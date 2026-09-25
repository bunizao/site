---
title: Blog design system
description: The ink-wash design language of 無人之境 — one blue hue, foreground-derived greys, and a single reading column.
group: Surfaces
order: 1
---

## Overview

This is the design system for the blog zone (`blog.buxx.me`), a publication
called **無人之境** ("no man's land"). It is deliberately **not** harmonized with
the main `buxx.me` hero/identity system — it is its own publication with its own
voice. Everything is scoped under `.blog-zone`; nothing here may leak onto other
routes.

The aesthetic is ink-wash: a near-monochrome greyscale field, one blue hue for
all accents, and a single 720px reading column. Restraint is the brief — when in
doubt, do less. The reference point was chl.ee's calm, but the visuals were
redesigned in this design language rather than ported.

**Source of truth.** The ink colours live in `blogPalette`
(`src/data/site.ts`) and are emitted as CSS custom properties by
`BlogLayout.astro`. Greys, type, and layout live in `src/styles/blog.css`. This
file mirrors them — change the code, then sync the tokens here.

## Colors

Two layers: **greys derived from the theme foreground**, and a **three-shade
blue ink set**.

**Greys are alpha, not hex.** `{colors.ink}` … `{colors.fill}` are all
`hsl(var(--foreground) / α)`. Because they ride the theme foreground (black in
light, white in dark), a single declaration produces both modes. Use them for
all text and structure; never hardcode a grey.

**The ink set is one hue, graded by depth.** A monochrome publication should
read as a single voice, so the accents are three blues — not blue plus a warm
counter-colour. Each shade owns exactly one job, and the job is fixed by WCAG
contrast against the surface it sits on:

| Token | Job | Contrast (light / dark) | Safe as text |
| --- | --- | --- | --- |
| `{colors.dai}` 黛 | Primary — links, table-of-contents progress, focus rings, hover | 6.84:1 / 7.99:1 | Both modes |
| `{colors.dian}` 靛 | The mark — the "Not by AI" pledge and the author byline | 10.27:1 / 8.22:1 | Both modes |
| `{colors.ji}` 霁 | Highlight wash on the reading surface | **3.57:1** / 8.79:1 | **No — fill only** |

`dai` is the greyed slate-blue shanshui painters dilute to push a ridge into the
haze. `dian` is the firmest blue on the page because it stands for the human
behind the work, which is why it appears nowhere else. `ji` fails AA as text on
the light surface, so it may only ever be a background — the constraint picks
the role, not taste. Blog search now lives in the site-wide ⌘K palette with its
own neutral mark, so `ji` is a reserved reading-zone fill rather than a
search-hit colour.

**Surfaces.** `{colors.surface.dark}` is `#0A0A0A`, not `#000`: pure black
smears on OLED during scroll, and white text on it hits 21:1, which haloes in
long-form reading. The near-black keeps the lights-off feel without the
artifacts.

## Typography

Body copy reads in **Inter** via the global `.reading` contract — content
surfaces opt in and inherit the family without re-declaring it. Code uses the
mono stack. `SiteWordmark.astro` renders the shared publication lockup from a
**2.6 KB WenKai subset** containing 無人之境, sillage, and its separators. The
family is named only by that component, so it does not leak into body text.

Sizes step in a clear hierarchy: `{typography.masthead}` for the wordmark, then
`{typography.article-h1}` → `{typography.article-h2}` → `{typography.article-h3}`
inside a post, `{typography.body}` for prose (a generous 1.85 line-height for
reading), and the muted scale (`{typography.excerpt}`, `{typography.meta}`,
`{typography.eyebrow}`, `{typography.tag}`) for index and chrome. Negative
letter-spacing tightens the large display sizes; body copy gets a hair of
positive tracking for screen legibility.

## Layout

One column, one width. `{layout.measure}` (720px) is the reading measure — every
shell caps here and centres. Shell padding is `{layout.shell-padding}`
(generous top, comfortable sides, deep floor so the last post never kisses the
viewport edge).

Vertical rhythm follows the `spacing` scale: `{spacing.sm}` inside a group,
`{spacing.lg}` between groups, `{spacing.section}`+ between sections. The zone
drops the site's ambient dot-grid background — chl.ee is a flat surface, so this
is too.

