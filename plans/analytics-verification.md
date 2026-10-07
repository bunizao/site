# Analytics expansion verification

Recorded on 2026-10-07, Australia/Melbourne. This file separates implementation,
local verification, cloud verification and production activation.

## Current state

- The public client and private Worker are merged and deployed in production.
  Collection is active; the first finished-day cron acceptance and seven-day
  quality observation remain pending.
- Contracts 0.14.0 and 0.15.0 were published by the tag release workflow. The
  final dependency is 0.15.0, whose lifetime-reader field can be `null` when
  anonymous rollups cannot reconstruct it.
- D1 `site-analytics` exists and both analytics migrations are applied.
- Backfill of 2026-07-02 through 2026-10-06 is applied and verified. The
  original `blog_analytics_events` table remains intact.
- An isolated Worker at
  `https://site-api-analytics-validation.bunizao.workers.dev` validated the
  real collect path. It has no production routes, crons, notification queues
  or application secrets. All synthetic beacons identify themselves as owner
  and WebDriver traffic, so they cannot enter the human headline.
- The owner supplied the analytics token. WAE SQL and account RUM reads were
  validated before adding `CLOUDFLARE_ANALYTICS_TOKEN` in one owned unactivated
  Worker upload. Existing deployed secrets were inherited and checked.
- The configured rollout marker is `2026-10-07T05:25:19Z`. The public client
  became active at `2026-10-07T05:32:38.554273Z`; both fall on 7 October in
  Melbourne. This is a partial collection day. Retirement clocks now run from
  the configured marker; no destructive retirement action has been executed.

## Measured cloud results

| Check | Evidence |
| --- | --- |
| Valid collect requests | 50/50 returned 204 in the final synthetic run |
| Foreign Origin | 403 |
| Local preview Origin | 204, ignored |
| Body over 8,192 bytes | 413 |
| Invalid body | 400 |
| Unauthenticated report | 401 |
| Final collect CPU | 11 accepted platform traces; p99 and maximum 2 ms |
| Classification | Real SQL returned `owner / owner_toggle`, the intended surface, viewport and navigation slots |
| SQL shapes | View progress, deduplicated clicks, range visitors, period visitors, log class and cursor queries executed successfully |
| Reports | Overview, Pages, Clicks, Sources, Audience, Quality, Log and Visitor executed against real WAE and D1 data; Quality also read real RUM data |
| RUM host scope | Only `buxx.me` and `www.buxx.me`; `/dev/*` and `/lab/*` excluded. One checked Melbourne day returned 515 loads |
| Backfill | 97 completed days; 1,164 legacy events; 1,107 human views; 723 five-second reads |
| Legacy comparison | Old display counted every event; 751 rows met the new read threshold before tool exclusion. The 723 imported reads exclude declared tools |
| Storage after backfill | About 270 KB in the new database at the verification snapshot |

The CPU result is a measured preview sample, not a guarantee over arbitrary
production traffic or cold owner JWT verification. Network RTT is not CPU.
The preview root has no application service binding; its unrelated root request
is not a collect-path acceptance check.

## Statistical limits discovered during implementation

WAE sampled a fifty-checkpoint synthetic view despite the small total site
workload. Its `_sample_interval = 5` represented checkpoints, not five people
or five page loads. Some action records were omitted. Consequently:

- Count observed unique view ids and visitor ids after reducing checkpoints.
  Never multiply an already grouped view by its checkpoint sampling weight.
- Use cumulative progress maxima. Retried checkpoints do not add dwell or
  interactions. Clicks deduplicate on view, carrying sequence, event time and
  stable action name.
- Show sampling on raw and aggregate reports. Sampled dwell, scroll and click
  sequences can miss updates. No claim of exact reconstruction is made.
- Use `SUM(_sample_interval)` for the raw write-budget check.
- Keep only observed distinct visitors when sampled. Across a legacy backfill
  boundary, range distinct visitors are unavailable; daily imported visitors
  remain valid within their original day.
- Do not sum daily medians. Daily identity-free histograms preserve the
  distribution, including click timing.
