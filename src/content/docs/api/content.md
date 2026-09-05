---
title: Content & Integrations
description: Blog metadata, mood comments by post id, GitHub contributions, the MusicKit developer token, and the posts endpoint that is not switched on yet.
group: API
order: 4
---

Five endpoints that pull something from outside the site and hand it back as
JSON. They have almost nothing in common except that each one is a cache in
front of a third party, and each one fails differently when that third party is
having a bad day.

## Writing

```
GET /api/writing
```

The latest posts from the Ghost blog, as the home page renders them. No auth.
Rate limit: 60 requests / 60s. Cached hard —
`public, s-maxage=3600, stale-while-revalidate=86400` — because the blog does
not change on the minute and this endpoint sits in front of a Ghost Content API
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

Always exactly the five newest posts; there is no `limit` parameter. `tags`
can include entries with `visibility: "internal"` — Ghost's convention for
tags starting with `#`, which are used for routing and are not meant to be
rendered as topic labels. Filter on `visibility === "public"` before displaying
them.

There is no error branch: if Ghost is unreachable the handler returns `200`
with an empty `posts` array rather than a `5xx`. As with
[`/api/footer`](/docs/api/status#footer-status), an empty result and a broken
upstream look identical from the outside.

## Comments by post id

```
GET /api/comments?postId=<id>
```

A legacy alias for the mood comment thread of a single post. It reads the same
data as `/api/mood/:id/comments` through the **live** Telegram mirror, not the
D1 archive — see [Mood API](/docs/api/mood) for the response shape and the
freshness trade-off.

Each comment carries the same fields as the mood route, including the
optional `replyTo: { id, author, text }` block that names the parent comment
when the comment is a reply. `text` is a plain-text preview (≤ 200 chars);
`content` is the reply body only.

`postId` is required and trimmed; omitting it (or sending only whitespace)
returns `400 {"error":"Missing postId parameter"}`. Note the flat error string
here, while the mood comment payload it wraps uses the nested
`{"error":{"code","message"}}` form — one route, both
[error shapes](/docs/api/overview#error-shapes-there-are-two), depending on how
far the request got.

New integrations should call the mood route directly. This one exists so old
clients keep working.

## GitHub contributions

```
GET /api/github/contributions?username=bunizao&days=365
```

The contribution grid on the home page. No auth. Rate limit: 60 requests / 60s.
`Cache-Control: no-store, max-age=0` on every response.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `username` | string | `bunizao` | Must be `bunizao`. Any other login is rejected. |
| `days` | integer | `365` | `1`–`365`. Non-numeric or out of range is rejected, not clamped. |

```json
{
  "total": { "lastYear": 1284 },
  "contributions": [{ "date": "2026-08-23", "count": 4, "level": 2 }]
}
```

`contributions` is the trailing `days` window, oldest first, one entry per
day. `level` is GitHub's own 0–4 intensity bucket. `total.lastYear` is always
the full-year total and does **not** shrink when you narrow `days` — a 30-day
window still reports the annual count, so do not use it as the sum of the
array you were given.

**Errors:** `400 {"error":"Unsupported GitHub username"}` for any login other
than `bunizao` — this is an allowlist, not an open proxy, so it will not fetch
arbitrary users' grids. `400 {"error":"Unsupported contribution window"}` for a
bad `days`. `429 {"error":"Too Many Requests"}`. `503 {"error":"GitHub
contributions unavailable"}` when GitHub's API cannot be reached — this one is
retryable, and unlike `/api/writing` and `/api/footer` it does surface the failure.
Any method other than `GET` gets a plain-text `405 Method Not Allowed`.

Despite the `no-store` on the response, results are cached inside the Worker
for 10 minutes per `(username, days)` pair, so hammering this endpoint does not
hammer GitHub.

## MusicKit developer token

```
GET /api/musickit/token
```

Mints a short-lived Apple MusicKit developer token so the browser can talk to
Apple Music directly. Rate limit: 30 requests / 60s.
`Cache-Control: private, max-age=300` — `private`, because the token is
credential material and must not land in a shared cache.

**Errors:** `503 {"error":"MusicKit is not configured"}` when the signing key
is absent from the environment, which is the normal state in local dev;
`500 {"error":"MusicKit token unavailable"}` if signing fails;
`429 {"error":"Too Many Requests"}`. Non-`GET` methods get a plain-text
`405 Method Not Allowed`.

`/v2/musickit/token` is a legacy alias of the same handler.

## Posts (not enabled)

```
GET /api/v2/posts
GET /api/v2/posts/:slug
```

A placeholder. The route exists, is wired up, and returns nothing useful — it
is reserved so the path is not claimed by anything else before the real
implementation lands.

With the `ENABLE_POSTS_API` flag off (the current state everywhere), both
return `404`:

```json
{ "error": { "code": "not_found", "message": "Posts API is not enabled." }, "endpoint": "/v2/posts" }
```

With the flag on, they return `501` with code `posts_coming_soon` instead,
because the data layer behind them is still a stub. Either way there is no
success path today. `Cache-Control: no-store, max-age=0`.

Use [`/api/writing`](#writing) for blog metadata, or the
[RSS feeds](/docs/api/feeds#rss) for full post content.
