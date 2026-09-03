# Blog comments — staging acceptance

Written 2026-08-30. Both branches carry origin/main merged in and every check
green; staging runs the exact build that would ship. Production launch waits
for manual acceptance on staging plus the cutover checklist at the bottom.

## Where to play

- Staging site: https://site-staging-9669e7.bunizao.workers.dev
- Test post (the one the e2e matrix exercised, `post_id
  66c8bb3d5614b50001db93c6`):
  https://site-staging-9669e7.bunizao.workers.dev/blog/dear-dont-be-confused
  — any other post works too. Probe rows from the automated runs were
  deleted, so comment sections start clean.
- Turnstile on staging uses the always-pass testing key — the widget renders
  and always succeeds. Production keeps the real key.

How to play, end to end:

1. Open a post, scroll to the comment box. Type a name + email + comment and
   submit. First-time commenters with a benign body publish immediately;
   link-heavy, keyword-flagged, or disposable-domain bodies are held.
2. A verify email arrives (Resend). Click the `/reader/confirm?token=…` link —
   it confirms the address, claims your earlier comments onto your reader
   identity, and sets the session cookie.
3. Reply to your own comment, edit it (15-minute window), delete it. Deleting
   a root that has replies leaves a tombstone; deleting a leaf hard-deletes.
4. React to the post or a comment (heart button). No login required.
5. Subscribe checkbox on the compose bar wires the email into
   `notify_subscribers` alongside reader identity.

Heads-up while playing: creates are capped at 3/minute and 10/hour per
IP/session/fingerprint. Hitting 429 during heavy manual testing is the risk
stack working, not a bug — the e2e matrix itself trips it when run twice
within an hour.

Known staging-only cosmetic issue: post hero images 404 (`/api/v2/images/…`)
because the staging worker's image cache isn't populated. The same path
serves 200 on prod. Every comments/reactions call on the page is 200
(dwell-token, reader/me, comments list, reactions batch — verified in the
browser).

## Behavioral matrix results

Final run (2026-08-30 late evening, `run=mtfs8x0j`, both workers on the
merged branches with the risk-control rework and async moderation live):
**37 probes — 37 pass, 0 fail, 0 skip.**

| Series | Probes | Result |
| --- | --- | --- |
| P: bot tripwires | dwell-token parity; missing/young dwell; honeypot; oversize body; unknown post; duplicate body; Turnstile reject + restore | all pass |
| C: create + risk stack | benign anon create settles published (live AI verdict); link count; keyword blocklist; disposable domain; first-session link; shadow ban held through the async continuation; hostile body settles rejected; 4th-in-a-minute 429 | all pass |
| M/V: email + verification | Resend delivery; verify/confirm; re-verify; tampered token; expired token; subscribe-on-verify; comment claim on verify; reader/me; resend cap (5 then 429) | all pass |
| R/E/D: lifecycle | verified reply settles published with parent + reader_id; edit in window; foreign edit 403; unknown id 404; edit after 15 min 409; root delete → tombstone; leaf delete → soft-deleted + hidden | all pass |
| L: visibility | public list leaks no held/rejected rows | pass |
| RX: reaction limits | identity churn from one IP → 429 at request 31; 429 carries rate-limit headers + no cookie; accepted toggle issues the cookie | all pass |

Two earlier same-day runs also informed the final state: run 2 (within the
hour) proved the 10/h IP cap fires exactly as designed, and run 3 exposed
that `wrangler secret put` rolls a new worker version whose first minutes
can flake staging (fail-closed 429s from erroring Durable Object calls, and
one platform-retried request that mis-reported `already_confirmed`). The
matrix now runs the secret-swapping Turnstile probes last so that
turbulence can't touch the create series. None of that affects production:
prod never swaps secrets mid-traffic, and the fail-closed behavior is the
intended posture.

