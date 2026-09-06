# Homepage background

Provenance: explored 2026-08-26 on a local branch that was never pushed. This
plan exists so the work stops living only in one machine's reflog.

## State

**Exploration: shipped, dev-only.** Two lab pages, both `404` outside dev and
`noindex` regardless:

- `/lab/background` — candidate directions against the real hero copy and the
  real token set.
- `/lab/glyph` — the monospace rain field, five concepts, every parameter on a
  live slider. Keys `1`–`5` switch concept, `t` toggles theme, `h` hides the
  copy so the field can be judged alone.

Both are standalone documents rather than pages in the site layout, on purpose:
inheriting the site's own background layers would mean judging each candidate on
top of the thing it is meant to replace.

**Decision: `02 Rain`, wired in 2026-09-06.** The homepage now mounts
`src/features/home/ui/GlyphField.astro`, painted by `src/lib/glyph-field.ts`.
What shipped, and what was decided along the way:

- One ink per theme, from the matched-lightness set in
  `src/features/home/glyph-inks.ts` (blue, steel, indigo, violet, amber, rose,
  teal). Each visit draws one at random and keeps it for the session; `?ink=`
  pins one. The owner's favourite is indigo; the draw was their call too. A time-of-day palette was prototyped and rejected as too strange; an
  achromatic field was tried and read as grime. The band runs at roughly half the lab's column density with
  near-zero resting alpha, so the ground stays clean between streaks.
- The clock moves the weather, not the colour. Day is the lab's `rain`
  preset, night is `drift`; the two blend on a cosine of local hour (calm at
  03:00, full rain at 15:00) and re-read every minute. `?hour=<0-24>` pins
  it for review. Tunables are the `DAY`/`NIGHT` constants in the engine.
- The field wakes from the centre outward on first paint instead of
  appearing fully formed.
- Pointer glow survives from the lab; touch gets a wider tap glow instead.
- The homepage hides the site-wide dot lattice and the pointer spotlight,
  page-scoped in `src/pages/index.astro`. Every other page keeps both.
- `prefers-reduced-motion` paints one static frame and never animates.
- The loop stops when the tab is hidden or the band leaves the viewport.

**Whole-page pass, 2026-09-06.** Four of the six concepts pitched after the
band shipped were taken; the "one ink through the page" accent and the live
"now" line in the hero were not (yet).

- Grid: the content column is 672px = 28 cells of the 24px lattice, with the
  lattice and spotlight dots centred on the page axis and the rain cells
  snapped to 12x16, so column edges, canvas edge and dots share one module.
- One pointer: the field publishes `--glyph-ink`; the homepage spotlight
  paints its dots in it, and the canvas glow matches the spotlight's core
  ellipse. One light crossing two textures.
- Collapse: the band is sticky inside a runtime-sized track. Over 320px of
  scroll the rows converge on one hairline; the track ends so that line
  unpins one cell above the Projects label and scrolls away as its rule.
  The lattice mask edge rises with the collapse, so the dots are what is
  left where the rain was.
- Strip: `src/components/GlyphStrip.astro` draws one row under the nav on
  `navVariant="page"` pages (docs draw their own bar; the blog is its own
  zone). Band and strip share `view-transition-name: glyph-field`, so leaving
  the homepage squashes the band into the row.
- The decode reveal now settles a third of a second after the line reaches
  full width, not a full second: show front to 94% of the mash window, boil
  0.12 (package defaults, README and demo updated).

## The five concepts

| # | Name | Thesis |
|---|------|--------|
| 01 | Current | The 24px dot lattice that ships today. Present as the A/B. |
| 02 | Rain | Per-column falling heads leaving trails that decay to a per-cell floor. The front-runner. |
| 03 | Drift | The same mechanic slowed until it reads as weather rather than rain. |
| 04 | Column | Field narrowed to the 720px text column — a property of the column, not wallpaper. |
| 05 | Ember | No fall at all; the pointer is the only light source. An untouched page runs zero frames. |

## Remaining

- [ ] Prune the draw if any hue misfires in the wild; amber on the light
      theme is the one to watch.
- [ ] Budget it. The band is a 1200x560 canvas repainting at ~11fps on the
      site's LCP page. Measure paint cost and LCP on prod before calling it
      done; the lab never did.
- [ ] Decide whether the hero's own motion (typewriter, decode, status
      rotation, marquee) stays now that the background moves. Untouched so far.
- [ ] The lab pages can go once the shipped tunables settle.

## Not in scope here

The same local branch also carried a site-wide removal of the pointer spotlight
overlay and a stray `sky-02-lumen.jpeg` at the repo root. Neither was
cherry-picked. The overlay is now hidden on the homepage only; removing it
everywhere is still a separate call, and `src/layouts/Layout.astro` keeps it.

Ships to `notes/archive/` when a concept lands on the homepage.
