---
title: Home
description: The composition of /, the sections it renders, and how each section gets its data.
internal: true
---

The home page is a prerendered shell. `src/pages/index.astro` mounts `Layout.astro`, wraps content in `ParallaxWrapper`, and renders sections in fixed order: hero, listening, projects, posts, mood preview, footer. Runtime-only data stays out of the route frontmatter so `/` can be served as static HTML.

Section anchors are owned by the shared layout navbar: `#projects-section`, `#writing-section`, `#moods-section`. The hero block has no anchor.

## Hero

Static markup. The displayed name uses `Typewriter.astro`, which renders a hidden longest-string placeholder so layout doesn't shift while typing. Social links are local config in the component, not CMS-driven. GitHub activity fetches from `/api/github/contributions` after DOM ready and renders into the hero animation chain. Tech rows are local arrays duplicated into CSS marquee tracks.

GSAP reveals `.hero-animate` elements with staggered fade-up. Status text rotates through a fixed word list. Social buttons use a magnetic hover effect. Reduced-motion users skip the initial hidden state.

## Projects

Build-time render fetches pinned repositories from GitHub. Primary path uses GraphQL when `GITHUB_TOKEN` exists; fallback uses a curated list and enriches with repo metadata when possible. E2E mode swaps live data with fixtures.

Tags are derived from `primaryLanguage + repositoryTopics`, deduped, truncated to 3. Ownership decides Author vs Contributor. GSAP `ScrollTrigger` reveals; cards apply pointer-based 3D tilt; radial glare is driven by CSS variables on hover.

## Listening

Initial render uses a neutral loading shell so the static home page never freezes an old track into the HTML. The client fetches `/api/listening` (Last.fm `user.getRecentTracks`) as soon as the script loads. iTunes Search enriches with preview audio and higher-confidence artwork. Missing Last.fm config keeps the static fallback.

The widget refreshes every 45 seconds. The preview button plays/pauses the current track's preview URL with the native `Audio` API. Long titles switch to a constrained stacked layout — the title scrolls, the artist truncates, the page doesn't widen.

## Writing

Build-time render fetches the latest 5 public Ghost posts from `GHOST_URL` using `GHOST_CONTENT_APIKEY`. Only `id`, `title`, `url`, `published_at`, `tags` are fetched. Each row links externally; first public tag is metadata; date is `YYYY.MM`; failure shows `No posts yet.`.

`GHOST_URL` and `GHOST_CONTENT_APIKEY` must be configured in the Cloudflare build environment, not only as Worker runtime secrets. The home page is prerendered, so runtime secrets cannot repair already-generated static HTML.

Ghost's `Post published` webhook should call the Cloudflare Workers Builds deploy hook for the production branch. The old Vercel deploy hook only rebuilt the previous Vercel deployment and does not refresh the Cloudflare Worker output.

GSAP reveals once. List items slide in from the left. Trailing link fades in last.

## Mood preview (L0)

Astro renders skeleton rows; real content is fetched on the client after the section enters the viewport. Only the latest 5 moods are kept. Mood items are built with DOM APIs, not Astro templates. Preview HTML keeps a very small safe subset; unsafe tags and image sources are dropped. Image failure falls back to `imageFallback`. The card target is in `data-href="/mood/{id}"`.

Loading is gated by `ScrollTrigger`. Skeleton shimmer is CSS-only. Loaded items use a heavier GSAP reveal than other home sections.

`PUBLIC_DEBUG_ALWAYS_LOADING === 'true'` keeps the section in loading mode.

## Cross-cutting

Theme is applied before paint from `localStorage.theme` or `prefers-color-scheme`. Navbar is section-anchor based, not route-aware — labels are split into character spans, active sections are tracked while scrolling. `ParallaxWrapper.astro` adds section drift without changing section ownership. The base layout does not mount a third-party analytics script.
