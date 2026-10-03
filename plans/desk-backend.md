# Desk backend: what /new needs from site-api

Written 2026-10-04 from the `agent/desk-home-prototype` branch of `site`
(head `9ad0c321`), after the desk gained subscriptions, a letter panel, the
painted GitHub year and the blog tally; revised the same day after the
GitHub card moved to the profile README and the forms took the comment
box's Turnstile flow. Facts about `site-api` are read from its
`origin/main`, not from the local checkout, which is stale.

The desk renders today without any of this. Where a figure has no source yet
it is **mocked in `src/features/desk/server/content.ts`** (search for `MOCK`).
Each item below names what the mock stands in for, so the executor can delete
it in the same PR that wires the real source.

## Already served, nothing to build

| Desk feature | Endpoint | Notes |
| --- | --- | --- |
| Subscribe slips (writing, moods) | `POST /api/notify/subscribe` | Same payload as the blog and mood panels: `channels: ['blog' \| 'mood']`, `deliveryMode`, Turnstile action `notify_subscribe`. A refusal (`400 "Turnstile verification failed"`) opens Cloudflare's checkbox and sends again once. See 4 for what the route does not check yet. |
| Letter panel | `POST /api/v2/messages` + `/api/v2/comments/dwell-token` | Runs the /message form client: dwell token, browser evidence, honeypot, Turnstile with the checkbox fallback. |
| Painted GitHub year | `GET /api/github/contributions?days=365` | Real data: 365 days with GitHub levels; the total and the day under the pointer are read in the browser (`client/year.ts`). About ten minutes behind GitHub (Worker cache, 600s at the edge). |
| GitHub week line | `raw.githubusercontent.com/bunizao/bunizao/HEAD/README.md` | Real data: the activity block the profile's `activity.yml` rewrites five times a day (00/05/10/15/20 UTC); an isolate rereads it at most every 30 minutes (`server/github.ts`). Private repositories are already unnamed there. |
| GitHub avatar | `/static/github/bunizao/avatar` | The site's media proxy, one allowlisted login. |
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

## 2. `GET /api/v2/blog/stats` (P1, new public route)

Replaces the `mockReads` MOCK. Named for what it counts: everything else
about these figures already says *blog* (the `/blog` routes, the
`blog_analytics_events` table, the notify channel `blog`, the portal's
blog analytics). The desk calls the section "writing"; the API does not
need to follow the desk's prose.

The source is `blog_analytics_events` (written by `POST
/api/analytics/event`, table since site-api migration 0003, 2026-06-28). The
admin portal already aggregates it in `getBlogAnalyticsSummary` /
`getBlogAnalyticsArticleDetail`
(`src/features/analytics/server/blog-analytics.ts`); reuse those queries,
but expose only the public aggregates.

```json
{
  "generatedAt": "2026-10-04T00:00:00.000Z",
  "since": "2026-06-28T09:14:00.000Z",
  "totals": { "reads": 12765, "readers": 4210, "completed": 3100 },
  "posts": [
    { "slug": "some-post", "reads": 2400, "completed": 610, "medianDwellMs": 182000 }
  ]
}
```

- **There is no backfill, so the figures carry their start.** Nothing was
  counted before the table existed, and nothing can be recovered for
  posts read before then. `since` is `MIN(opened_at)` over the table, kept
  in the snapshot (not recomputed per request). Every figure means "since
  `since`", never "all time".
- The desk says exactly that: "Read 12,765 times since I started counting
  in June 2026". It already renders this sentence from the mock
  (`DeskWriting.reads.since` in `server/content.ts`). A post published
  after `since` has its whole life counted; one published before has only
  its tail. Neither is labelled per post on the desk, so no per-post
  `since` is needed.
- **Don't mix sources.** If older page views exist elsewhere (GA4,
  Cloudflare Web Analytics), they are views, not reads, measured
  differently and with bots counted another way. Never add them to
  `reads`. If the owner wants them shown, a separate one-off import into a
  separate `views` figure with its own label, and only on the owner's say.
- A **read** is one distinct `eventId` (one page view). `readers` is distinct
  `visitorId`. `completed` counts `completed = 1`. Bots never reach the table.
- Public data only. Never return referrers, countries, user agents, visitor
  ids or anything per event: `/docs` is public and so is this route.
- Precompute into KV like the mood snapshot (daily or 6-hourly), with the
  route reading only KV. No D1 work per request.
- Cache: `public, max-age=300`, CDN `max-age=3600, stale-while-revalidate=86400`.
- Contract: add `BlogStats` to `packages/contracts` in `site` (canonical),
  publish by tag (`contracts-vX.Y.Z`), then raise the pin in `site-api`.
- Docs: a "Blog stats" section in `src/content/docs/api/content.md`, then
  `bun run check:docs-coverage` with `SITE_API_REPO=../site-api`.
- Site side (after it ships): `loadDeskContent` fetches it through the same
  service binding as the mood feed, joins by slug, takes `since` from it,
  and drops `mockReads` and `MOCK_READS_SINCE`. The tally keeps working
  without it: a missing snapshot hides the "Read N times" sentence, it
  does not fail the page.

## 3. `GET /api/v2/github/activity` (P3, only if the README stops being enough)

The desk no longer needs this. The week line ("484 commits in 8 projects
this week, among them site, moodle-cli and Attegi") is read from the
profile README's activity block (see the table above), which already
leaves private repositories unnamed. The `MOCK_REPOS` mock is gone.

Build it only if the desk wants what the README does not have (languages,
push times), or if the profile workflow is retired. Then:

- **Public, non-fork, non-archived repositories only**, ordered by
  `pushedAt`, at most 5. Private repos (the Koenig fork, site-api) must never
  appear, not even by name; filter with `privacy: PUBLIC` in the query, not
  afterwards. `src/lib/github.ts` already talks to GitHub's GraphQL with a
  token for the contributions grid; extend it.
- Same allowlist (`bunizao` only), rate limit and cache tiers as
  `/api/github/contributions` (10 min in the Worker, 600s at the edge).
- Docs: next to "GitHub contributions" in `content.md`.

## 4. Subscribe risk parity (P2, site-api + contract)

The letter and the comment box send four signals; `POST
/api/notify/subscribe` takes one. Today it checks Turnstile and a rate limit,
and double opt-in means nobody is subscribed without clicking the mail.
What it still allows is using the form to send confirmation mail to
someone else's inbox. Turnstile makes that slow, not impossible.

- **Per-address cooldown on the confirmation mail** (do this first, and
  check whether it already exists): an address that was sent a
  confirmation in the last N hours gets the same `200` but no new mail.
  This is the control that actually caps mail to a victim.
- **Honeypot**: accept an optional `website` field. Filled means a bot:
  answer the normal `200` and drop it, as the message route does.
- **Dwell token**: accept an optional `dwellToken` from
  `/api/v2/comments/dwell-token`, checked with `inspectDwellToken` like
  messages. Missing or young: score it, don't refuse (old clients and the
  blog/mood panels must keep working).
- **Browser evidence**: `collectClientEvidence` output, scored the way
  comments score it. Never refuse on the input method (owner's rule from
  the comments flood work).
- All additive and optional in the contract; unknown fields ignored, so
  the desk slips can start sending them before the route reads them.
  Site side: the slips mint the dwell token on open and send the honeypot
  and evidence; the blog and mood panels follow in the same PR.

## 5. Optional, the owner's call before anyone builds them

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
alone. 2 needs a contracts release; 4's contract fields can ride in the
same version. 4's cooldown needs no contract and can go any time. 3 waits
until the README is not enough; 5 waits for a yes.
