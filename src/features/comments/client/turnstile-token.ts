// Turnstile -- one non-intrusive widget per expectedAction. Structurally the
// same load/render/reset shape as subscribe-panel.ts's visible widget, but
// rendered with `appearance: 'interaction-only'`: the widget stays invisible
// unless Turnstile actually needs the reader to interact with it, rather than
// the invalid `size: 'invisible'` this used to pass (Turnstile only accepts
// compact/flexible/normal -- the bad value threw on every render).
//
// Extracted from comments-controller.ts so the post-level ReactionBar
// island can mint its own 'blog_reaction' tokens through the same widgets.

export type TurnstileAction = 'blog_comment_create' | 'blog_reaction';

interface TurnstileWidgetState {
  container: HTMLElement;
  widgetId: string | null;
  tokenPromise: Promise<string> | null;
  resolveCurrent: ((token: string) => void) | null;
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

/** Resolves a fresh, single-use Turnstile token for one action. Empty site
    key means Turnstile is unconfigured (e2e fixtures, local dev) -- resolves
    to '' immediately and lets the server's own `not_configured` response
    decide what happens, rather than blocking submission on a widget that
    will never load. */
export async function getTurnstileToken(siteKey: string, action: TurnstileAction): Promise<string> {
  if (!siteKey) return '';
  await loadTurnstileScript();
  const turnstile = (window as unknown as { turnstile?: any }).turnstile;
  if (!turnstile) return '';

  let state = turnstileWidgets.get(action);
  if (!state) {
    const container = document.createElement('div');
    container.style.display = 'none';
    document.body.appendChild(container);
    state = { container, widgetId: null, tokenPromise: null, resolveCurrent: null };
    turnstileWidgets.set(action, state);
  }

  if (state.tokenPromise) return state.tokenPromise;

  const captured = state;
  const settle = (token: string) => captured.resolveCurrent?.(token);

  captured.tokenPromise = new Promise<string>((resolve) => {
    captured.resolveCurrent = resolve;
    if (captured.widgetId === null) {
      captured.widgetId = turnstile.render(captured.container, {
        sitekey: siteKey,
        action,
        appearance: 'interaction-only',
        callback: settle,
        'error-callback': () => settle(''),
        'expired-callback': () => settle(''),
        'timeout-callback': () => settle(''),
      });
    } else {
      turnstile.reset(captured.widgetId);
    }
  });

  return captured.tokenPromise;
}

/** A token is single-use server-side -- call after every submit (success or
    failure) so the next attempt runs the widget again instead of replaying
    a spent token. */
export function releaseTurnstileToken(action: TurnstileAction): void {
  const state = turnstileWidgets.get(action);
  if (state) state.tokenPromise = null;
}
