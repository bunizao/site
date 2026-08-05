# 026 — scroll-dock fallback: coalesce per-event writes into a frame

- **Status**: TODO
- **Severity**: LOW
- **Category**: Performance
- **Estimated scope**: 1 file, ~12 lines

## Where this is

`src/lib/scroll-dock.ts`, the fallback path only. Visible as the `/mood` navbar
collapsing into a bar (`src/features/mood/ui/MoodNavbar.astro`) and the blog
TOC dock (`src/features/posts/ui/TableOfContents.astro`).

Browsers **with** `animation-timeline: scroll()` never run this code — they take
the composited path, which is well built and out of scope. This plan is only
about the branch taken by engines without scroll-driven animations.

## Problem

```ts
// src/lib/scroll-dock.ts:73-95, 109-111 — current
const paint = () => {
  for (const channel of channels) {
    const { ride, fold } = read(channel);
    host.style.setProperty(`--${channel}-ride`, ride.toFixed(5));
    host.style.setProperty(`--${channel}-fold`, fold.toFixed(5));
  }
};

const onScroll = () => paint();

// ...
} else {
  window.addEventListener('scroll', onScroll, { passive: true });
}
```

`onScroll` runs once per scroll event with no coalescing. Each run does two
`setProperty` calls per channel on the host, and both properties are registered
`inherits: true` (`src/styles/scroll-dock.css:38-60`), so every write
re-resolves them down the host's whole subtree. Scroll events fire well above
frame rate during momentum scrolling, so most of that work is discarded before
anything paints.

The file's own header comment (`:11-12`) already states the intent — "the same
two numbers are written per frame from a passive scroll listener" — the code
just writes them per *event* instead.

## Target

```ts
// src/lib/scroll-dock.ts:95 — target
// Scroll events outpace frames during momentum scrolling, and every paint()
// rewrites two inherited registered properties on the host — which re-resolves
// them down its whole subtree. One write per frame is all that can be shown,
// so anything more is discarded work.
let raf = 0;
const onScroll = () => {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    paint();
  });
};
```

and cancel a pending frame in teardown:

```ts
// src/lib/scroll-dock.ts:122-134 — target, first line of destroy()
destroy() {
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  if (!composited) window.removeEventListener('scroll', onScroll);
  // ... rest unchanged
}
```

The direct `paint()` calls at `:112` (initial seed) and inside `setRun` (`:120`)
stay direct — those are one-shot and must land before the next frame, which is
what the comment at `:65-72` explains.

## Repo conventions to follow

- `src/lib/scroll-dock.ts` keeps one model on both paths so they cannot drift
  (`:11-12`). This change touches only the fallback branch and does not alter
  the numbers either path produces.
- Comments state the tradeoff, not the mechanism.
- Every listener this module adds is removed in `destroy()`; a pending frame is
  the same kind of resource and belongs there too.

## Steps

1. `src/lib/scroll-dock.ts:95` — replace `const onScroll = () => paint();` with
   the rAF version, declaring `raf` immediately above it.
2. `src/lib/scroll-dock.ts:122` — add the `cancelAnimationFrame` guard as the
   first statement of `destroy()`.

## Boundaries

- Do NOT touch the composited branch (`:97-108`) or `publishRanges`.
- Do NOT wrap the `paint()` calls at `:112` or inside `setRun` — those are
  deliberate synchronous seeds and the comment at `:65-72` records why.
- Do NOT change `read`, `ease`, or `FOLD_START`. The values produced must be
  identical; only their write cadence changes.
- If a cited line does not match what you find, STOP and report.

## Verification

- **Mechanical**: `bun run check` and `bun run build` succeed.
- **Reaching the fallback**: this path is dead on engines with scroll-driven
  animations, so the change is untestable until you force it. Temporarily make
  `supportsScrollTimeline()` (`:52-53`) return `false`, then exercise `/mood`
  and a blog post. **Revert the stub before committing.**
- **Behavioural, with the stub in place**: scroll `/mood` — the navbar must dock
  and undock exactly as on the composited path, with no visible lag or stepping.
  A dropped `raf = 0` reset shows up as the dock freezing after the first frame.
- **Performance proof**: DevTools → Performance while scrolling with the stub in
  place. Before: one `Recalculate Style` per scroll event. After: at most one
  per frame.
- **Composited path untouched**: with the stub removed, confirm
  `createScrollDock(...).composited === true` in a supporting browser and that
  the navbar still docks. If this regressed, the change leaked out of the
  fallback branch.
- **Done when**: the fallback produces one style write per frame, the composited
  path is byte-identical, and the stub is gone.