The document scrolls, as on the homepage, so iOS Safari collapses its toolbar
on the way down and the page shows through its glass. From August to September
2026 the zone contained its scroll in an inner element to keep content out of
the status-bar band; the toolbar then never collapsed and the strip under it was
flat body colour, a fixed band at both ends of every reading screen. The band
above the reading bar is now left to Safari, as on every other root-scrolling
page.

## Elevation & Depth

**There is no elevation.** The zone is intentionally flat — no drop shadows, no
raised cards floating over the page. Depth is expressed two ways only:

- **Hairlines** (`{colors.line}`) and **spacing** separate content. Prefer
  whitespace to a divider; reach for `{components.divider}` only when grouping
  genuinely needs a line.
- **Image edges** use a 1px inset hairline (`{layout.image-edge.light}` /
  `{layout.image-edge.dark}`) in pure black/white — NOT the tinted foreground
  neutral, which would pick up the surface beneath and read as dirt on the
  photo.

The one motion affordance is the **sliding hover pill** (`{colors.fill}` at
`{rounded.pill}`) that springs to hug the hovered list row.

## Shapes

Corner radii are a small fixed set: `{rounded.inline}` for inline code,
`{rounded.image}` for media, `{rounded.card}` for cards and panels,
`{rounded.pill}` for tags and round controls. Single-sided or borderless
surfaces use `{rounded.none}` — a rounded corner only belongs on a full border.

## Components

Components compose the tokens above; they never introduce new colour or type.

- `{components.link}` / `{components.post-item}` — text in `{colors.ink}`,
  links and interaction in `{colors.dai}`. On hover a row gets
  `{components.post-item-hover}` (the `{colors.fill}` pill).
- `{components.tag-pill}` — `{colors.dai}` text on a 12% `{colors.dai}` wash. A
  tag may override its own accent via `--tag-accent`; absent that, it falls back
  to `{colors.dai}`.
- `{components.ai-credit}` — the model co-author line in the post's colophon.
  Carries no accent of its own: the vendor mark beside each model name is
  already coloured, and a second colour inside 14px of metadata reads as two
  competing marks. The name is told apart by weight on `{colors.body}`.
- `{components.search-mark}` — reserved. Blog full-text search (Pagefind) now
  renders inside the site-wide ⌘K palette, which owns its own neutral highlight;
  the blog zone no longer draws its own search mark.
- `{components.callout}` / `{components.inline-code}` — quiet `{colors.fill}`
  surfaces at card / inline radius.

### Index and ledger

`/blog` renders every listed post but shows only the latest eight, so a reader
reaches the sea footer. "更早的 N 篇 ↓", a quiet centred line in the faint ink
(a 44px touch target, no fill), unfolds
the next eight in place; the rows arrive staggered, rising and fading in (no
motion under `prefers-reduced-motion`). The year section above the control drops
its hairline while the fold hides the rest, so the control, not a rule, ends the
list. Any link to a year (`#y2024`: the year rail, which lists every year, the
ledger's year labels, or a shared URL) unfolds every post down to the end of
that year and scrolls to it. Without script, everything shows. There is no
separate archive page.

The index closes with the writing ledger (`BlogLedger.astro`, figures from
`src/features/posts/ledger.ts`): posts, words and the first year on one quiet
caption line, figures in ink and units faint, well clear of the control, then
one strip of months from the first January to now: a `{colors.ji}` bar per month, its height the words written on a square-root scale so one long
essay does not flatten the rest. The strip keeps its height and the column's
width however many years it covers — more years only make the bars thinner.
Chinese is counted by character and other scripts by word. Hovering a month
with posts opens a card over the bar naming that month's posts as links; the
card stays while the pointer climbs into it. On a phone the bars are a few
pixels wide, too thin to hit, so a touch anywhere on the strip opens the
written month nearest the finger, and sliding sideways moves the card with it
(`touch-action: pan-y`, so a vertical drag still scrolls).

### Sea footer

`BlogSeaFooter.astro` closes the `/blog` index and every post with a crayon sailboat crossing a
crayon sea — the literal reading of *sillage*, the wake a boat leaves behind.
The sea is seen side on, a swell profile against the page; the page background
is the sky, in both themes. The band starts under the site footer's last line,
which sits on top of it, so the page ends in the sea's sky rather than a gap.
On iOS the water fades into the page at its foot: at the end of a page Safari
brings its toolbar back and fills the strip under it with body's
`background-color`, and nothing can paint into it — the document ends at the
toolbar's top edge and fixed layers are clipped there too. Tinting body
sea-blue would also tint Safari's top edge, so the sea ends in page colour and
the strip continues it.

The art is generated. `scripts/paint-sillage.ts` paints every layer in four
lights — day, night, and dusk in each theme — mixing the day and night colours
from `blogPalette`, so the sea is the same three
blues as the links above it. Change an ink, re-run, and the painting follows;
`public/sillage/README.md` covers the files. The same run writes
`sillage-motion.json` next to the component, which carries the geometry and the
motion. The component draws nothing and hardcodes no numbers.

Layers, back to front: the dusk sky and sun (dusk only), clouds, back
swell, boat, near sea, the sun's road (dusk only), the white water (bow wave,
wake and, once the lantern is lit, its reflection), then a front row of waves
across the lower sea. The picture's box runs 120 art px above the band, behind
the footer, so whatever leaves the water has sky to fly in. Each row of water is lighter at its crest and darker
toward its floor, so the row in front stands off the one behind it; the tallest
crests break white, on their steeper downwind faces. These are worth knowing
before touching it:

