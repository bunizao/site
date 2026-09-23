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

### Sea footer

`BlogSeaFooter.astro` closes the `/blog` index with a drawn sea and a sailboat —
the literal reading of *sillage*, the wake a boat leaves behind. It sits outside
the token system on purpose: it is artwork, not chrome, and its palette is the
drawing's, not the blog's ink set.

Four layers drift over the page background: clouds, far sea, boat, near sea. The
boat sits **between** the two water layers so the near crests occlude its hull —
without that stacking it reads as a sticker on the water. Art lives in
`public/sillage/` (placeholders today; `public/sillage/README.md` carries the
drawing spec), and swapping it is four URL edits in the component.

Two things are worth knowing before touching it:

- **The sky is the page background, not a painted layer.** With a pure white
  light background and a near-black dark one, no painted sky matches both. Each
  water layer instead masks its own alpha at the top, so the page shows through
  and one set of assets serves both themes.
- **There is no dark art set.** Night is the same files under a
  `brightness`/`saturate`/`hue-rotate` filter driven by four custom properties.
  The filter is on the drawn layers only — the horizon haze is air, not artwork,
  and carries its own per-theme alpha.

The whole band is `aria-hidden` and stops entirely under
`prefers-reduced-motion`.

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
