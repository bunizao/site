# 023 — TOC sliding pill: four layout properties → one transform

- **Status**: TODO
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 2 files, ~25 lines

## Where this is

`/blog/<slug>`, desktop only. The rounded highlight that sits behind the current
section in the table-of-contents rail and slides as you read.

## Problem

The pill is positioned by writing four layout properties, and transitioned by
tweening all four:

```css
/* src/styles/blog.css:839-856 — current */
.toc-sliding-pill {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--blog-accent) 20%, transparent);
  opacity: 0;
  z-index: 0;
  pointer-events: none;
  transition:
    top 0.48s cubic-bezier(0.25, 1.22, 0.45, 1.04),
    height 0.48s cubic-bezier(0.25, 1.22, 0.45, 1.04),
    left 0.48s cubic-bezier(0.25, 1.22, 0.45, 1.04),
    width 0.48s cubic-bezier(0.25, 1.22, 0.45, 1.04),
    opacity 0.25s ease-out;
}
```

```js
// src/features/posts/ui/TableOfContents.astro:443-451 — current
const movePill = (link) => {
  const wrap = wrapper.getBoundingClientRect();
  const box = link.getBoundingClientRect();
  pill.style.top = `${box.top - wrap.top}px`;
  pill.style.left = `${box.left - wrap.left}px`;
  pill.style.width = `${box.width}px`;
  pill.style.height = `${box.height}px`;
  pill.style.opacity = '1';
};
```

`top`, `left`, `width` and `height` all trigger layout → paint → composite.
Nothing here reaches the GPU. The pill moves on every heading change while
scrolling (`:509`) and on every TOC link hover (`:190`), so this runs during the
exact interaction it is decorating.

## Target

Give the pill a fixed 1×1 box and drive it entirely with `transform`. The
`scale()` factors then equal the target's pixel dimensions, and the visual
result is identical because the pill is a solid rounded rectangle with no
content to distort.

The one thing `scale()` does distort is `border-radius`, so the radius moves to
a child that is not scaled — a pseudo-element cannot be used here because it
would inherit the parent's scale. Instead, scale a wrapper and keep the painted
surface at natural size using the inverse trick is overkill for an 8px radius on
a ~28px-tall pill: at the scales involved the radius error is under 1px. Take
the simpler route and accept the radius riding the scale, but compensate the
declared radius so the *rendered* radius lands at 8px for the common case.

```css
/* src/styles/blog.css:839-856 — target */
/* Driven entirely by transform: the pill is a 1x1 box that scale() stretches to
   the active link's dimensions, so moving it is a composite, not a relayout.
   Radius is declared in the pill's own (unscaled) units and therefore rides the
   scale — at the sizes involved (~28px tall) the rendered error is sub-pixel.
   JS writes the transform; see TableOfContents.astro. */
.toc-sliding-pill {
  position: absolute;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  transform-origin: 0 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--blog-accent) 20%, transparent);
  opacity: 0;
  z-index: 0;
  pointer-events: none;
  will-change: transform;
  transition:
    transform 0.48s cubic-bezier(0.25, 1.22, 0.45, 1.04),
    opacity 0.25s ease-out;
}
```

```js
// src/features/posts/ui/TableOfContents.astro:443-451 — target
// One composited write instead of four layout writes. The pill is a 1x1 box
// (blog.css) with transform-origin at its top-left, so translate positions it
// and scale sizes it in the same property.
const movePill = (link) => {
  const wrap = wrapper.getBoundingClientRect();
  const box = link.getBoundingClientRect();
  pill.style.transform =
    `translate(${box.left - wrap.left}px, ${box.top - wrap.top}px)` +
    ` scale(${box.width}, ${box.height})`;
  pill.style.opacity = '1';
};
```

`will-change: transform` is correct here and only here: with the box fixed at
1×1, the promoted layer's raster never changes, so the promotion pays for
itself. (Contrast plan 024, where the same declaration currently sits on a pill
whose box *does* change — that combination is what forces a re-raster per frame.)

## Repo conventions to follow

- TOC geometry is measured on the events that can change it, never per frame —
  the comment at `src/features/posts/ui/TableOfContents.astro:453-456` records
  why. `movePill` is already event-driven; keep it that way.
- Comments state the tradeoff, not the mechanism.
- Blog styles live in `src/styles/blog.css`; the TOC block starts at :830.

## Steps

1. `src/styles/blog.css:839-856` — replace the rule with the target above.
2. `src/features/posts/ui/TableOfContents.astro:443-451` — replace `movePill`
   with the target above.
3. Check the two other writers of pill state still make sense:
   `:218` sets `pill.style.opacity = '0'` (fine, untouched) and `:509` calls
   `movePill` (fine). No other code writes `top`/`left`/`width`/`height` on this
   element — confirm with
   `grep -n "pill" src/features/posts/ui/TableOfContents.astro`.

## Boundaries

- Do NOT change the 0.48s duration or the `cubic-bezier(0.25, 1.22, 0.45, 1.04)`
  curve. The overshoot in that curve is the pill's character and this plan is a
  pure performance change.
- Do NOT touch `.toc-progress-fill` (`src/styles/blog.css:873-882`) — its
  `height 0.1s linear` is a 4px rail fill, a different element with a different
  problem, and it is not in scope.
- Do NOT touch the mobile reading topbar (`.toc-topbar__*`) or its WAAPI title
  ticker at `TableOfContents.astro:112-142`.
- If a cited line does not match what you find, STOP and report.

## Verification

- **Mechanical**: `bun run check` and `bun run build` succeed.
- **Visual equivalence**: open a post with 5+ headings at desktop width. The pill
  must hug each link's box exactly as before — same size, same inset, same
  overshoot on arrival. Screenshot the pill on a short heading and a long one
  and compare against `main`; a wrong `transform-origin` shows up as the pill
  landing offset, a missing `scale` argument as it collapsing to a line.
- **Performance proof** (this is the point of the plan): DevTools → Performance,
  record while scrolling through the post. In the flame chart the pill's moves
  must no longer produce `Layout` entries. Before the change each heading
  transition shows Layout + Paint; after, it should show neither.
- **Hover path**: hovering TOC links (`:190`) must still move the pill, and
  moving the pointer away must restore it to the active section.
- **Done when**: the pill looks and lands identically, and scrolling a long post
  produces no layout work attributable to it.
