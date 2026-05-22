# Mascot

`peek` is the site mascot.

This document exists to keep mascot work simple. It is not a deployment guide, not a migration diary, and not a place to design a framework around a cat.

## What `peek` Does

- Acts as the navbar brand mark.
- Provides a small set of motion and expression states for the site UI.
- Powers the mascot preview at `/dev/preview`.
- Supplies the public SVG used by favicon and related consumers.

## What Matters

When working on `peek`, keep these rules intact:

- `peek` should stay easy to render and easy to reason about.
- The mascot data should have one clear source of truth.
- Consumers should use stable public data, not reach into random internal files.
- Preview exists to show mascot states, not to become a second registry.

If a mascot change needs a pile of ceremony, the design is probably wrong.

## Current Usage

- Navbar brand mark in [`src/layouts/Layout.astro`](../src/layouts/Layout.astro)
- Logo data in [`src/features/logos/data/peek.ts`](../src/features/logos/data/peek.ts)
- Extra looks in [`src/features/logos/data/peek-looks.ts`](../src/features/logos/data/peek-looks.ts)
- Preview surface in [`src/pages/dev/preview.astro`](../src/pages/dev/preview.astro)
- SVG route in [`src/pages/logo/[id].svg.ts`](../src/pages/logo/[id].svg.ts)

## Current Problem

The mascot data is carrying too much in one place.

- Identity, motion data, extra looks, and preview grouping are too tightly mixed.
- Preview knows too much about how mascot data is stored.
- Adding more `peek` variants will get messy fast if this keeps growing sideways.

That does not justify a CMS, database, or some overbuilt content system. It just means the mascot data should stay organized and explicit.

## Direction

The right direction is animation-authoring first:

- Keep mascot data static and typed.
- Give every source frame and runtime slot a stable name.
- Prefer a small source-frame set plus timeline beats over duplicated frame arrays.
- Use per-beat holds when timing matters; a flat FPS loop is only for truly even motion.
- Keep SVG output as rectangles so the mascot can stay inspectable and easy to manipulate.
- Keep rendering code separate from mascot content.
- Make preview read from the same source of truth as the rest of the site.

Low complexity wins here. A mascot is branding content with behavior, not infrastructure.

## Authoring New Motions

Pose and motion data lives in `src/features/mascot/peek/`. For repeated animation, define named source frames and schedule them with timeline beats.

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

This is the default authoring model: draw the frames that actually exist, then tune rhythm through `beat(...)` or `beatMs(...)`. Do not copy the same frame eight times just to make it hold longer.

Sparse layers still exist, but only as a drawing shortcut for small deltas.

### Layer sources

Three forms cover all cases. Pick the one that fits the layer.

```ts
sparse([
  [x, y, c],   // [x, y, cell]. c = -1 erases (paints cell 0)
  ...
])

rows([           // pipe-string alphabet: . # o *
  '..#####..',
  ...
])

rle(width, height, [    // run-length encoded
  [[1, 9]],             // row 0: nine cells of cell 1
  ...
])
```

### Composing

```ts
import { composeFrame } from '../timeline';
import { sparse } from '../layer';
import { PEEK_BASE } from '../base';

const WINK_LEFT = composeFrame(
  'wink-left',
  PEEK_BASE.base,
  sparse([
    [2, 5, 1],
    [7, 5, 2],
  ]),
);
```

Later layers overwrite earlier layers, pixel by pixel. Sparse pixels with `c = -1` paint cell 0 (background). Pixels that aren't listed are transparent — the underlying base or earlier layer shows through.

For motions where the silhouette stays put (idle, dart, purr), each source frame is a small sparse delta and the timeline holds or revisits it by index. For motions that reshape the silhouette (pop, hide, dissolve), pass full pipe-strings or `rows(...)` because the change covers most of the grid.

For motion with uneven rhythm, keep the frame set small and put timing in the timeline:

```ts
beat(0, 2, 'wind-up');
beatMs(1, 270, 'effort');
```

### Visualizing

```bash
bun mascot:show peek.pose.track-center        # render one asset to the terminal
bun mascot:show peek.motion.curious           # frames side-by-side
bun mascot:show peek.motion.curious -- --png  # also write PNGs to .tmp/mascot/
bun mascot:diff peek.pose.left peek.pose.right
```

The visualizer prints ANSI color blocks from the mascot cell palette. The `--png` flag is for human review only.

### Looks

Looks (`expressions/`, `costumes/`) stay full grids since they're variable height and replace the head silhouette outright. Use `defineLook` with numeric rows.

## Definition Of Done

A mascot change is in good shape when:

- the intended UI surface still works
- `/dev/preview` still reflects the real mascot data
- `/logo/peek.svg` still renders correctly
- the data layout is easier to understand than before

If a change makes mascot work harder to follow, it missed the point.
