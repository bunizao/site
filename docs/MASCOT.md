# Mascot

`peek` is the site mascot and current navbar brand mark. The source of truth lives in [`src/features/logos/data/peek.ts`](../src/features/logos/data/peek.ts).
The preview/gallery surface lives at `/dev/preview` when local dev is running.

## Files

- `src/features/logos/data/peek.ts` — pixel grid, accent color, grouped gallery metadata, runtime behavior map, and every motion state
- `src/features/logos/data/types.ts` — mascot data model
- `src/features/logos/lib/svg.ts` — grid-to-SVG renderer and logo registry
- `src/features/logos/ui/PixelLogo.astro` — static SVG embedding for Astro templates
- `src/features/logos/ui/AnimatedLogo.tsx` — frame-based client animation renderer
- `src/pages/logo/[id].svg.ts` — public SVG route used by favicon and image consumers
- `src/pages/dev/preview.astro` — shared developer preview surface for mascot and newsletter states
- `public/dev/mascot-lab/*` — vendored `peek` lab assets derived from the design system export

## Current usage

- `src/layouts/Layout.astro` uses `peek` as the navbar brand mark.
- The live navbar setup is `animation="idle"` with `hoverAnimation="dart"`.
- `AnimatedLogo` also listens for nav event overrides: `curious`, `happy`, and `sleepy`.
- `/logo/peek.svg` is the favicon and Safari mask icon source.

## Motion groups

- `Core Expressions` — `idle`, `hide`, `pop`, `curious`, `purr`, `dart`, `nap`
- `Navbar Triggers` — the live site wiring: `idle`, `dart`, `curious`, `happy`, `sleepy`
- `Tracking Poses` — `scan`, `track_far_left`, `track_left`, `track_center`, `track_right`, `track_far_right`
- `Utility Motions` — `alert`, `dissolve`

## Runtime behavior map

| Trigger | Animation | Notes |
|--------|-----------|-------|
| Default navbar rest | `idle` | Base brand state |
| Brand hover / fast scroll | `dart` | High-energy attention response |
| Section link hover | `curious` | Desktop nav hover expression |
| Active section change | `happy` | Alias of `purr` |
| 10s inactivity | `sleepy` | Alias of `nap` |

## Preview routes

- `/dev/preview` — mascot motion preview, tracking demo, and the vendored `peek` lab
- `/dev/preview?view=newsletter` — notify email preview surface

Keep new mascot work inside the existing grid-and-frame model unless there is a real reason to change the renderer. A mascot does not need a framework inside the framework.
