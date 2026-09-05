---
title: Mood API
description: The mood feed, detail, comments, search, stats, and live-counts endpoints — every parameter, cache tier, and error code, read straight from site-api.
group: API
order: 1
---

Mood has two independent read paths that happen to return the same shape.
`/v2/mood*` reads the D1 archive — what mood pages render by default.
`/v1/mood*` reads live from the Telegram channel — the freshness fallback,
and the only source for a post that hasn't been archived yet. Both are owned
by `site-api`; see [API Overview](/docs/api/overview) for the version and
auth conventions referenced below, and
[Mood dev/prod source split](/docs/architecture#runtime-shape) for when each
one is actually in play.

## Feed

```
GET /api/v2/mood
GET /api/v1/mood
```

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `limit` | integer | 20 | Clamped to 1–100 server-side. Out-of-range values are silently clamped, not rejected. |
| `before` | string (post id) | — | Cursor: posts older than this id. Must match `^\d{1,20}$` or the request 400s. |
| `after` | string (post id) | — | Cursor: posts newer than this id. Same validation as `before`. |
| `tag` | string | — | Filters to one mood tag; normalized through `normalizeMoodTag`. |
| `fresh` | boolean flag | `false` | Any value other than `0`/`false`/`no`/`off` counts as true. Forces `no-store` and skips the edge cache read (see rate limit note below). |
| `fallback` | boolean flag | `true` | `fallback=0` turns off t.me completion: an empty archive page returns as-is instead of being topped up from the live channel. It does not affect availability — when the archive itself fails, the read still degrades to the live reader (see [Degradation](#degradation)). Edge-cached under its own cache entry. The site SSR sends `fallback=0` on every archive read. |
| `probe` | boolean flag | `false` | Returns `{"latestId": "..."}` instead of a page — a cheap way to check for new posts without paying for the full payload. |
| `probe=image` | — | — | Returns `{"latestImage": {...} | null}` — the latest post carrying an image, for the OG/preview pipeline. |

A Telegram album is one post. The archive stores a `group_id` on every row
(the lowest visible message id of the media group, or the post's own id),
a page is the newest `limit` distinct group ids, and `before`/`after` compare
against that id — the `id` the feed returns. Deleting an album's first photo
re-elects the next one as the post id. Each page costs one index seek plus one
row read per member, which is what keeps the Free-tier D1 read budget flat.

Response body:

```json
{
  "posts": [
    {
      "id": "4821",
      "datetime": "2026-08-20T09:14:00.000Z",
      "tag": "daily",
      "previewText": "...",
      "previewHtml": "...",
      "media": [],
      "mediaHtml": "",
      "needsDetailPage": false,
      "forwardedFrom": null,
      "quote": null,
      "reactions": [],
      "commentsCount": 3
    }
  ],
  "channel": { "...": "ContentChannelSummary" }
}
```

`before`/`after`, `limit`, `tag`, and the `fallback` flag are hashed into the
edge cache key, so identical requests share one cache entry. A request with no cursor (the "latest" page)
caches for 30s; a request with `before`/`after` (paging through history)
caches for 300s, since history doesn't change once written.

**Errors:** `400 {"error": "Invalid cursor parameter"}` for a malformed
`before`/`after`. `503 {"error":{"code":"mood_repository_unavailable", ...}}`
if the D1/live binding isn't configured. `500
{"error":{"code":"mood_feed_failed", ...}}` only after the archive, the live
reader, and the last-known-good copy have all failed. Note the shape
difference — see
[Error shapes](/docs/api/overview#error-shapes-there-are-two).

## Degradation

Every `/v2/mood*` response carries an `X-Mood-Source` header naming what
served it:

| Value | Meaning |
| --- | --- |
| `archive` | The D1 archive answered, topped up from t.me unless `fallback=0`. |
| `live` | The archive threw or is locked out, so the Telegram live reader served the page. Cached for 30s whatever the cursor. |
| `stale` | Every reader failed. The body is the last successful default page, kept in KV for seven days, sent `no-store` with `X-Mood-Stale-Since` set to when it was captured. Only the cursorless, untagged feed page has a stale copy. |

A D1 daily-quota error (code 7500) locks the archive in that Worker isolate
until 00:00 UTC instead of retrying on every request; other errors retry on
the next read. Tag-filtered reads never degrade — tags only exist in the
archive, so they return 500 rather than an unfiltered page dressed up as a
filter. The site SSR and the browser feed apply the same policy on their own
side, falling through to `/api/v1/mood` and `/api/moods` (see
[Mood surface](/docs/surfaces/mood)).

## Detail

```
GET /api/v2/mood/{id}
GET /api/v1/mood/{id}
```

Both paths run the same handler against different repositories: `v2` reads the
D1 archive, `v1` reads the live Telegram mirror. The response shape is
identical, so a client can retry `v1` on a `v2` miss without branching.

Same `fresh` flag as the feed (also accepts `probe` as a bypass synonym here).
Returns the single post document. `404
{"error":{"code":"mood_not_found","message":"Mood document was not found."}}`
for a missing or not-yet-archived id — that's the case where falling back to
`/api/v1/mood` (or waiting for the archive backfill) makes sense. Successful
responses cache at the edge for 60s; `?fresh=1` bypasses both the cache read
and the cache write.

## Comments

```
GET /api/v2/mood/{id}/comments
GET /api/v1/mood/{id}/comments
```

Same archive/live split as detail above, same response shape on both.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `limit` | integer | 20 | Same 1–100 clamp as the feed. |
| `before` | string | — | Opaque comment cursor from a previous page's `nextBefore`. Not validated against a pattern — pass through what the API gave you. |
| `fresh` | boolean flag | `false` | Bypasses cache, same semantics as the feed. |

```json
{
  "comments": [
    { "id": "1", "author": "...", "datetime": "...", "content": "...", "reactions": [] },
    {
      "id": "2",
      "author": "...",
      "datetime": "...",
      "content": "...",
      "reactions": [],
      "replyTo": { "id": "1", "author": "...", "text": "..." }
    }
  ],
  "hasMore": true,
  "nextBefore": "1"
}
```

`replyTo` is present only on comments that answer another comment. `id` is
the parent comment id — it may belong to a page you have not fetched yet.
`text` is a plain-text preview of the parent capped at 200 characters, not
HTML; `content` never contains the parent.

60s edge cache when not bypassed. Same `mood_id_required` (400) /
`mood_not_found` (404) / `mood_comments_failed` (500) error family as detail.

## Live counts

```
GET /api/v2/moods/live-counts?ids=4821,4820,4819
```

Batches comment/reaction counts for posts already rendered from the archive
— this is what keeps an archive-rendered page's counts from going stale
without re-fetching the whole post. `ids` is a comma-separated list, max 30,
each matching `^\d{1,20}$`; anything else is a `400`. Missing or unknown ids
come back as `{"commentsCount": null, "reactions": null}` rather than being
omitted, so a client can zip the response against its request list
positionally. 60s edge cache, keyed on the sorted id set so out-of-order
requests for the same ids still hit.

```json
{ "counts": { "4821": { "commentsCount": 3, "reactions": [] }, "4820": { "commentsCount": null, "reactions": null } } }
```

## Live meta (v1)

```
GET /api/v1/mood/meta?ids=4821,4820
```

The same idea against the live Telegram mirror instead of the archive: max
50 ids, same digit-string validation, 30s edge cache. Returns an array, not
an object keyed by id:

```json
[{ "id": "4821", "reactions": [], "commentsCount": 3 }]
```

`commentsCount: null` means the count is genuinely unknown (the Telegram
window didn't include it and backfill couldn't resolve it) — a client should
keep its last-known count rather than treating `null` as zero.

## Search

```
GET /api/v2/mood/search?q=keyword
```

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `q` | string | — | Required, 2–64 chars after whitespace collapsing. Control characters reject the request. |
| `limit` | integer | 10 | Clamped 1–20 — a tighter ceiling than the feed's 100. |

Runs against a D1 FTS index; matched terms come back pre-wrapped in `<mark>`
inside an HTML-escaped snippet, so the field is safe to inject directly:

```json
{ "results": [{ "id": "4821", "datetime": "...", "snippet": "...<mark>keyword</mark>...", "tags": [], "sentiment_label": "calm" }] }
```

`400 {"error": "Invalid q parameter"}` for a query outside the length bounds
or containing control characters. 300s edge cache, keyed on the lowercased
query + limit. Tightest rate limit on the whole mood surface: 30 requests per
60s.

## Stats

```
GET /api/v2/mood/stats
```

No parameters — one precomputed snapshot (activity buckets, sentiment
timeline, streaks, media-type totals) read straight from KV, refreshed by a
background job rather than computed per-request. `503
{"error":{"code":"mood_stats_unavailable"},"unavailable":true}` if the
snapshot hasn't been generated yet — this is a legitimate steady state right
after a deploy, not necessarily an outage. Successful responses are
browser-cacheable: `public, max-age=300, stale-while-revalidate=3600`, the
only mood endpoint that sets `stale-while-revalidate`.
