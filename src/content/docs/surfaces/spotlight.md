---
title: Spotlight overlay
description: The pointer-tracking spotlight over the dot grid, and why it is one fixed layer.
group: Surfaces
order: 4
---

A full-page overlay that highlights the existing `24px` dot grid as the pointer
moves. It draws nothing new — no canvas, no particles. It reveals a brighter
copy of the same grid through two moving CSS masks, so the whole effect is one
fixed layer with a `requestAnimationFrame` loop writing custom properties.

Files: [`src/layouts/Layout.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Layout.astro) (markup and the inline script) and [`src/styles/globals.css`](https://github.com/bunizao/site/blob/main/src/styles/globals.css) (every layer).

## DOM structure

Mounted once near the top of `<body>`; the rest of the page is wrapped in
`.site-shell` so content stays above the overlay in stacking order.

```html
<div class="spotlight-overlay" data-spotlight-overlay aria-hidden="true">
  <div class="spotlight-overlay__grid spotlight-overlay__grid--soft"></div>
  <div class="spotlight-overlay__grid spotlight-overlay__grid--core"></div>
</div>
```

## Layers

All three paint the same dot pattern. What differs is the blur and the mask.

| Layer | Element | Blur | Mask | Role |
| --- | --- | --- | --- | --- |
| Base grid | `body::before` | — | None, always visible | The baseline texture |
| Soft highlight | `.spotlight-overlay__grid--soft` | Slight | Ellipse offset by pointer velocity | A trailing edge without glow bloom |
| Core highlight | `.spotlight-overlay__grid--core` | None | Tighter ellipse centered on the pointer | The crisp part that makes it feel precise |

The base grid is a `radial-gradient(circle, hsl(var(--grid)) 1px, transparent 1px)`
at `background-size: 24px 24px`.

## When it runs

| Condition | Behavior |
| --- | --- |
| `(prefers-reduced-motion: reduce)`, or `(pointer: fine)` fails | The script sets both opacities to `0` and returns before binding a single listener. Touch devices get the static grid. |
| `pointermove` with a `pointerType` other than `mouse` | Ignored — a pen or touch contact does not move the spotlight. |
| `mouseout`, `blur` | Treated as maximum idle: the fade runs to zero. |
| Everything settled | The loop drops `is-active` and stops. It is not a permanent ticker; a `pointermove` restarts it. |

## State

| Field | Holds |
| --- | --- |
| `targetX`, `targetY` | Latest pointer coordinates |
| `currentX`, `currentY` | Smoothed spotlight coordinates |
| `velocityX`, `velocityY` | Recent pointer delta, decaying every frame |
| `tailX`, `tailY` | The velocity smoothed again — this is what shapes the trailing ellipse |
| `lastPointerMoveTime` | Timestamp of the latest movement |
| `currentOpacity` | Smoothed rendered opacity |

Every blend is an exponential of elapsed time rather than a fixed per-frame
increment, so the motion holds up across refresh rates and through dropped
frames:

```ts
const deltaMs = Math.min(32, timestamp - lastFrameTime || 16.67);
const positionBlend = 1 - Math.exp(-deltaMs / positionSmoothingMs);
const opacityBlend  = 1 - Math.exp(-deltaMs / opacitySmoothingMs);
const velocityDecay = Math.exp(-deltaMs / velocityDecayMs);
const tailBlend     = 1 - Math.exp(-deltaMs / tailSmoothingMs);
```

The tail is its own spring: it lerps toward the decaying velocity rather than
reading it directly, which smooths out micro-jitter and gives the soft layer a
comet-like lag. Its magnitude drives the radii through a normalized, square-rooted
speed, so slow movement still reads as motion:

```ts
const rawSpeed = Math.hypot(tailX, tailY);
const speed = Math.min(1, Math.sqrt(rawSpeed / 20));
```

Idle visibility is derived continuously from elapsed time, not scheduled with a
timer, so the spotlight starts fading the instant the pointer stops rather than
waiting out a delay. The curve is a smoothstep, so the glow sinks in instead of
dropping linearly:

```ts
const idleElapsedMs = hasPointer
  ? Math.max(0, timestamp - lastPointerMoveTime)
  : idleFadeDurationMs;

const idleT = Math.min(1, idleElapsedMs / idleFadeDurationMs);
targetOpacity = 1 - (idleT * idleT * (3 - 2 * idleT));
```

## Constants and tuning

| Constant | Value | Controls | Lower it | Raise it |
| --- | --- | --- | --- | --- |
| `positionSmoothingMs` | `38` | How fast the spotlight catches the pointer | More responsive | More stable |
| `opacitySmoothingMs` | `90` | Fade in and out | More responsive | Softer |
| `velocityDecayMs` | `72` | How long velocity survives after the pointer stops | Shorter tail | More stable tail |
| `tailSmoothingMs` | `110` | How far the soft layer lags behind the velocity | Tighter to the pointer | Longer comet |
| `idleFadeDurationMs` | `800` | Pointer stop to zero opacity | Fades sooner | Lingers |

The radii and opacities are computed per frame from the smoothed state:

| Output | Formula | Governs |
| --- | --- | --- |
| Soft radius | `170px + speed * 30` | Size of the trailing halo |
| Core radius | `88px + speed * 14` | Size of the crisp highlight |
| Soft opacity | `currentOpacity * 0.26` | Brightness of the halo |
| Core opacity | `currentOpacity * 0.98` | Brightness of the highlight |
| Tail offset | `tailX * 1.4`, `tailY * 1.4` | How far the soft mask trails the pointer |

Make it smaller by reducing the two base radii; make it brighter by raising the
two opacity multipliers, or the dot alpha in `.spotlight-overlay__grid` if the
dots themselves are too faint.

## CSS variable contract

The script mutates variables on `.spotlight-overlay` only — never on `html` or
`body` — which keeps style invalidation inside the overlay subtree.

| Variable | Written from |
| --- | --- |
| `--spotlight-x`, `--spotlight-y` | `currentX`, `currentY` |
| `--spotlight-tail-x`, `--spotlight-tail-y` | The tail spring, scaled `1.4×` |
| `--spotlight-soft-radius`, `--spotlight-core-radius` | The radius formulas above |
| `--spotlight-soft-opacity`, `--spotlight-core-opacity` | The opacity formulas above |

## Performance

The effect stays CSS-driven on purpose: one fixed overlay instead of per-section
effects, the existing grid pattern reused instead of a second one, variables
written to a single element, no timers, and the animation loop running only
while something is actually animating.

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

## Limitations

- Pointer-driven, so touch devices never see it.
- The overlay hardcodes `24px` spacing to match the base grid. Change one and
  the other stops lining up — promoting the spacing to a shared custom property
  is the fix, and has not been done.

## Possible refinements

- Key on hover-capable devices instead of only fine pointers.
- A route-level opt-out for pages that should stay fully static.
- A DevTools-friendly debug mode for radius and opacity tuning.
