---
title: Spotlight overlay
description: The full-page spotlight that highlights the dot grid as the pointer moves.
internal: true
---

A full-page overlay highlights the existing 24px dot grid as the pointer moves. It reuses the grid that's already on `body::before`, fades smoothly when motion stops, and keeps runtime work isolated to a single fixed overlay layer.

## DOM and layers

```html
<div class="spotlight-overlay" data-spotlight-overlay aria-hidden="true">
  <div class="spotlight-overlay__grid spotlight-overlay__grid--soft"></div>
  <div class="spotlight-overlay__grid spotlight-overlay__grid--core"></div>
</div>
```

Three visual layers cooperate:

- **Base grid** on `body::before` — a `radial-gradient(circle, hsl(var(--grid)) 1px, transparent 1px)` background tiled at `24px 24px`. Always visible.
- **Soft highlight** (`__grid--soft`) — same dot pattern, slight blur, elliptical mask offset by pointer velocity. Subtle trailing edge without a glow bloom.
- **Core highlight** (`__grid--core`) — same dot pattern, no blur, tighter ellipse centered on the pointer. The crisp part.

Site content sits inside `.site-shell` so it stays above the overlay in stacking order.

## Runtime

The animation lives in an inline script in `Layout.astro` and listens for `pointermove`, `mouseout`, and `blur`.

Gates:

- `(pointer: fine)` — only fine pointers run the effect.
- `(prefers-reduced-motion: reduce)` — disables it entirely.

State the loop tracks: latest pointer (`targetX/Y`), smoothed coordinates (`currentX/Y`), pointer delta (`velocityX/Y`), `lastPointerMoveTime`, `currentOpacity`.

## Idle fade

The spotlight fades immediately when motion stops — no wait. Visibility is derived continuously from elapsed idle time:

```ts
const idleElapsedMs = hasPointer ? Math.max(0, timestamp - lastPointerMoveTime) : idleFadeDurationMs;
const idleVisibility = Math.max(0, 1 - idleElapsedMs / idleFadeDurationMs);
targetOpacity = idleVisibility;
```

`idleFadeDurationMs = 600`. So: moving → fully active; pointer stops → fades immediately; ~600ms after stop → zero opacity.

## Animation model

`requestAnimationFrame` driven, with time-based smoothing rather than fixed per-frame increments:

```ts
const deltaMs = Math.min(32, timestamp - lastFrameTime || 16.67);
const positionBlend = 1 - Math.exp(-deltaMs / positionSmoothingMs);
const opacityBlend = 1 - Math.exp(-deltaMs / opacitySmoothingMs);
const velocityDecay = Math.exp(-deltaMs / velocityDecayMs);
```

Stable across refresh rates and frame drops. Current constants: `positionSmoothingMs = 42`, `opacitySmoothingMs = 72`, `velocityDecayMs = 58`.

## CSS variable contract

The script mutates only variables on `.spotlight-overlay` — never on `html` or `body` — to keep style invalidation scoped:

`--spotlight-x`, `--spotlight-y`, `--spotlight-tail-x`, `--spotlight-tail-y`, `--spotlight-soft-radius`, `--spotlight-core-radius`, `--spotlight-soft-opacity`, `--spotlight-core-opacity`.

## Performance

Deliberately CSS-driven, no canvas. One fixed overlay instead of per-section effects. Reuses the existing grid pattern. Writes CSS variables only to the overlay. `contain: strict` on the overlay, `contain: paint` on each grid layer. No timers for fade orchestration. Single `rAF` loop only while animation is active.

## Tuning

| Goal | Lever |
| --- | --- |
| More responsive | Reduce `positionSmoothingMs`, `opacitySmoothingMs` |
| More stable | Increase `positionSmoothingMs`, `velocityDecayMs` |
| Smaller | Reduce base `--spotlight-soft-radius`, `--spotlight-core-radius` |
| Brighter | Increase soft/core opacity multipliers, dot alpha |

Current defaults: soft radius `236 + speed * 28`, core radius `124 + speed * 14`. Soft layer opacity `currentOpacity * 0.28`, core layer `currentOpacity * 0.96`.

## Limits

Pointer-driven, so touch devices don't use it. The overlay assumes the base grid stays at `24px` spacing — if the base grid changes, the spotlight grid must update to match.