- **The boat holds still; the water moves.** Each row is a seamless tile
  translated one tile per loop, nearer rows faster, for parallax. The back and
  front rows also breathe up and down on their own slow counts. The near row is
  pinned to the boat's position, so the tile point the ride was sampled at is
  under the hull at any viewport width.
- **The boat rides the painted swell.** Its heave and pitch keyframes are
  sampled from the surface function the near sea was painted with
  (`sillage-surface.ts`, shared with the touch code), averaged over the hull's
  length and lagged, so a crest passing under it lifts it and tips the bow. The
  bow wave swells as the pitching stem drives into the water. The near sea is
  opaque below the surface and hides the hull.
- **The sea can be touched.** `sillage-touch.ts`: a tap splashes on the painted
  surface under the finger, and rocks the boat if it lands near her; a tap on
  the boat ducks her. The boat can be picked up: she follows the finger out of
  the water, swings as it moves, drips, and on release falls back, or flies if
  thrown, then lands with a splash and drifts back to her place; her bow wave,
  stern water and wake go with her and dry up while she is out. A sideways drag
  of the water takes hold of it, which moves with
  the finger — hold still and it stops, sweep and it runs, up to ten times its
  pace — then coasts back on release. The speed is one `playbackRate` set on
  every CSS animation in the band, so the ride, bow wave and wake stay in step
  with the water at any speed. `touch-action: pan-y` leaves vertical swipes to
  the page scroller, except on the boat, which can be lifted any way.
- **Things live in it.** `sillage-life.ts`: the first touch of the water always
  brings a dolphin leaping past it; later touches sometimes bring one, or a
  shoal of small fish. A touch on the sky sends a gull off by day and lights a
  twinkling star by night; every fifth star falls. Drive the sea fast and
  dolphins come to leap at the bow. Each creature is a sprite from the same
  painter, flown once with Web Animations and removed.
- **The page's scroll runs on into it.** As the band scrolls in, the clouds
  settle and the front row rises (scroll-driven animations on the band's view
  timeline), so the depth opens on arrival. At the end, the speed a scroll
  arrives with carries into the water, and scroll the page can no longer take —
  wheel and trackpad deltas, a finger still pulling up — keeps driving it,
  through the same `playbackRate`.
- **It is silent until touched.** `sillage-sound.ts` opens audio on the first
  touch of the water, never on its own. The speaker in the sea's sky switches
  it off, remembered in `localStorage` (`sillage-sound`); it is the band's one
  control, outside the `aria-hidden` picture, and hidden under reduced motion,
  where the sea never sounds. Then splashes sound where the finger
  lands, panned across the band, and while the reader plays with the sea — or
  scrolls it on — the surf comes up and a hull wash rises with the speed. Five
  seconds after they stop it fades and the audio context sleeps. It mixes with
  other audio and obeys the iOS silent switch. The recordings are CC0; see
  `public/sillage/README.md`.
- **Night is repainted, not filtered.** Pastel on black paper puts the lighter
  pigment on top, which no filter over the day art can do. Night also lights the
  stern lantern: a glow on the boat and a reflection on the water.
