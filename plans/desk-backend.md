# Desk backend: what /new needs from site-api

Written 2026-10-04 from the `agent/desk-home-prototype` branch of `site`
(head `9ad0c321`), after the desk gained subscriptions, a letter panel, the
painted GitHub year and the blog tally. Facts about `site-api` are read from
its `origin/main`, not from the local checkout, which is stale.

The desk renders today without any of this. Where a figure has no source yet
it is **mocked in `src/features/desk/server/content.ts`** (search for `MOCK`).
Each item below names what the mock stands in for, so the executor can delete
it in the same PR that wires the real source.

## Already served, nothing to build

| Desk feature | Endpoint | Notes |
| --- | --- | --- |
| Subscribe slips (writing, moods) | `POST /api/notify/subscribe` | Same payload as the blog and mood panels: `channels: ['blog' \| 'mood']`, `deliveryMode`, Turnstile action `notify_subscribe`. |
| Letter panel | `POST /api/v2/messages` + `/api/v2/comments/dwell-token` | Runs the /message form client unchanged. |
| Painted GitHub year | `GET /api/github/contributions?days=365` | Real data: 365 days with GitHub levels. Streaks, busiest day and weekday are computed in the browser (`client/year.ts`). |
| Blog posts and words | Ghost, via `getListedPosts` + `writingLedger` | Real, computed at request time in `site`. |

## 1. Restart the mood stats snapshot (P0, ops + one flag)

`GET /api/v2/mood/stats` serves a KV snapshot generated **2026-07-15T19:00Z**.
The hourly refresh was switched off on 2026-07-16 (site-api `57a08b0`,
`scheduledMoodStatsRefreshEnabled = false` in `src/worker-tasks.ts`, with the
note "paused until the Mood stats UI ships"). Everything it says is now
eleven weeks old: `totals.posts`, `lastPostAt` and `streaks.current` are wrong.

- Turn the scheduled refresh back on, but daily, not hourly. The snapshot
  aggregates over all of `mood_posts`; at 24 runs a day it spends D1 reads
  (Free tier, 5M rows/day, shared with every other site DB) for figures that
  move a few times a day. Measure one run's rows read
  (`meta.rows_read` per query) before choosing the cadence.
- **`media.photo` is 0**: the aggregation reads the `media` JSON column, but
  about 970 archived photo rows have `media = NULL` while their objects sit
  at R2 `mood/<id>/0`. Count photos by `type = 'photo'` instead
  (`aggregateMedia` in `src/features/mood/server/mood-stats.ts`).
- **`sentimentTimeline` is empty**: the query needs `sentiment_label` /
  `sentiment_score`, and nothing has written them. Either backfill them
  (through the tuuhub gateway, alias `task-guard` or a new alias, never a
  vendor SDK) or drop the field from the contract. Don't ship an empty
  chart.
- Acceptance: `generatedAt` is less than 25h old, and `totals.posts` matches
  `SELECT COUNT(*) FROM mood_posts WHERE is_deleted = 0` within a day.

## 2. `GET /api/v2/writing/stats` (P1, new public route)

Replaces the `mockReads` MOCK. The source is `blog_analytics_events` (written
by `POST /api/analytics/event`). The admin portal already aggregates it in
`getBlogAnalyticsSummary` / `getBlogAnalyticsArticleDetail`
(`src/features/analytics/server/blog-analytics.ts`); reuse those queries, but
expose only the public aggregates.

```json
{
  "generatedAt": "2026-10-04T00:00:00.000Z",
  "totals": { "reads": 12765, "readers": 4210, "completed": 3100 },
  "posts": [
    { "slug": "some-post", "reads": 2400, "completed": 610, "medianDwellMs": 182000 }
  ]
}
```

- A **read** is one distinct `eventId` (one page view). `readers` is distinct
  `visitorId`. `completed` counts `completed = 1`. Bots never reach the table.
- Public data only. Never return referrers, countries, user agents, visitor
  ids or anything per event: `/docs` is public and so is this route.
- Precompute into KV like the mood snapshot (daily or 6-hourly), with the
  route reading only KV. No D1 work per request.
- Cache: `public, max-age=300`, CDN `max-age=3600, stale-while-revalidate=86400`.
- Contract: add `WritingStats` to `packages/contracts` in `site` (canonical),
  publish by tag (`contracts-vX.Y.Z`), then raise the pin in `site-api`.
- Docs: a "Writing stats" section in `src/content/docs/api/content.md`, then
  `bun run check:docs-coverage` with `SITE_API_REPO=../site-api`.
- Site side (after it ships): `loadDeskContent` fetches it through the same
  service binding as the mood feed, joins by slug, and drops `mockReads`.
  The tally keeps working without it: a missing snapshot hides "read N
  times", it does not fail the page.

## 3. `GET /api/v2/github/activity` (P1, new public route)

Replaces the `MOCK_REPOS` MOCK ("Lately pushed to ogis yesterday, …").
`src/lib/github.ts` already talks to GitHub's GraphQL with a token for the
contributions grid; extend it.

```json
{
  "generatedAt": "2026-10-04T00:00:00.000Z",
  "repos": [
    { "name": "ogis", "url": "https://github.com/bunizao/ogis", "pushedAt": "2026-10-03T08:12:00Z", "language": "TypeScript", "stars": 5 }
  ],
  "languages": [{ "name": "TypeScript", "share": 0.71 }]
}
```

- **Public, non-fork, non-archived repositories only**, ordered by
  `pushedAt`, at most 5. Private repos (the Koenig fork, site-api) must never
  appear, not even by name; filter with `privacy: PUBLIC` in the query, not
  afterwards.
- `languages` is optional: bytes per language summed over those public repos.
- Same allowlist (`bunizao` only), rate limit and cache tiers as
  `/api/github/contributions` (10 min in the Worker, 600s at the edge).
- Docs: next to "GitHub contributions" in `content.md`.

## 4. Optional, the owner's call before anyone builds them

- **Subscriber counts** ("212 readers get the moods by email") under the
  slips. Social proof, but it publishes the size of the list; the owner
  decides. Source: confirmed rows in the notify subscriber table, by channel.
  Aggregate counts only.
- **Listening counts** (plays this week, top artist) from
  `listening_analytics_events`, for a line under the turntable.
- **Where a subscription came from**: an optional `source: 'desk' | 'blog' |
  'mood'` on `POST /api/notify/subscribe`, stored on the subscriber row, so
  the portal can say whether the desk slips convert. It is a contract change.
  Unknown values must be ignored, not rejected, so an old client never breaks.

## Order

1 is a flag and a query fix and unblocks the mood figures; do it first and
alone. 2 and 3 are independent and each needs a contracts release, so batch
their contract additions into one version. 4 waits for a yes.
