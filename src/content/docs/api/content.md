---
title: Content & Integrations
description: Blog metadata, legacy mood comments, GitHub contributions, Instagram, MusicKit, and a disabled posts API.
group: API
order: 4
---

These endpoints return content metadata and integration data. Third-party
integrations cache upstream responses; blog stats read a precomputed snapshot.

## Blog stats

```
GET /api/v2/blog/stats
```

Public aggregate reads from the site's blog analytics, refreshed daily at
19:00 UTC. The request reads only KV; it never queries D1.

```json
{
  "generatedAt": "2026-10-04T19:00:00.000Z",
  "since": "2026-06-28T09:14:00.000Z",
  "totals": { "reads": 12765, "readers": 4210, "completed": 3100 },
  "posts": [
    { "slug": "some-post", "reads": 2400, "completed": 610, "medianDwellMs": 182000 }
  ]
}
```

One distinct event id counts as one read, distinct visitor ids count as
readers, and completed events count toward `completed`. Dwell time is the
stored maximum per event; the per-post median includes all recorded events.
This route counts every recorded page view, unlike the portal's dwell-time
threshold for reads. Bots filtered during ingestion do not reach the table.

`since` is the earliest recorded opening time across the table, kept in the
snapshot. It is `null` when the table is empty. These are figures since
collection began, with no historic backfill or imported third-party views.
Only post slugs and aggregates are public: no visitor ids, referrers,
countries, user agents, or event records are returned.

Successful responses use `Cache-Control: public, max-age=300` and
`Cloudflare-CDN-Cache-Control: public, max-age=3600, stale-while-revalidate=86400`.
A missing snapshot returns an uncached `503` with
`error.code: "blog_stats_unavailable"`. The desk keeps its writing tally
and hides the reading sentence until a snapshot is available.

## Writing

```
GET /api/writing
```

Returns the latest posts from the Ghost blog, as the home page renders them.
No auth. Rate limit: 60 requests / 60s.

Responses are cached for a long time
(`public, s-maxage=3600, stale-while-revalidate=86400`), because the blog does
not change by the minute and this endpoint sits in front of a Ghost Content API
call.

```json
{
  "ghostUrl": "https://blog.buxx.me",
  "posts": [
    {
      "id": "6512c0f3a9b1e40001d2c4aa",
      "title": "無人之境",
      "url": "https://blog.buxx.me/wu-ren-zhi-jing/",
      "published_at": "2026-08-14T09:00:00.000Z",
      "tags": [{ "id": "…", "name": "Essays", "slug": "essays", "visibility": "public" }]
    }
  ]
}
```

The response always has exactly the five newest posts. There is no `limit`
parameter.

`tags` can include entries with `visibility: "internal"`. Ghost uses that for
tags starting with `#`, which are for routing and should not be rendered as
topic labels. Filter on `visibility === "public"` before you display them.

