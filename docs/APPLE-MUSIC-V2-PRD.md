# Apple Music Full-Track Playback (MusicKit) — v2 PRD

Status: **draft** (2026-06-28) · Owner: bunizao · Branch: `plan-new-blog-era`

## TL;DR

Today the site fakes Apple Music. At build time `apple-music.ts` strips the official
`embed.music.apple.com` iframe (which can stream ~1:30, or the full track once a subscriber
signs in) and replaces it with a static vinyl card driven by a dead 30-second `previewUrl`
from the public iTunes Lookup API. The aesthetic is calm; the cost is that playback silently
downgraded from 1:30 to 30s and full-track playback is impossible.

This PRD wires in **MusicKit JS v3** — Apple's official web SDK — so a visitor can play the
**full track in-page**, using **their own** Apple Music subscription, with no iframe and no
redirect. `getInstance()` is a headless audio controller: `music.play()` makes sound with no
Apple UI surfaced, so the existing vinyl card and play button stay in place and just drive the
MusicKit singleton instead of `new Audio(previewUrl)`. Non-subscribers and unauthorized
visitors fall back to the existing 30-second preview.

## Hard Constraints (non-negotiable, learned the hard way)

1. **You cannot remote-control the Apple iframe.** `embed.music.apple.com` is a cross-origin
   black box with no public `postMessage` play API. "Drive Apple playback from my own button"
   is **only** possible via MusicKit JS. There is no free version of the headless experience.
2. **Full track requires the visitor's own subscription.** Playback is always bound to the
   *listener's* Apple Music account, never the publisher's. Sharing the owner's session token
   is impossible and violates Apple Media Services terms. The owner's account is irrelevant to
   what a visitor can hear.
3. **`previewUrl` is forever 30s; 1:30 only comes from Apple's own player.** The MusicKit
   engine bridges this: subscribers get full tracks, everyone else falls back to the 30s
   preview file we already resolve.
4. **The developer token must be signed with the `.p8` private key, which lives only in
   `site-api`.** This is the public/private security boundary. The `site` repo never sees the
   private key.

## Decisions (locked with owner)

| Topic | Decision |
| --- | --- |
| Developer token signing | **`site-api` signs it.** New `site-api` endpoint returns a 6-month ES256 JWT. `site` fetches it; `.p8` never leaves the private worker. |
| Playback surface | **Both** the blog `.blog-music` cards (in-article) and the home Now Playing widget (`Listening.astro`) play full tracks via one shared MusicKit singleton. |
| Blog card polish | **Redesign required.** The card's typographic hierarchy (title/album/year weight, spacing, marquee) is the weak point and gets reworked. Playback feedback is upgraded to convey "playing the full track" with a real progress affordance and time. |
| Home widget visuals | **Frozen — pixel-perfect, do not redesign.** Only its data API (→ v2) and its playback internals (→ MusicKit full track) change. The shell does not move. |
| API versioning | **Two surfaces both go v2.** New `/api/v2/musickit/token` (token mint) and `/api/v2/listening` (now-playing read, response upgraded to carry the Apple catalog id needed to drive MusicKit). |
| Two-API retention | **v1 stays alive as fallback.** v1 `/api/listening` keeps its old logic and shape. v2 is added in parallel; the front end prefers v2 and falls back to v1 on failure. |
| Quality gates | All of: `bun run check`, `bun run test:unit`, `bun run test:e2e:site`, `bun run build`. |

## Why "首页很完美" and "升级到 v2" are not a contradiction

The home widget's **shell stays frozen**. What changes is underneath it:
- Its data source moves from `/api/listening` (v1) to `/api/v2/listening`, which adds the
  Apple Music **catalog id** to each track — the one field MusicKit needs to queue a full song.
- Its play button stops spawning `new Audio(30s)` and starts driving the shared MusicKit
  singleton. Subscriber → full track; everyone else → the same 30s fallback as before.

Visual layer and playback engine are independent. The skin is done; the engine is new.

## Architecture

```
┌─ site-api (private, holds .p8) ───────────────────────────┐
│  GET /api/v2/musickit/token                                │
│    └─ jose ES256-signs a ≤6-month JWT (kid, iss=TEAM_ID)   │
│       → { token, expiresAt }                                │
└────────────────────────────────────────────────────────────┘
                        ↑ proxied via site /api/* service binding
┌─ site (public front end) ─────────────────────────────────┐
│  lib/musickit/player.ts   ← NEW module-level singleton     │
│    ├─ lazy-load musickit.js on first play intent           │
│    ├─ configure({ developerToken })                        │
│    ├─ play(catalogId): authorize() on demand; fallback     │
│    │    to 30s preview if unauthorized / no subscription   │
│    ├─ pause / toggle / seek / time + progress events       │
│    └─ global single-owner: one track at a time             │
│                                                            │
│  features/posts/server/apple-music.ts                      │
│    └─ keep catalog id + previewUrl on the card DOM         │
│  features/posts/ui/Prose.astro                             │
│    └─ play button drives singleton; preview is fallback    │
│       + redesigned card: hierarchy, progress, time         │
│  features/home/ui/Listening.astro                          │
│    └─ unchanged shell; button drives the same singleton    │
│  features/home/server/listening.ts → v2 read w/ catalogId  │
└────────────────────────────────────────────────────────────┘
```

