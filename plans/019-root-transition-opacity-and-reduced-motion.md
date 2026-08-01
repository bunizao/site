# 019 — Stop the washed-out mid-transition frame; keep a crossfade under reduced motion

- **Status**: DONE (2026-08-01)
- **Commit**: 3ec02a76
- **Severity**: MEDIUM
- **Category**: Easing & duration / Accessibility
- **Estimated scope**: 1 file, ~20 lines

## Problem

**1. The incoming page is visibly grey for the first third of every navigation.**

```css
/* src/styles/globals.css:2258-2281 — current */
::view-transition-old(root) {
  animation: vt-root-out 240ms cubic-bezier(0.4, 0, 1, 1) both;
}

::view-transition-new(root) {
  animation: vt-root-in 460ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes vt-root-in {
  from { opacity: 0; transform: translateY(10px) scale(0.992); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
```

Opacity and transform share one 460ms window, so the page is still translucent
well past the point where it has stopped moving perceptibly. Recorded at 1/8
speed, the frame near 100ms shows the whole incoming page as grey text on white
— while any named layer (the mark, a morphing title) is at full opacity in its
own layer. The contrast between the sharp element and the washed page behind it
is what reads as broken; the settle itself is fine.

The comment at `src/styles/globals.css:2251-2257` says the goal was "no flash of
bare bg". The remaining problem is not a flash of background, it is a long
translucent ramp.

**2. Reduced motion removes the transition entirely rather than softening it.**

```css
/* src/styles/globals.css:2422-2428 — current */
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
}
```

With no animations the transition finishes on the next frame, so navigation hard
-cuts. `prefers-reduced-motion` asks for less *movement*, not less feedback —
opacity and colour changes should survive.

## Target

**1.** Front-load the opacity so the page is opaque by ~35% of the window while
the transform keeps settling:

```css
/* src/styles/globals.css:2272-2281 — target */
/* Opacity finishes early (about 160ms) and the transform keeps settling for the
   rest of the window. Sharing one ramp left the page grey for a third of the
   navigation while any named layer sat at full opacity on top of it — the
   mismatch, not the movement, was what read as unfinished. */
@keyframes vt-root-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.992);
  }
  35% {
    opacity: 1;
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
```

The outgoing rule and both durations stay as they are.

**2.** Reduced motion keeps a short opacity crossfade and drops every named
morph:

```css
/* src/styles/globals.css:2422-2428 — target */
@media (prefers-reduced-motion: reduce) {
  /* Less movement, not less feedback: the page still crossfades so the
     navigation is legible, but nothing travels and nothing morphs. */
  ::view-transition-group(*) {
    animation: none !important;
  }

  ::view-transition-old(root) {
    animation: vt-root-out 150ms linear both !important;
  }

  ::view-transition-new(root) {
    animation: vt-reduced-in 150ms linear both !important;
  }

  ::view-transition-old(*):not(.root),
  ::view-transition-new(*):not(.root) {
    animation: none !important;
  }
}

@keyframes vt-reduced-in {
  from {
    opacity: 0;
  }
}
```

## Repo conventions to follow

- All view-transition rules live in the block starting at
  `src/styles/globals.css:2240`; keyframes are declared next to the rule that
  uses them (exemplar: `vt-root-out` at :2266, used at :2259).
- Comments state the tradeoff, not the mechanism.
- Existing easing custom properties (`--expo-out`) are used where a curve is
  reused; a one-off curve stays inline. Do not introduce a new token for this.

## Steps

1. `src/styles/globals.css:2272-2281` — replace the `vt-root-in` keyframe with
   the target above, including its comment.
2. `src/styles/globals.css:2422-2428` — replace the reduced-motion block with
   the target above and add the `vt-reduced-in` keyframe directly after it.

## Boundaries

- Do NOT change the 240ms / 460ms durations or either timing function.
- Do NOT touch `::view-transition-group(.post-title)`,
  `::view-transition-group(blog-mark)`, or any `blog-hero` rule.
- Do NOT touch the `:root.theme-wipe` block (`src/styles/globals.css:2344-2379`)
  — that is a same-document transition with its own tuning.
- If a cited line does not match what you find, STOP and report.

## Verification

- **Mechanical**: `bun run build` succeeds (lightningcss has stripped
  multi-keyword CSS before — confirm both keyframes survive into
  `dist/client/**/*.css` with `grep -r "vt-reduced-in" dist/client`).
- **Feel check** (Chrome):
  - DevTools → Animations, playback 10%. Navigate `/blog/` → post and watch the
    body text: it must reach full black in the first third of the window and
    only then finish sliding. No long grey phase.
  - The named title layer must never look sharper than the page behind it.
  - DevTools → Rendering → emulate `prefers-reduced-motion: reduce`. Navigate:
    the page crossfades over ~150ms, nothing slides, nothing morphs, and the
    navigation does not hard-cut.
- **Done when**: at 10% playback the incoming page is opaque by roughly the
  first third of the transition, and reduced motion yields a fade rather than a
  cut.
