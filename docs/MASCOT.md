# Mascot

`peek` is the site mascot and current navbar brand mark. The source of truth lives in [`src/features/logos/data/peek.ts`](../src/features/logos/data/peek.ts).

## Files

- `src/features/logos/data/peek.ts` — pixel grid, accent color, blurb, and every animation state
- `src/features/logos/data/types.ts` — mascot data model
- `src/features/logos/lib/svg.ts` — grid-to-SVG renderer and logo registry
- `src/features/logos/ui/PixelLogo.astro` — static SVG embedding for Astro templates
- `src/features/logos/ui/AnimatedLogo.tsx` — frame-based client animation renderer
- `src/pages/logo/[id].svg.ts` — public SVG route used by favicon and image consumers
- `src/pages/dev/preview/mascot.astro` — developer preview for the navbar behavior and all mascot actions

## Current usage

- `src/layouts/Layout.astro` uses `peek` as the navbar brand mark.
- The live navbar setup is `animation="idle"` with `hoverAnimation="dart"`.
- `/logo/peek.svg` is the favicon and Safari mask icon source.

## Animation states

| State | FPS | Frames | Notes |
|------|-----|--------|-------|
| `idle` | 6 | 6 | Resting blink and ear flick |
| `hide` | 12 | 6 | Drops below the edge line |
| `pop` | 16 | 8 | Fast surprise burst |
| `curious` | 10 | 8 | Head tilt with eye tracking |
| `purr` | 8 | 6 | Squint and nose pulse |
| `dart` | 24 | 8 | Fast eye flick, used on navbar hover |
| `nap` | 4 | 6 | Slow eye droop and breathing |

## Preview routes

- `/dev/preview/mascot` — mascot action gallery plus the real navbar interaction
- `/dev/preview/newsletter` — notify email preview surface

Keep new mascot work inside the existing grid-and-frame model unless there is a real reason to change the renderer. A mascot does not need a framework inside the framework.
