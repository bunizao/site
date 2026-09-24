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
  sides so the field dissolves before the viewport edges. It is full behind
  the status line and the name, drops to a faint floor (22%) by 270px where
  the bio starts, and is gone at the band's end, so body text never sits in
  full rain.
- Phones: the same composition as wide screens (copy at the top, rain
  behind it), on a 320px band with no side mask. The mask is full behind
  the status line and the display name and dissolves through the chips and
  the role, so it is gone where the bio starts. The rain is the same mono
  face at nearly the bio's size, so it may sit behind display type but never
  behind body text.
- The band width snaps to the 24px lattice, a `ResizeObserver` rebuilds the
  grid on resize, pointer-glow repaints are capped near 30fps, and the band
  is sticky in a track that lets it condense and fade over the first 320px
  of scroll.
- The simulation ticks every 60ms; heads fall 6–12 cells/s (about 150px/s
  on average), the pace of the typewriter's 11 keystrokes a second. One
  fixed preset, no time-of-day variation. Trails linger about half a second,
  and a gust crosses the band every 8–14s at under twice the resting speed.
  Gust timing and glyph churn are written in wall-clock terms, so the tick
  only sets smoothness. Review pins: `?speed=<multiplier>` scales the fall,
  `?ink=<name>` picks the hue.

## Hero / intro

Supporting components: `Typewriter.astro`, `GitHubContributions.astro`,
`TechMarquee.astro`.

- Astro renders mostly static markup.
- The displayed name uses `Typewriter.astro`, which renders a hidden longest-string placeholder to avoid layout shift during typing.
  It paints on a canvas, positioning each glyph by the measured width of the
  run before it, so kerning and the name's CSS tracking survive. It types one
  pass through the names and rests on the first.
- A faint `.hero-lcp-anchor` paints the longest name at first paint, since
  canvas text does not count for LCP. The script removes it when typing
  starts; left in place it showed through as a ghost behind the caret.
- The bio is three paragraphs of prose written in `Hero.astro`, and all of
  it decodes. Every link is a word in the sentence: Monash University, `projects`,
  `write`, `moods`, `Say hi` (to `/message`) and the `hero.socials`
  channels. Only links are bright; the rest of the prose stays muted. They are decode atoms, so they keep their boxes through the
  reveal, and the original markup comes back once it settles. No email
  address on the page, only `/message`.
- GitHub activity is client-fetched from `/api/github/contributions?days=30` after DOM ready; the API keeps the last-year total but returns only the visible waveform window.
- Tech rows are local arrays duplicated into CSS marquee tracks.

Client behavior:

- The entrance is CSS transitions, no GSAP: the script adds `is-live` to the
  section and each `.hero-animate` element rises on its `--hero-i` stagger
  (identity lines 80ms apart, widgets from 950ms in 70ms steps).
- The script fires `home:hero-name-ready` and `home:hero-bio-ready` at 600ms
  and `home:hero-github-ready` (plus `window.__homeHeroGithubReady`) when the
  contributions widget lands. `Typewriter.astro` and `DecodeText.astro` start
  on the first two; `GitHubContributions.astro` renders its bars on the third.
- Status text runs a short random stretch (four swaps) of a fixed word list,
  then rests; the dot pulses once the identity lines have landed.
- Link underlines draw in one after another once the decode settles
  (`dt-settled`). Hovering a link raises a highlight out of its underline.
- Every link carries one mark. Words that stay on the site are underlined;
  the three channels lead with their brand instead, with no underline, since
  both marks together crowded the lines.
- Each bio link names a hover card (`data-card`, rendered by
  `HeroCards.astro` outside the decode root). Every card is its own object,
  and the ones with a shape of their own float on the page with no card
  under them:
  - Monash: the student card on its lanyard, after the university's own:
    the Monash M device beside the photo (its fixed 1:2.3 shape from the
    brand book), the clip through a punched hole, a drawn portrait
    (`public/badge/portrait-{128,256,384}.webp`, picked by pixel density
    through `srcset`), the full logo
    (`public/brands/monash-logo.svg`, crest in Monash blue), the degree, the
    faculty and graduation as the expiry date. It hangs below
    the word and swings once. The barcode is real Code 128 and scans to
    `buxx.me`; no student number goes on the page.
  - Projects: a loose hand of cards dealt on open (type, name, stars), with
    the way to the whole list as the bottom card. Hovering a card lifts its
    face; the fanned hit area stays put, so the card never slides out from
    under the pointer.
  - Write: the blog's latest three posts as a page of contents, one corner
    turned down.
  - Moods: the latest three moods as a channel, from `/api/moods`.
  - Message: an open envelope holding a letter to me, a visitor's draft
    already started, under a Southern Cross stamp postmarked with the time
    in Melbourne.
  - GitHub: a twelve-week heatmap from
    `/api/github/contributions?days=84`, with the year total, the streak and
    the stars across every repo. Stars come from the self-hosted
    github-readme-stats card (`gh-stats.buxx.me`), read at build time
    because it serves SVG without CORS; a failed read shows a dash.
  - Telegram: the chat itself, two sent messages in iMessage blue and a
    reply box floating on the page, with no name, handle or window around
    them. The blue keeps them off the page in the dark theme, where the
    card surface is the page colour.
  - Instagram: the profile picture behind a story ring, with the post,
    follower and following counts. Both come from the profile page at build
    time: Instagram answers link-preview crawlers (`facebookexternalhit`)
    without a login, `og:image` names the picture and `og:description`
    carries the counts. The CDN signs the picture's address and expires it
    within days, so the bytes are inlined as a data URI. A failed read
    leaves the initials and no counts.

  Cards name the short links (`tuu.cat/gh`), never the address behind them.
  GitHub and Instagram show their own profile pictures; the others use
  initials.
  The two network reads start on the first link hover. Cards open after
  120ms of mouse hover or on keyboard focus. They swap instantly between
  links, sit above the word, and flip below it near the viewport top. The
  open card takes the pointer: it stays open while the pointer is on it and
  closes 280ms after the pointer leaves. Escape closes it. Touch never
  opens a card. The layer is `aria-hidden`, and its links are out of the
  tab order, because every destination is also the link itself.
- The experience row for Monash carries the crest
  (`public/brands/monash-crest.svg`, cut from the Wikimedia Commons logo),
  drawn as a mask in the text colour.
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
- a bare URL shows as `host/path`, without scheme or query; past 32
  characters it keeps the host and first segment (`x.com/ryolu_/…`), and the
  full address moves to the link's `title`
- an untitled photo or sticker renders its thumbnail alone; the type name
  ("Photo") moves into the image's `alt`
- the time stamp sits on the card's first-line baseline and the dot centres
  on that line; the rail runs on to 4px short of the next dot, and the
  skeleton blocks sit where the loaded lines will
- a card is the page colour, opaque, so it cuts a clean window in the dot
  lattice; a hairline draws the edge and a small tail points at the row's
  dot. Hover darkens the edge, tail included

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
