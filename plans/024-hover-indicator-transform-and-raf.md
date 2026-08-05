# 024 — Hover pill: stop re-rasterising a promoted layer, and stop forcing layout on scroll

- **Status**: DONE (2026-08-01, `7ccaa6ef`)
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 2 files, ~30 lines

## Where this is

The rounded highlight that slides behind the row you are hovering. Three mount
points, all using the same shared module:

| Route | List | Mount |
| --- | --- | --- |
| `/` (Writing section) | recent posts | `src/features/home/ui/Posts.astro:321` |
| `/blog`, `/blog/tag/<slug>` | post list | `src/features/posts/ui/PostHover.astro:17` |
| `/components` | hover-list specimen | `src/features/components/previews/HoverListPreview.astro:50` |

## Problem

**1. `will-change: transform` on an element whose box is animated.**

```css
/* src/styles/blog.css:195-212 — current */
.blog-indicator {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 0;
  border-radius: 12px;
  background: var(--blog-fill);
  opacity: 0;
  pointer-events: none;
  /* The pill springs to a new row on every hover; pre-promote it so Safari
     composites the transform on the GPU instead of stuttering on frame one. */
  will-change: transform;
  transition:
    transform 0.46s cubic-bezier(0.25, 1.18, 0.45, 1.04),
    width 0.4s cubic-bezier(0.25, 1, 0.3, 1),
    height 0.4s cubic-bezier(0.25, 1, 0.3, 1),
    opacity 0.25s ease-out;
}
```

The comment's intent is right and the promotion is real. But a compositor layer
only stays cheap while its raster is reusable — the whole premise is "this
texture does not change, only its position does". Tweening `width` and `height`
changes the layer's box every frame, so the compositor must re-rasterise it
每 frame *and* the browser still does the layout for the size change. The
promotion is paid for and then thrown away; the net result is worse than not
promoting at all.

**2. The scroll handler forces synchronous layout on every scroll event.**

```js
// src/lib/hover-indicator.ts:41-48, 69-75 — current
const moveTo = (item) => {
  const ir = item.getBoundingClientRect();
  const lr = list.getBoundingClientRect();
  pill.style.width = `${ir.width + padX * 2}px`;
  pill.style.height = `${ir.height + padY * 2}px`;
  pill.style.transform = `translate(${ir.left - lr.left - padX}px, ${ir.top - lr.top - padY}px)`;
  pill.style.opacity = '1';
};

const onScroll = () => {
  if (!list.classList.contains('is-hovering')) return;
  const item = document.elementFromPoint(pointerX, pointerY)?.closest(itemSelector);
  if (item && list.contains(item)) moveTo(item);
  else leave();
};
```

`onScroll` is registered as `passive` but is not coalesced, so it runs once per
scroll event. Each run does `elementFromPoint` (forces layout), two
`getBoundingClientRect()` (force layout), then four style writes (invalidate
layout) — and the next event forces it again. Hovering the blog list while
scrolling is the worst case, and it is also the common case, because the reason
this handler exists is that people scroll with the cursor resting on the list.

## Target

**1.** Same 1×1-box-plus-`scale()` technique as plan 023, so the promoted layer's
raster becomes genuinely stable.

```css
/* src/styles/blog.css:195-212 — target */
/* A 1x1 box that scale() stretches to the hovered row: moving the pill is a
   single composited transform, so the pre-promotion below actually holds. The
   previous version promoted the layer and then tweened width/height, which
   forced a re-raster every frame — the promotion paid for and thrown away.
   Radius rides the scale; at row heights (~48px) the rendered error is
   sub-pixel. JS writes the transform; see src/lib/hover-indicator.ts. */
.blog-indicator {
  position: absolute;
  left: 0;
  top: 0;
  width: 1px;
  height: 1px;
  transform-origin: 0 0;
  z-index: 0;
  border-radius: 12px;
  background: var(--blog-fill);
  opacity: 0;
  pointer-events: none;
  will-change: transform;
  transition:
    transform 0.46s cubic-bezier(0.25, 1.18, 0.45, 1.04),
    opacity 0.25s ease-out;
}
```

**2.** One transform write, and the scroll path coalesced into a frame.

```ts
// src/lib/hover-indicator.ts:41-48 — target
// One composited write. The pill is a 1x1 box with transform-origin at its
// top-left (see the consumer stylesheet), so translate positions it and scale
// sizes it in the same property — no layout, and the promoted layer's raster
// stays reusable.
const moveTo = (item: HTMLElement) => {
  const ir = item.getBoundingClientRect();
  const lr = list.getBoundingClientRect();
  pill.style.transform =
    `translate(${ir.left - lr.left - padX}px, ${ir.top - lr.top - padY}px)` +
    ` scale(${ir.width + padX * 2}, ${ir.height + padY * 2})`;
  pill.style.opacity = '1';
};
```

