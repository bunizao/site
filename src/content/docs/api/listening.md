---
title: Listening API
description: The home page's now-playing track and Last.fm week, how that read is cached, and how the player reports playback.
group: API
order: 2
---

The Listening API returns the current track and the owner's Last.fm week.
Its write endpoint records what a visitor did with the site's player.

The now-playing endpoint **always returns a track**. It has no empty state and no
`404`. When Last.fm is unconfigured or unreachable, it serves a hardcoded demo
track with a `200`. Check the `source` field before you trust the content.

## Now playing

```
GET /api/v2/listening
```

No parameters, no auth. Rate limit: 60 requests / 60s (advertised only; see
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
    "accent": null,
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
  "week": { "plays": 180, "topArtist": "Kanye West" },
  "configured": true,
  "source": "lastfm"
}
```

### The week

`week` is the owner's Last.fm listening in the rolling seven days before the
read, not playback in the site's own player. `plays` is Last.fm's scrobble
total for that window, and `topArtist` is the most scrobbled artist (Last.fm's
`7day` period), or `null` when nothing was scrobbled. Last.fm scrobbles a song
about halfway through, so `plays` can rise while the same track is still
playing.

`week` is `null` whenever the track is not live: the demo track, the last
known track served after a Last.fm failure, or a Last.fm week read that failed
while the track read worked. It is cached with the track, so it is at most as
stale as the track.

### Track fields

Every scalar `track` field is a string except `isNowPlaying` (boolean) and
`releaseKind` (`"album"` | `"single"`). The numeric-looking fields
`trackNumber`, `trackCount`, and `year` are strings too. `playedAt` is `""`
when the track is playing right now instead of being a past scrobble. Treat an
empty value as "now". It does not mean the field is missing.

`accent` is either `null` or a colour chosen by the server:

```json
{ "hue": 229.6, "chromaLight": 0.037, "chromaDark": 0.037 }
```

The Worker extracts it once from the Apple artwork and caches the result for a
week. `null` tells you to render the neutral foreground, usually because the
cover is monochrome. It is not a missing field, and it is not a signal to
sample the image again in the browser.

The identifiers come from Apple Music. Last.fm supplies the artist and title,
and the handler looks that pair up in Apple's catalog. That lookup returns the
artwork, a preview stream, a linkable URL, and the artwork palette. The palette
is a bounded fallback for when image extraction is unavailable.

### Read `source` before rendering

`configured` and `source` together tell you which of three cases happened. All
three return `200`:

| `configured` | `source` | What it means |
| --- | --- | --- |
| `true` | `"lastfm"` | Real data. A live scrobble, a cache hit, or, when Last.fm fails, the last track read successfully (up to 7 days old) with `isNowPlaying: false`. |
| `true` | `"fallback"` | Last.fm **is** configured, but the fetch threw and no earlier track is cached. This is the demo track, with `isNowPlaying: false`. |
| `false` | `"fallback"` | Last.fm is not configured on this deployment at all. Demo track. |

The demo track is a complete, real-looking track object. Nothing in its shape
marks it as filler. If you render the response without checking `source`, a
Last.fm outage turns into a confident claim that someone is listening to a
specific Kanye West song. Check `source === "lastfm"` before you present it as
fact.

`cacheTtlSeconds` exists internally but is **not** in the response body. It
only sets the `s-maxage` below.

### Caching

```
Cache-Control: public, s-maxage=<0..30>, stale-while-revalidate=300
```

There is no `max-age`, so browsers never cache this. Only the Cloudflare edge
does. `s-maxage` changes per response: it is the *remaining* life of the
Worker Cache entry the response was built from, clamped to `0..30`. A response
built from a 25-second-old entry advertises `s-maxage=5`. This keeps the edge
TTL and the internal TTL from adding up to a 60-second staleness window.

Two responses are different:

- A configured `source:"fallback"` response sends
  `Cache-Control: no-store, max-age=0`, so the edge never pins a Last.fm
  outage.
- A last-known-good response after a Last.fm failure advertises `s-maxage=0`.

Behind the endpoint is a Worker Cache entry (`listening:current`) plus a
single-flight promise. Concurrent misses share one Last.fm round trip instead
of each making their own. How the entry is used depends on its age:

- **Up to 30s:** fresh.
- **Up to an hour:** served as is while a background refresh runs. Once the
  entry is older than 10 minutes, `isNowPlaying` is forced to `false`.
- **Over an hour:** the request waits for Last.fm.

The Apple Music enrichment (catalog id, artwork, preview, accent, year, genre,
track number) is cached for 24 hours per artist, title and album. A refresh
while the same song plays costs one Last.fm call and nothing else. An
enrichment without an Apple catalog id is not cached.

### Errors

| Status | Body | When |
| --- | --- | --- |
| `429` | `{"error":"Too Many Requests"}` | Over the limit. Unreachable today, because this route runs in observability mode. |
| `500` | `{"error":"Listening data unavailable"}` | Only when the handler itself throws. An upstream failure never gets here; it returns `200` with `source:"fallback"`. |
| `405` | `Method Not Allowed` (plain text) | Any method other than `GET`. |

The `429` and `500` responses switch to `Cache-Control: no-store, max-age=0`.

### Legacy alias

```
GET /api/listening   →  308  →  /api/v2/listening
```

`/api/listening` is a `308` to `LISTENING_PATH`. When the request came in on
`buxx.me` or `www.buxx.me`, the redirect helper adds the `/api` prefix back, so
the `Location` is a path that host actually serves. On `api.buxx.me` there is
no prefix, and `api.buxx.me/listening` redirects to
`api.buxx.me/v2/listening`.

It is one hop either way. A `308` keeps the method, but a client that does not
follow redirects gets nothing. Call `/api/v2/listening` directly.

## Report a playback event

```
POST /api/v2/analytics/listening
```

The site's own player calls this while someone plays the preview clip. Rate
limit: 60 requests / 60s. The endpoint accepts same-origin calls only and is
not a public ingest. See [Analytics API](/docs/api/analytics#the-same-origin-gate)
for the `Origin`/`Referer` check that gates it, the 4096-byte body cap, and the
bot user-agent rule that drops an event with a `204`.

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

### Required fields

| Field | Rule |
| --- | --- |
| `playbackId` | A v1–v8 UUID. |
| `visitorId` | 8 characters or more. |
| `trackTitle` | Must not be empty. |
| `pagePath` | Must start with `/`. |
| `action` | `play_request` \| `play` \| `progress` \| `pause` \| `seek` \| `complete` |
| `surface` | The part of the site the player is on: `home` \| `blog` \| `mood` \| `components` \| `other` |

### Number limits

Every `*Ms` value is clamped to `0`–`43200000` (12 hours) and rounded.
`requestCount`, `playCount`, `pauseCount`, and `seekCount` are clamped to
`0`–`1000`. An out-of-range number is set to the nearest bound instead of
being rejected, so a malformed duration degrades the data but does not fail
the request.

Two caps come from the server rather than the payload. `mediaTimeMs` never
exceeds a positive `durationMs`. `listenedMs` never exceeds the time the
server has seen pass since the first post of that `playbackId`, plus two
minutes, so a client can't report more listening than wall-clock time
allows.

### Responses

Success is `200 {"status":"ok"}`. A bare `204` with no body means the event
was accepted and then dropped: it came from a bot user agent, or the site
already wrote its daily share of playback events.

Errors are flat strings, such as `403 {"error":"origin_rejected"}`,
`413 {"error":"body_too_large"}`, and `400 {"error":"invalid_playback_id"}`.
The full code list is in [Analytics API](/docs/api/analytics).
