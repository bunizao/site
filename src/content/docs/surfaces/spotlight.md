---
title: Spotlight overlay
description: The pointer-tracking spotlight over the dot grid, built as one fixed CSS layer.
group: Surfaces
order: 4
---

The spotlight is a full-page overlay that brightens the existing `24px` dot
grid around the pointer. Read this page when you want to tune how it looks or
moves, or when it misbehaves.

The overlay draws nothing new: no canvas, no particles. It shows a brighter copy
of the same grid through two moving CSS masks. The whole effect is one fixed
layer plus a `requestAnimationFrame` loop that writes custom properties.

| Part | File |
| --- | --- |
| Markup and the inline script | [`src/layouts/Layout.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Layout.astro) |
| Every layer's styles | [`src/styles/globals.css`](https://github.com/bunizao/site/blob/main/src/styles/globals.css) |

## DOM structure

The overlay is mounted once, near the top of `<body>`. The rest of the page is
wrapped in `.site-shell`, which keeps content above the overlay in stacking
order.

```html
<div class="spotlight-overlay" data-spotlight-overlay aria-hidden="true">
  <div class="spotlight-overlay__grid spotlight-overlay__grid--soft"></div>
  <div class="spotlight-overlay__grid spotlight-overlay__grid--core"></div>
</div>
```

## Layers

All three layers paint the same dot pattern. They differ only in blur and mask.

| Layer | Element | Blur | Mask | Role |
| --- | --- | --- | --- | --- |
| Base grid | `body::before` | None | None, always visible | The baseline texture |
| Soft highlight | `.spotlight-overlay__grid--soft` | Slight | Ellipse offset by pointer velocity | A trailing edge without glow bloom |
| Core highlight | `.spotlight-overlay__grid--core` | None | Tighter ellipse centered on the pointer | The crisp part that makes it feel precise |

The base grid is a `radial-gradient(circle, hsl(var(--grid)) 1px, transparent 1px)`
at `background-size: 24px 24px`.

## When it runs

| Condition | Behavior |
| --- | --- |
| `(prefers-reduced-motion: reduce)`, or `(pointer: fine)` fails | The script sets both opacities to `0` and returns before it binds any listener. Touch devices get the static grid. |
| `pointermove` with a `pointerType` other than `mouse` | Ignored. A pen or touch contact doesn't move the spotlight. |
| `mouseout`, `blur` | Treated as maximum idle, so the fade runs to zero. |
| Everything settled | The loop drops `is-active` and stops, so it never ticks forever. A `pointermove` restarts it. |

## State

The loop keeps this state between frames:

| Field | Holds |
| --- | --- |
| `targetX`, `targetY` | Latest pointer coordinates |
| `currentX`, `currentY` | Smoothed spotlight coordinates |
| `velocityX`, `velocityY` | Recent pointer delta, decaying every frame |
| `tailX`, `tailY` | The velocity, smoothed again. This shapes the trailing ellipse |
| `lastPointerMoveTime` | Timestamp of the latest movement |
| `currentOpacity` | Smoothed rendered opacity |

Each blend is an exponential of elapsed time instead of a fixed per-frame step.
That keeps the motion the same across refresh rates and through dropped frames:

```ts
const deltaMs = Math.min(32, timestamp - lastFrameTime || 16.67);
const positionBlend = 1 - Math.exp(-deltaMs / positionSmoothingMs);
const opacityBlend  = 1 - Math.exp(-deltaMs / opacitySmoothingMs);
const velocityDecay = Math.exp(-deltaMs / velocityDecayMs);
const tailBlend     = 1 - Math.exp(-deltaMs / tailSmoothingMs);
```

The tail is its own spring. It lerps toward the decaying velocity instead of
reading it directly. This smooths out micro-jitter and gives the soft layer a
comet-like lag. The tail's magnitude sets the radii through a normalized,
square-rooted speed, so slow movement still reads as motion:

```ts
const rawSpeed = Math.hypot(tailX, tailY);
const speed = Math.min(1, Math.sqrt(rawSpeed / 20));
```

Idle visibility is computed from elapsed time on every frame, with no timer. The
spotlight starts fading the moment the pointer stops, with no delay first. The
fade follows a smoothstep curve, so the glow eases out instead of dropping
linearly:

```ts
const idleElapsedMs = hasPointer
  ? Math.max(0, timestamp - lastPointerMoveTime)
  : idleFadeDurationMs;

const idleT = Math.min(1, idleElapsedMs / idleFadeDurationMs);
targetOpacity = 1 - (idleT * idleT * (3 - 2 * idleT));
```

## Constants and tuning

These constants live in the inline script in `Layout.astro`:

| Constant | Value | Controls | Lower it | Raise it |
| --- | --- | --- | --- | --- |
| `positionSmoothingMs` | `38` | How fast the spotlight catches the pointer | More responsive | More stable |
| `opacitySmoothingMs` | `90` | Fade in and out | More responsive | Softer |
| `velocityDecayMs` | `72` | How long velocity survives after the pointer stops | Shorter tail | More stable tail |
| `tailSmoothingMs` | `110` | How far the soft layer lags behind the velocity | Tighter to the pointer | Longer comet |
| `idleFadeDurationMs` | `800` | Pointer stop to zero opacity | Fades sooner | Lingers |

The loop computes the radii and opacities every frame from the smoothed state:

| Output | Formula | Governs |
| --- | --- | --- |
| Soft radius | `170px + speed * 30` | Size of the trailing halo |
| Core radius | `88px + speed * 14` | Size of the crisp highlight |
| Soft opacity | `currentOpacity * 0.26` | Brightness of the halo |
| Core opacity | `currentOpacity * 0.98` | Brightness of the highlight |
| Tail offset | `tailX * 1.4`, `tailY * 1.4` | How far the soft mask trails the pointer |

To make the spotlight smaller, lower the two base radii. To make it brighter,
raise the two opacity multipliers. If the dots themselves are too faint, raise
the dot alpha in `.spotlight-overlay__grid`.

## CSS variable contract

The script writes variables only on `.spotlight-overlay`, never on `html` or
`body`. This keeps style invalidation inside the overlay subtree.

| Variable | Written from |
| --- | --- |
| `--spotlight-x`, `--spotlight-y` | `currentX`, `currentY` |
| `--spotlight-tail-x`, `--spotlight-tail-y` | The tail spring, scaled `1.4×` |
| `--spotlight-soft-radius`, `--spotlight-core-radius` | The radius formulas above |
| `--spotlight-soft-opacity`, `--spotlight-core-opacity` | The opacity formulas above |

## Performance

The effect stays CSS-driven to keep it cheap:

- One fixed overlay instead of effects per section.
- The existing grid pattern, reused instead of a second one.
- Variables written to a single element.
- No timers.
- An animation loop that runs only while something is animating.

The overlay styles isolate its layout and paint:

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

- The spotlight is pointer-driven, so touch devices never see it.
- The overlay hardcodes `24px` spacing to match the base grid. If you change
  one, the two stop lining up. The fix is to move the spacing into a shared
  custom property, which hasn't been done yet.

## Possible refinements

- Key on hover-capable devices instead of only fine pointers.
- A route-level opt-out for pages that should stay fully static.
- A DevTools-friendly debug mode for radius and opacity tuning.
