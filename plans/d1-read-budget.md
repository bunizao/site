# D1 read budget

Provenance: 2026-09-29. The owner saw a site-notify read spike and a Cloudflare
email warning that the account was close to its D1 write limit ("d1 的 read
激增 … 写入昨天也给我发邮件逼近限额了"). Constraint from the owner: **no change to
current performance or behaviour.** Project isolation (moving unicorn to another
account) is not possible for now.

## State

**Phase 0 in review** (bunizao/site-api#90). Phases 1–3 not started. Cache
max age decided by the owner: **60 s**. unicorn is out of scope here; the
owner is handling it in its own repository.

## What the numbers say (GraphQL `d1AnalyticsAdaptiveGroups`, `d1 insights`)

- The Free plan allows **5M rows read and 100k rows written per day, for the
  whole account**. All four databases share that allowance.
- **Writes come from unicorn, not from site.** On 2026-09-28 unicorn wrote
  87,421 rows, site-notify 833 and site-mood 42. On 2026-09-26 unicorn wrote
  211,250 rows, over the limit. Its hourly `labelStructure` rewrites about 650
  unchanged items per cycle, about 5 rows each. The deployed source is in no
  local or GitHub branch at the time of writing; unicorn is tracked outside
  this plan.
- **site-notify reads are small but multiplied.** At rest it reads about 216
  rows an hour (cron). A portal session hour read 89,531 rows in 4,755 queries.
  That is under 2% of the daily allowance at today's size (61 comments, 57
  reactions, 1 message).
- **Query shape is already good.** Indexes, partial indexes and `INDEXED BY`
  pins are in place. Each statement reads about the size of its table. The waste
  is repetition:
  - Every `GET admin/comments` recomputes the same six-statement summary, plus
    about 20 actor-count lookups. That includes the 60-second badge poll, every
    infinite-scroll page and every refetch of a loaded page.
  - The idle warm-up, link-intent prefetch and focus refetch then repeat those
    identical reads while nothing has changed.
- Analytics tables are about 600 rows read a day. Not a factor.

The growth risk: every aggregate scales with table size multiplied by request
count. At 10k comments, the same portal hour is about 15M rows.

## Principle

Keep every request the client makes. Make identical reads cheap on the server
instead. Prefetch, polling, `staleTime` and focus refetch stay exactly as they
are, and no contract changes. The client does not change, so its performance
and behaviour cannot regress.

## Phase 0 — measure (site-api, no behaviour change)

1. Count D1 work per request. Built as `src/lib/runtime/d1-meter.ts`: the
   admin middleware swaps `locals.env` for a copy whose `NOTIFY_DB`, `DB` and
   `MOOD_DB` are metered, so every reader in the request is counted, not just
   the two client factories. Sums `meta.rows_read`, `meta.rows_written` and the
   statement count from `all()`, `run()` and `batch()` results; a bare
   `first()` runs as `all()[0]` so it reports meta.
2. For `/admin/*`, emit `Server-Timing: d1;desc="q=<n> read=<rows> write=<rows>"`,
   and one `d1_request` log line per request (route pattern, status, q, read,
   write) for `wrangler tail`. The raw path is never logged: source routes
   carry emails and IPs.
3. Baseline: the owner uses the portal normally for about 30 minutes. Tail the
   log and total it per route. That table is the before number for phases 1–2.

Verify: unit test that a request through the wrapper reports the right totals
(bun:sqlite fake). Check that response bodies are byte-identical.

## Phase 1 — version-stamped read cache for the comment summary (site-api)

The summary is the same for every filter, page and caller, so one cache entry
serves all of them.

1. Migration `scripts/sql/migrations/0041_moderation_version.sql`:
   - `CREATE TABLE data_versions (name TEXT PRIMARY KEY, version INTEGER NOT NULL) WITHOUT ROWID`,
     seeded with `('moderation', 0)`.
   - `AFTER INSERT / UPDATE / DELETE` triggers on `blog_comments`,
     `blog_reactions`, `owner_messages` and `blog_bans` (plus any other ban
     table the cached reads touch) that run
     `UPDATE data_versions SET version = version + 1 WHERE name = 'moderation'`.
   - Triggers catch every writer (routes, cron, bot, manual `d1 execute`), so no
     code path can forget to invalidate. site-notify already runs triggers in
     production (`trg_notify_gate_*`).
2. Cache helper, about 40 lines, `src/features/admin/server/read-cache.ts`: an
   isolate-memory `Map` capped at about 200 entries, keyed by
   `name + params + version + UTC date`. Each entry holds a value and
   `computedAt`. It is a hit only when the version matches and the entry is
   younger than `maxAgeMs`. Read the version first, then compute on a miss.
   This order is race-safe: a write during the compute only makes the stored
   value newer than its key.
3. Wrap `getAdminCommentSummary` with `maxAgeMs = 60 s` (owner's choice).

Why memory rather than the Cache API or KV:
- The Cache API is unavailable behind Cloudflare Access, which fronts part of
  `buxx.me/api/*`.
- Workers Caching serves responses before the Worker runs, so it would skip the
  admin auth check.
- KV (1k writes/day on Free) and a D1 cache table would spend writes, the scarce
  resource.

Behaviour: new comments, moderation actions, reactions and bans change the
version and show at once, the same as today. The only difference: a row falling
out of a rolling window ("last 24h", 30-day actor counts) can leave the count up
to 60 s late, within the 20–60 s staleness the client already tolerates. The
60-second badge poll mostly misses at this age; prefetch, paging and refetches
within the minute still hit.

Performance: a hit costs one primary-key read instead of six aggregates. A miss
adds that one short read before the compute.

Verify:
- A test inserts, updates and deletes on each covered table and asserts the
  version moves.
- A test asserts a cached summary equals a fresh one after each kind of write.
- A test asserts every table named in the cached SQL has all three triggers.
- `Server-Timing` shows `q=1` on repeat reads within a minute (paging, refetch, re-hover).

## Phase 2 — extend the same cache (site-api)

Apply the helper, same version, to:
- the D1 half of `GET admin/comments` (rows, total and actors, keyed by the full
  query string; post names stay live outside the cache);
- `GET admin/sources/[type]/[value]` (18 statements);
- `GET admin/comments/insights` and `GET admin/reactions/insights` (keyed by
  window).

One shared version keeps this simple. A reaction also invalidates comment
entries, which is rare enough not to matter.

Expected effect: repeat reads (poll, refetch, re-hover, revisits) drop to one
row. The first view of each distinct source or window still pays full price.
Removing that would mean cutting prefetch, which the owner's constraint rules
out. Target: roughly 60–90% fewer site-notify rows per portal hour. Confirm
against the phase 0 baseline and record the real number here.

STOP if the hit rate in `Server-Timing` stays low because requests spread
across many isolates. Record it, and decide with the owner before reaching for
a shared store.

## Phase 3 — budget alert (site-api cron)

Without isolation, the only defence against another project exhausting the
shared allowance is early warning.

1. On the existing hourly cron (`src/worker-tasks.ts`), query GraphQL for today's
   account-wide `rowsRead` and `rowsWritten`, per database.
2. At 50%, 80% and 95% of either limit, message the owner through the existing
   Telegram owner channel. Include the top database, and send each threshold
   once a day (one `settings` row write per alert).
3. New secret: a Cloudflare API token with Account Analytics Read only.

Verify: unit test of threshold and dedupe logic against a canned GraphQL
response; one manual dry run with the thresholds lowered.

## Not doing

- Removing or delaying prefetch, polling or focus refetch, or raising
  `staleTime`: each costs click-to-paint, which the owner ruled out.
- Returning the summary only on page 1: this needs a contract change, and phase
  1's cache already makes the repeats free.
- Counter tables maintained on write: they spend writes and duplicate the
  version cache's job at today's scale. Revisit past about 10k comments.
