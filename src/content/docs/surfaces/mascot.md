---
title: Mascot
description: Where the peek mascot's data and sprites live, the rules for changing it, and how to add motions.
group: Surfaces
order: 5
---

`peek` is the site mascot, a pixel-grid cat. Read this page when you change the
mascot or add a pose, motion, look, or sticker.

## What `peek` does

- It is the navbar brand mark.
- It provides a small set of motion and expression states for the site UI.
- It powers the mascot preview at `/dev/preview`.
- It supplies the public SVG used by the mask icon, emails and `og:logo`, and
  the grid the painted favicon and OG card are drawn from.

## Where it lives

| Piece | File |
| --- | --- |
| Navbar brand mark | [`src/layouts/Layout.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Layout.astro) |
| Mascot catalog (poses, motions, looks, slots) | [`src/features/mascot/peek/catalog.ts`](https://github.com/bunizao/site/blob/main/src/features/mascot/peek/catalog.ts) |
| Runtime logo data | [`src/features/logos/data/peek-runtime.ts`](https://github.com/bunizao/site/blob/main/src/features/logos/data/peek-runtime.ts) |
| Preview surface | [`src/pages/dev/preview.astro`](https://github.com/bunizao/site/blob/main/src/pages/dev/preview.astro) |
| SVG route | [`src/pages/logo/[id].svg.ts`](https://github.com/bunizao/site/blob/main/src/pages/logo/[id].svg.ts) |
| Sticker assets | [`public/mascot/peek/stickers/`](https://github.com/bunizao/site/blob/main/public/mascot/peek/stickers/), with dimensions in [`src/features/mascot/peek/stickers.ts`](https://github.com/bunizao/site/blob/main/src/features/mascot/peek/stickers.ts) |

## Rules

Keep mascot work simple. A mascot is branding content with some behavior, so
don't build a framework around it. When you change `peek`, keep these rules:

- `peek` stays easy to render and easy to reason about.
- The mascot data has one clear source of truth.
- Consumers read stable public data. They don't reach into internal files.
- `/dev/preview` shows mascot states. It must not turn into a second registry.

If a mascot change needs a lot of ceremony, the design is probably wrong.

## Current problem

The mascot data holds too much in one place:

- Identity, motion data, extra looks, and preview grouping are tightly mixed.
- The preview knows too much about how mascot data is stored.
- Adding more `peek` variants will get messy fast if the data keeps growing
  sideways.

None of this calls for a CMS, a database, or a content system. The mascot data
needs to stay organized and explicit.

## Direction

Treat mascot work as animation authoring first:

- Keep mascot data static and typed.
- Give every source frame and runtime slot a stable name.
- Prefer a small set of source frames plus timeline beats over duplicated frame
  arrays.
- Use per-beat holds when timing matters. Use a flat FPS loop only for truly
  even motion.
- Keep SVG output as rectangles, so the mascot stays inspectable and easy to
  manipulate.
- Keep rendering code separate from mascot content.
- Make the preview read from the same source of truth as the rest of the site.

## Author a new motion

Pose and motion data lives in `src/features/mascot/peek/`. For repeated
animation, define named source frames, then schedule them with timeline beats.
A beat shows one frame for a set time.

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

This is the default way to author a motion. Draw each distinct frame once,
then tune the rhythm with `beat(...)` (hold for a number of frames at the
motion's FPS) or `beatMs(...)` (hold for a number of milliseconds). Don't copy
the same frame eight times to make it hold longer.

Sparse layers still exist, but use them only as a drawing shortcut for small
deltas.

### Layer sources

A layer is a set of cells drawn over a base grid. Three forms cover every case,
so pick the one that fits the layer.

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

### Compose a frame

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

Later layers overwrite earlier layers, pixel by pixel. Sparse pixels with
`c = -1` paint cell 0 (background). Pixels that aren't listed are transparent,
so the base or an earlier layer shows through.

Pick the layer form by how much of the silhouette changes:

| Motion | Examples | Source frames |
| --- | --- | --- |
| Silhouette stays put | idle, dart, purr | A small sparse delta each. The timeline holds or revisits it by index. |
| Silhouette reshapes | pop, hide, dissolve | Full pipe-strings or `rows(...)`, because the change covers most of the grid. |

For motion with uneven rhythm, keep the frame set small and put the timing in
the timeline:

```ts
beat(0, 2, 'wind-up');
beatMs(1, 270, 'effort');
```

### Preview in the terminal

```bash
bun mascot:show peek.pose.track-center        # render one asset to the terminal
bun mascot:show peek.motion.curious           # frames side-by-side
bun mascot:show peek.motion.curious -- --png  # also write PNGs to .tmp/mascot/
bun mascot:diff peek.pose.left peek.pose.right
```

The visualizer prints ANSI color blocks from the mascot cell palette. The
`--png` flag is for human review only.

### Looks

Looks (`expressions/`, `costumes/`) stay full grids. They vary in height and
replace the head silhouette outright. Use `defineLook` with numeric rows.

### Stickers

When exact raster fidelity matters, sticker-style source art lives outside the
grid catalog. Keep each sticker on a stable public path and register its
dimensions in `stickers.ts`.

The current SVG stickers are self-contained wrappers around cropped source PNG
data, so they keep the supplied artwork exact for review. Don't treat them as
vector assets until someone redraws or traces them into editable paths or pixel
rectangles.

## Definition of done

A mascot change is done when:

- The part of the UI it targets still works.
- `/dev/preview` still reflects the real mascot data.
- `/logo/peek.svg` still renders correctly.
- If the base grid changed, the favicon and OG card are regenerated with
  `node scripts/brand/generate.mjs`.
- The data layout is easier to understand than before.

If a change makes mascot work harder to follow, it isn't done.