There is no error branch. If Ghost is unreachable, the handler returns `200`
with an empty `posts` array instead of a `5xx`. As with
[`/api/footer`](/docs/api/status#footer-status), an empty result and a broken
upstream look the same from the outside.

## Comments by post id

```
GET /api/comments?postId=<id>
```

The public read path for one mood post's comment thread. It reads the
**live** Telegram mirror instead of the D1 archive, and the site's own mood
pages call it. It answers directly (no redirect) with the same handler as
`/api/v1/mood/:id/comments`. The older `/api/mood/:id/comments` form is a
redirect to that versioned route. See [Mood API](/docs/api/mood) for the
response shape and the freshness trade-off.

### Caching

The payload is the same for every viewer (published rows only), so readers
share the thread. The route uses a 15s in-worker cache entry per
`postId`/`limit`/`before`, kept apart from the archive route's entries. It also
sends `Cloudflare-CDN-Cache-Control: public, max-age=15, stale-while-revalidate=30,
stale-if-error=300` with browser `Cache-Control: public, max-age=0`.

A new or deleted comment can therefore take up to about 45s to reach other
readers. The writer's own row comes from the `no-store` `/api/v2/comments`
poll, not from this route. `?fresh=1` or `?probe=1` bypasses both layers and
returns `no-store`. `/api/v1/mood/{id}/comments` follows the same policy.

### Response fields

Each comment has the same fields as the mood route, including the optional
`replyTo: { id, author, text }` block that names the parent comment when the
comment is a reply. `text` is a plain-text preview (≤ 200 chars); `content` is
the reply body only.

Comments also carry the Telegram-bridge overlay fields:

| Field | Meaning |
| --- | --- |
| `origin` | `"web"` for a comment written on the site. Omitted for an ordinary Telegram one |
| `commentId` | The site's own comment row id. On `web` items only |
| `anchorToken` | Renders as `id="c-<anchorToken>"`. On `web` items only |

The overlay replaces a scraped message that links back to a published site row
with that row's author and body. It also appends a site row the scrape hasn't
picked up yet. It never does both for the same comment. See
[Comments API § Mood surface](/docs/api/comments#mood-surface-the-telegram-bridge)
for the full bridge.

The `MoodContentDocument` this thread belongs to carries `discussionLinked`
(the compose box on `/mood/[id]` may post into this thread) and
`discussionRepliesEnabled` (a reply to a `telegram`-origin comment is safe to
send). See [Mood API § Detail](/docs/api/mood#detail).

### Errors

`postId` is required and trimmed. Omitting it, or sending only whitespace,
returns `400 {"error":"Missing postId parameter"}`. That error is a flat
string, while the mood comment payload the route wraps uses the nested
`{"error":{"code","message"}}` form. One route can return both
[error shapes](/docs/api/overview#error-shapes), depending on how
far the request got.

## GitHub contributions

```
GET /api/github/contributions?username=bunizao&days=365
```

Returns the contribution grid on the home page. No auth. Rate limit: 60
requests / 60s.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `username` | string | `bunizao` | Must be `bunizao`. Any other login is rejected. |
| `days` | integer | `365` | `1`–`365`. Non-numeric or out-of-range values are rejected, not clamped. |

```json
{
  "total": { "lastYear": 1284 },
  "contributions": [{ "date": "2026-08-23", "count": 4, "level": 2 }]
}
```

`contributions` is the trailing `days` window, oldest first, one entry per
day. `level` is GitHub's own 0–4 intensity bucket.

`total.lastYear` is always the full-year total. It does **not** shrink when you
narrow `days`: a 30-day window still reports the annual count. Don't use it as
the sum of the array you got back.

### Caching

A `200` is `Cache-Control: public, max-age=300` with
`Cloudflare-CDN-Cache-Control: public, max-age=600, stale-while-revalidate=86400, stale-if-error=86400`
and no rate-limit headers. The grid is public and the same for every viewer,
so the edge answers repeat views without running the Worker. Errors, and the
E2E fixture, are `no-store, max-age=0`.

Behind the edge copy, the Worker also caches results for 10 minutes per
`(username, days)` pair, so heavy traffic on this endpoint does not reach
GitHub. The home page's grid and hero card both ask for `days=84` so they share
one cached copy. The grid trims it to 30 days in the browser.

### Errors

`400 {"error":"Unsupported GitHub username"}` for any login other than
`bunizao`. The username is an allowlist, so the route will not fetch other
users' grids.

`400 {"error":"Unsupported contribution window"}` for a bad `days`.

`429 {"error":"Too Many Requests"}` when rate limited.

`503 {"error":"GitHub
contributions unavailable"}` when GitHub's API cannot be reached. You can retry
this one. Unlike `/api/writing` and `/api/footer`, this route reports the
failure.

Any method other than `GET` gets a plain-text `405 Method Not Allowed`.

## Instagram profile

```
GET /api/v2/instagram
GET /api/v2/instagram/avatar
```

These routes serve a stored Instagram profile: picture and counts. No auth. The
profile route is rate limited to 60 requests / 60s; the picture route is not
rate limited.

The home page's Instagram card doesn't use them. It shows a hand-updated
snapshot (`instagramSnapshot` in `src/data/site.ts`), because Instagram now
refuses the logged-out read below from every server address tried (`401` with
`require_login`, GitHub Actions runners included), so the store has never been
filled in production.

### Where the data comes from

Neither route talks to Instagram. Instagram has no API for a private personal
account, and the web app's own `web_profile_info` endpoint answers only over
HTTP/2, which a Worker's outbound fetch does not speak.

Instead, a GitHub Actions job in `site-api`
(`.github/workflows/instagram-refresh.yml`, manual dispatch only) reads the
profile with curl and reports the answer to a signed internal route. `site-api`
checks that the report is for this account and has a picture on Instagram's
photo CDN, downloads the picture, and stores both in KV. A report that fails
any check stores only its attempt record, so these routes always serve the
last read that passed.

```json
{
  "username": "bunizao_",
  "fullName": "Lucian Bu",
  "profileUrl": "https://www.instagram.com/bunizao_/",
  "avatar": {
    "url": "https://buxx.me/api/v2/instagram/avatar?v=3f1c0a9b2d4e5f60",
    "contentType": "image/jpeg",
    "bytes": 18412,
    "sha256": "3f1c0a9b2d4e5f60…"
  },
  "counts": { "posts": 35, "followers": 34, "following": 89 },
  "refreshedAt": "2026-09-25T12:41:07.000Z",
  "lastAttempt": { "at": "2026-09-25T15:41:09.000Z", "ok": false, "error": "profile:401,profile:401,profile:401,profile:401" }
}
```

`refreshedAt` is when the stored read was last written. `lastAttempt` is the
most recent report, which may have failed without changing anything else. A
successful read identical to the stored one does not rewrite the profile or
picture, so `refreshedAt` then advances only about once a day. Use
`lastAttempt.at` to see when the job last ran.

Read both fields together. An old `refreshedAt` with a failing `lastAttempt`
means Instagram has been refusing the job.

Counts are exact integers. `Cache-Control: public,
max-age=60, s-maxage=300, stale-while-revalidate=3600`.

### Avatar caching

`/api/v2/instagram/avatar` serves the stored bytes with `ETag` set to their
SHA-256, and answers `If-None-Match` with `304`.

| Request | Cache policy |
| --- | --- |
| No `v`, or a `v` that is not the current picture's | `max-age=3600` |
| The current `v` (the first 16 hex digits of `sha256`, as in `avatar.url`) | `immutable` |

A client that links the unversioned URL sees a new picture within the hour
without a rebuild.

### Errors

- `503` on both routes until the first read is stored, and when the KV binding
  is missing. The profile `503` includes the latest `lastAttempt`.
- `429 {"error":"Too Many Requests"}` on the profile route.
- A plain-text `405 Method Not Allowed` for any other method.

## MusicKit developer token

```
GET /api/musickit/token
```

Mints a short-lived Apple MusicKit developer token so the browser can talk to
Apple Music directly. Rate limit: 30 requests / 60s.

The token carries an `origin` claim listing `https://buxx.me`,
`https://www.buxx.me` and `http://localhost:4321`. Apple Music refuses it
from a browser on any other site. A non-browser client can still forge the
`Origin` header, so the claim stops other pages from borrowing the token, not
a determined script. Server-side Apple Music reads use a separate token
without the claim, which never leaves `site-api`.

The token response is `Cache-Control: private, max-age=300`. It is `private`
because the token is credential material and must not land in a shared cache.
Error responses (`429`, `500`, `503`) are `no-store`, so the browser never
reuses a failure.

**Errors:**

- `503 {"error":"MusicKit is not configured"}` when the signing key is missing
  from the environment. This is the normal state in local dev.
- `500 {"error":"MusicKit token unavailable"}` if signing fails.
- `429 {"error":"Too Many Requests"}` when rate limited.
- A plain-text `405 Method Not Allowed` for non-`GET` methods.

`/v2/musickit/token` is a legacy alias. It answers `308` to `/musickit/token`.

## Posts (not enabled)

```
GET /api/v2/posts
GET /api/v2/posts/:slug
```

A placeholder. The route exists and is wired up, but it returns nothing useful.
It reserves the path so nothing else claims it before the real implementation
lands.

With the `ENABLE_POSTS_API` flag off (the current state everywhere), both
routes return `404`:

```json
{ "error": { "code": "not_found", "message": "Posts API is not enabled." }, "endpoint": "/v2/posts" }
```

With the flag on, they return `501` with code `posts_coming_soon`, because the
data layer behind them is still a stub. Either way there is no success path
today. `Cache-Control: no-store, max-age=0`.

Use [`/api/writing`](#writing) for blog metadata, or the
[RSS feeds](/docs/api/feeds#rss) for full post content.

After site-analytics cutover and verified blog backfill, blog reads count views with at least 5,000 ms visible dwell, and completions use a 0.9 scroll threshold. `since` comes from the earliest stored Melbourne day. Lifetime `readers` is `null` when the identity-free rollups cannot reconstruct a distinct lifetime audience; it is never the sum of daily unique visitors. The desk uses reads and since.
