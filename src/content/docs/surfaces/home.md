---
title: Home page
description: Every section on the landing page, the reveal choreography, and the fixtures the tests drive it with.
group: Surfaces
order: 0
---

## Scope

This document covers the home page entry and the sections rendered on `/`:

- intro / hero
- projects
- writing
- mood preview (`L0`)

## Entry Composition

Entry file: [`src/pages/index.astro`](https://github.com/bunizao/site/blob/main/src/pages/index.astro)

The page is a prerendered shell:

- mounts [`src/layouts/Layout.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Layout.astro)
- wraps content in [`src/features/home/ui/ParallaxWrapper.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/ParallaxWrapper.astro)
- renders sections in fixed order:
  - [`src/features/home/ui/Hero.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Hero.astro)
  - [`src/features/home/ui/Listening.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Listening.astro)
  - [`src/features/home/ui/Projects.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Projects.astro)
  - [`src/features/home/ui/Posts.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Posts.astro)
  - [`src/features/mood/ui/HomePreview.astro`](https://github.com/bunizao/site/blob/main/src/features/mood/ui/HomePreview.astro)
  - [`src/features/home/ui/Footer.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Footer.astro)
- keeps runtime-only data out of the route frontmatter so `/` can be served as static HTML

Section anchors are owned by the shared layout navbar:

- `#projects-section`
- `#writing-section`
- `#moods-section`

The hero block does not have a navbar anchor.

Feature boundary:

- home-private UI lives in [`src/features/home/ui/`](https://github.com/bunizao/site/blob/main/src/features/home/ui)
- home-private server helpers live in [`src/features/home/server/`](https://github.com/bunizao/site/blob/main/src/features/home/server/)
- shared site scaffolding lives in [`src/layouts/`](https://github.com/bunizao/site/blob/main/src/layouts) and other feature-local UI shells

## Hero / Intro

Implementation files:

- [`src/features/home/ui/Hero.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Hero.astro)
- [`src/features/home/ui/Typewriter.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Typewriter.astro)
- [`src/features/home/ui/GitHubContributions.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/GitHubContributions.astro)
- [`src/features/home/ui/TechMarquee.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/TechMarquee.astro)

Implementation shape:

- Astro renders mostly static markup.
- The displayed name uses `Typewriter.astro`, which renders a hidden longest-string placeholder to avoid layout shift during typing.
- Social links are local config in the component, not CMS-driven.
- GitHub activity is client-fetched from `/api/github/contributions?days=30` after DOM ready; the API keeps the last-year total but returns only the visible waveform window.
- Tech rows are local arrays duplicated into CSS marquee tracks.

Client behavior:

- GSAP reveals `.hero-animate` elements with staggered fade-up.
- Status text rotates through a fixed word list.
- Social buttons use a magnetic hover effect.
- Reduced-motion users skip the initial hidden state.

## Projects

Implementation files:

- [`src/features/home/ui/Projects.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Projects.astro)
- [`src/features/home/server/e2e-fixtures.ts`](https://github.com/bunizao/site/blob/main/src/features/home/server/e2e-fixtures.ts)
- [`src/lib/e2e.ts`](https://github.com/bunizao/site/blob/main/src/lib/e2e.ts)

Data flow:

- Project cards are rendered from local card data.
- The contribution waveform fetches `/api/github/contributions`; production traffic is served by `site-api`.
- E2E mode swaps live data with fixtures.

Mapping rules:

- tags are derived from `primaryLanguage + repositoryTopics`
- tags are deduped and truncated to 3
- ownership decides whether the card shows `Author` or `Contributor`

Client behavior:

- GSAP `ScrollTrigger` reveals the section and cards.
- Cards apply pointer-based 3D tilt.
- Radial glare is driven by CSS variables on hover.

## Listening

Implementation files:

- [`src/features/home/ui/Listening.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Listening.astro)
- [`src/features/home/server/listening.ts`](https://github.com/bunizao/site/blob/main/src/features/home/server/listening.ts)
- `site-api /api/listening`

Data flow:

- The initial render uses a neutral loading shell so the static home page never freezes an old track into the HTML.
- The client fetches `/api/listening`, served by `site-api`, as soon as the listening script loads.
- Last.fm provides the current or latest track; iTunes Search enriches it with preview audio and higher-confidence artwork when available.
- Missing Last.fm configuration keeps the static fallback in place.

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

Implementation files:

- [`src/features/home/ui/Posts.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Posts.astro)
- [`src/features/home/server/e2e-fixtures.ts`](https://github.com/bunizao/site/blob/main/src/features/home/server/e2e-fixtures.ts)
- [`src/lib/e2e.ts`](https://github.com/bunizao/site/blob/main/src/lib/e2e.ts)

Data flow:

- Build-time render fetches the latest 5 public Ghost posts from `PUBLIC_GHOST_URL`.
- The request uses `GHOST_CONTENT_API_KEY`.
- `PUBLIC_GHOST_URL` and `GHOST_CONTENT_API_KEY` must exist in the Cloudflare build environment. Worker runtime secrets alone are not enough because the home page is prerendered into static HTML.
- Preview Workers have the same rule: GitHub Actions must pass those values into the build step before `wrangler versions upload`. Runtime dashboard variables only affect on-demand Worker code.
- Ghost's `Post published` webhook should call the Cloudflare Workers Builds deploy hook for the production branch. The old Vercel deploy hook does not rebuild the Cloudflare Worker.
- Only metadata needed by the section is fetched:
  - `id`
  - `title`
  - `url`
  - `published_at`
  - `tags`

Rendering rules:

- each row links to the external Ghost post
- the first public tag is used as display metadata
- publish date is formatted as `YYYY.MM`
- fetch failure returns an empty list and shows `No posts yet.`

Publishing flow:

- In Cloudflare, create a Workers Builds deploy hook for the `cloudflare-runtime` production branch.
- In Ghost, replace the old Vercel deploy hook URL with that Cloudflare deploy hook URL.
- Keep the Ghost hook event as `Post published`.
- After changing build variables or the hook URL, trigger one fresh Cloudflare build and verify that the deployed HTML no longer contains `No posts yet.` inside `#writing-section`.

Client behavior:

- GSAP reveals the section once.
- list items slide in from the left.
- the trailing link fades in last.

## Mood Preview (`L0`)

Implementation files:

- [`src/features/mood/ui/HomePreview.astro`](https://github.com/bunizao/site/blob/main/src/features/mood/ui/HomePreview.astro)
- `site-api /api/moods`

Rendering strategy:

- Astro renders skeleton rows only.
- Real content is fetched on the client after the section enters the viewport.
- The client keeps only the latest 5 moods for home preview.

Data flow:

- fetches `GET /api/moods`
- consumes feed-optimized payload:
  - `previewText`
  - `previewHtml`
  - `image`
  - `imageFallback`
  - `mediaHtml`
  - `needsDetailPage`
  - `reactions`
  - `commentsCount`

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

## Shared Home Hooks

Relevant files:

- [`src/layouts/Layout.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Layout.astro)
- [`src/features/home/ui/ParallaxWrapper.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/ParallaxWrapper.astro)

Cross-cutting behavior:

- theme is applied before paint from `localStorage.theme` or `prefers-color-scheme`
- navbar is section-anchor based, not route-aware
- navbar text is split into character spans and tracks active sections while scrolling
- `ParallaxWrapper.astro` adds section drift without changing section ownership
- the base layout does not mount a third-party analytics script
