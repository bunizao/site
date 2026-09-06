// Turnstile -- one non-intrusive widget per expectedAction. Structurally the
// same load/render/reset shape as subscribe-panel.ts's visible widget, but
// rendered with `appearance: 'interaction-only'`: the widget stays invisible
// unless Turnstile actually needs the reader to interact with it, rather than
// the invalid `size: 'invisible'` this used to pass (Turnstile only accepts
// compact/flexible/normal -- the bad value threw on every render).
//
// Extracted from comments-controller.ts so the post-level ReactionBar
// island can mint its own 'blog_reaction' tokens through the same widgets.
//
// A solve costs ~2.3s of wall clock. Asking for the token at submit time put
// every millisecond of that between the press of Post and the request leaving
// the browser, which is the worst place for it: nothing is on screen to
// explain the wait and the reader has already finished their part. So the
// token is solved ahead of the submission -- on the thread scrolling into
// view, and again on the first focus in a compose box -- and read back
// instantly when there is finally something to send.
//
// The widget also has to be somewhere a reader can reach. Invisible mode is
// only invisible until Cloudflare decides it wants a human: it then opens an
// interactive challenge inside its own container, and a container parked in a
// `display: none` div off the end of <body> can never show one. That turned
// every challenged submission into a dead end whose only exit was a page
// reload. setTurnstileHost puts the container in the page instead, and the
// interactive callbacks flag the host so it can open for the challenge and
// close again after.

import { loadTurnstileScript } from '@/lib/turnstile-script';

// 'owner_message_create' is the /message form and 'mood_comment_create' the
// mood thread. They share this module rather than growing their own because
// the widget lifecycle -- warm early, read at submit, re-mint on expiry -- is
// identical; only the action string differs.
export type TurnstileAction =
  | 'blog_comment_create'
  | 'blog_reaction'
  | 'mood_comment_create'
  | 'owner_message_create';

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
  /** When the current token was solved. Only meaningful while `settled`. */
  solvedAt: number;
  /** The next render should draw a visible checkbox the reader can press,
      rather than the invisible widget. Set only by challengeTurnstile. */
  forced: boolean;
}

/** Cloudflare expires a solved token at about five minutes. Stop trusting one
    well before that: it still has to survive the flight to site-api, and the
    clock started when the token was solved, not when Post was pressed.

    'expired-callback' above already re-mints on expiry, and on a desktop tab
    left open that is enough. It is a timer inside the widget, though, and a
    phone that slept -- or backgrounded the tab, or froze it for bfcache --
    wakes up holding a token whose expiry never ran. The submission then spends
    a dead token and comes back 400 invalid_token, which is what warming a
    token minutes before it is used bought us. Checking the age where the token
    is read cannot be skipped by a timer that did not fire. */
const TOKEN_MAX_AGE_MS = 240_000;

const turnstileWidgets = new Map<TurnstileAction, TurnstileWidgetState>();
const turnstileHosts = new Map<TurnstileAction, HTMLElement>();

/** Marks the host while Cloudflare is showing a challenge in it. The host is
    collapsed the rest of the time, so nothing is reserved in the layout until
    there is something to reserve it for -- see `.blog-compose__turnstile`. */
const INTERACTIVE_ATTR = 'data-turnstile-interactive';

/** Give an action's widget a home in the page. Safe to call before or after
    the first solve: an existing container moves. Without it the widget falls
    back to a hidden div on <body>, which still mints tokens fine but cannot
    show a challenge -- so call this wherever a reader could be challenged. */
export function setTurnstileHost(action: TurnstileAction, host: HTMLElement): void {
  turnstileHosts.set(action, host);
  const existing = turnstileWidgets.get(action);
  if (existing && existing.container.parentElement !== host) host.appendChild(existing.container);
}

function hostFor(action: TurnstileAction): { parent: HTMLElement; hidden: boolean } {
  const host = turnstileHosts.get(action);
  return host ? { parent: host, hidden: false } : { parent: document.body, hidden: true };
}