- **Dusk is the reader's clock.** From 16:30 to 20:00 local time the component
  sets `data-dusk` and the dusk set loads instead: violet water with rose and
  gold crests, clouds lit from below, and a sunset sky that eases out to the
  bare page before the footer's text. By day a sun sits half down behind
  the far swell, in a haze, its road running down to the front row; in the
  dark theme it is blue hour — the sun gone, a thin warm line left on the far
  water and indigo clouds lit from under. It is the
  one place warm colour is allowed on the blog, at the owner's asking.
  `?sea=dusk` or `?sea=day` previews either at any hour.

The water animates transform or opacity only; the arrival moves the front
row's `bottom`, on scroll only. The touch loop runs only while a finger is down,
a scroll is driving the sea, or the sea is still settling. The art loads as the band nears the
screen, the animation runs only while it is in view, and reduced motion gets the
same picture standing still and ignores touch. The picture is `aria-hidden`; the
sound switch is the only thing in it assistive tech sees.

Wherever the sea is, the root drops its rubber band (`overscroll-behavior-y:
none`, `blog.css`): bouncing past the sea pulled the water up and showed bare
page under it. Scroll past the end still reaches the sea as wheel and touch
input.

## Do's and Don'ts

- **Do** keep every accent inside the blue ink set. If a new surface needs an
  accent, it is `{colors.dai}` unless it is a highlight wash (`{colors.ji}`);
  `{colors.dian}` is currently unspent and stays that way until a surface has a
  reason for an ink that is not a link.
- **Do** derive greys from `{colors.ink}`'s alpha scale, so both modes stay in
  sync for free.
- **Do** confirm any new text/background pair clears **WCAG AA 4.5:1** in *both*
  modes before shipping it.
- **Don't** use `{colors.ji}` as a text or icon colour — it fails AA on the
  light surface. Fill only.
- **Don't** add a warm or second-hue accent (red, amber, green). The
  publication is monochrome on purpose; a counter-colour breaks the voice.
- **Don't** introduce drop shadows or raised cards. Separate with whitespace and
  hairlines.
- **Don't** use pure `#000` for the dark surface, or full-opacity dividers.
- **Don't** let any blog token leak outside `.blog-zone`, and don't pull the
  main-site identity tokens in.

## Token reference

The normative values. These mirror the live system — `blogPalette` in `src/data/site.ts`
owns the inks, `src/styles/blog.css` owns the greys and layout. Edit the code first,
then sync this block.

