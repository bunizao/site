# Analytics expansion verification

Recorded on 2026-10-07, Australia/Melbourne. This file separates implementation,
local verification, cloud verification and production activation.

## Current state

- The public client and private Worker implementation are complete on their
  feature branches. Production `site` and `site-api` have not been switched.
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
- Production still needs a dedicated `CLOUDFLARE_ANALYTICS_TOKEN`, scoped to
  Account Analytics Read on the owning account. Existing local credentials
  proved that SQL and RUM can be queried, but their full scope was not
  available for inspection; they were not copied into the Worker.
- `SITE_ANALYTICS_CUTOVER_AT` remains unset until the actual public deployment.
  No retirement or table-drop clock has been started.

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
  fourteen public routes at 320, 375 and 1440 pixels.
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

Do not describe this work as production-live until steps 1–4 have their real
receipts. Do not describe the seven-day quality acceptance as passed until all
seven Melbourne days have been observed.

The final freshness check merged the current `origin/main` letter-receipt and
dependency changes, then repeated the public type check, full unit suite,
build and eight browser acceptance tests. The implementation commits are
unsigned because 1Password SSH signing failed; no global signing setting was
changed. Production still answered 404 on the unimplemented public collect
route at the final read-only deployment check.
