---
title: Home page
description: What each home page section renders, where its data comes from, and how it animates.
group: Surfaces
order: 0
---

The home page at `/` is a prerendered shell. This page covers each of its
sections: the component, the data it reads, when it renders, and what the
client does. Read it before you change a section or its data source.

[`src/pages/index.astro`](https://github.com/bunizao/site/blob/main/src/pages/index.astro) mounts the shared layout, wraps everything in
`ParallaxWrapper.astro`, and renders six sections in a fixed order. Runtime-only
data stays out of the route frontmatter so the page can be served as static
HTML.

## Sections at a glance

| Section | Component | Data | Rendered |
| --- | --- | --- | --- |
| [Hero](#hero) | `home/ui/Hero.astro` | Local config, plus `/api/github/contributions?days=84` | Static. Contributions fetched after DOM ready |
| [Listening](#listening) | `home/ui/Listening.astro` | `/api/v2/listening` | Neutral shell at build, hydrated on load, refreshed every 45s while on screen |
| [Projects](#projects) | `home/ui/Projects.astro` | Local card data | Static, revealed on scroll |
| [Writing](#writing) | `home/ui/Posts.astro` | Ghost Content API | **Build time**. Needs build-env credentials |
| [Mood preview (`L0`)](#mood-preview-l0) | `mood/ui/HomePreview.astro` | `/api/v2/mood?limit=5`, `/api/moods` as fallback | Skeleton at build, fetched about one viewport before the section scrolls in |
| Footer | `home/ui/Footer.astro` | `/api/footer`, `/api/edge` | Client |

Two more parts span sections: the [glyph field](#glyph-field) behind the hero,
and the [shared home hooks](#shared-home-hooks) from the layout.

Code under `src/features/home/` is private to the home page: `ui/` holds
components and `server/` holds helpers. Shared scaffolding lives in
`src/layouts/`.

The navbar links to three section anchors: `#projects-section`,
`#writing-section` and `#moods-section`. The hero has no anchor.

## Glyph field

`home/ui/GlyphField.astro` mounts a band of monospace "rain" (falling glyphs)
behind the hero. `src/lib/glyph-field.ts` paints it on a canvas. Decisions and
tunables are in `plans/home-background.md`. The canvas is sized to its host, so
the engine only simulates cells you can see.

| Screen | Band | Mask |
| --- | --- | --- |
| Wide (≥ 640px) | 560px tall, at most 1200px wide, masked on both sides so the field fades out before the viewport edges | Full behind the status line and the name, a faint floor (22%) by 270px where the bio starts, gone at the band's end |
| Phones | 320px tall, no side mask. Same layout as wide screens (copy at the top, rain behind it) | Full behind the status line and the display name, fades through the chips and the role, gone where the bio starts |

On both, body text never sits in full rain. On phones the rain is the same mono
face at nearly the bio's size, so it may sit behind display type but never
behind body text.

Layout:

- The band width snaps to the 24px lattice.
- A `ResizeObserver` rebuilds the grid on resize.
- Pointer-glow repaints are capped near 30fps.
- The band is sticky in a track that lets it condense and fade over the first
  320px of scroll.

Motion uses one fixed preset, with no time-of-day variation:

| Setting | Value |
| --- | --- |
| Simulation tick | Every 60ms |
| Head fall speed | 6–12 cells/s (about 150px/s on average), the pace of the typewriter's 11 keystrokes a second |
| Trails | Linger about half a second |
| Gusts | Cross the band every 8–14s at under twice the resting speed |

Gust timing and glyph churn are set in wall-clock time, so the tick only
controls smoothness.

To review the look, two query params pin it: `?speed=<multiplier>` scales the
fall and `?ink=<name>` picks the hue.

## Hero

Astro renders the hero as mostly static markup. It uses three supporting
components: `Typewriter.astro`, `GitHubContributions.astro` and
`TechMarquee.astro`. Tech rows are local arrays duplicated into CSS marquee
tracks.

### Name

The displayed name uses `Typewriter.astro`. It renders a hidden placeholder with
the longest string, so typing doesn't shift the layout. It paints on a canvas
and places each glyph by the measured width of the run before it, so kerning and
the name's CSS tracking survive. It types one pass through the names and rests
on the first.

Canvas text doesn't count for LCP, so a faint `.hero-lcp-anchor` paints the
longest name at first paint. The script removes it when typing starts. Left in
place, it showed through as a ghost behind the caret.

### Bio

The bio is three short paragraphs of prose in `Hero.astro`: what the owner
makes, what they write, and where they are. All of it decodes, using the
scramble-then-settle text reveal from `DecodeText.astro`.

Every link is a word in the sentence. In reading order:

- `projects`, `write`, `moods`
- Monash University
- `Message me` (to `/message`)
- the `hero.socials` channels

Only links are bright. The rest of the prose stays muted. Links are decode
atoms, so each keeps its box through the reveal, and the original markup comes
back once the reveal settles. The page has no email address, only `/message`.

### GitHub activity

The client fetches GitHub activity from `/api/github/contributions?days=84`
after DOM ready. The hero's GitHub card uses the same URL, so both share one
cached response. The waveform keeps the last 30 days and sums its own total,
because the payload's total covers all 84.

### Entrance

The entrance uses CSS transitions, with no GSAP. The script adds `is-live` to
the section, and each `.hero-animate` element rises on its `--hero-i` stagger:
identity lines 80ms apart, then widgets from 950ms in 70ms steps.

The script fires three events:

- `home:hero-name-ready` and `home:hero-bio-ready` at 600ms.
  `Typewriter.astro` and `DecodeText.astro` start on these two.
- `home:hero-github-ready` (plus `window.__homeHeroGithubReady`) when the
  contributions widget lands. `GitHubContributions.astro` renders its bars on
  this one.

The status text makes four random swaps through a fixed word list, then rests.
The status dot pulses once the identity lines have landed.

### Link marks

Link underlines draw in one after another once the decode settles
(`dt-settled`). Hovering a link raises a highlight out of its underline.

Each link has one mark:

- The prose words (`projects`, `write`, `moods`) are underlined.
- The last paragraph's links start with an icon and have no underline, because
  both marks together crowded the lines. The icons are the Monash crest
  (`/brands/monash-crest.svg`, cut from the full logo and drawn as a CSS mask so
  it takes the link colour), an envelope for `Message me`, and each channel's
  brand.

The experience row for Monash also shows the crest
(`public/brands/monash-crest.svg`, cut from the Wikimedia Commons logo), drawn
as a mask in the text colour.

### Hover cards

Each bio link names a hover card with `data-card`. `HeroCards.astro` renders the
cards outside the decode root. Each card is drawn as its own object. Cards with
a shape of their own float on the page with no card under them.

- **Monash.** The student card on its lanyard, modelled on the university's own.
  It hangs below the word and swings once. It shows:
  - the Monash M device beside the photo (its fixed 1:2.3 shape from the brand
    book)
  - the clip through a punched hole
  - a drawn portrait (`public/badge/portrait-{128,256,384}.webp`, picked by
    pixel density through `srcset`)
  - the full logo (`public/brands/monash-logo.svg`, crest in Monash blue)
  - the degree, the faculty, and graduation as the expiry date

  The barcode is real Code 128 and scans to `buxx.me`. No student number goes on
  the page.
- **Projects.** A loose hand of cards dealt on open (type, name, stars). The
  bottom card links to the whole list. Hovering a card lifts its face. The
  fanned hit area stays put, so the card never slides out from under the
  pointer.
- **Write.** The blog's latest three posts as a page of contents, with one
  corner turned down.
- **Moods.** The latest three moods as a channel. It shares the mood preview's
  `/api/v2/mood?limit=5` request (falling back to `/api/moods`), so the page
  makes at most one mood feed request.
- **Message.** An open envelope holding a letter to the owner, with a visitor's
  draft already started, under a Southern Cross stamp postmarked with the time
  in Melbourne.
- **GitHub.** A twelve-week heatmap from `/api/github/contributions?days=84`,
  with the year total, the streak, and the stars across every repo. Stars come
  from the self-hosted github-readme-stats card (`gh-stats.buxx.me`). The build
  reads it, because it serves SVG without CORS. A failed read shows a dash.
- **Telegram.** The chat itself: two sent messages in iMessage blue and a reply
  box floating on the page, with no name, handle or window around them. The
  blue sets them apart from the page in the dark theme, where the card surface
  is the page colour.
- **Instagram.** The profile picture behind a story ring, with the post,
  follower and following counts. Both come from `site-api`
  ([Instagram profile](/docs/api/content#instagram-profile)). Nothing on this
  card is read at build.

The Instagram picture is `/api/v2/instagram/avatar`, the stored copy of the last
read that passed validation, so the page never links a signed Instagram address.
If that read is unavailable (the avatar request errors, including one that
already failed before hydration), the ring shows a neutral Instagram glyph at
the same size instead of a broken image, so nothing shifts. The counts load
with the other live reads and show dashes until they arrive, whether or not the
avatar loads.

Ops Health (`tests/ops/instagram-profile-health.test.ts`) fails when:

- the stored read is over a day old
- the served picture stops matching the profile
- the handle drifts from the site's link
- the card links anything but the stored picture

Cards show the short links (`tuu.cat/gh`), never the address behind them.
GitHub and Instagram show profile pictures. The three network reads start on the
first link hover.

| Input | Behaviour |
| --- | --- |
| Mouse | Opens after 120ms of hover. The open card takes the pointer: it stays open while the pointer is on it and closes 280ms after the pointer leaves |
| Keyboard | Opens on focus. Escape closes it |
| Touch | The first tap on a link opens its card instead of navigating, and marks the word (`data-card-active`). Tapping the card's object or the same word again follows the link. A tap anywhere else closes it |

Cards swap instantly between links. They sit above the word and flip below it
near the viewport top. The card layer is `aria-hidden` and its links are out of
the tab order, because every destination is also the link itself.

### Reduced motion

With reduced motion on, the script doesn't run at all. The elements are visible
from the first paint.

## Projects

Cards come from local data. The contribution waveform fetches
`/api/github/contributions`. In E2E mode, `home/server/e2e-fixtures.ts` and
`lib/e2e.ts` swap live data for fixtures (fixed test data).

How repository data maps to a card:

- Tags come from `primaryLanguage + repositoryTopics`.
- Tags are deduped and cut to 3.
- Ownership decides whether the card shows `Author` or `Contributor`.

In the browser:

- GSAP `ScrollTrigger` reveals the section and the cards.
- Cards tilt in 3D with the pointer.
- CSS variables drive a radial glare on hover.

## Listening

The first render is a neutral loading shell, so the static home page never
bakes an old track into the HTML. Last.fm supplies the track. iTunes Search adds
preview audio and better artwork. If configuration is missing, the fallback
stays in place. The endpoint's three-state `source` contract is in
[Listening API](/docs/api/listening#read-source-before-rendering).

Rendering rules:

- The first track hydrates the compact widget on initial render.
- Track metadata is kept in `data-*` attributes for client updates.
- Outbound music links open in a new tab.
- Title and artist render inline with a separator when they fit the available
  width.
- Long titles switch to a constrained stacked layout. The title scrolls and the
  artist truncates, without widening the page.

In the browser:

- If the page has no server-rendered track, the first fetch starts as soon as
  the script runs.
- The client only calls `/api/v2/listening`. `/api/listening` is a redirect to
  the same handler, so it is never used as a fallback.
- The preview button plays or pauses the current track's preview URL with the
  native `Audio` API.
- If the API is unavailable, live refresh keeps the static fallback.

The widget refreshes live listening data on this schedule:

| When | What happens |
| --- | --- |
| Tab is visible and the card is within 200px of the viewport | Refreshes every 45 seconds |
| You scroll back to the card and the last fetch is older than 45 seconds | Refreshes at once |
| You refocus the tab | Refreshes at once |

## Writing

The build fetches the latest five public Ghost posts from `PUBLIC_GHOST_URL`
and keeps only `id`, `title`, `url`, `published_at`, and `tags`.

**This is the only section that fails at build time instead of at runtime.**
`PUBLIC_GHOST_URL` and `GHOST_CONTENT_API_KEY` must exist in the *build*
environment. Worker runtime secrets aren't enough, because the page is
prerendered into static HTML. Preview Workers follow the same rule: GitHub
Actions must pass both into the build step before `wrangler versions upload`.

Ghost's `Post published` webhook must call the Cloudflare Workers Builds deploy
hook. The old Vercel hook doesn't rebuild this Worker.

Rendering rules:

- Each row links to the external Ghost post.
- The first public tag is shown as metadata.
- The publish date is formatted as `YYYY.MM`.
- A fetch failure returns an empty list and shows `No posts yet.`

### Set up the publish hook

1. Create a Workers Builds deploy hook for the `cloudflare-runtime` production
   branch.
2. In Ghost, replace the old Vercel deploy hook URL with the new one. Keep the
   event as `Post published`.
3. After you change build variables or the hook URL, trigger a fresh build.
   Confirm the deployed HTML no longer contains `No posts yet.` inside
   `#writing-section`.

In the browser:

- GSAP reveals the section once.
- List items slide in from the left.
- The trailing link fades in last.

## Mood preview (`L0`)

`L0` is the first level of the mood surface: a short preview of the latest
posts. The full feed is covered in [Mood](/docs/surfaces/mood).

Astro renders skeleton rows only. The client code is
[`mood/client/preview-feed.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/client/preview-feed.ts):

1. When the section is about one viewport away, it fetches
   `GET /api/v2/mood?limit=5` (the cached D1 archive).
2. If that fails, it retries once against the live mirror at `GET /api/moods`.
3. It keeps the latest five.

It reads the feed-optimized fields: `previewText`, `previewHtml`, `image`,
`imageFallback`, `mediaHtml`, `needsDetailPage`, `reactions`, `commentsCount`.

Rendering rules:

- Mood items are built with DOM APIs, not Astro templates.
- Preview HTML keeps a very small safe subset. Unsafe tags and unsafe image
  sources are dropped.
- If an image fails, it falls back to `imageFallback`.
- The card target is stored in `data-href="/mood/{id}"`.
- A bare URL shows as `host/path`, without scheme or query. Past 32 characters
  it keeps the host and first segment (`x.com/ryolu_/…`), and the full address
  moves to the link's `title`.
- An untitled photo or sticker renders its thumbnail alone. The type name
  ("Photo") moves into the image's `alt`.

Layout:

- The time stamp sits on the card's first-line baseline, and the dot centres on
  that line.
- The rail runs on to 4px short of the next dot.
- Skeleton blocks sit where the loaded lines will be.
- A card is the page colour and opaque, so it cuts a clean window in the dot
  lattice. A hairline draws the edge, and a small tail points at the row's dot.
  Hover darkens the edge, tail included.

In the browser:

- `ScrollTrigger` gates loading.
- The skeleton shimmer is CSS-only.
- Loaded items use a heavier GSAP reveal than the other home sections.

For debugging, `PUBLIC_DEBUG_ALWAYS_LOADING === 'true'` keeps the section in
loading mode.

## Shared home hooks

These come from `Layout.astro` and `ParallaxWrapper.astro`:

- The theme is applied before paint, from `localStorage.theme` or
  `prefers-color-scheme`.
- The navbar links to section anchors and isn't route-aware.
- Navbar text is split into character spans and tracks the active section as
  you scroll.
- `ParallaxWrapper.astro` adds section drift without changing section
  ownership.
- The base layout doesn't mount a third-party analytics script.