An earlier iteration skipped C8 (hostile-body AI probe) because moderation
was pointed at `api.openai.com`, where the configured key 401s. The key was
never the problem — it is a valid key for the `ai.tuuhub.com` gateway (see
the risk-control rework below), and after repointing `AI_BASE_URL` the
publish path went live and C8 became runnable.

One operational lesson from the final rerun: the 10/h create budget is a
fixed window per IP that opens on the first attempt, so the reset time
moves with whoever last played on staging. Trust the `X-RateLimit-Reset`
header on a 429, not arithmetic from an earlier run.

## Risk-control rework (post-acceptance)

The abuse-control research doc
(`notes/research/2026-08-30-blog-comments-reactions-abuse-control.md`)
found the reaction limiter bypassable: it counted only the anonymous
identity, and the identity lives in a cookie the caller mints for free, so
discarding the cookie each request meant unlimited reactions from one
machine (35/35 rotated requests succeeded in the live probe). Changes, all
regression-tested in `tests/unit/comments-reaction-limits.test.ts` and live
via the RX probes in the matrix:

- **Hashed-IP budgets on the reaction toggle** — 30/min and 120/h per
  hashed client IP (`hashIp` keyed with the session secret, same primitive
  the comment path uses), alongside the existing per-identity 30/min.
  Identity churn no longer buys anything.
- **Rate-limit headers on reaction 429s** — `Retry-After`,
  `X-RateLimit-Limit`, `X-RateLimit-Remaining`, matching the comment path.
- **Cookie only on accepted writes** — both the reaction toggle and comment
  POST previously attached a fresh `__Host-reader_anon` cookie to rejected
  responses, handing abusers a new identity per rejection. Rejections are
  now cookie-free.
- **AI moderation on the tuuhub gateway** — `AI_BASE_URL` now defaults to
  `https://ai.tuuhub.com/v1` (code, `wrangler.jsonc`, and
  `wrangler.staging.jsonc`) and the default model alias is `task-guard`,
  the purpose-routed moderation model on that gateway. Primary and
  fallback are deliberately the same alias: the gateway owns backend
  routing, and a second alias would fail together with the first whenever
  the gateway itself is down. Models remain KV-overridable via
  `comments:ai:config`.

## Root causes found and fixed on staging

These came out of the remote behavioral runs — none were visible in unit
tests or local dev:

1. **`/reader/confirm` 404** — the confirm route was missing from
   `run_worker_first` in the public worker config, so the static asset layer
   answered first. Fixed by adding `/reader*`; regression-tested in
   `tests/unit/cloudflare-runtime-config.test.ts`.
2. **Body-less DELETE always 403** — Astro's CSRF check in site-api compares
   `Origin` to the request URL. The service-binding proxy rewrites the URL to
   `https://site-api.internal` but forwarded the public Origin, so every
   browser DELETE died cross-site. Fixed in
   `src/lib/http/api-service-proxy.ts`: a same-origin Origin is translated to
   the target origin; a foreign Origin is forwarded untouched so the CSRF
   check still fires. Unit-tested both ways. Prod routes `buxx.me/api/*`
   directly (no proxy), so this only ever hit staging/preview — but it would
   have broken every preview deployment forever.
3. **`redirect: 'error'` throws in workerd** — used in the Turnstile, Ghost
   post-registry, and OAuth fetches; workerd rejects the value outright.
   Switched to `redirect: 'manual'`.
4. **Durable rate-limit key collision** — comment endpoints stack a per-minute
   and per-hour window on one prefix+identifier; without `windowMs` in the DO
   key they shared a counter and reset each other. Key now includes
   `windowMs`; regression test asserts two buckets.
5. **Turnstile testing-key semantics** — the always-pass secret accepts any
   token, which masked action mismatches locally; the verify path now checks
   `expectedAction` explicitly.
6. **Form POSTs 500 with "Body has already been used"** — the public worker's
   asset probe passed the original request to `ASSETS.fetch`, which consumes a
   POST body even on a 404 miss, so `/reader/confirm`'s Confirm button died
   before Astro could read the form. GETs carry no body, which is why every
   page *load* worked. `src/worker.ts` now routes non-GET/HEAD requests
   straight to Astro — assets and the HTML edge cache are GET-only surfaces.