- WAE retention is three months; the owner raw-report window is ninety days.

The client currently measures about 3.3 KB minified and gzipped. This exceeds
its initial 2.5 KB target; retry preservation and UTF-8 request limits were
kept rather than removed to make the size number pass.

## Repeatable local checks

From `/Users/tutu/Dev/site`:

```bash
bun run check
bun run test:unit
bun run build
SITE_API_REPO=/Users/tutu/Dev/site-api-wt/site-analytics bun run check:docs-coverage
bun run test:e2e:site
```

The focused browser acceptance set is:

```bash
bunx playwright test tests/e2e/site-analytics.pw.ts tests/e2e/portal-analytics.pw.ts tests/e2e/portal-perf.pw.ts --workers=1 --grep 'site report|reports show|all public surfaces|desk panels|localhost stays|revisiting audience|subscriber panes, report tabs'
```

From `/Users/tutu/Dev/site-api-wt/site-analytics`:

```bash
bun run check:contracts
bun run check
bun run test:unit
bun run build
bunx wrangler deploy --dry-run
```

The behavioral tests cover:

- Valid, expired and wrong-audience owner JWTs; declaration precedence;
  normal Chrome, Safari, Firefox and WeChat clients.
- Origin rejection, preview suppression, rate limiting, strict UUIDs,
  malformed objects, UTF-8 byte caps, string clamps and frozen WAE slots.
- Melbourne 23-hour, 24-hour and 25-hour days; session boundaries across
  midnight; sampling-safe view counts; top-N folding; weighted write points.
- Real SQLite transactional day replacement, rerun idempotency, failed-run
  recording and bounded JSON batch inserts under high dimension cardinality.
- Beacon visible dwell from time zero, background pause/resume, session idle
  rollover, bfcache reset, input trust, click names, regions and positions,
  query removal, synthetic-click rejection and concurrent fetch retries.
- Production-origin browser payloads through a local intercepted server on
  fifteen public routes at 320, 375 and 1440 pixels.
- Desk panels opened by click and initial hash, buffered pagehide clicks,
  localhost and GPC suppression, portal tabs, surface filters, owner setting
  persistence, explicit API failures and cached report paint budgets.

The first full browser run had 359 passes and two failures in the old
article-only performance assertions. Those assertions were updated to the new
report UI. The focused rerun passed all ten tests without skipped tests.
The final public unit suite passed 1,119 site tests plus 27 desk tests. The
private full suite passed 2,103 tests after the final cutover-manifest
regression was added; the focused analytics, desk snapshot and production
readiness run also passed all 59 tests. Both repositories passed type checks
and production builds. The final public browser rerun passed all eight
collection/portal tests; the corrected performance rerun passed both budgets.

React Doctor found existing easel diagnostics and the SPA report form's
intentional `preventDefault`. The form updates the portal router and query
cache; native submission would reload the application. No diagnostic rule was
disabled, and this warning is not treated as a runtime failure.

## Repeatable cloud checks

The private repository includes `scripts/analytics/verify.ts`. Supply read
credentials through the local environment; never put a token in command
arguments, a committed file or a chat message.

```bash
bun scripts/analytics/verify.ts --origin https://site-api-analytics-validation.bunizao.workers.dev --view <synthetic-view-uuid>
```

It lists dataset names, reads the synthetic view and clicks, executes every
report SQL shape and checks the unauthenticated HTTP report gate. It prints
only classifications and aggregate validation results, not IPs or secrets.

Historical import defaults to a dry run:

```bash
bun scripts/analytics/backfill-blog.ts --from 2026-07-02 --to 2026-10-06 --cutover 2026-10-07
```

`--apply` imports the computed day replacements, then queries the destination
and compares every day and the complete totals. Only a full verified history
writes the manifest used by the desk migration and later legacy cleanup.
A resumed run replaces the same days; it cannot append duplicate counts.

Independent destination checks:

