# 039 — Land the serverless mood convergence stack

Status: proposed 2026-09-07. Completes plan 037 (track A) and plan 038 G2;
supersedes the in-Worker embed probe of plan 032 (its monitor survives).

## What broke

`https://buxx.me/mood/3810` (posted 2026-09-07) renders as a bare URL on `/`,
on `/mood/3810`, and in the newsletter. Its D1 row holds
`link_previews = [{"type":"link_preview_options",…}]` and
`last_verified_at IS NULL`. Neither the site nor the converge DO is at fault.

- The DO's server half lives on site-api `feat/mood-converge-ship` (15
  commits ahead of `main`, never pushed): `POST /v2/mood/converge/report`,
  the ingest-time unfurl, the `*/15` retry drain, the `web_page_none`
  terminal marker, the stale-lane cap.
- That branch was deployed on 2026-09-03 12:49Z. The next deploy, at
  15:35:22Z, came from `main`, which has none of it. The four deploys on
  2026-09-06 also came from `main`.
- KV `mood:converge:status.reportedAt = 2026-09-03T15:33:30Z` — 112 s before
  that deploy. The DO has alarmed every five minutes into an Astro 404 HTML
  page for four days; `failures` only counts, nothing stops the loop.
- The webhook has stored bare `link_preview_options` since then. Posts
  3806–3809 carry no URL; 3810 is the first link post after the regression,
  which is why the bug "came back".
- Backlog: 43 rows match the `needs_preview` predicate (ids 11…3810). All but
  3810 are 2022–2026 rows where Telegram most likely never produced a card.
  43 rows (every id ≥ 3806, plus 3803) have `last_verified_at IS NULL`.

The lesson is not "the DO needs a restart". It is that the only copy of the
production pipeline sat on an unmerged worktree branch, so the first routine
deploy from `main` erased it, and nothing watched the heartbeat.

## Design — four lanes, all on Workers Free

### A. Land the stack (the fix)

Merge `feat/mood-converge-ship` onto site-api `origin/main`. `git merge-tree`
shows conflicts in `package.json` and `bun.lock` only. Open a PR, deploy from
`main`. Restores the report route, ingest unfurl, retry drain, marker and
stale-lane cap. No `/start` is needed: the next alarm's report succeeds,
`getChannelDifference` from pts 9068 replays 3806–3810 plus any deletions,
and a TooLong falls into the existing dense sweep.

Document `/v2/mood/converge/report` on `/docs/api/internal` (path, purpose,
auth tier). Worker-level routes are invisible to `check:docs-coverage`, so
this is a manual obligation, same as the reconcile routes should have been.

### B. D1-backed preview backfill (new, ~60 lines)

Plan 037 seeded the retry list by hand once. A hand step is exactly what
this incident lost. Make D1 the queue instead: on the `*/15` cron, select up
to 5 rows matching `needs_preview`, newest first, call
`unfurlTelegramLinkPreview`, and write `web_page` (card found) or
`web_page_none` (embed renders, no card). A network failure or non-200 ends
the tick without writing — t.me throttling must not become a mass "no card".

Migration `0012_mood_needs_preview_index.sql`: a partial index on the
predicate (`channel, message_id` WHERE `is_deleted = 0 AND type = 'text' AND
instr(text, 'http') > 0 AND link_previews NOT LIKE '%web_page%'`) so the
query reads only backlog rows — zero once drained. 3810 is repaired on the
first tick; the 43 rows drain in about 2.5 h. The ingest-time unfurl and KV
retry from plan 037 stay as the fast path; this lane is the floor under it.

### C. Dead-man alert

Port `ops-bot/alerts.ts` and `mood-pipeline-monitor.ts` from
`claude/serverless-mood-reconcile` (drop its embed-probe half; the DO owns
aliveness now). Hourly cron, two signals:

1. KV `mood:converge:status.reportedAt` older than 1 h → "converge loop
   stalled" (the DO ticks every 5 min; 1 h absorbs a Telegram wobble).
   Costs zero D1 rows.
2. `needs_preview` backlog whose oldest `datetime` is older than 6 h →
   "previews not landing". Costs backlog rows only, via the lane B index.

Pushes go to the ops bot's allowlisted user ids with a 20 h KV dedupe. This
is the piece that turns a four-day silent outage into a Telegram ping at
the top of the next hour.

### D. Deploy guard

The failure class is "production deployed from a worktree branch, then
overwritten by `main`". Rule: production deploys come from `main` only;
worktree branches deploy to staging. Optional code guard: one assertion in
the site's hourly `tests/ops` run — unsigned
`POST /api/v2/mood/converge/report` returns 401, never 404. The ops-health
workflow is the scheduled check the owner already runs, so this adds no
scheduler.

### E. Retire, after seven silent days of lane C

`scripts/mood-reconcile/`, `/v2/mood/reconcile/{due,report}` with
`handleMoodReconcileRequest` and `MOOD_RECONCILE_*`, the
`claude/serverless-mood-reconcile` branch, plan 032's probe sections, and
the site's dead `preserveBookmarks` sanitizer option. Then plan 038's A3:
VPS credentials deleted, box off.

## D1 budget

Lane B reads ~0 rows once drained (partial index). Lane C signal 1 reads
none; signal 2 reads backlog rows. Neither moves the plan 038 G1 target of
< 65,000 reads/day.

## Verification

1. After the lane A deploy: `mood:converge:status.reportedAt` advances
   within 5 min; unsigned `POST /api/v2/mood/converge/report` → 401.
2. Within 15 min: a cache-busted `/api/v2/mood/3810?fallback=0` returns
   `media[0].type === 'link-preview'`; `/` and `/mood/3810` render the card
   once edge SWR turns over.
3. Within 3 h: the `needs_preview` count is 0; historic rows carry
   `web_page_none`.
4. Lane C: unit tests with a fake clock; the first hourly tick logs
   `previewBacklog: 0, staleWatermark: false` in `wrangler tail`.

## Not in scope

- Site rendering. `renderLinkPreview` and `renderStructuredMoodDetailContent`
  already draw the card; verified locally against 3810's shape.
- Hand-editing D1 rows. Lane B repairs them through the sanctioned path.
- Media over 20 MB, GitHub Actions as a pipeline scheduler, a VPS, a Paid
  plan — per plans 033 and 037 and the owner's standing constraints.

## Decisions for the owner

1. Lane A merge shape: merge commit (recommended — the DO kill-test fixtures
   carry history worth keeping) or a rebase of the 15 commits.
2. Historic rows: mark `web_page_none` after one clean "embed renders, no
   card" observation (recommended — old posts are deterministic) or after
   three attempts like the ingest retry.