7. **Gateway rejects `temperature`** — ai.tuuhub.com routes `task-guard`
   across backends and the reasoning-model ones reject the parameter
   per-request, so moderation failed closed intermittently
   (`moderation_model` NULL). The moderation call now sends no sampling
   params.
8. **Empty state above a visible comment** — the client keyed "no one has
   been here yet" off `total`, which counts published comments only, while
   the list also renders the viewer's own held rows. Now keyed off rendered
   rows.
9. **Submit latency** — the AI verdict (1.7–3.4s measured) sat in the create
   request's critical path. The API now waits at most 1.5s
   (`MODERATION_DEADLINE_MS`); a slower verdict inserts the row as held and
   lands via `waitUntil`, guarded on `updated_at` so a writer edit during the
   race is never clobbered (a raced edit stays held). The client polls the
   list a few times after a held submit and upgrades the row in place when
   the verdict publishes. The wire still never distinguishes held from
   rejected.

## Merge summary (both branches converged onto main)

- **site**: merged origin/main (101 commits, 3 conflicts). Kept our Colophon
  redesign + ReactionBar; adopted main's `languageSwitcher`/`ogLocale` copy;
  dropped NotByAI in favor of the AiCredit line. `bun run check` 0 errors,
  unit green, docs coverage 107/107, prod build green.
- **site-api**: merged origin/main (95 commits, 42 conflicts). The two big
  architectural convergences:
  - *Rate limiting* moved onto main's prod-deployed `RateLimitDO`
    (fetch-POST protocol, binding `RATE_LIMITER`, fail-closed) via a new
    `withDurableIdentifierRateLimit` that keeps our identifier-keyed,
    stacked-window semantics.
  - *Subscriber writes* moved onto main's guarded primitives
    (`updateSubscriberIfCurrent` / `insertSubscriberIfNotMoved`) — reader
    activation no longer blind-upserts over concurrent notify state.
  - *Contracts* now consume the published `@bunizao/contracts` package,
    pinned to 0.2.0 (adds `/comments` types). `bun run check` 0 errors,
    unit 908/908, build green.
- Commits in both repos are **unsigned and unpushed** (op-ssh-sign was
  unreachable); push is yours.

## Cutover checklist (production launch)

In order:

1. **Publish `@bunizao/contracts@0.2.0`** from `site` (contracts-release.yml
   workflow), then `bun install` in site-api so bun.lock trues up (it still
   holds a 0.1.0 entry; staging was deployed from a local tarball).
2. **Verify AI moderation config on prod** — the key is valid; it just has
   to reach the right host. `wrangler.jsonc` now ships
   `AI_BASE_URL=https://ai.tuuhub.com/v1`; confirm the `AI_API_KEY` secret
   is present on prod site-api (it is shared with mood AI). If the gateway
   or the `task-guard` alias is ever down, moderation fails closed and
   unknown-session comments are held — a delay, not a leak.
3. **Back up prod D1** (fresh export), then apply migration
   `0016_blog_comments.sql` to production.
4. **Upload prod secrets** to site-api: `GITHUB_READER_OAUTH_CLIENT_ID/SECRET`,
   `GOOGLE_READER_OAUTH_CLIENT_ID/SECRET`, `COMMENTS_SESSION_SECRET`,
   `COMMENTS_EMAIL_SECRET`, `COMMENTS_EMAIL_PEPPER`, `TURNSTILE_SECRET_KEY`
   (real key, not the testing one). `scripts/check-production-readiness.ts`
   enforces the full set.
5. Deploy site-api, then site.
6. Flip prod `COMMENTS_ENABLED` to `"true"` in site-api wrangler.jsonc
   (currently `"false"`) and redeploy.
7. Smoke with the real Turnstile widget: post one comment, verify the email
   round-trip, one edit, one delete, one reaction.