function widgetFor(action: TurnstileAction): TurnstileWidgetState {
  let state = turnstileWidgets.get(action);
  if (!state) {
    const { parent, hidden } = hostFor(action);
    const container = document.createElement('div');
    if (hidden) container.style.display = 'none';
    parent.appendChild(container);
    state = { container, widgetId: null, tokenPromise: null, resolveCurrent: null, settled: false, solvedAt: 0, forced: false };
    turnstileWidgets.set(action, state);
  }
  return state;
}

function setInteractive(state: TurnstileWidgetState, open: boolean): void {
  const host = state.container.parentElement;
  if (!host || host === document.body) return;
  if (open) host.setAttribute(INTERACTIVE_ATTR, '');
  else host.removeAttribute(INTERACTIVE_ATTR);
}

function settleWidget(state: TurnstileWidgetState, token: string): void {
  state.settled = true;
  state.solvedAt = Date.now();
  setInteractive(state, false);
  state.resolveCurrent?.(token);
}

/** Only a token that has actually been handed out can be too old. A promise
    still waiting on the widget is in flight, not stale, and discarding it
    would abandon a solve that is about to land.

    Takes its clock as an argument and reads nothing but two numbers, so the
    rule can be tested without standing up a DOM and a fake Cloudflare. */
export function isTokenStale(
  token: { settled: boolean; solvedAt: number },
  now: number,
): boolean {
  return token.settled && now - token.solvedAt > TOKEN_MAX_AGE_MS;
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
        // Fixed for the life of the widget, which is why the forced challenge
        // below renders a new one rather than resetting this one.
        appearance: state.forced ? 'always' : 'interaction-only',
        callback: (token: string) => settleWidget(state, token),
        'error-callback': () => settleWidget(state, ''),
        'timeout-callback': () => settleWidget(state, ''),
        'expired-callback': () => expireWidget(state, siteKey, action),
        // Cloudflare wants a human. Open the host so the challenge has room
        // and the reader can answer it here, rather than hitting a refusal
        // whose only remedy was reloading the page.
        'before-interactive-callback': () => setInteractive(state, true),
        'after-interactive-callback': () => setInteractive(state, false),
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
  if (!(await loadTurnstileScript())) return '';
  const state = widgetFor(action);
  // Costs a fresh ~2.3s solve, but only on the submission that would otherwise
  // have been refused outright -- and by here the reader has pressed Post, so
  // the receipt line is already saying something.
  if (isTokenStale(state, Date.now())) state.tokenPromise = null;
  return state.tokenPromise ?? mintToken(state, siteKey, action);
}

/** Put a visible Turnstile in front of the reader and wait for them to solve
    it. For the one case the invisible widget cannot answer on its own: the
    submission came back `turnstile_failed`, so the silent solve either never
    produced a token or produced one Cloudflare refused.

    The old answer to that was a sentence telling the reader to reload the
    page, which threw away their draft's place in the thread and did nothing
    the reader could not have done by pressing Post again. This asks the one
    question that actually unblocks them, in the box they are already looking
    at.

    `appearance` is fixed when a widget is rendered, so the invisible one is
    torn down and replaced -- and torn down again afterwards, so the next
    ordinary submission is back to solving silently. Resolves to '' if the
    reader walks away from the challenge or it fails again; the caller's
    existing message is still on screen for that. */
export async function challengeTurnstile(siteKey: string, action: TurnstileAction): Promise<string> {
  if (!siteKey) return '';
  const api = await loadTurnstileScript();
  if (!api) return '';

  const state = widgetFor(action);
  if (state.widgetId !== null) api.remove?.(state.widgetId);
  state.widgetId = null;
  state.tokenPromise = null;
  state.forced = true;
  setInteractive(state, true);

  try {
    const token = await mintToken(state, siteKey, action);
    return token;
  } finally {
    state.forced = false;
    setInteractive(state, false);
    // Keep the token (it is in `tokenPromise`, and the retry is about to
    // spend it) but not the visible widget it came from.
    if (state.widgetId !== null) api.remove?.(state.widgetId);
    state.widgetId = null;
  }
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
