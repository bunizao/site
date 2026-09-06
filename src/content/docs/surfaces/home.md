---
title: Home page
description: Every section on the landing page, the reveal choreography, and the fixtures the tests drive it with.
group: Surfaces
order: 0
---

`/` is a prerendered shell: [`src/pages/index.astro`](https://github.com/bunizao/site/blob/main/src/pages/index.astro)
mounts the shared layout, wraps everything in `ParallaxWrapper.astro`, and
renders six sections in a fixed order. Runtime-only data is deliberately kept
out of the route frontmatter so the page can be served as static HTML.

## Sections at a glance

| Section | Component | Data | Rendered |
| --- | --- | --- | --- |
| Hero / intro | `home/ui/Hero.astro` | Local config, plus `/api/github/contributions?days=30` | Static; contributions fetched after DOM ready |
| Listening | `home/ui/Listening.astro` | `/api/listening` | Neutral shell at build, hydrated on load, refreshed every 45s |
| Projects | `home/ui/Projects.astro` | Local card data | Static, revealed on scroll |
| Writing | `home/ui/Posts.astro` | Ghost Content API | **Build time** — needs build-env credentials |
| Mood preview (`L0`) | `mood/ui/HomePreview.astro` | `/api/moods` | Skeleton at build, fetched when the section enters the viewport |
| Footer | `home/ui/Footer.astro` | `/api/footer`, `/api/edge` | Client |

Everything under `src/features/home/` is home-private — `ui/` for components,
`server/` for helpers. Shared scaffolding lives in `src/layouts/`.

The navbar owns three section anchors — `#projects-section`,
`#writing-section`, `#moods-section`. The hero has none.

## Glyph field

`home/ui/GlyphField.astro` mounts a monospace rain band behind the hero,
painted on a canvas by `src/lib/glyph-field.ts` (decisions and tunables in
`plans/home-background.md`). The canvas is sized to its host, so the engine
only simulates cells that can be seen:

- Wide screens (≥ 640px): a 560px band, at most 1200px wide, masked on both
  sides so the field dissolves before the viewport edges.
- Phones: a 320px band that dissolves fully at its own bottom edge, with no
  side mask. The hero pads its copy down 216px so only the status label and
  the display name sit in the fade; the chips, role and bio start below the
  band. The rain is the same mono face at nearly the bio's size, so it may
  sit behind display type but never behind body text.
- The band width snaps to the 24px lattice, a `ResizeObserver` rebuilds the
  grid on resize, pointer-glow repaints are capped near 30fps, and the band
  is sticky in a track that lets it condense and fade over the first 320px
  of scroll.

## Hero / intro

Supporting components: `Typewriter.astro`, `GitHubContributions.astro`,
`TechMarquee.astro`.

- Astro renders mostly static markup.
- The displayed name uses `Typewriter.astro`, which renders a hidden longest-string placeholder to avoid layout shift during typing.
- Social links are local config in the component, not CMS-driven.
- GitHub activity is client-fetched from `/api/github/contributions?days=30` after DOM ready; the API keeps the last-year total but returns only the visible waveform window.
- Tech rows are local arrays duplicated into CSS marquee tracks; the marquee is hidden below 640px.

Client behavior:

- The entrance is CSS transitions, no GSAP: the script adds `is-live` to the
  section and each `.hero-animate` element rises on its `--hero-i` stagger
  (identity lines 80ms apart, widgets from 950ms in 70ms steps).
- The script fires `home:hero-name-ready` and `home:hero-bio-ready` at 600ms
  and `home:hero-github-ready` (plus `window.__homeHeroGithubReady`) when the
  contributions widget lands. `Typewriter.astro` and `DecodeText.astro` start
  on the first two; `GitHubContributions.astro` renders its bars on the third.
- Status text rotates through a fixed word list; the dot pulses once the
  identity lines have landed.
- Social buttons use a magnetic hover effect (pointer events plus a CSS
  transition, mouse only).
- Reduced-motion users skip the script entirely; the elements are visible
  from the first paint.

## Projects

Cards come from local data, and the contribution waveform fetches
`/api/github/contributions`. E2E mode swaps live data for fixtures through
`home/server/e2e-fixtures.ts` and `lib/e2e.ts`.

Mapping rules:

- tags are derived from `primaryLanguage + repositoryTopics`
- tags are deduped and truncated to 3
- ownership decides whether the card shows `Author` or `Contributor`

Client behavior:

- GSAP `ScrollTrigger` reveals the section and cards.
- Cards apply pointer-based 3D tilt.
- Radial glare is driven by CSS variables on hover.

## Listening

The initial render is a neutral loading shell, so the static home page never
freezes an old track into the HTML. Last.fm supplies the track; iTunes Search
enriches it with preview audio and better artwork. Missing configuration keeps
the fallback in place — the endpoint's three-state `source` contract is in
[Listening API](/docs/api/listening#read-source-before-rendering).

Rendering rules:

- the first track hydrates the compact widget on initial render
- track metadata is carried through `data-*` attributes for client updates
- outbound music links open in a new tab
- title and artist render inline with a separator when they fit the available width
- long titles switch to a constrained stacked layout; the title scrolls and the artist truncates without widening the page

Client behavior:

- the widget refreshes live listening data every 45 seconds
- the preview button plays or pauses the current track's preview URL with the native `Audio` API
- live refresh keeps the static fallback if the API is unavailable

## Writing

The build fetches the latest five public Ghost posts from `PUBLIC_GHOST_URL`
and keeps only `id`, `title`, `url`, `published_at`, and `tags`.

**This is the one section that fails at build time rather than at runtime.**
`PUBLIC_GHOST_URL` and `GHOST_CONTENT_API_KEY` must exist in the *build*
environment — Worker runtime secrets are not enough, because the page is
prerendered into static HTML. Preview Workers have the same rule: GitHub
Actions must pass both into the build step before `wrangler versions upload`.
Ghost's `Post published` webhook must call the Cloudflare Workers Builds deploy
hook; the old Vercel hook does not rebuild this Worker.

Rendering rules:

- each row links to the external Ghost post
- the first public tag is used as display metadata
- publish date is formatted as `YYYY.MM`
- fetch failure returns an empty list and shows `No posts yet.`

Publishing flow:

1. Create a Workers Builds deploy hook for the `cloudflare-runtime` production branch.
2. Replace the old Vercel deploy hook URL in Ghost with that one, keeping the event as `Post published`.
3. After changing build variables or the hook URL, trigger a fresh build and confirm the deployed HTML no longer contains `No posts yet.` inside `#writing-section`.

Client behavior:

- GSAP reveals the section once.
- list items slide in from the left.
- the trailing link fades in last.

## Mood preview (`L0`)

Astro renders skeleton rows only; the client fetches `GET /api/moods` once the
section enters the viewport and keeps the latest five. It consumes the
feed-optimized fields — `previewText`, `previewHtml`, `image`, `imageFallback`,
`mediaHtml`, `needsDetailPage`, `reactions`, `commentsCount`.

Rendering rules:

- mood items are built with DOM APIs, not Astro templates
- preview HTML keeps a very small safe subset
- unsafe tags and unsafe image sources are dropped
- image failure falls back to `imageFallback`
- the card target is stored in `data-href="/mood/{id}"`

Client behavior:

- loading is gated by `ScrollTrigger`
- skeleton shimmer is CSS-only
- loaded items use a heavier GSAP reveal than the other home sections

Debug hook:

- `PUBLIC_DEBUG_ALWAYS_LOADING === 'true'` keeps the section in loading mode

## Shared home hooks

From `Layout.astro` and `ParallaxWrapper.astro`:

- theme is applied before paint from `localStorage.theme` or `prefers-color-scheme`
- navbar is section-anchor based, not route-aware
- navbar text is split into character spans and tracks active sections while scrolling
- `ParallaxWrapper.astro` adds section drift without changing section ownership
- the base layout does not mount a third-party analytics script
