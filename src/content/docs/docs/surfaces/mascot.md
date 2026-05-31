---
title: Mascot
description: peek — the site mascot — its placement, animation states, and authoring model.
public: true
---

`peek` is the site mascot. It's a small pixel cat that lives in the navbar, runs through a handful of motion and expression states, and doubles as the favicon. The mascot system stays deliberately simple — branded content with behavior, not infrastructure.

## What peek does

- The navbar brand mark on every page.
- Motion and expression states that respond to nav hovers, active sections, fast scroll, and idle.
- The mascot preview at `/dev/preview`.
- The public SVG used by the favicon and any consumer that wants a logo image.

## Where the bits live

- Logo definition: `src/features/logos/data/peek.ts`.
- Extra looks (expressions, costumes): `src/features/logos/data/peek-looks.ts`.
- Navbar usage: `src/layouts/Layout.astro`.
- Preview: `src/pages/dev/preview.astro`.
- SVG route: `src/pages/logo/[id].svg.ts`.
- Stickers: PNG assets under `public/mascot/peek/stickers/`, registered in `src/features/mascot/peek/stickers.ts`.

## Authoring model

Pose and motion data live in `src/features/mascot/peek/`. Repeated motion uses named source frames scheduled with timeline beats — never duplicate a frame eight times to make it hold longer.

```ts
const OPEN = frame('open', PEEK_BASE.base);
const BLINK = composeFrame('blink', PEEK_BASE.base, sparse([
  [2, 4, 1],
  [7, 4, 1],
]));

export const PEEK_IDLE_MOTION = defineTimelineMotion('peek.motion.idle', 'idle', 2, [
  OPEN,
  BLINK,
], [
  beat(0, 8, 'rest'),
  beat(1, 1, 'blink'),
], metadata);
```

Three layer-source forms cover all cases: `sparse([...])` for small deltas, `rows([...])` with the `. # o *` pipe-string alphabet for full grids, and `rle(width, height, [...])` when the grid is large and repetitive.

Compose with `composeFrame`. Later layers overwrite earlier ones, pixel by pixel; sparse pixels with `c = -1` paint cell 0; pixels not listed are transparent. For motions where the silhouette stays put (idle, dart, purr), each source frame is a small sparse delta. For motions that reshape the silhouette (pop, hide, dissolve), pass full pipe-strings or `rows(...)`.

For uneven rhythm, keep the frame set small and put timing in the timeline:

```ts
beat(0, 2, 'wind-up');
beatMs(1, 270, 'effort');
```

## Looks and stickers

Looks (`expressions/`, `costumes/`) stay full grids — they're variable height and replace the head silhouette outright. Use `defineLook` with numeric rows.

Stickers live outside the grid catalog when raster fidelity matters. Each sticker has a stable public path and dimensions registered in `stickers.ts`. The current SVG stickers are self-contained wrappers around cropped source PNG data — deliberately, to preserve the artwork exactly. Don't pretend they're vector until they've been redrawn.

## Visualizing

```bash
bun mascot:show peek.pose.track-center
bun mascot:show peek.motion.curious
bun mascot:show peek.motion.curious -- --png    # also writes PNGs to .tmp/mascot/
bun mascot:diff peek.pose.left peek.pose.right
```

The visualizer prints ANSI color blocks from the mascot cell palette. The `--png` flag is for human review only.

## Done conditions

A mascot change is in good shape when the intended UI surface still works, `/dev/preview` still reflects the real mascot data, `/logo/peek.svg` still renders correctly, and the data layout reads cleaner than it did before. If a change makes mascot work harder to follow, it missed the point.
