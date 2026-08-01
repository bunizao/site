# 025 — Record scrub: stop recalculating a whole card subtree per pointermove

- **Status**: TODO
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 1 file, ~20 lines

## Where this is

`/blog/<slug>`, inside the article body: the Apple Music card (`.blog-music`).
Dragging its progress bar scrubs the track and spins the record to match.

## Problem

The scrub writes a custom property on the **card**, and three descendants read it
in their `transform`:

```js
// src/features/posts/ui/Prose.astro:366-369 — current
const syncRecordRotation = (fraction: number) => {
  const clamped = Math.min(1, Math.max(0, fraction));
  cardEl.style.setProperty('--record-rotation', `${clamped * RECORD_SCRUB_TURNS}turn`);
};
```

```css
/* src/styles/blog-prose.css — the three consumers */
.blog-prose .blog-music__record { /* :576 */ transform: translate(-50%, -50%) rotate(var(--record-rotation)); } /* :601 */
.blog-prose .blog-music__cover  { /* :606 */ transform: translate(-50%, -50%) rotate(var(--record-rotation)); } /* :616 */
.blog-prose .blog-music__label  { /* :795 */ transform: translate(-50%, -50%) rotate(var(--record-rotation)); } /* :806 */
```

`syncRecordRotation` runs from `seekFromEvent`, which is wired to `pointermove`
(`src/features/posts/ui/Prose.astro:428-431`) with pointer capture — so it fires
at input rate for the whole drag.

Changing an inherited custom property on the card invalidates style for the
card's entire subtree, not just the three rotating elements. That subtree
includes the title, the artist line, the time readouts, the play button, the
progress track and its thumb. All of them get their style recomputed on every
pointermove to serve three transforms.

This is the pattern the repo's own animation standards call out:

> Don't drive child transforms via a CSS variable on the parent — it recalcs
> styles for all children. Set `transform` directly on the element.

## Target

Write `transform` straight to the three elements during the drag. The variable
stays — it is still the right mechanism for the non-drag paths.

```ts
// src/features/posts/ui/Prose.astro:366-369 — target
// Resolve the three rotating elements once, then write transform directly to
// each during a drag. Setting --record-rotation on the card instead would be
// one write, but it invalidates style for the card's whole subtree — title,
// buttons, progress track and all — on every pointermove, to move three
// elements. The variable stays for the non-drag paths below.
const spinners = [
  cardEl.querySelector<HTMLElement>('.blog-music__record'),
  cardEl.querySelector<HTMLElement>('.blog-music__cover'),
  cardEl.querySelector<HTMLElement>('.blog-music__label'),
].filter((el): el is HTMLElement => el !== null);

const syncRecordRotation = (fraction: number) => {
  const clamped = Math.min(1, Math.max(0, fraction));
  const turns = clamped * RECORD_SCRUB_TURNS;
  for (const el of spinners) {
    el.style.transform = `translate(-50%, -50%) rotate(${turns}turn)`;
  }
};
```

The inline writes must be released when the drag ends, or they will outrank the
stylesheet forever and freeze the record:

```ts
// src/features/posts/ui/Prose.astro — target, inside endScrub (:434-440)
const endScrub = (event: PointerEvent) => {
  if (!scrubbing) return;
  scrubbing = false;
  // Hand the transform back to the stylesheet before the spin animation
  // resumes; an inline transform would outrank the keyframes and freeze the
  // record at wherever the finger left it.
  freezeCurrentRecordRotation();
  for (const el of spinners) el.style.removeProperty('transform');
  cardEl.classList.remove('is-scrubbing');
  progress.releasePointerCapture(event.pointerId);
};
```

`freezeCurrentRecordRotation` (`:371-379`) already exists and already does the
right thing — it reads the rendered matrix and writes the resulting angle back
into `--record-rotation`, so the record resumes from where the finger left it
rather than snapping. Calling it *before* clearing the inline transforms is what
makes the handoff seamless; it currently reads `recordEl`'s computed transform,
which during a drag will be the inline one. That is exactly what we want.

### Why the inline write wins during the drag

`.blog-music.is-scrubbing` already suspends the spin animation:

```css
/* src/styles/blog-prose.css:627-630 and :816-819 — existing, unchanged */
.blog-prose .blog-music.is-scrubbing .blog-music__record,
.blog-prose .blog-music.is-scrubbing .blog-music__cover { animation: none; transition-duration: 80ms; }
.blog-prose .blog-music.is-scrubbing .blog-music__label { animation: none; transition-duration: 80ms; }
```

Without `animation: none` a running CSS animation would outrank the inline
style and the drag would do nothing. It is already there — verify it, do not
remove it.

## Repo conventions to follow

- `src/features/posts/ui/Prose.astro` resolves DOM references once at setup and
  closes over them (exemplar: `progressEl`, `totalEl` at :353-355). The
  `spinners` array follows that shape.
- Comments state the tradeoff, not the mechanism.
- The home page has a second copy of this card (`src/styles/listening.css`,
  mounted from `src/features/home/ui/Listening.astro`). It uses the same
  `--record-rotation` name but is driven by `src/lib/listening/controller.ts`,
  not by this file. See Boundaries.

## Steps

1. `src/features/posts/ui/Prose.astro:366-369` — add the `spinners` lookup above
   `syncRecordRotation` and replace the function body.
2. `src/features/posts/ui/Prose.astro:434-440` — add the `freezeCurrentRecordRotation()`
   call and the `removeProperty('transform')` loop to `endScrub`, in that order.
3. Confirm the `is-scrubbing` rules at `src/styles/blog-prose.css:627-630` and
   `:816-819` are present and unmodified.

## Boundaries

- Do NOT delete `--record-rotation` or change the three stylesheet rules that
  read it. Playback (`is-playing` → `blog-music-spin`, `:624`/`:813`) and the
  freeze-on-release path both depend on the variable. This plan only bypasses it
  for the duration of a drag.
- Do NOT touch `src/styles/listening.css` or `src/lib/listening/controller.ts`.
  The home-page Listening card shares the token name but has its own controller
  and its own scrub path; whether it has the same problem is a separate question
  and a separate plan.
- Do NOT change `RECORD_SCRUB_TURNS` (`:356`) or the 80ms scrub transition.
- If a cited line does not match what you find, STOP and report.

## Verification

- **Mechanical**: `bun run check` and `bun run build` succeed.
- **Behavioural**, on a post containing an Apple Music card, with a track playing:
  - Drag the progress bar. The record, the artwork and the centre label must all
    rotate together, six turns end to end, exactly as before.
  - Release mid-track. The record must resume spinning **from where you left
    it**, not snap back to zero and not freeze. This is the regression the
    `freezeCurrentRecordRotation()` ordering guards against — test it
    deliberately, twice in a row.
  - Release, then drag again. A stale inline transform shows up here as the
    second drag having no effect.
- **Performance proof**: DevTools → Performance, record a 3-second drag. Before:
  a `Recalculate Style` entry per pointermove whose "Elements affected" count
  covers the whole card. After: the recalc count per move drops to the three
  rotating elements.
- **Done when**: the scrub feels identical, resume-after-release works twice in
  a row, and style recalc during the drag no longer spans the card.
