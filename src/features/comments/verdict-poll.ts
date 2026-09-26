// How long a writer's own held row waits for its verdict. Shared by the blog
// thread (comments-controller.ts) and the mood thread (detail-compose.ts).
//
// site-api waits up to 8s for the verdict -- the language model reading an
// anonymous comment takes most of that -- and past it the comment lands as
// held and flips to published in a `waitUntil` continuation after the
// response is sent. A queued continuation, a retried fetch, or a cold check
// lands well past the old twelve-second window, and the row was then told it
// was invisible, permanently, for a comment that went public moments later.
// Telling a reader the wrong thing forever is worse than a few more cheap
// `no-store` GETs, so the window is a backoff out to roughly a minute and a
// half. The gaps widen as the odds of a flip fall: eight probes, five of them
// inside the first seventeen seconds, where nearly every verdict lands.
export const VERDICT_POLL_DELAYS_MS: readonly number[] = [1500, 2000, 3000, 4000, 6000, 15_000, 30_000, 30_000];

// When "Publishing" becomes "Still checking". Akismet alone answers in well
// under a second; past this the language model is the one still reading.
export const SLOW_VERDICT_MS = 3000;
