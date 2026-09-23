// The reader pass, client side. site-api sets a session-bound cookie after a
// reaction whose Turnstile token verified, and takes that cookie in place of
// a token for the next hour -- so a reader who likes five comments solves
// once, and Cloudflare never sees the run of solves from one IP that used to
// make it demand a human on the fourth.
//
// The cookie is HttpOnly, so this side cannot read it. What it can do is
// remember the expiry the server reported and stop minting tokens until
// then; a `400 turnstile_failed` on a pass-backed request is the server
// saying the pass is gone (cookies cleared, a new device), and forgetting it
// here puts the next like back on the ordinary silent solve.

const STORAGE_KEY = 'blog:reaction-pass-until';

/** Slack against the server's clock and the flight time of the request: a
    pass this close to lapsing is not worth betting a refusal on. */
const MARGIN_MS = 30_000;

let passUntil = 0;

function readStored(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/** Whether the next reaction can go out without a Turnstile token. */
export function hasReactionPass(now = Date.now()): boolean {
  if (!passUntil) passUntil = readStored();
  return passUntil - MARGIN_MS > now;
}

export function rememberReactionPass(until: unknown): void {
  if (typeof until !== 'number' || !Number.isFinite(until)) return;
  passUntil = until;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(until));
  } catch {
    // Memory alone still covers this page; the next one re-earns the pass.
  }
}

export function forgetReactionPass(): void {
  passUntil = 0;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored, nothing to forget.
  }
}
