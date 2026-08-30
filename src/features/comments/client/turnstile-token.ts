// Turnstile -- invisible-mode widget lifecycle, one per expectedAction.
// Structurally the same load/render/reset shape as subscribe-panel.ts's
// visible widget; this surface just never shows a challenge box for it.
//
// Extracted from comments-controller.ts so the post-level ReactionBar
// island can mint its own 'blog_reaction' tokens through the same widgets.
//
// A solve costs ~2.3s of wall clock. Asking for the token at submit time put
// every millisecond of that between the press of Post and the request leaving
// the browser, which is the worst place for it: nothing is on screen to
// explain the wait and the reader has already finished their part. So the
// token is solved on intent (warmTurnstileToken, called from the compose
// box's first focus) and read back instantly when there is finally something
// to send.

export type TurnstileAction = 'blog_comment_create' | 'blog_reaction';

interface TurnstileWidgetState {
  container: HTMLElement;
  widgetId: string | null;
  tokenPromise: Promise<string> | null;
  /** The current promise's resolver. The widget is rendered once and `reset()`
      for every later solve, so its callbacks outlive any one promise and have
      to dispatch through this rather than close over a particular resolve. */
  resolveCurrent: ((token: string) => void) | null;
  /** Whether `tokenPromise` has already handed a token out. Tells a real
      expiry apart from a challenge that failed before it ever produced one. */
  settled: boolean;
}

const turnstileWidgets = new Map<TurnstileAction, TurnstileWidgetState>();
let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (turnstileScriptPromise) return turnstileScriptPromise;
  turnstileScriptPromise = new Promise((resolve) => {
    if ((window as unknown as { turnstile?: unknown }).turnstile) {
      resolve();
      return;
    }
    if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onCommentsTurnstileLoad';
    script.async = true;
    (window as unknown as { onCommentsTurnstileLoad?: () => void }).onCommentsTurnstileLoad = () => resolve();
    document.head.appendChild(script);
  });
  return turnstileScriptPromise;
}

function widgetFor(action: TurnstileAction): TurnstileWidgetState {
  let state = turnstileWidgets.get(action);
  if (!state) {
    const container = document.createElement('div');
    container.style.display = 'none';
    document.body.appendChild(container);
    state = { container, widgetId: null, tokenPromise: null, resolveCurrent: null, settled: false };
    turnstileWidgets.set(action, state);
  }
  return state;
}

function settleWidget(state: TurnstileWidgetState, token: string): void {
  state.settled = true;
  state.resolveCurrent?.(token);
}

/** Cloudflare expires a token about five minutes after it is solved. Warming
    means a reader can now be holding one while they write, so the expiry
    lands mid-draft rather than never -- solve the next one immediately and
    keep the whole point of warming. Nothing is waiting on the stale promise
    at this point: it resolved when the token was first handed out. */
function expireWidget(state: TurnstileWidgetState, siteKey: string, action: TurnstileAction): void {
  if (!state.settled) {
    settleWidget(state, '');
    return;
  }
  state.tokenPromise = null;
  void mintToken(state, siteKey, action);
}

function mintToken(state: TurnstileWidgetState, siteKey: string, action: TurnstileAction): Promise<string> {
  const turnstile = (window as unknown as { turnstile?: any }).turnstile;
  if (!turnstile) return Promise.resolve('');

  state.settled = false;
  state.tokenPromise = new Promise<string>((resolve) => {
    state.resolveCurrent = resolve;
    if (state.widgetId === null) {
      state.widgetId = turnstile.render(state.container, {
        sitekey: siteKey,
        action,
        size: 'invisible',
        callback: (token: string) => settleWidget(state, token),
        'error-callback': () => settleWidget(state, ''),
        'timeout-callback': () => settleWidget(state, ''),
        'expired-callback': () => expireWidget(state, siteKey, action),
      });
    } else {
      turnstile.reset(state.widgetId);
    }
  });
  return state.tokenPromise;
}

/** Resolves a fresh, single-use Turnstile token for one action. Empty site
    key means Turnstile is unconfigured (e2e fixtures, local dev) -- resolves
    to '' immediately and lets the server's own `not_configured` response
    decide what happens, rather than blocking submission on a widget that
    will never load. */
export async function getTurnstileToken(siteKey: string, action: TurnstileAction): Promise<string> {
  if (!siteKey) return '';
  await loadTurnstileScript();
  const state = widgetFor(action);
  return state.tokenPromise ?? mintToken(state, siteKey, action);
}

/** Start solving now, for a submission that has not happened yet. Idempotent:
    a warm token already in hand is kept, so this is safe to call from an
    event that fires often (focus, pointer entry). */
export function warmTurnstileToken(siteKey: string, action: TurnstileAction): void {
  void getTurnstileToken(siteKey, action);
}

/** A token is single-use server-side -- call after every submit (success or
    failure) so the next attempt runs the widget again instead of replaying
    a spent token. */
export function releaseTurnstileToken(action: TurnstileAction): void {
  const state = turnstileWidgets.get(action);
  if (state) {
    state.tokenPromise = null;
    state.settled = false;
  }
}