```bash
bunx wrangler d1 execute site-analytics --remote --command "SELECT COUNT(*) AS finished_days, SUM(view_points) AS legacy_points FROM rollup_runs WHERE status = 'done'; SELECT SUM(views) AS human_views, SUM(reads) AS defined_reads FROM pv_daily WHERE surface = 'blog_post' AND entity != '*'; SELECT key, value FROM analytics_state;" --json
```

Expected for this recorded import: 97 days, 1,164 legacy points, 1,107 human
views and 723 reads. These are a snapshot, not invariant future site totals.

## Production activation and time-based acceptance

1. Create and upload the dedicated Account Analytics Read secret with Wrangler
   or the Cloudflare dashboard. Verify SQL and RUM access before merging the
   Worker change. Keep the public collector inactive until the backend exists.
2. Apply the analytics migrations before deployment. They affect only the new
   database. Run the verified backfill through the last completed Melbourne
   day before the actual cutover. If the date changes from this record, rerun
   the backfill with that actual day and include newly finished legacy days.
3. Set `SITE_ANALYTICS_CUTOVER_AT` to the real UTC timestamp, deploy the private
   Worker, then the public client. Confirm the new public route answers 204,
   an owner's visit is labelled owner, and the portal can read all report tabs.
4. After the next finished Melbourne day and the 01:00 margin, check that its
   `rollup_runs.status` becomes `done`. Rerun that day and confirm row totals do
   not increase. Recent days are refreshed to capture late cross-midnight
   progress; wider missing history is explicitly flagged.
5. Observe seven actual production days: compare human views with RUM per
   surface, inspect traffic declaration reasons, and investigate ratios outside
   0.7–1.3 or tool UAs in the human log. A ratio before full-site cutover is not
   a valid comparison because imported history covers blog articles only.
6. Fourteen days after cutover, the legacy event endpoint becomes a no-op.
   After thirty days it and the legacy read endpoints return 410; physical
   source-route removal is a later release. After ninety days the old table
   can be dropped only when a verified backfill manifest matches the cutover.
   These clocks are not marked complete in advance.

Production deployment is active after steps 1–3. Finished-day aggregation
acceptance still requires step 4. Do not describe the seven-day quality
acceptance as passed until all seven full Melbourne days have been observed.

The final freshness check merged the current `origin/main` letter-receipt and
dependency changes, then repeated the public type check, full unit suite,
build and eight browser acceptance tests. The implementation commits are
unsigned because 1Password SSH signing failed; no global signing setting was
changed. Before activation, production answered 404 on the unimplemented public
collect route. The production receipts below supersede that snapshot.

Cloud CI also exercised the standalone component registry consumer. It exposed
a site-only analytics import in the redistributed timeline wheel. The wheel
now emits a generic gesture event without that dependency, and the site beacon
consumes it separately. Translated blog pages use their canonical entity slug
while preserving the page locale and path. Both changes have focused browser
checks alongside registry consumer typechecking and building.

A final browser-to-cloud run sent the real client beacons from all fifteen
fixture pages through the isolated Worker. Independent SQL readback found all
fifteen view ids, with matching surface, entity, path and locale; every one was
owner traffic and none was sampled. The translated article used its canonical
slug, and the genuinely missing URL used `not_found`. Reproduce with:

```bash
ANALYTICS_VALIDATION_ORIGIN=https://site-api-analytics-validation.bunizao.workers.dev bunx playwright test tests/e2e/site-analytics.pw.ts --project=chromium --workers=1 --grep '1440px'
```

This optional live mode only allows the named isolated Worker and explicitly
marks the browser as owner before any beacon. The normal tests keep intercepting
beacons locally and perform no cloud writes.

Manual WAE reruns reject dates before the configured collection cutover. Those
legacy days must be recomputed with the original-data backfill script while
the legacy table still exists; an empty WAE day must never overwrite imported
history. The additional guard has a regression test that refuses any database
access on such a request.