```ts
// src/lib/hover-indicator.ts:69-75 — target
// Scroll fires far more often than it can be usefully answered, and answering
// it costs an elementFromPoint plus two rect reads — all forced layout. One
// answer per frame is the most the pill can show anyway.
let scrollRaf = 0;
const onScroll = () => {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    if (!list.classList.contains('is-hovering')) return;
    const item = (document.elementFromPoint(pointerX, pointerY) as HTMLElement | null)
      ?.closest<HTMLElement>(itemSelector);
    if (item && list.contains(item)) moveTo(item);
    else leave();
  });
};
```

The pending frame must be cancelled when the listener is torn down, at
`src/lib/hover-indicator.ts:95-101`:

```ts
list.addEventListener('pointerleave', () => {
  if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = 0; }
  if (scrolling) {
    document.removeEventListener('scroll', onScroll, { capture: true });
    scrolling = false;
  }
  leave();
});
```

### The other two consumers

`hover-indicator.ts` is shared, and `moveTo` no longer writes `width`/`height`.
Every stylesheet that styles a pill produced by this module must therefore
declare the 1×1 box and `transform-origin`. Find them with:

```
grep -rn "attachHoverIndicator" src/
```

and follow each call's `indicatorClass` option to its stylesheet. `.blog-indicator`
is the one in `blog.css`; the home Writing list and the `/components` specimen
pass their own class names. **A consumer left at `width: 0; height: 0` renders an
invisible pill** — this is the failure mode to watch for, and it is silent.

## Repo conventions to follow

- `src/lib/hover-indicator.ts:5-7` documents the contract: "The caller owns the
  look" — the module writes geometry, stylesheets own appearance. Adding the
  1×1 box to each consumer stylesheet honours that; hardcoding it in the module
  would not.
- The module is deliberately hover-capability-gated at `:26` and that gating is
  correct. Do not touch it.
- Comments state the tradeoff, not the mechanism.

## Steps

1. `src/styles/blog.css:195-212` — replace the rule with the target above.
2. `src/lib/hover-indicator.ts:41-48` — replace `moveTo`.
3. `src/lib/hover-indicator.ts:69-75` — replace `onScroll` with the rAF version;
   declare `scrollRaf` beside the existing `scrolling` flag at `:57`.
4. `src/lib/hover-indicator.ts:95-101` — add the `cancelAnimationFrame` to the
   `pointerleave` teardown.
5. Locate the other two consumer stylesheets (see above) and give each pill the
   same `width: 1px; height: 1px; transform-origin: 0 0;` and the same
   transition list. Do not change their curves or durations.

## Boundaries

- Do NOT change any duration or curve. `0.46s` /
  `cubic-bezier(0.25, 1.18, 0.45, 1.04)` and each consumer's own values stay.
- Do NOT remove `will-change: transform`. After this change it is finally doing
  what its comment claims.
- Do NOT touch the sibling-dim rule
  (`src/styles/blog.css:222-224`, `.blog-list.is-hovering .blog-row:not(:hover)`).
  Its 300ms feels slow for a hover-follow, but that is a feel decision and not
  this plan's business.
- Do NOT touch the TOC pill — that is plan 023, a different element in a
  different file. The two plans do not overlap and can run in parallel.
- If a cited line does not match what you find, STOP and report.

## Verification

- **Mechanical**: `bun run check` and `bun run build` succeed.
- **All three mounts render**: this is the step that catches a missed consumer
  stylesheet. Visit `/` (Writing section), `/blog`, and `/components`
  (hover-list tile) and hover a row on each. A pill that fails to appear means
  its stylesheet is still at `width: 0`.
- **Visual equivalence**: the pill must sit at the same inset (`padX`/`padY`
  bleed) and arrive with the same slight overshoot as on `main`.
- **Performance proof**: DevTools → Performance. Hover the `/blog` list, leave
  the cursor still, and scroll through the page. Before: one `Layout` per scroll
  event. After: at most one per frame, and the pill's own moves produce no
  `Layout` at all.
- **Scroll re-resolve still works**: with the cursor stationary over the list,
  scroll so a different row passes under it — the pill must follow to the new
  row, and must disappear when the list scrolls out from under the cursor. This
  is the behaviour `onScroll` exists for (see the comment at `:50-54`) and the
  rAF wrapper is where it would regress.
- **Done when**: all three lists animate as before, and scroll-while-hovering no
  longer shows per-event layout.
