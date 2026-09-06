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
  it for review, `?speed=<multiplier>` scales the fall. Tunables are the
  `DAY`/`NIGHT` constants in the engine.
- The field wakes from the centre outward on first paint instead of
  appearing fully formed.
- Pointer glow survives from the lab; touch gets a wider tap glow instead.
- The homepage hides the site-wide dot lattice and the pointer spotlight,
  page-scoped in `src/pages/index.astro`. Every other page keeps both.
- `prefers-reduced-motion` paints one static frame and never animates.
- The loop stops when the tab is hidden or the band leaves the viewport.

**Whole-page pass, 2026-09-06.** Four of the six concepts pitched after the
band shipped were tried, three survived; the "one ink through the page" accent and the live
"now" line in the hero were not (yet).

- Grid: the content column is 672px = 28 cells of the 24px lattice, with the
  lattice and spotlight dots centred on the page axis and the rain cells
  snapped to 12x16, so column edges, canvas edge and dots share one module.
- One pointer: the field publishes `--glyph-ink`; the homepage spotlight
  paints its dots in it, and the canvas glow matches the spotlight's core
  ellipse. One light crossing two textures.
- Collapse: the band is sticky inside an 880px track. Over the first 320px
  of scroll every row converges on one focus row while the glyphs fade
  (squared, so the field is faint before the rows overlap) and the lattice
  mask edge rises to meet it. First version condensed into a hairline that
  became the Projects rule; the owner found the line ugly, so now the rain
  just condenses and is gone, leaving the dots.
- Tried and cut the same day, owner's call: a one-row glyph strip under the
  nav on inner pages with a view-transition squash from the band. Reverted;
  inner pages are untouched.
- The decode reveal now settles a third of a second after the line reaches
  full width, not a full second: show front to 94% of the mash window, boil
  0.12 (package defaults, README and demo updated).

**Phone pass, 2026-09-06.** The owner found the phone view "messy, the
characters pile on top of each other". Measured on a 390x664 viewport: the
560px band was solid to 280px and the copy started at 76px, so the whole
hero sat inside the rain; the bio (238px of 14px Geist Mono) ran from 244px
to 482px through the field, which is 12px Geist Mono. Two texts in one face
at one size, one on top of the other. Wide screens never had the problem
because the 672px column sits inside the 1200px band with rain on either
side — the band's territory is beside the copy, and on a phone it had none.

- Rule: rain may sit behind display type, never behind body type.
- First attempt, rejected by the owner the same day: pad the phone copy down
  216px so the band owned the top of the screen and only the name sat in
  its fade. Balanced on paper, top-heavy on a phone: 216px of near-empty
  ground (32 columns of sparse rain cannot hold that space), and the bio
  cut at the fold. The owner preferred the original composition.
- What shipped: the composition does not move. Phones (below 640px) get a
  320px band, no side mask (its edges would fall inside the column), whose
  mask is full to 45% (144px: nav, status line, the 28px name) and gone at
  76% (243px), which is where the bio starts. The chips and the role sit in
  the fade; the bio is on clean ground.
- The canvas is sized to its host instead of a fixed 1200x560, so a phone
  simulates ~500 cells rather than 3500 and its bitmap is 768x640, not
  2400x1120. Width snaps to the 24px lattice; a ResizeObserver rebuilds.

**Tempo, 2026-09-06.** The owner's own diagnosis of what still irritated:
the rain ran slower than everything else on the page. The numbers agreed.
The page's beat is the typewriter's 90ms keystroke; the rain ticked at 90ms
too, but a head moved 0.25–1.0 cells per tick at day speed, so most columns
did not move on a given beat (about 7 cells/s on average, 3 for the slow
ones). Then the clock made it worse: the day/night blend drops speed to
0.35 by 03:00, and at 21:00 — when the owner looks — it was already at half.

- Tick 90ms → 60ms, column speed 0.6–1.6 cells per tick (was 0.25–1.0),
  night speed 0.35 → 0.6. Day average is now ~18 cells/s (2.6× before), the
  slowest column ~10; at 21:00 ~14/s (3× before). A head crosses the phone
  band in about a second.
- Trails shortened to match (day 0.93 → 0.88, night 0.965 → 0.90) so the
  streak length in cells stays where it was; only the tempo changed.
- Entrance 1100ms → 700ms, wake 500 → 400ms, so the field lands with the
  hero copy (600ms) instead of after it.
- `?speed=<multiplier>` scales the fall for review; the weather blend still
  applies on top. Resting cost at 17fps, CPU x4, dev build: see the tempo
  probe numbers in the same commit.
- Hero entrance moved from a GSAP timeline to CSS transitions with the same
  choreography and the same hand-off events (`home:hero-name-ready`,
  `home:hero-bio-ready`, `home:hero-github-ready`). The nav's hover wave
  now loads GSAP on first mouse hover instead of at init, so no page loads
  the 70KB chunk up front.

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
- [x] Budget it. Measured 2026-09-06 on the production build over
      localhost, iPhone 14 viewport, CPU throttled 4x (Playwright + CDP):
      hero visible 1520ms → 1005ms, field ready 1044ms → 648ms, load
      1337ms → 821ms, long tasks 5 (814ms) → 4 (441ms), canvas bitmap
      2400x1120 → 768x640, inline JS in the HTML 25.6KB → 23.7KB, and the
      70KB GSAP chunk off the critical path. Pointer-glow repaints capped
      near 30fps. Still to do on real hardware: a field trace on a mid-range
      Android; the lab numbers are a floor.
- [ ] Decide whether the hero's own motion (typewriter, decode, status
      rotation, marquee) stays now that the background moves. Untouched so far.
- [ ] The lab pages can go once the shipped tunables settle.

## Not in scope here

The same local branch also carried a site-wide removal of the pointer spotlight
overlay and a stray `sky-02-lumen.jpeg` at the repo root. Neither was
cherry-picked. The overlay is now hidden on the homepage only; removing it
everywhere is still a separate call, and `src/layouts/Layout.astro` keeps it.

Ships to `notes/archive/` when a concept lands on the homepage.