```yaml
name: 無人之境 — blog design system
version: alpha
description: >
  The calm, ink-wash visual zone for the blog at blog.buxx.me. A single blue
  hue graded by depth, near-black greys derived from the theme foreground, and a
  720px reading column. Blog styling stays under .blog-zone; only the shared
  publication lockup is also rendered in the homepage Writing doorway.

colors:
  # Surfaces — the page floor in each mode. Dark is near-black, never #000.
  surface.light: '#FFFFFF'
  surface.dark: '#0A0A0A'

  # Greys — NOT fixed hex. Expressed as the theme foreground at alpha, so one
  # declaration yields the calm light palette and a tuned dark variant for free.
  ink: 'hsl(var(--foreground))'           # 100% — titles, strong text
  body: 'hsl(var(--foreground) / 0.78)'   # article body copy
  muted: 'hsl(var(--foreground) / 0.58)'  # list excerpts
  faint: 'hsl(var(--foreground) / 0.42)'  # dates, meta, year ticks
  line: 'hsl(var(--foreground) / 0.10)'   # hairline dividers
  fill: 'hsl(var(--foreground) / 0.045)'  # sliding hover pill

  # Ink set — one hue, three depths. Source of truth: blogPalette in site.ts.
  # The mode-agnostic token is the live CSS var components consume; the
  # .light/.dark entries below document the concrete value resolved in each mode.
  dai: 'var(--blog-dai)'
  dian: 'var(--blog-dian)'
  ji: 'var(--blog-ji)'
  dai.light: '#3C5D80'    # Distant-mountain ink — primary. WCAG 6.84:1 on surface.light
  dai.dark: '#7FA8D6'     #            WCAG 7.99:1 on surface.dark
  dian.light: '#27406E'   # Indigo ink — the mark. WCAG 10.27:1 on surface.light
  dian.dark: '#6FA8FF'    #            WCAG 8.22:1 on surface.dark
  ji.light: '#3E8BD8'     # Clear-sky blue — highlight FILL only. 3.57:1 — never text
  ji.dark: '#6FB2F2'      #            WCAG 8.79:1 on surface.dark

typography:
  # Families. Body reads in Inter (the .reading contract); code in the mono
  # stack; the publication lockup uses a tiny WenKai subset for its Chinese sillage.
  family.sans: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
  family.mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  family.display: "'WenKai Lockup', 'Songti SC', 'Noto Serif CJK SC', serif"

  masthead:     { fontFamily: '{typography.family.display}', cjkSize: '50px', latinSize: '20px', lineHeight: '1', cjkLetterSpacing: '0.10em', fontWeight: 400 }
  article-h1:   { fontFamily: '{typography.family.sans}', fontSize: 'clamp(27px, 4.4vw, 34px)', lineHeight: '1.3', letterSpacing: '-0.02em', fontWeight: 600 }
  article-h2:   { fontFamily: '{typography.family.sans}', fontSize: '22px', lineHeight: '1.4', letterSpacing: '-0.01em', fontWeight: 600 }
  article-h3:   { fontFamily: '{typography.family.sans}', fontSize: '19px', lineHeight: '1.45', fontWeight: 600 }
  body:         { fontFamily: '{typography.family.sans}', fontSize: '17.5px', lineHeight: '1.85', letterSpacing: '0.003em', fontWeight: 400 }
  post-title:   { fontFamily: '{typography.family.sans}', fontSize: '19px', lineHeight: '1.45', letterSpacing: '-0.012em', fontWeight: 500 }
  excerpt:      { fontFamily: '{typography.family.sans}', fontSize: '15px', lineHeight: '1.55', fontWeight: 400 }
  meta:         { fontFamily: '{typography.family.sans}', fontSize: '13px', lineHeight: '1.4', fontWeight: 400 }
  eyebrow:      { fontFamily: '{typography.family.sans}', fontSize: '13px', letterSpacing: '0.02em', fontWeight: 500 }
  tag:          { fontFamily: '{typography.family.sans}', fontSize: '11.5px', lineHeight: '1', fontWeight: 500 }
  inline-code:  { fontFamily: '{typography.family.mono}', fontSize: '0.875em', fontWeight: 400 }

spacing:
  # 2px base, used as a calm 4px-ish rhythm. The named steps below are the ones
  # the zone actually reaches for.
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '24px'
  section: '40px'
  floor: '96px'

rounded:
  none: '0'        # single-sided / borderless surfaces (mobile list rows)
  inline: '6px'    # inline code, kbd, small chips
  image: '10px'    # media corners
  card: '12px'     # cards, callouts, share row, subscribe panel
  pill: '999px'    # tag pills, sliding hover pill, round controls

layout:
  measure: '720px'           # the reading column — every shell maxes here
  shell-padding: '40px 24px 96px'
  image-edge.light: 'inset 0 0 0 1px rgba(0, 0, 0, 0.1)'
  image-edge.dark: 'inset 0 0 0 1px rgba(255, 255, 255, 0.1)'

components:
  post-item:
    typography: '{typography.post-title}'
    textColor: '{colors.ink}'
    backgroundColor: 'transparent'
  post-item-hover:
    backgroundColor: '{colors.fill}'
    rounded: '{rounded.pill}'
  link:
    textColor: '{colors.dai}'
  tag-pill:
    typography: '{typography.tag}'
    textColor: '{colors.dai}'
    backgroundColor: 'color-mix(in srgb, {colors.dai} 12%, transparent)'
    rounded: '{rounded.pill}'
    padding: '4px 9px'
  search-mark:
    backgroundColor: 'color-mix(in srgb, {colors.ji} 26%, transparent)'
    textColor: 'inherit'
    rounded: '3px'
  ai-credit:
    typography: '{typography.meta}'
    textColor: '{colors.body}'
  callout:
    typography: '{typography.excerpt}'
    textColor: '{colors.body}'
    backgroundColor: '{colors.fill}'
    rounded: '{rounded.card}'
    padding: '16px 18px'
  inline-code:
    typography: '{typography.inline-code}'
    backgroundColor: '{colors.fill}'
    rounded: '{rounded.inline}'
    padding: '0.15em 0.4em'
  divider:
    backgroundColor: '{colors.line}'
    height: '1px'
```