Final edge-case regressions cover list-row positions when earlier rows contain
several links, UUID v4 generation in older webviews without `randomUUID`,
normalized mood-tag entities (including invalid filters), reserved aggregation
keys, erased visitor identifiers, and declared tool names beyond the saved UA
length cap. The focused suites now pass 14 beacon cases and 20 Worker cases.

Session exit snapshots no longer revive a session that expired thirty minutes
ago or overwrite a newer session created in another tab. A literal `(other)`
dimension is merged into the folded tail without duplicate primary keys.
Range and period visitors are counted in WAE directly, so monthly audience
cardinality cannot exceed a response-row limit and block daily rollups. These
queries, including empty-period counts, were checked against the live SQL API.
The final focused coverage is 15 beacon cases and 21 Worker cases.

Final exact-head local verification passed 1,123 public unit tests, 27 desk
tests and 2,107 private Worker tests. All GitHub head checks passed on both
PRs, including both public E2E shards. The Cloudflare Ghost Content timeout
passed on retry and uploaded an unactivated public preview version. A final
17-URL browser run, including normalized and invalid mood-tag queries, also
passed against the live collector; its teardown drains writes before closing
the browser context. SQL readback again verified all seventeen owner views.
The latest collector version produced eleven accepted platform traces with
2 ms p99/max CPU and no exceptions.


## Production receipts, 7 October