## MusicKit JS v3 Reference (confirmed shape)

```html
<script src="https://js-cdn.music.apple.com/musickit/v3/musickit.js" data-web-components async></script>
```
```ts
document.addEventListener('musickitloaded', async () => {
  await MusicKit.configure({
    developerToken: TOKEN,            // ES256 JWT from site-api
    app: { name: 'buxx', build: '1.0.0' },
  });
  const music = MusicKit.getInstance();
  await music.setQueue({ song: catalogId }); // catalog song id
  await music.authorize();            // only needed for full track; prompts Apple sign-in
  await music.play();                 // headless: no Apple UI surfaced
});
```
- `music.isAuthorized` gates full-track vs preview fallback.
- `music.player` exposes `currentPlaybackTime`, `currentPlaybackDuration`, `seekToTime()`.
- `MusicKit.Events.playbackStateDidChange` / `playbackTimeDidChange` drive UI state + progress.
- A single global instance is enforced by MusicKit; the singleton wrapper owns it.

## Degradation paths (all three must be preserved)

1. Developer token not configured (e.g. local dev) → fall back to 30s preview.
2. Visitor not subscribed / declines authorization → fall back to 30s preview.
3. `musickit.js` fails to load → fall back to 30s preview.

The 30s `previewUrl` and the static card must never be removed — they are the floor.

## Build Order

Front end first (owner's call), backed by a stubbed/optional token so the UI is real before
the private endpoint lands.

### Phase 0 — Token endpoint (site-api, parallel-safe)
- **S1** `site-api`: `GET /api/v2/musickit/token` mints a ≤6-month ES256 JWT with `jose`
  (`MUSICKIT_PRIVATE_KEY` .p8, `MUSICKIT_KEY_ID`, `MUSICKIT_TEAM_ID` as worker secrets).
  Cache the minted token in KV until near expiry. Returns `{ token, expiresAt }`.

### Phase 1 — Front-end engine + blog card redesign (this repo, start here)
- **S2** `lib/musickit/player.ts`: module-level singleton. Lazy-loads `musickit.js`, configures
  with a token fetched from `/api/v2/musickit/token` (gracefully no-ops if unavailable),
  exposes `toggle(catalogId, { previewUrl })`, `pause()`, progress/time events, single-owner
  preemption. Falls back to preview audio on every degradation path.
- **S3** `apple-music.ts`: stop discarding the embed; write `data-apple-catalog-id` (already
  extracted by `extractAppleId`) and keep `data-preview-url` on the card.
- **S4** `Prose.astro`: replace `new Audio(previewUrl)` with the singleton; remove the manual
  `.is-playing` mutex (the singleton owns preemption); keep preview fallback.
- **S5** Blog card **visual redesign**: tighten title/album/year hierarchy and marquee, add a
  full-track playback state (progress bar + elapsed/total time), refine container (border,
  radius, accent sampling). Aesthetic stays in the calm vinyl idiom.

### Phase 2 — Home widget engine swap (shell frozen)
- **S6** `/api/v2/listening` + `listening.ts`: v2 read adds Apple catalog id per track; v1
  preserved unchanged. Front end prefers v2, falls back to v1.
- **S7** `Listening.astro` script: drive the shared singleton instead of `new Audio`. **No
  visual change.** Subscriber → full track; else → existing 30s preview.

### Phase 3 — Hardening
- **S8** Playwright e2e for both surfaces: preview fallback path (no token) must still play 30s;
  card redesign renders; no console errors; degradation paths verified.

## Resolved Decisions (were open questions)

- **Authorization UX: click-to-play, zero extra clicks.** First tap immediately calls
  `authorize()` then `play()`. Subscribers hear the full track instantly. Decline / no
  subscription → silently fall back to the 30s preview on the same tap. No gating affordance,
  no "play full track" button.
- **Progress bar: draggable seek.** The redesigned card's progress bar scrubs via
  `music.player.seekToTime()`.
- **Token caching: KV TTL 150 days.** Apple allows ≤180 days; mint with 150-day expiry for a
  30-day safety margin. `site-api` caches the minted JWT in KV until near expiry. The front end
  honors `expiresAt` and re-fetches one day early to avoid edge-of-expiry failures.

## Non-Goals

- Sharing the owner's subscription / session for visitor playback (impossible + ToS violation).
- Remote-controlling the legacy iframe.
- Redesigning the home Now Playing widget shell.
- Removing the 30s preview / static card fallback.
- A full Apple Music browse/library UI. This is single-track playback only.
