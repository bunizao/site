# 031 — Mood feed entrance, exit and skeleton: a retune that needs an owner decision

- **Status**: BLOCKED — needs owner decision on §Decisions before execution
- **Severity**: MEDIUM
- **Category**: Easing & duration / Feel
- **Estimated scope**: 1 file, ~40 lines

## Where this is

`/`, the Mood section (`src/features/mood/ui/HomePreview.astro`). Three
connected moments: the skeleton that shows while the feed loads, the cards
arriving to replace it, and cards leaving on refresh.

**Read this whole plan before touching anything.** Unlike plans 023–030 this one
changes how the page *feels*, and three of its four items are judgement calls
the repo owner has to make. The measurements and the reasoning are here so the
decision is informed; the execution is trivial once it is made.

## Problem

**1. The entrance takes over a second to finish.**

```css
/* src/features/mood/ui/HomePreview.astro:118-134 — current */
/* Feed entrance. The section itself is revealed by src/lib/home-reveal.ts;
   these two classes cover the async swap from skeletons to real cards, which
   lands long after that first reveal. Both are pure CSS transitions, so a
   busy main thread delays them rather than freezing them part-way. */
#moods-section .mood-item {
  transition:
    opacity 0.7s var(--expo-out),
    transform 0.7s var(--expo-out),
    filter 0.7s var(--expo-out);
  transition-delay: calc(var(--item-index, 0) * 90ms);
}

#moods-section .mood-item--entering {
  opacity: 0;
  transform: translateY(24px) scale(0.94);
  filter: blur(6px);
}
```

With five items the last one starts at 360ms and settles at 1060ms. The repo's
own home-page reveal vocabulary, for comparison, runs 550–600ms with a 60ms
stagger (`src/styles/home-reveal.css:9, :33, :39`) — this is meaningfully slower
than the section it lands inside.

`filter: blur(6px)` is also the only animated blur on the home page. Blur is a
paint-stage effect: five cards blurring simultaneously is five full repaints per
frame, and this fires at the exact moment the feed data has just landed and the
main thread is busiest parsing and rendering it.

**2. The exit uses the site's only ease-in.**

```css
/* src/features/mood/ui/HomePreview.astro:136-144 — current */
#moods-section .mood-item--leaving {
  opacity: 0;
  transform: translateY(-12px) scale(0.94);
  filter: blur(6px);
  transition-duration: 0.5s;
  transition-timing-function: cubic-bezier(0.55, 0.06, 0.68, 0.19);
  transition-delay: calc(var(--item-index, 0) * 60ms);
  pointer-events: none;
}
```

`cubic-bezier(0.55, 0.06, 0.68, 0.19)` is easeInCubic — the only pure ease-in
on a UI transition in the repository. The first ~100ms is near-motionless, so a
refresh reads as hanging before it moves.

**3. Four concurrent infinite animations in the skeleton.**

```css
/* src/features/mood/ui/HomePreview.astro — current */
:420  animation: mood-skeleton-pulse   2.4s ease-out     infinite;  /* dot ring */
:445  animation: mood-skeleton-flow    2.6s ease-in-out  infinite;  /* timeline gradient */
:471  animation: mood-skeleton-sheen   2.8s ease-in-out  infinite;  /* card sweep */
:498  animation: mood-skeleton-shimmer 1.9s ease-in-out  infinite;  /* text blocks */
```

Each is also offset by `animation-delay: var(--skeleton-delay)`. All four run at
once, all four drive paint-stage properties (`background-position`, opacity on a
gradient overlay), and all four are slow. Faster loading animation makes the
same wait feel shorter; four overlapping 2-3s breaths do the opposite.

## Decisions

Item 2 is not a judgement call — see Target. Items 1, 3 and 4 are.

**Decision A — entrance timing.** Options:

| | Duration | Stagger | Last card settles | Note |
| --- | --- | --- | --- | --- |
| A1 | 0.42s | 50ms | 620ms | Matches the site's reveal vocabulary most closely |
| A2 | 0.55s | 60ms | 790ms | Exactly the `home-reveal.css` values |
| A3 | keep 0.7s | keep 90ms | 1060ms | Keep as authored |

A2 is the recommendation: it makes the Mood entrance a member of the home page's
existing motion family rather than a slower cousin, without inventing values.

**Decision B — the entrance blur.** Options:

| | |
| --- | --- |
| B1 | Remove `filter` from the transition and from `--entering`/`--leaving` |
| B2 | Keep it but drop to `blur(3px)` |
| B3 | Keep `blur(6px)` |

B1 is the recommendation. The blur is doing very little at 24px of travel, and
it is the single most expensive thing in the sequence at its worst possible
moment. If the softness is wanted, B2 halves the cost for most of the look.

**Decision C — the skeleton.** Options:

| | |
| --- | --- |
| C1 | Keep one animation (the card sheen, `:471`) at ~1.2s; drop the other three to static styling |
| C2 | Keep all four but bring each into the 1.0–1.4s band |
| C3 | Keep as authored |

C1 is the recommendation. But if the intent was an ambient "breathing" placeholder
rather than a progress signal, C3 is a legitimate answer and this item should be
closed as REJECTED rather than left open.

