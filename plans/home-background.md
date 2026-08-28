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

**Decision: outstanding.** Nothing is wired into the real homepage, and that is
the whole of the remaining work.

## The five concepts

| # | Name | Thesis |
|---|------|--------|
| 01 | Current | The 24px dot lattice that ships today. Present as the A/B. |
| 02 | Rain | Per-column falling heads leaving trails that decay to a per-cell floor. The front-runner. |
| 03 | Drift | The same mechanic slowed until it reads as weather rather than rain. |
| 04 | Column | Field narrowed to the 720px text column — a property of the column, not wallpaper. |
| 05 | Ember | No fall at all; the pointer is the only light source. An untouched page runs zero frames. |

## Remaining

- [ ] Pick one. `02 Rain` is the default the lab boots into, but `05 Ember` is
      the only one that costs nothing on an idle page — worth weighing against
      how much the motion is actually adding.
- [ ] Wire the winner into the real homepage. The lab is a standalone document;
      the shipped version has to survive the site's existing background layers,
      view transitions, and the mood/blog zones that opt out of the dot grid.
- [ ] Budget it. The field is a full-viewport-width canvas repainting every
      frame on the site's LCP page. Measure before it ships, not after.
- [ ] Honour `prefers-reduced-motion`. The lab does not.

## Not in scope here

The same local branch also carried a removal of the pointer spotlight overlay
and a stray `sky-02-lumen.jpeg` at the repo root. Neither was cherry-picked —
the overlay removal is a separate concern that deserves its own review, and the
site still has the overlay in `src/layouts/Layout.astro`.

Ships to `notes/archive/` when a concept lands on the homepage.
