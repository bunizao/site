# 030 — Nothing appears from nothing: three `scale(0)` entrances and one exit curve

- **Status**: TODO
- **Severity**: LOW
- **Category**: Physicality / Easing
- **Estimated scope**: 4 files, ~10 lines

## Problem

**1. Three elements grow from zero.**

An element scaling up from `scale(0)` reads as materialising out of nowhere,
because nothing in the physical world does that. The fix is always the same:
start from a small-but-real scale and let opacity carry the rest of the
appearance.

```css
/* src/features/mood/ui/TimelineWheel.astro:224-238 — current */
/* Pip dot on major notch tip — /mood, the date dial on the right edge */
:global(.timeline-notch-pip) {
  width: 5px;
  height: 5px;
  transform: translateY(-50%) scale(0);
  opacity: 0;
  transition:
    opacity 0.3s ease,
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

```css
/* src/styles/listening.css:888 — the Listening card's seek thumb (/, /components) */
transform: translate(-50%, -50%) scale(0);

/* src/styles/blog-prose.css:1041 — the same thumb on the blog music card (/blog/<slug>) */
transform: translate(-50%, -50%) scale(0);
```

Both thumbs scale to 1 on `:hover`/`:focus-visible` of their progress bar.

**2. A dismiss that does not acknowledge the click.**

```tsx
// src/components/project-cards/ProjectStack.tsx:657-662 — current
exit={{
  ...originPose,
  transition: reduce ? { duration: 0 } : { duration: 0.3, ease: [0.4, 0, 1, 1] },
}}
```

`/`, the Projects card deck: closing an expanded card. `[0.4, 0, 1, 1]` is a
pure ease-in, so for roughly the first third of the 300ms the card is
effectively still. The entrance beside it uses `[0.32, 0.72, 0, 1]` at 420ms —
the asymmetry (slower deliberate entrance, faster exit) is right and stays. It
is the curve that costs the click its acknowledgement.

The comment at `:663-664` explains why the entrance is a tween rather than a
spring and that reasoning is sound; it does not cover the exit curve.

## Target

**1.** Start the pip and both thumbs from a visible scale:

```css
/* src/features/mood/ui/TimelineWheel.astro:231 — target */
/* 0.6, not 0: at 5px the dot is already tiny, and growing it from nothing reads
   as materialising rather than arriving. Opacity carries the appearance. */
transform: translateY(-50%) scale(0.6);
```

```css
/* src/styles/listening.css:888 and src/styles/blog-prose.css:1041 — target */
transform: translate(-50%, -50%) scale(0.4);
```

The thumbs sit at `0.4` rather than `0.6` because they are larger and the hidden
state must stay visually absent against the track; `0.4` of a ~10px thumb is
still sub-pixel-ish at rest but has a real size to grow from. Confirm against
the track: if the resting thumb is visible as a dot when it should not be,
the value is too high — drop to `0.3` and re-check, but do not return to `0`.

**2.** Give the exit an immediate start:

```tsx
// src/components/project-cards/ProjectStack.tsx:657-662 — target
exit={{
  ...originPose,
  // Not a pure ease-in: the card has to start moving on the frame the click
  // lands, or the dismiss reads as ignored. Still faster than the 420ms
  // entrance — the deliberate move in and the system's answer out.
  transition: reduce ? { duration: 0 } : { duration: 0.3, ease: [0.32, 0, 0.67, 0.3] },
}}
```

## Repo conventions to follow

- Comments state the tradeoff, not the mechanism.
- `TimelineWheel.astro` styles descendants through `:global()` because the
  notches are built in `src/features/mood/client/timeline-wheel.ts`; keep that
  form.
- `ProjectStack.tsx` passes framer-motion transitions as inline object literals
  at each call site, with shared ones hoisted to module constants
  (exemplar: `dealTransition` at `:1003`). A one-off exit curve stays inline.
- If plan 022 has landed, these are one-off curves and stay as literals — the
  token set deliberately does not include a "gentle ease-in".

## Steps

1. `src/features/mood/ui/TimelineWheel.astro:231` — change `scale(0)` to
   `scale(0.6)`, add the comment.
2. `src/styles/listening.css:888` — change to `scale(0.4)`.
3. `src/styles/blog-prose.css:1041` — change to `scale(0.4)`.
4. `src/components/project-cards/ProjectStack.tsx:661` — change the exit curve,
   add the comment.

## Boundaries

- Do NOT change the pip's `cubic-bezier(0.34, 1.56, 0.64, 1)` overshoot or its
  0.35s duration. The bounce is the dial's character.
- Do NOT change the ProjectStack **entrance** (`:665-667`, 420ms
  `[0.32, 0.72, 0, 1]`) or the exit **duration**. The enter/exit asymmetry is
  deliberate and correct.
- Do NOT touch `dealTransition` (`:1003-1006`, 720ms). That is the deck's
  ambient auto-deal, a different register from a user-initiated dismiss.
- Do NOT touch `pip-pulse` (`TimelineWheel.astro:247`) — the active pip's
  breathing loop is unrelated.
- If a cited line does not match what you find, STOP and report.

## Verification

- **Mechanical**: `bun run check` and `bun run build` succeed.
- **Pip**: `/mood`, scroll so the active date changes. The dot must still arrive
  with its bounce; at DevTools animation playback 10% it should visibly start
  from a small dot rather than from nothing. Confirm the inactive pips are not
  now faintly visible along the dial — that is the failure mode for `0.6`.
- **Thumbs**: hover the seek bar on the home Listening card and on a blog post's
  music card. The thumb must grow in as before, and at rest must be invisible
  against the track. Check both light and dark themes; the resting thumb is
  easier to see against the light track.
- **Card dismiss**: `/`, open a project card and close it. At 10% playback the
  card must begin moving in the first frames rather than hanging. Compare
  side-by-side with `main` — this is a subtle change and the difference is in
  the first ~80ms only.
- **Reduced motion**: with `prefers-reduced-motion: reduce`, the card dismiss
  must still be instant (`duration: 0`) — the `reduce` branch is untouched but
  worth confirming the edit did not land in the wrong branch.
- **Done when**: nothing in the three entrances starts from zero, the resting
  states are still invisible, and the card dismiss starts moving on click.
