---
title: Spotlight overlay
description: The pointer-tracking spotlight over the dot grid, and why it is one fixed layer.
group: Surfaces
order: 4
---

## Purpose

This document describes the current full-page spotlight overlay implementation used to highlight the existing dot grid as the pointer moves.

The effect is designed to stay visually clean:

- Reuse the same `24px` dot grid already rendered by `body::before`
- Highlight dots across the whole page, not only inside the hero
- Fade out smoothly when pointer movement stops
- Keep runtime work isolated to a single fixed overlay layer

## Implementation Summary

The spotlight is implemented as a global fixed overlay mounted in the base layout.

Files involved:

- `src/layouts/Layout.astro`
- `src/styles/globals.css`

The overlay does not render new particles or draw to canvas. It only reveals a brighter copy of the same dot grid through moving CSS masks.

## DOM Structure

The overlay is mounted once near the top of `<body>`:

```html
<div class="spotlight-overlay" data-spotlight-overlay aria-hidden="true">
  <div class="spotlight-overlay__grid spotlight-overlay__grid--soft"></div>
  <div class="spotlight-overlay__grid spotlight-overlay__grid--core"></div>
</div>
```

The rest of the page content is wrapped in `.site-shell` so content remains above the overlay in stacking order.

## Visual Layers

### Base Grid

The static grid remains on `body::before`:

```css
body::before {
  background-image: radial-gradient(circle, hsl(var(--grid)) 1px, transparent 1px);
  background-size: 24px 24px;
}
```

This layer is always visible and acts as the baseline visual texture.

### Soft Highlight Layer

`.spotlight-overlay__grid--soft` uses:

- The same dot pattern as the base grid
- Slight blur
- An elliptical mask offset by pointer velocity

This creates a subtle trailing edge without introducing a visible shadow or glow bloom.

### Core Highlight Layer

`.spotlight-overlay__grid--core` uses:

- The same dot pattern
- No blur
- A tighter ellipse centered on the pointer

This provides the crisp highlight that makes the spotlight feel precise.

## Runtime Behavior

The animation logic lives in an inline script in `Layout.astro`.

### Input Handling

The script listens to:

- `pointermove`
- `mouseout`
- `blur`

Only fine pointers are enabled:

```ts
const prefersFinePointer = window.matchMedia('(pointer: fine)');
```

Reduced motion disables the effect entirely:

```ts
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
```

### State Model

The effect tracks:

- `targetX`, `targetY`: latest pointer coordinates
- `currentX`, `currentY`: smoothed spotlight coordinates
- `velocityX`, `velocityY`: recent pointer delta for trailing shape
- `lastPointerMoveTime`: timestamp of latest movement
- `currentOpacity`: smoothed rendered opacity

### Idle Fade

The spotlight now starts fading immediately when pointer movement stops.

It does not wait before fading. Instead, visibility is derived continuously from elapsed idle time:

```ts
const idleElapsedMs = hasPointer
  ? Math.max(0, timestamp - lastPointerMoveTime)
  : idleFadeDurationMs;

const idleVisibility = Math.max(0, 1 - idleElapsedMs / idleFadeDurationMs);
targetOpacity = idleVisibility;
```

Current fade duration:

- `idleFadeDurationMs = 600`

This means:

- Moving pointer: spotlight stays fully active
- Pointer stops: spotlight begins fading immediately
- After 600 ms of no movement: spotlight reaches zero opacity

## Animation Model

The effect is driven by `requestAnimationFrame`.

Instead of fixed per-frame increments, smoothing is time-based:

```ts
const deltaMs = Math.min(32, timestamp - lastFrameTime || 16.67);
const positionBlend = 1 - Math.exp(-deltaMs / positionSmoothingMs);
const opacityBlend = 1 - Math.exp(-deltaMs / opacitySmoothingMs);
const velocityDecay = Math.exp(-deltaMs / velocityDecayMs);
```

This keeps the motion more stable across different refresh rates and under occasional frame drops.

Current timing constants:

- `positionSmoothingMs = 42`
- `opacitySmoothingMs = 72`
- `velocityDecayMs = 58`

These values were tuned for a more responsive, less floaty feel.

## CSS Variable Contract

The script only mutates variables on `.spotlight-overlay`, not on `html` or `body`.

Variables updated at runtime:

- `--spotlight-x`
- `--spotlight-y`
- `--spotlight-tail-x`
- `--spotlight-tail-y`
- `--spotlight-soft-radius`
- `--spotlight-core-radius`
- `--spotlight-soft-opacity`
- `--spotlight-core-opacity`

This keeps style invalidation scoped to the overlay subtree.

## Performance Notes

The current implementation intentionally avoids canvas and keeps the effect CSS-driven.

Performance-related choices:

- Use one fixed overlay instead of per-section effects
- Reuse the existing grid pattern
- Write CSS variables to the overlay element only
- Add `contain: strict` to the overlay
- Add `contain: paint` to child layers
- Avoid timers for fade orchestration
- Use a single `requestAnimationFrame` loop only while animation is active

Relevant CSS:

```css
.spotlight-overlay {
  contain: strict;
  transform: translateZ(0);
  backface-visibility: hidden;
}

.spotlight-overlay__grid {
  contain: paint;
}
```

## Tuning Guide

### Make It More Responsive

Reduce:

- `positionSmoothingMs`
- `opacitySmoothingMs`

### Make It More Stable

Increase:

- `positionSmoothingMs`
- `velocityDecayMs`

### Make It Smaller

Reduce:

- Base `--spotlight-soft-radius`
- Base `--spotlight-core-radius`

### Make It Brighter

Increase:

- Soft layer opacity multiplier
- Core layer opacity multiplier
- Dot alpha in `.spotlight-overlay__grid`

## Current Defaults

Current radius values generated by the script:

- Soft radius: `236px + speed * 28`
- Core radius: `124px + speed * 14`

Current opacity scaling:

- Soft layer: `currentOpacity * 0.28`
- Core layer: `currentOpacity * 0.96`

## Limitations

- The effect is pointer-driven, so touch devices do not use it
- The overlay assumes the base grid stays at `24px` spacing
- If the base grid style changes, the spotlight grid must be updated to match

## Future Improvements

Possible refinements if needed later:

- Respect hover-capable devices instead of only fine pointers
- Add route-level opt-out for pages that should stay fully static
- Promote the grid spacing to a shared CSS custom property to remove duplication
- Add DevTools-friendly debug mode for radius and opacity tuning
