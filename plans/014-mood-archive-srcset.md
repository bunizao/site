# Plan 014: Restore responsive images (srcset) on the archive read path

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in the "STOP conditions" section occurs, stop and report — do not
> improvise. Your reviewer maintains `plans/README.md`; do not edit it.
>
> **Drift check (run first)**:
> `git diff --stat da8c4747..HEAD -- src/features/mood/ui/FeedShell.astro src/features/mood/client/feed-renderer.ts src/features/mood/client/feed-media-hydration.ts src/features/mood/shared/gallery.ts src/features/mood/shared/feed-thumbnail.ts src/pages/mood.astro tests/unit`
> On drift, compare "Current state" excerpts; mismatch is a STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 011 (shares image element wiring; land 011 first)
- **Category**: perf
- **Planned at**: `site` commit `da8c4747`, 2026-07-19

## Why this matters

When mood reads defaulted to the D1 archive, images silently lost width
negotiation: archive URLs (`/api/v2/images/mood/{id}/{n}`) are emitted bare,
so every phone downloads the full-resolution original for feed thumbs,
galleries, and the LCP preload. The image proxy already supports resizing —
nothing asks for it.

## Current state

- Proxy capability (`../site-api`, read-only reference — do NOT modify it):
  `src/features/mood/image-proxy/telegram-image-proxy.ts` accepts
  `?w=`/`?width=` and snaps to widths `[320, 480, 640, 800, 1200]`
  (`resolveResizeWidth`, `:152-160`), serving via `/cdn-cgi/image/...`
  (`buildResizedImageUrl`) with quality 82. Variants are edge-cached.
- Live-path exemplar in this repo: `buildSrcSet` in
  `src/features/mood/server/telegram-source.ts:161` (and use ~`:581-589`) —
  emits `src` + `srcset` from width variants.
- Bare sinks today:
  - SSR feed thumb: `src/features/mood/ui/FeedShell.astro:462-473`
    (`src={thumbImage}`, no `srcset`/`sizes`).
  - Client feed thumb: `feed-renderer.ts:589-700` — `img` gets `src` via
    `mediaHydrator.applyResponsiveImage(img, imageSrc)`.
  - `applyResponsiveImage` in `feed-media-hydration.ts` just assigns `.src`.
  - Gallery items: `shared/gallery.ts:354` region (`data-deferred-src`).
  - LCP preload: `src/pages/mood.astro:70-75` — `preloadImages` array with a
    bare `href` handed to the Layout.
- Only archive-proxied URLs (path contains `/api/v2/images/` or the
  configured image host) should get `?w=` params — external/legacy URLs must
  pass through untouched.
- Convention: shared pure helpers in `src/features/mood/shared/`, unit tests
  in `tests/unit/` (bun test).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Target tests | `bun test tests/unit/mood-image-srcset.test.ts` | all pass |
| Typecheck | `bun run check` | exit 0 |
| Unit suite | `bun run test:unit` | all pass |
| E2E (mood) | `bun run test:e2e:site -- --grep mood` | all pass |

## Scope

**In scope**:

- `src/features/mood/shared/image-srcset.ts` (create: URL predicate +
  `withWidth(url, w)` + `buildArchiveSrcSet(url, widths)`)
- `src/features/mood/ui/FeedShell.astro`, `client/feed-renderer.ts`,
  `client/feed-media-hydration.ts`, `shared/gallery.ts`,
  `shared/feed-thumbnail.ts` (if it computes sizes), `src/pages/mood.astro`
  (preload)
- `tests/unit/mood-image-srcset.test.ts` (create)

**Out of scope**:

- `../site-api` (proxy already supports everything needed).
- The live-path `buildSrcSet` in `telegram-source.ts`.
- Detail page (`DetailArticle.astro`) — follow-up; keep this change bounded.

## Git workflow

- Branch: `fix/mood-hardening` (continue on it if it exists).
- Conventional Commit: `perf(mood): emit srcset on archive images`
- Do not push.

## Steps

### Step 1: Shared srcset helper

Create `shared/image-srcset.ts`: `isArchiveImageUrl(url)` (matches
`/api/v2/images/` paths, relative or absolute), `withWidth(url, w)` (adds
`w` query param, preserving existing params), and
`buildArchiveSrcSet(url)` returning `{ src, srcset, sizes }` using widths
`[320, 480, 640, 800, 1200]` and a `sizes` default that matches the feed
column (inspect the feed CSS max width in `mood.astro` — the feed column is
what the thumb spans; a plain `(max-width: 680px) 100vw, 640px`-style value
derived from the actual CSS is fine — cite what you found in NOTES).
Non-archive URLs return `{ src: url }` only.

**Verify**: unit tests: archive URL → 5-entry srcset with `?w=`; URL with
existing query keeps it; external URL unchanged.

### Step 2: Apply at the four sinks

- FeedShell SSR `<img>`: add `srcset`/`sizes` when
  `isArchiveImageUrl(thumbImage)`.
- `applyResponsiveImage` (feed-media-hydration): when the target URL is an
  archive URL, set `srcset`/`sizes` alongside `src` (this covers the client
  renderer and deferred hydration in one place). Keep the fallback-swap path
  (plan 011) working: a fallback swap must clear `srcset` if the fallback is
  non-archive.
- Gallery deferred images (`shared/gallery.ts`): emit `data-deferred-srcset`
  next to `data-deferred-src` and apply both on hydrate.
- LCP preload (`mood.astro`): give the preload an `imagesrcset`/`imagesizes`
  (Layout preload API permitting — check how `preloadImages` is consumed in
  `src/layouts/Layout.astro`; if it only supports `href`, extend it minimally
  or preload the 800w variant instead of the original; document the choice).

**Verify**: `bun run check` → exit 0; e2e mood specs green; built page HTML
for a fixture feed shows `srcset` on archive thumbs.

## Test plan

- `tests/unit/mood-image-srcset.test.ts`: helper behavior (Step 1 cases) plus
  a DOM test that `applyResponsiveImage` sets and clears `srcset` correctly.
- Existing `mood-feed-thumbnail`/gallery tests stay green.

## Done criteria

- [ ] Feed SSR thumbs, client-rendered thumbs, deferred gallery images, and
      the LCP preload request width-appropriate variants for archive URLs
- [ ] External URLs never get `?w=`
- [ ] All listed commands pass; only in-scope files modified

## STOP conditions

- The Layout preload contract can't carry srcset and changing it affects
  non-mood pages beyond a minimal optional field.
- `/cdn-cgi/image` resizing turns out to be unavailable in the deployment
  (proxy returns originals) — the change is still harmless, but note it.
- Verification fails twice.

## Maintenance notes

- Plan 017 (render unification) must fold these helpers into the unified
  markup builder.
- If the proxy's width list changes, update `image-srcset.ts` to match
  (single source: consider exporting widths from `@bunizao/contracts` later).
