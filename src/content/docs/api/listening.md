---
title: Listening API
description: The now-playing track behind the home page — how the Last.fm read is cached, why a response can be real or a hardcoded demo, and how playback events are reported back.
group: API
order: 2
---

One read endpoint and one write endpoint. The read returns whatever the site
thinks is currently playing; the write is how the site's own audio player
reports what a visitor did with it.

The read endpoint **always returns a track**. It has no empty state and no
`404` — when Last.fm is unconfigured or unreachable it serves a hardcoded
demo track with a `200`. Read the `source` field before you trust the
content.

## Now playing

```
GET /api/v2/listening
```

No parameters, no auth. Rate limit: 60 requests / 60s (advertised — see
[Rate limits](/docs/api/overview#rate-limits)).

```json
{
  "track": {
    "id": "1888707290",
    "appleCatalogId": "1888707290",
    "catalogId": "1888707290",
    "title": "ALL THE LOVE",
    "artist": "Kanye West & Andre Troutman",
    "collection": "BULLY",
    "appleMusicUrl": "https://music.apple.com/tw/album/all-the-love/1888707282?i=1888707290&l=en-GB",
    "artworkUrl": "https://is1-ssl.mzstatic.com/.../600x600bb.jpg",
    "thumbUrl": "https://is1-ssl.mzstatic.com/.../100x100bb.jpg",
    "previewUrl": "https://audio-ssl.itunes.apple.com/.../mzaf_....m4a",
    "year": "2026",
    "genre": "Hip-Hop/Rap",
    "releaseKind": "album",
    "trackNumber": "4",
    "trackCount": "18",
    "sourceUrl": "https://music.apple.com/tw/album/all-the-love/1888707282?i=1888707290&l=en-GB",
    "isNowPlaying": true,
    "playedAt": ""
  },
  "configured": true,
  "source": "lastfm"
}
```

Every `track` field is a string except `isNowPlaying` (boolean) and
`releaseKind` (`"album"` | `"single"`). The numeric-looking ones —
`trackNumber`, `trackCount`, `year` — are strings, not numbers. `playedAt` is
`""` when the track is playing right now rather than a past scrobble, so treat
empty as "now", not as missing.

The identifiers come from Apple Music, not Last.fm: Last.fm supplies the
artist and title, and the handler resolves that pair against Apple's catalog
to get artwork, a preview stream, and a linkable URL.

### Read `source` before rendering

`configured` and `source` together tell you which of three things happened,
and all three are a `200`:

| `configured` | `source` | What it means |
| --- | --- | --- |
| `true` | `"lastfm"` | Real data. A live scrobble, or a cache hit under 30s old. |
| `true` | `"fallback"` | Last.fm **is** configured but the fetch threw. You are looking at the demo track. |
| `false` | `"fallback"` | Last.fm is not configured on this deployment at all. Demo track. |

The demo track is a real, complete, plausible-looking track object. Nothing
about its shape marks it as filler — if you render the response without
checking `source`, a Last.fm outage silently turns into a confident claim that
someone is listening to a specific Kanye West song. Check `source === "lastfm"`
before presenting it as fact.

`cacheTtlSeconds` exists internally but is **not** in the response body; it
only sets the `s-maxage` below.

### Caching

```
Cache-Control: public, s-maxage=<0..30>, stale-while-revalidate=300
```

There is no `max-age`, so a browser never caches this — only the Cloudflare
edge does. `s-maxage` is not a constant: it is the *remaining* life of the
Worker-Cache entry the response was built from, clamped to `0..30`. A response
served from a 25-second-old entry advertises `s-maxage=5`. That keeps the edge
TTL and the internal TTL from stacking into a 60-second staleness window.

Behind the endpoint sits a Worker Cache entry (`listening:current`, 30s) plus a
single-flight promise, so concurrent misses collapse into one Last.fm round
trip rather than a thundering herd.

### Errors

| Status | Body | When |
| --- | --- | --- |
| `429` | `{"error":"Too Many Requests"}` | Over the limit. Currently unreachable — this route runs in observability mode. |
| `500` | `{"error":"Listening data unavailable"}` | Only if the handler itself throws. An upstream failure does not reach here; it returns `200` with `source:"fallback"`. |
| `405` | `Method Not Allowed` (plain text) | Any method other than `GET`. |

Both error responses switch to `Cache-Control: no-store, max-age=0`.

### The legacy alias hops twice

```
GET /api/listening   →  308  →  /v2/listening
```

`/api/listening` is a `308` to `LISTENING_PATH`, and the redirect helper
rewrites only the pathname — it does not re-add the `/api` prefix. On
`buxx.me` that lands on `/v2/listening`, which the public `site` Worker
`308`s again to `/api/v2/listening`. Two redirects to reach one endpoint.

On `api.buxx.me` there is no prefix to lose, so `api.buxx.me/listening`
redirects straight to `api.buxx.me/v2/listening` in one hop.

Call `/api/v2/listening` directly and neither hop happens.

## Report a playback event

```
POST /api/v2/analytics/listening
```

What the site's own player calls as someone plays the preview clip. Rate
limit: 600 requests / 60s. This is a same-origin endpoint, not a public
ingest — see [Analytics API](/docs/api/analytics#the-same-origin-gate) for the
`Origin`/`Referer` check that gates it, the 4096-byte body cap, and the
bot-user-agent rule that silently drops an event with a `204`.

```json
{
  "playbackId": "b7f1c4e2-9a3d-4f8b-9c21-6d0e5a7b8c9d",
  "visitorId": "a-stable-anonymous-id",
  "sessionId": "optional",
  "action": "progress",
  "trackId": "1888707290",
  "trackTitle": "ALL THE LOVE",
  "trackArtist": "Kanye West & Andre Troutman",
  "pagePath": "/",
  "surface": "home",
  "listenedMs": 18400,
  "mediaTimeMs": 18400,
  "durationMs": 29000,
  "requestCount": 1,
  "playCount": 1,
  "pauseCount": 0,
  "seekCount": 0,
  "completed": false
}
```

**Required:** `playbackId` (a v1–v8 UUID), `visitorId` (8 characters or more),
`trackTitle`, `pagePath` (must start with `/`), plus `action` and `surface`
from the sets below.

- `action`: `play_request` | `play` | `progress` | `pause` | `seek` | `complete`
- `surface`: `home` | `blog` | `mood` | `components` | `other`

Every `*Ms` value is clamped to `0`–`43200000` (12 hours) and rounded;
`requestCount`, `playCount`, `pauseCount`, and `seekCount` are clamped to
`0`–`1000`. Out-of-range numbers are pinned to the bound, not rejected, so a
malformed duration degrades the data instead of failing the request.

Success is `200 {"status":"ok"}`, or a bare `204` with no body when the event
was accepted and deliberately dropped (bot user agent). Errors are flat
strings — `403 {"error":"origin_rejected"}`, `413 {"error":"body_too_large"}`,
`400 {"error":"invalid_playback_id"}` and friends. The full code list is in
[Analytics API](/docs/api/analytics).