- Public implementation PR [site #276](https://github.com/bunizao/site/pull/276)
  merged as `129fb1ab3dfe2dbb8086859b560a03ff52244732`.
- Private implementation PR [site-api #97](https://github.com/bunizao/site-api/pull/97)
  merged as `aeaae7a18ce6c365848dfcc2f92fc6b564b77400`.
- The first owned secret-bound API candidate was
  `cf733e33-5d07-4704-a645-5c2e8be41616`. The merge build subsequently deployed
  `c83303c4-713f-4fe4-9843-d18ec597c409` at 05:32:16 UTC. Standalone production
  readiness passed against that final active version and its released lock.
- The public merge build deployed `5529a7d0-ed20-4974-ab5a-e5f20400d148`
  at 05:32:38 UTC. Both Cloudflare production build checks passed.
- New deployment-tool regression coverage passed. The updated complete private
  unit suite passed 2,114 tests; type checking and building passed. The public
  production build used real Ghost content, passed the 39-post deployment
  guard and retained 55 previous asset files.
- Three explicit synthetic owner requests to
  `https://buxx.me/api/analytics/collect` returned 204. Foreign Origin returned
  403, preview Origin 204 without collection, oversize body 413, malformed
  body 400 and unauthenticated reports 401. WAE independently returned the
  synthetic view as `owner / owner_toggle` with its deduplicated clicks.
- The real owner browser visited the deployed home and Mood panel. WAE readback
  returned unsampled home and mood-feed views as `owner / owner_access`, with
  visible dwell and named desk clicks. The portal's owner-browser exclusion
  was enabled through its checkbox and its stored value was verified.
- Production browser requests for Overview, Pages, Clicks, Sources, Audience,
  Quality, Log and Visitor returned 200. The independent Listening and
  Newsletter summaries also returned 200. Checks waited for each actual HTTP
  response rather than accepting a loading screen or cached previous tab.
- A production trace sample of 200 collector requests had maximum CPU 9 ms,
  no exceptions and only `ok` outcomes. This includes initial post-deployment
  traffic and owner checks. It does not establish the cron CPU budget.
- The first scheduled finished-day acceptance is 8 October after 01:00
  Melbourne time. The seven full quality days are 8–14 October; completion
  cannot be assessed before 15 October. The 7 October partial day is excluded
  from the seven-full-day quality comparison.
- A follow-up in this chat runs daily at 02:10 local time, records acceptance
  evidence, and reports meaningful failures or final completion. It does not
  treat successful collection as proof of successful daily aggregation.

The guarded first-token deployment command is:

```bash
bun run production:cutover --incremental --base-version-id <active-uuid> --analytics-token-file <secure-env-file> --execute
```

This option accepts only the previously absent analytics token. Existing token
rotation is rejected; all other deployed secret names must remain present.
Resume retains the same base and owner IDs and the token-file option, but uses
its already uploaded candidate without reading or uploading the secret again.
Normal subsequent deployments omit this option.


## First finished-day acceptance, 8 October

The heartbeat began at 02:13 Melbourne time on 8 October (15:13 UTC on
7 October). **Acceptance is blocked; production aggregation is not verified.**

- Production readiness passed: the active API version remains
  `c83303c4-713f-4fe4-9843-d18ec597c409`, required secrets are present, the
  cutover lock is released and matches the active version, and the permanent
  Notify fence and queue consumer remain healthy.
- The collector rejected a malformed POST with 400 without storing an event.
  Unauthenticated reports returned 401. A GET to the POST-only collector
  returned 404; this is not evidence that collection disappeared.
- D1 recorded `rollup_runs.day = 2026-10-07`, `status = failed`, `failures = 2`,
  `error = analytics_sql_422`, last started at `2026-10-07T15:00:34.611Z`.
  The day's `pv_daily`, `pv_dim_daily`, `click_daily` and `traffic_daily` each
  contain zero rows. No manual rerun was invoked because the required first
  successful cron run has not happened. Legacy backfill was not modified.
- Live read-only reproduction found 356 observed views. The click query
  constructed by `fetchWaeRange` included all 356 view IDs in one `IN (...)`.
  Its ASCII SQL was 14,496 bytes. WAE returned 422 with the explicit error:
  `SQL was excessively long, exceeded maximum length: 10000`.
- The view query, session query and weighted-point queries succeeded with the
  same credentials and dates. This isolates the failure to query length,
  rather than a missing token, missing dataset or empty completed day.
- A temporary read-only diagnostic split the ID lists into batches of 100.
  All five dependent queries passed; maximum query size was 7,924 bytes.
  It read the same 356 views and 93 deduplicated click records. Local aggregate
  reconstruction produced 11 page rows, 74 dimension rows, one click row and
  36 traffic rows. These were **not written to D1**.
- Classification of the observed views: 48 human, 228 bot, 80 owner. The 48
  human views include three mood embeds, so the whole-site human view total
  is 45. The remaining human surfaces are mood feed 43, blog post one and
  other one. No declared-tool UA was found among the human records.
- Weighted writes for the Melbourne day were 1,004 view points and 277 click
  points. RUM returned eight surface groups: mood feed 353, home 64, mood post
  35, blog index 30, mood embed 13, blog post two, blog tag two and other one.
  The day includes hours before collection activation. Its WAE/RUM ratio is
  not a valid seven-full-day quality comparison.
- Historical platform cron CPU/outcome traces were not captured in this run.
  D1 proves failed rollup attempts; it does not establish the scheduled
  invocation's CPU consumption or overall platform outcome.

Required repair: bound the complete SQL size for both the view-ID click lookup
and the session-ID neighboring-view lookup in
`site-api/src/features/analytics/server/site-wae.ts`. Combine disjoint batches
without losing deduplication, neighboring sessions or sampling metadata, and
retain the existing result-cardinality checks. Regression cases must exercise
hundreds of views, many sessions and the actual downstream query seam, with
an enforced 10,000 SQL-length limit. Re-run the full completed-day cloud query
and first-day cron/manual-rerun acceptance after deployment.

A read-only reproduction from the private analytics checkout is:

```bash
bun --env-file=/Users/tutu/Dev/site/.env.local -e '
import { readWaeRange } from "./src/features/analytics/server/site-wae";
import { dayBounds } from "./src/features/analytics/server/site-time";
const env = {
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_ANALYTICS_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
};
const bounds = dayBounds("2026-10-07");
try {
  const raw = await readWaeRange({ env }, bounds.from, bounds.to);
  console.log({ views: raw.views.length, clicks: raw.clicks.length });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
'
```

The current implementation fails with `analytics_sql_422` before any D1 write.
The acceptance automation is paused after recording this actionable blocker.
This heartbeat explicitly prohibited deployment changes; no runtime code,
credentials, production configuration or rollup rows were changed.
