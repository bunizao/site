# Apple Music Recently Played feasibility for Listening

Research date: 2026-08-06

## Question

Can the homepage Listening provider move from Last.fm to Apple Music's Recently
Played API, and would that be at least as real-time and operationally reliable?

## Conclusion

The switch is technically feasible on the existing Cloudflare Worker, but it is
**not a semantic drop-in replacement** for the current widget.

Apple's track endpoint returns rich Apple catalog resources, so it can eliminate
the current Last.fm-to-Apple search/enrichment step. It does not return a playback
event timestamp, a now-playing flag, or a documented ordering/propagation SLA.
Apple describes it only as a feed of recently played tracks. Therefore it can
truthfully power **Recently Played**, but the official contract cannot power the
current **Now Playing** state or `playedAt` value. [Apple: Get Recently Played
Tracks](https://developer.apple.com/documentation/applemusicapi/get-v1-me-recent-played-tracks)
and [Apple: Songs.Attributes](https://developer.apple.com/documentation/applemusicapi/songs/attributes-data.dictionary)
define the returned resource shape.

The official documentation also gives no cache duration, update trigger, or
maximum delay between playback and appearance in this feed. A production token
and controlled playback probe are required to measure real latency; documentation
alone cannot establish that the feed is real-time. The repository currently has
the developer-token credentials but no owner Music User Token binding, so that
probe cannot be run from `site-api` yet. The configured secret names are documented
in [`site-api/wrangler.jsonc`](../../../site-api/wrangler.jsonc), while Apple makes
the Music User Token mandatory for this endpoint in [User Authentication for
MusicKit](https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit).

**Recommendation:** do not replace Last.fm outright while the product still says
"Now Playing." First run Apple as a shadow provider using
`/v1/me/recent/played/tracks?types=songs&limit=1`. If measured delay is acceptable,
either:

1. switch the UI contract permanently to "Recently Played" and leave
   `isNowPlaying` false with no fabricated `playedAt`; or
2. keep Last.fm for liveness and timestamps while using Apple Recently Played only
   as a corroborating/catalog source.

## Current Listening contract

The public contract requires `isNowPlaying` and `playedAt`, and the client uses
them to choose "Now Playing" versus "Recently Played" and to format a recent-play
date. See [`ListeningTrack`](../../src/features/home/types.ts), the
[`Listening` component](../../src/features/home/ui/Listening.astro), and the
[client refresh controller](../../src/lib/listening/controller.ts).

The private Worker currently calls Last.fm `user.getrecenttracks`, reads Last.fm's
`@attr.nowplaying` and Unix play timestamp, then searches Apple Music/iTunes for
catalog metadata. It caches the normalized result for 30 seconds; the browser
refreshes every 45 seconds while visible. See the current
[`site-api` Listening provider](../../../site-api/src/features/home/server/listening.ts)
and [client refresh controller](../../src/lib/listening/controller.ts).

This means the current product needs four distinct capabilities:

| Need | Current source | Apple Recently Played |
| --- | --- | --- |
| Current/latest song | Last.fm first item | A recent resource, but first-item ordering is not explicitly documented |
| Live/now-playing state | Last.fm `@attr.nowplaying` | Not present |
| Actual play time | Last.fm `date.uts` | Not present |
| Apple catalog ID, artwork, preview, URL | Apple search enrichment | Present directly on catalog song resources |

Apple's endpoint and song schema support the last row directly, but contain no
fields matching the middle two rows. [Get Recently Played
Tracks](https://developer.apple.com/documentation/applemusicapi/get-v1-me-recent-played-tracks)
returns `Resource` objects; [Songs.Attributes](https://developer.apple.com/documentation/applemusicapi/songs/attributes-data.dictionary)
documents album, artist, artwork, duration, genre, name, preview assets, release
date, track number, and sharing URL, but no play-event status or timestamp.

## Endpoint variants

| Endpoint | Intended contents | Query contract | Fit for this widget |
| --- | --- | --- | --- |
| `GET /v1/me/recent/played/tracks` | Tracks | `types` is required; allowed values are `songs`, `library-songs`, `music-videos`, and `library-music-videos`. `limit` defaults to 30 and has a maximum of 30. `offset`, `include`, `extend`, and `l` are supported. | Best option; request only `types=songs` to receive catalog song IDs and metadata. |
| `GET /v1/me/recent/played` | Non-track resources | `types` is required; allowed values are albums, library albums, playlists, library playlists, artists, curators, and stations. `limit` defaults to 10 and has a maximum of 10. | Wrong shape for a song card. |
| `GET /v1/me/recent/radio-stations` | Radio stations | Supports pagination and localization. | Not relevant unless Listening expands to radio. |

These parameters and limits come from Apple's canonical endpoint references:
[Recently Played Tracks](https://developer.apple.com/documentation/applemusicapi/get-v1-me-recent-played-tracks),
[Recently Played Resources](https://developer.apple.com/documentation/applemusicapi/get-recently-played-resources),
and [Recently Played Stations](https://developer.apple.com/documentation/applemusicapi/get-recently-played-stations).
The track page's example omits `types`, although its parameter table marks `types`
required; an implementation should send `types=songs` explicitly rather than rely
on the example's omission.

Successful results are paginated resource collections. Apple documents `offset`
and a response `next` link when additional results exist. Fetching only the latest
candidate needs `limit=1` and no pagination, but a history view can follow `next`
instead of constructing offsets itself. [Apple: Handling Requests and
Responses](https://developer.apple.com/documentation/applemusicapi/handling-requests-and-responses)
defines the `next` behavior.

## Ordering and real-time semantics

Apple calls the data "recently played" but does not state in the endpoint
reference that results are sorted newest-first, whether repeated plays are
deduplicated, whether an item appears at playback start or completion, or how
quickly playback becomes visible. The response examples also contain catalog
resources rather than playback-event records. [Apple: Get Recently Played
Tracks](https://developer.apple.com/documentation/applemusicapi/get-v1-me-recent-played-tracks)
is the complete public endpoint contract used for this conclusion.

Consequences:

- `data[0]` is the practical latest-candidate heuristic, not a documented sorting
  guarantee.
- Response time or HTTP `Date` cannot be substituted for `playedAt`; it records
  retrieval, not playback.
- `isNowPlaying` must remain false when Apple is the only source. Inferring live
  state from song duration and poll timing would be fabricated because the feed
  has no play start time.
- Faster polling cannot create a real-time guarantee that Apple itself does not
  publish.

Apple documents qualitative developer-token rate limiting but publishes no
numeric request quota: excess traffic temporarily receives `429 Too Many
Requests`. The public API should therefore remain cached and should back off on
429 rather than poll Apple once per visitor. [Apple: Generating Developer
Tokens](https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens)
documents this behavior.

The site's own observable delay is controllable but separate from Apple's unknown
delay. The current Worker cache can serve a result up to 30 seconds old, and a
visible browser checks only every 45 seconds. These values are defined in the
[`site-api` provider](../../../site-api/src/features/home/server/listening.ts)
and [client controller](../../src/lib/listening/controller.ts). They should not be
presented as Apple API latency.

## Authentication and unattended operation

Every Apple Music API request needs a signed developer JWT in
`Authorization: Bearer ...`. Apple requires ES256, Team ID as issuer, Key ID in
the JWT header, and an expiry no more than six months from issuance. The existing
Worker already implements this with `MUSICKIT_PRIVATE_KEY`, `MUSICKIT_KEY_ID`,
and `MUSICKIT_TEAM_ID`; see the
[`site-api` token signer](../../../site-api/src/features/musickit/server/token.ts)
and [Apple's developer-token specification](https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens).

Recently Played is personalized `/me` data, so the same request must also carry
the owner's Music User Token in `Music-User-Token`. A developer token alone is
insufficient. Apple shows both headers in its personalized-request example and
states that MusicKit on the Web handles user authorization. [Apple: User
Authentication for MusicKit](https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit).

For this personal site, the narrow bootstrap path is an owner-only MusicKit web
authorization, followed by storing the returned token as a private Worker secret.
The current official MusicKit v3 distribution exposes `authorize()` and the
`musicUserToken` accessor, so the token can be captured during that explicit
owner authorization. [Apple's official MusicKit v3 JavaScript
distribution](https://js-cdn.music.apple.com/musickit/v3/musickit.js) is the
primary source for the current SDK surface.

Apple's public API documentation does not specify a Music User Token lifetime or
promise headless renewal. It does document `403 Forbidden` when the media user
token is invalid or authentication is insufficient. Operationally, the Worker
must treat 403 as a reauthorization condition, retain the last good/fallback
track, and alert the owner; it must not assume the initial token is permanent.
[Apple: Handling Requests and Responses](https://developer.apple.com/documentation/applemusicapi/handling-requests-and-responses)
defines the 401 developer-token and 403 user-token distinction.

The Music User Token must never be returned by the public Listening endpoint.
Cloudflare documents encrypted Worker secrets specifically for API keys and auth
tokens, available through the Worker `env` binding. [Cloudflare: Workers
Secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## Storefront and metadata implications

The `/me` route resolves personalized content for the authenticated Apple Music
user. Apple also provides `GET /v1/me/storefront`, whose response supplies the
user's storefront ID, default language, supported language tags, and explicit
content policy. [Apple: Get a User's
Storefront](https://developer.apple.com/documentation/applemusicapi/get-a-user%27s-storefront)
and [Storefronts and Localization](https://developer.apple.com/documentation/applemusicapi/storefronts-and-localization)
define this behavior.

Catalog content and localization vary by storefront. Apple uses the storefront's
default language unless `l` requests another supported language. The Recently
Played response example includes storefront-scoped catalog `href` and Apple Music
URLs, so the response should be used as-is instead of re-searching the currently
hard-coded `tw` catalog. [Apple: Storefronts and
Localization](https://developer.apple.com/documentation/applemusicapi/storefronts-and-localization)
and [Get Recently Played Tracks](https://developer.apple.com/documentation/applemusicapi/get-v1-me-recent-played-tracks).

Requesting `types=songs` is important for the current playback contract. Apple
states that personal-library identifiers differ from catalog identifiers and may
change if an item is removed and re-added. The current widget and extended-preview
path expect an Apple catalog song ID, so `library-songs` would require an explicit
catalog relationship/mapping step. [Apple: Handling Requests and
Responses](https://developer.apple.com/documentation/applemusicapi/handling-requests-and-responses)
documents the identifier distinction.

Filtering to `types=songs` also intentionally excludes `library-songs`. If shadow
testing finds a coverage gap, the broader request can include both types and ask
for the library song's `catalog` relationship; library-only content still needs a
fallback because no associated catalog resource is guaranteed. [Apple:
LibrarySongs.Relationships](https://developer.apple.com/documentation/applemusicapi/librarysongs/relationships-data.dictionary)
documents the optional association with catalog content.

The catalog song itself already supplies the fields the UI needs: catalog ID,
album and artist names, artwork template, duration, genre, title, preview assets,
release date, track number, play parameters, and sharing URL. [Apple:
Songs.Attributes](https://developer.apple.com/documentation/applemusicapi/songs/attributes-data.dictionary).
The current 90-second extended-preview upgrade is a separate repository concern;
it is not part of the documented Recently Played response contract.

## Cloudflare feasibility

No platform migration is required. Workers support outbound HTTP requests with
the standard Fetch API, so `site-api` can call `https://api.music.apple.com` with
the two authorization headers. [Cloudflare: Workers
Fetch](https://developers.cloudflare.com/workers/runtime-apis/fetch/).

The existing `site-api` already performs outbound Apple catalog fetches and signs
developer tokens, so the minimum provider change is small: add one Music User
Token secret, fetch `types=songs&limit=1`, normalize the first resource, and keep
the existing fallback/error behavior. See the current
[`site-api` provider](../../../site-api/src/features/home/server/listening.ts)
and [token signer](../../../site-api/src/features/musickit/server/token.ts).

The current Cache API design is feasible but not a global single-flight cache.
Cloudflare states that Cache API contents do not replicate outside the originating
data center and do not use Tiered Cache. Apple requests may therefore occur once
per active Cloudflare data center per TTL, not once globally. Whether that request
volume is acceptable must be observed after the shadow rollout; 429 handling and
observability remain required because Apple publishes no numeric quota.
[Cloudflare: Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
and [Apple: Request Rate Limiting](https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens#Request-Rate-Limiting).

## Required live probe before cutover

The documentation cannot answer the real-time question quantitatively. After an
owner Music User Token is provisioned, run a shadow probe without changing the
public response:

1. Poll `types=songs&limit=1` every 10 seconds for a bounded test window and log
   only response status, catalog ID, fetch time, and relevant cache headers. Never
   log either token.
2. Start, pause, resume, and finish a known song in Apple Music; record time to
   first endpoint change for each event.
3. Repeat the same song and then switch rapidly between two songs to establish
   whether repeats are deduplicated and whether `data[0]` behaves newest-first.
4. Repeat across at least two Apple playback clients used by the owner.
5. Run the existing Last.fm lookup in parallel and compare update delay and event
   semantics over at least five trials.
6. Accept cutover only if the measured delay fits the product's agreed
   "Recently Played" expectation and 403/429/fallback behavior is proven.

Until that probe exists, the strongest defensible answer is: **Apple Recently
Played is cleaner for Apple-native metadata, but its official contract is less
real-time and less expressive than the current Last.fm-backed Listening contract.**