## Target

**Item 2 — the exit curve. No decision needed.**

```css
/* src/features/mood/ui/HomePreview.astro:140-141 — target */
/* An exit still has to start on the frame it is triggered. easeInCubic held the
   card almost still for the first 100ms, which read as the refresh hanging
   before anything moved. */
transition-duration: 0.25s;
transition-timing-function: cubic-bezier(0.23, 1, 0.32, 1);
```

(If plan 022 has landed, `var(--ease-out)`.)

**Items 1, 3, 4** — apply whichever option the owner picks. For the recommended
set (A2 + B1 + C1):

```css
/* src/features/mood/ui/HomePreview.astro:122-134 — target under A2 + B1 */
/* Matches the home reveal vocabulary (--reveal-stagger, and the 550ms/600ms
   pair in home-reveal.css) so the feed arrives as part of the page rather than
   after it. No blur: it bought very little at 24px of travel and cost a full
   repaint per card per frame, at the one moment the main thread is busy
   rendering the data that just arrived. */
#moods-section .mood-item {
  transition:
    opacity 0.55s var(--expo-out),
    transform 0.55s var(--expo-out);
  transition-delay: calc(var(--item-index, 0) * 60ms);
}

#moods-section .mood-item--entering {
  opacity: 0;
  transform: translateY(24px) scale(0.94);
}
```

with `filter: blur(6px)` also removed from `--leaving` (`:139`).

For C1, keep the `mood-skeleton-sheen` rule at `:458-474` with its duration
changed to `1.2s`, and delete the `animation` (not the styling) from `:420`,
`:445` and `:498`. The three `@keyframes` blocks they used
(`mood-skeleton-pulse` :573, `mood-skeleton-flow` :559, `mood-skeleton-shimmer`
:539) then have no consumers and go with them.

## Repo conventions to follow

- Mood component styles live inside `HomePreview.astro`'s `<style>` block.
- The existing reduced-motion block at `:146-155` already covers `.mood-item`,
  `--entering` and `--leaving`, and the skeleton has its own at `:588-601`.
  Both must keep covering whatever survives — if a property is removed from a
  rule, remove it from the reduced-motion counterpart too.
- Comments state the tradeoff, not the mechanism.
- The comment at `:118-121` explains why these are CSS transitions rather than
  JS — preserve that reasoning in whatever comment replaces it.

## Steps

1. **STOP.** Get decisions A, B and C from the owner. Record them at the top of
   this file before writing any code.
2. Apply item 2 (the exit curve) — this one is unconditional.
3. Apply A, B, C as decided.
4. Update the reduced-motion blocks at `:146-155` and `:588-601` to match what
   now exists. Under B1, `filter: none` at `:153` becomes dead and should go.
5. If C1 was chosen, delete the three orphaned `@keyframes` blocks and confirm
   with `grep -n "mood-skeleton-" src/features/mood/ui/HomePreview.astro` that
   no rule references a keyframe that no longer exists.

## Boundaries

- Do NOT touch `src/lib/home-reveal.ts` or `src/styles/home-reveal.css`. This
  plan borrows their values; it does not change them. The section-level reveal
  and the async card swap are two different moments and stay independent.
- Do NOT change `--item-index` bookkeeping in the script (`:1389`) or the
  skeleton reservation logic (`:1171-1174`, `:1238`). Those are layout, not
  motion.
- Do NOT touch `.mood-item` hover styling (`:229`) — that is plan 027 (its
  `transition: all`) and plan 029 (its missing pointer gate).
- Do NOT apply the same retune to the `/mood` feed
  (`src/features/mood/client/feed-controller.ts` and its styles). That surface
  has its own entrance and is not in scope.
- If a cited line does not match what you find, STOP and report.

## Verification

- **Mechanical**: `bun run check` and `bun run build` succeed.
- **Entrance**, on `/` with the network throttled so the skeleton is visible for
  a beat: the cards must replace the skeleton as one group settling, not a
  visible one-by-one cascade. Time the last card with DevTools animation
  playback at 25% and confirm it lands within the budget chosen in A.
- **Against the neighbouring section**: scroll so the Writing section and the
  Mood section reveal in the same viewport pass. Under A2 they should now read
  as the same motion family. This is the actual point of the change and the only
  way to check it is side by side.
- **Exit**: trigger a feed refresh (or toggle the entering/leaving classes in
  DevTools). The cards must begin moving immediately, not after a pause.
- **Skeleton**: throttle to Slow 3G and watch the placeholder for 5+ seconds.
  Under C1 it should read as one calm pulse, not four overlapping ones.
- **Reduced motion**: emulate `prefers-reduced-motion: reduce` and reload. Cards
  must appear without movement and the skeleton must be static. Step 4 is where
  this regresses.
- **Performance**: DevTools → Performance, record the skeleton-to-cards swap.
  Under B1 the paint cost during the swap should drop visibly versus `main`;
  that is the measurable half of the change.
- **Done when**: decisions are recorded at the top of this file, the exit starts
  immediately, and the entrance reads as part of the home page's motion rather
  than a slower guest.
