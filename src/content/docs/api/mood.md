---
title: Mood API
description: Mood feed, detail, comments, search, stats, and live counts, with every parameter, cache tier, and error.
group: API
order: 1
---

The mood API serves the mood feed, single posts, their comments, search, and
stats. It has two independent read paths that return the same shape:

| Path | Reads from | Role |
| --- | --- | --- |
| `/v2/mood*` | The D1 archive | What mood pages render by default |
| `/v1/mood*` | The Telegram channel, live | The freshness fallback, and the only source for a post that hasn't been archived yet |

`site-api` serves both. See [API Overview](/docs/api/overview) for the version
and auth conventions used below, and
[Mood dev/prod source split](/docs/architecture#runtime-shape) for when each
path is in play.

## Feed

```
GET /api/v2/mood
GET /api/v1/mood
```

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `limit` | integer | 20 | Clamped to 1–100 server-side. Out-of-range values are clamped, never rejected. |
| `before` | string (post id) | None | Cursor: posts older than this id. Must match `^\d{1,20}$` or the request 400s. |
| `after` | string (post id) | None | Cursor: posts newer than this id. Same validation as `before`. |
| `tag` | string | None | Filters to one mood tag, normalized through `normalizeMoodTag`. |
| `fresh` | boolean flag | `false` | Any value other than `0`/`false`/`no`/`off` counts as true. Forces `no-store` and skips the edge cache read. It has its own rate limit (30 per 60s instead of 180), unless `probe` is also set. See [Rate limits](/docs/api/overview#rate-limits). |
| `fallback` | boolean flag | `true` | `fallback=0` turns off t.me completion: an empty archive page returns as-is instead of being topped up from the live channel. It does not affect availability. When the archive itself fails, the read still degrades to the live reader (see [Degradation](#degradation)). Edge-cached under its own cache entry. The site SSR sends `fallback=0` on every archive read. |
| `probe` | boolean flag | `false` | Returns `{"latestId": "..."}` instead of a page. Use it to check for new posts cheaply, without the full payload. |

`probe=image` returns `{"latestImage": {...} | null}` instead: the latest post
with an image, for the OG/preview pipeline.

A Telegram album counts as one post. The archive stores a `group_id` on every
row: the lowest visible message id of the media group, or the post's own id. A
page is the newest `limit` distinct group ids, and `before`/`after` compare
against that id, which is the `id` the feed returns. If an album's first photo
is deleted, the next one becomes the post id. Each page costs one index seek
plus one row read per member, which keeps the Free-tier D1 read budget flat.

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

### Feed caching

`before`/`after`, `limit`, `tag`, and the `fallback` flag are hashed into the
edge cache key, so identical requests share one cache entry.

| Request | In-worker cache |
| --- | --- |
| No cursor (the "latest" page) | 30s |
| With `before`/`after` (paging through history) | 300s, since historical pages change less often |

These TTLs apply to the in-worker Cache API. Successful feed responses also
send `Cloudflare-CDN-Cache-Control: public, max-age=60,
stale-while-revalidate=600, stale-if-error=600`, while browsers get
`Cache-Control: public, max-age=0`. The private Worker's platform cache is
enabled, and a platform cache hit does not invoke its route handler or read D1.

Fresh reads, `probe=image`, stale fallback responses, and errors stay
`no-store` and do not get the public CDN policy.

A plain `probe=1` read skips the in-worker cache but is not `no-store`. It
keeps browser `Cache-Control: public, max-age=0` and sends
`Cloudflare-CDN-Cache-Control: public, max-age=15` (no stale-while-revalidate).
Every open tab's update poll in a colo then shares one invocation, and the
probe sees a new post within about 15s. `probe=1&fresh=1` stays `no-store`.

### Feed errors

`400 {"error": "Invalid cursor parameter"}` for a malformed `before`/`after`.

`503 {"error":{"code":"mood_repository_unavailable", ...}}` if the D1/live
binding isn't configured.

`500
{"error":{"code":"mood_feed_failed", ...}}` only after the archive, the live
reader, and the last-known-good copy have all failed.

The `400` body has a different shape from the other two. See
[Error shapes](/docs/api/overview#error-shapes).

## Degradation

Every `/v2/mood*` response has an `X-Mood-Source` header that names what
served it:

| Value | Meaning |
| --- | --- |
| `archive` | The D1 archive answered, topped up from t.me unless `fallback=0`. |
| `live` | The archive threw or is locked out, so the Telegram live reader served the page. Cached for 30s whatever the cursor. Its CDN policy drops to `public, max-age=30, stale-if-error=600` (no long revalidation window) so the archive takes traffic back quickly. |
| `stale` | Every reader failed. The body is the last successful default page, kept in KV for seven days and sent `no-store` with `X-Mood-Stale-Since` set to when it was captured. Only the cursorless, untagged feed page has a stale copy. |

A D1 daily-quota error (code 7500) locks the archive in that Worker isolate
until 00:00 UTC, so the Worker stops retrying it on every request. Other errors
retry on the next read.

Tag-filtered reads never degrade. Tags only exist in the archive, so a failed
tag read returns 500 instead of an unfiltered page dressed up as a filtered
one.

The site SSR and the browser feed apply the same policy on their own side,
falling through to `/api/v1/mood` and `/api/moods` (see
[Mood surface](/docs/surfaces/mood)).

## Detail

```
GET /api/v2/mood/{id}
GET /api/v1/mood/{id}
```

Returns a single post document. Both paths run the same handler against
different repositories: `v2` reads the D1 archive, and `v1` reads the live
Telegram mirror. The response shape is identical, so a client can retry `v1`
after a `v2` miss without branching.

The `fresh` flag works as in the feed. Here `probe` is also accepted as a
bypass synonym.

A missing or not-yet-archived id returns `404
{"error":{"code":"mood_not_found","message":"Mood document was not found."}}`.
In that case, fall back to `/api/v1/mood` or wait for the archive backfill.

Successful responses cache at the edge for 60s, and `?fresh=1` bypasses both
the cache read and the cache write. Successful detail responses send the same
separate 60-second CDN TTL and 600-second stale window as the feed, including
when the in-worker detail cache supplies the response. `fresh` and `probe`
responses omit that CDN policy.

### Discussion flags

The `v2` document has two booleans that a `v1` (live-mirror) document never
sets:

| Field | Set when |
| --- | --- |
| `discussionLinked` | The post's copy in the Telegram discussion group is known and `MOOD_COMMENTS_ENABLED` is on, so the site can post into it. See [Comments API](/docs/api/comments#mood-surface-the-telegram-bridge). |
| `discussionRepliesEnabled` | The read path has verified that the group's message ids really are what the scrape's comment ids claim, so a reply to a `telegram`-origin comment is safe to send. |

Both are `false`/absent on any post the bridge hasn't reached yet, which
includes every `v1` response. Clients then render the "Leave a comment on
Telegram" link instead of the compose box.

## Comments

```
GET /api/v2/mood/{id}/comments
GET /api/v1/mood/{id}/comments
```

Returns a page of comments for one post. The archive/live split works as in
detail, with the same response shape on both paths.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `limit` | integer | 20 | Same 1–100 clamp as the feed. |
| `before` | string | None | Opaque comment cursor from a previous page's `nextBefore`. Not validated against a pattern, so pass through what the API gave you. |
| `fresh` | boolean flag | `false` | Bypasses the cache, as in the feed. |

```json
{
  "comments": [
    { "id": "1", "author": "...", "datetime": "...", "content": "...", "reactions": [] },
    {
      "id": "4812",
      "author": "Alice",
      "datetime": "...",
      "content": "nice shot",
      "reactions": [],
      "origin": "web",
      "commentId": "01H...",
      "anchorToken": "3f9a1c0b7e2d",
      "replyTo": { "id": "1", "author": "...", "text": "..." }
    }
  ],
  "hasMore": true,
  "nextBefore": "1"
}
```

`replyTo` is present only on comments that answer another comment. Its `id` is
the parent comment id, which may be on a page you have not fetched yet. `text`
is a plain-text preview of the parent capped at 200 characters, not HTML.
`content` never contains the parent.

`origin`, `commentId`, and `anchorToken` are the Telegram bridge's overlay on
top of the plain scrape:

| Field | Meaning |
| --- | --- |
| `origin` | Omitted for an ordinary Telegram comment. `"web"` means the comment was written on the site and is re-attributed to its author here. |
| `commentId` | The site's own comment row id. On `web` items only. |
| `anchorToken` | Set as `id="c-<anchorToken>"` on the rendered row. On `web` items only. |

`commentId` and `anchorToken` let the writer's own browser mark the row `mine`
and offer edit/delete. See
[Comments API § Mood surface](/docs/api/comments#mood-surface-the-telegram-bridge)
for the full bridge and overlay rules, and
[`/api/comments`](/docs/api/content#comments-by-post-id) for the live-thread
path that takes the post id as `?postId=`.

Responses use a 60s edge cache when not bypassed. The live-thread routes
(`/api/comments`, `/api/v1/mood/{id}/comments`) use a separate, shorter 15s
cache. See [`/api/comments`](/docs/api/content#comments-by-post-id).

Errors are the same family as detail: `mood_id_required` (400), `mood_not_found`
(404), and `mood_comments_failed` (500).

## Live counts

```
GET /api/v2/moods/live-counts?ids=4821,4820,4819
```

Returns comment and reaction counts for a batch of posts already rendered from
the archive. An archive-rendered page uses it to keep its counts current
without re-fetching whole posts.

- `ids` is a comma-separated list, max 30, each matching `^\d{1,20}$`.
  Anything else is a `400`.
- Missing or unknown ids come back as
  `{"commentsCount": null, "reactions": null}` instead of being left out, so a
  client can zip the response against its request list positionally.
- Responses use a 60s edge cache, keyed on the sorted id set, so requests for
  the same ids in a different order still hit.

```json
{ "counts": { "4821": { "commentsCount": 3, "reactions": [] }, "4820": { "commentsCount": null, "reactions": null } } }
```

## Live meta (v1)

```
GET /api/v1/mood/meta?ids=4821,4820
```

The same idea against the live Telegram mirror instead of the archive. It
accepts up to 50 ids with the same digit-string validation and uses a 30s edge
cache. It returns an array instead of an object keyed by id:

```json
[{ "id": "4821", "reactions": [], "commentsCount": 3 }]
```

`commentsCount: null` means the count is unknown: the Telegram window didn't
include it and backfill couldn't resolve it. Backfill covers at most five ids
per request, two at a time, within one shared 3s deadline. Keep your
last-known count instead of treating `null` as zero.

## Search

```
GET /api/v2/mood/search?q=keyword
```

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `q` | string | None | Required. 2–64 chars after whitespace collapsing, or a single CJK character. Control characters reject the request. |
| `limit` | integer | 10 | Clamped to 1–20, a tighter ceiling than the feed's 100. |

Search runs against a D1 FTS5 index. Each whitespace-separated term must match,
and each matches as a prefix (`ocean` finds `oceans`). The index splits CJK text
into single characters and a CJK term matches those characters in order, so
`耐用` finds 电池比我想象中耐用 even though Chinese has no spaces between words.
Results are ranked by relevance, not date. Matched terms come back wrapped in
`<mark>` inside an HTML-escaped snippet, so you can inject the field directly:

```json
{ "results": [{ "id": "4821", "datetime": "...", "snippet": "...<mark>keyword</mark>...", "tags": [], "sentiment_label": "calm" }] }
```

A query outside the length bounds or containing control characters gets
`400 {"error": "Invalid q parameter"}`.

Responses use a 300s edge cache, keyed on the lowercased query + limit. The
rate limit is 30 requests per 60s, the tightest on the mood API.

## Stats

```
GET /api/v2/mood/stats
```

Returns one precomputed snapshot: activity buckets, sentiment timeline,
streaks, and media-type totals. There are no parameters. A background job
refreshes the snapshot, and the route reads it straight from KV instead of
computing it per request.

If the snapshot hasn't been generated yet, the route returns `503
{"error":{"code":"mood_stats_unavailable"},"unavailable":true}`. That is a
normal state right after a deploy and not necessarily an outage.

Successful responses are browser-cacheable:
`public, max-age=300, stale-while-revalidate=3600`. This is the only mood
endpoint that sends `stale-while-revalidate` in `Cache-Control`, where the
browser sees it. Other mood routes send it only in
`Cloudflare-CDN-Cache-Control`, which only the Cloudflare edge reads:

| Endpoint | Header | `stale-while-revalidate` |
| --- | --- | --- |
| `/api/v2/mood/stats` | `Cache-Control` | 3600 |
| Feed (`/api/v2/mood`, `/api/v1/mood`, `/api/moods`) and detail (`/api/v2/mood/{id}`, `/api/v1/mood/{id}`) | `Cloudflare-CDN-Cache-Control` | 600 |
| Live-thread comments (`/api/comments`, `/api/v1/mood/{id}/comments`) | `Cloudflare-CDN-Cache-Control` | 30 |
| `/api/v2/mood/{id}/comments`, search, live counts, live meta | None | None |

The feed and detail drop the stale window when `X-Mood-Source` is `live`. A
`fresh` read, a feed `probe`, and every `no-store` response send none.
