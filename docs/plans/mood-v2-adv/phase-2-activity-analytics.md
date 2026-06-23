# Phase 2 — Activity analytics (no AI)

**Goal:** ship `/mood/stats` with everything that doesn't need AI — activity heatmap,
hour×weekday rhythm, streaks, media composition. Establishes the **KV-snapshot pipeline** that
Phase 3 extends with sentiment.

**Depends on:** P0. **Unblocks:** P3 (reuses the snapshot + aggregation + page).

---

## Scope
Pure D1 aggregation → hourly cron → KV snapshot → public read endpoint → stats page + four viz
components. The snapshot includes a `sentimentTimeline` field, left **empty** until Phase 3.

Out of scope: any AI / sentiment computation.

---

## Steps

### Step 2.1 — Aggregation functions (`site-api`)
Pure, D1-only, no mutation, no AI:
- `activity` — posts per local date.
- `rhythm` — 7×24 weekday/hour matrix.
- `streaks` — current + longest consecutive-day run.
- `media` — counts by type (text/photo/video/other).
- `totals` — posts, firstPostAt, lastPostAt.
- (`sentimentTimeline` stub returns `[]` this phase.)

Unit tests with seeded fixtures: 5 posts / 3 days → activity sums to 5; streak edges (single day,
gap-broken); empty DB → well-formed empty snapshot (empty arrays, `streaks {current:0,longest:0}`)
without throwing.

### Step 2.2 — Cron → KV snapshot (`site-api`)
Scheduled handler assembles `MoodStatsSnapshot`, writes KV `mood:stats:v1` with `generatedAt`.
Register the cron trigger in wrangler config (hourly).
- **On aggregation error, leave the previous snapshot intact** (no partial/empty overwrite); log.
- Document an on-ingest best-effort refresh hook (full recompute optional this phase).
- Verify (mocked KV): invoking the handler writes a snapshot whose `totals.posts` matches fixtures.

### Step 2.3 — Public `GET /v2/mood/stats` (`site-api`)
Reads `mood:stats:v1` from KV, returns JSON with sensible cache headers. Unauthenticated;
aggregate-only (no raw text/PII).
- **Missing snapshot → documented unavailable response; never query D1 inline.**
- Verify: with a snapshot, 200 + keys present; without, the unavailable response and **no D1 hit**.

### Step 2.4 — `/mood/stats` page scaffold (`site`)
Astro route fetches `/v2/mood/stats` once on the server (existing API service binding), passes the
snapshot to components. Friendly empty state when unavailable. Reuse mood layout/tokens; link back
to `/mood`.

### Step 2.5 — Viz components (`site`)
- **Activity calendar** — date-keyed, color by posts/day, accessible hover (date + count); empty
  array → empty frame, not a broken grid.
- **Rhythm heatmap** — 7×24 grid, reuse calendar color tokens; all-zero matrix → uniform empty
  grid, no NaN colors.
- **Streaks** — current + longest, clear labels (`current streak: 12 days`); zero → `0 days`.
- **Media composition** — stacked bar or donut; zero data → empty state, no divide-by-zero.
- Respect `prefers-reduced-motion` for any reveal.

---

## Acceptance
- `/mood/stats` renders activity, rhythm, streaks, media from a single snapshot fetch.
- Anonymous traffic never triggers a D1 query (snapshot-only).
- Gates pass in both repos.

## Negative cases
- Empty DB → valid empty snapshot, page shows empty states.
- Snapshot missing in KV → endpoint returns unavailable **without** D1 compute; page shows
  "stats not ready yet".
- Aggregation throws during cron → old snapshot preserved.

## Verification (UI)
Repo Playwright for the heatmaps/streaks/media render + empty states; compress screenshots.
