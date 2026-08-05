# 029 — Reduced motion for the marquee, pointer gating for thirteen hover transforms

- **Status**: TODO
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 12 files, ~40 lines

## Problem

**1. One infinite animation site-wide has no reduced-motion handling.**

```css
/* src/features/home/ui/TechMarquee.astro:73-79, 113-115 — current */
.marquee-track.left  { animation: scroll-left  25s linear infinite; }
.marquee-track.right { animation: scroll-right 25s linear infinite; }

.tech-marquee:hover .marquee-track { animation-play-state: paused; }
```

Mounted on `/` from `src/features/home/ui/Hero.astro:112`. There is no
`@media (prefers-reduced-motion: reduce)` block in the file and no site-wide
catch-all in `src/styles/globals.css` — the five reduced-motion blocks there are
all scoped to specific components. Continuous horizontal movement is the
canonical vestibular trigger, and this is the only unhandled instance of it.

The hover-pause is also ungated: on touch, a tap fires a synthetic hover and
freezes the marquee until the user taps elsewhere.

**2. Thirteen hover rules move an element without a pointer gate.**

Touch devices fire a synthetic `:hover` on tap and hold it until the next tap
elsewhere, so each of these leaves an element visibly displaced after a tap that
was meant to be a click.

| Location | What moves | Route |
| --- | --- | --- |
| [Posts.astro:265](../src/features/home/ui/Posts.astro) | post title shifts right | `/` Writing |
| [HomePreview.astro:229](../src/features/mood/ui/HomePreview.astro) | timeline dot scales | `/` Mood |
| [BackToTop.astro:99](../src/features/mood/ui/BackToTop.astro) | arrow lifts | `/mood` |
| [listening.css:347](../src/styles/listening.css) | tonearm swings | `/`, `/components` |
| [listening.css:381](../src/styles/listening.css) | tonearm swings (live) | `/`, `/components` |
| [listening.css:900](../src/styles/listening.css) | progress thumb scales | `/`, `/components` |
| [blog-prose.css:706](../src/styles/blog-prose.css) | tonearm swings | `/blog/<slug>` music card |
| [blog-prose.css:1053](../src/styles/blog-prose.css) | progress thumb scales | `/blog/<slug>` music card |
| [blog.css:391](../src/styles/blog.css) | year-rail label slides out | `/blog` |
| [blog.css:1999](../src/styles/blog.css) | tag card lifts | `/blog/tags` |
| [ShareRow.astro:179](../src/features/posts/ui/ShareRow.astro) | share button lifts | `/blog/<slug>` |
| [DetailArticle.astro:712](../src/features/mood/ui/DetailArticle.astro) | image preview scales | `/mood/<id>` |
| [projects.astro:187, :348](../src/pages/projects.astro) | icons shift | `/projects` |
| [portal.css:728, :982](../src/styles/portal.css) | card lifts, arrow shifts | `/dev/portal/*` |
| [mood.astro:1503, :1512](../src/pages/mood.astro) | comments popover | `/mood` |

The repo already has the correct pattern in several places — for example
`src/styles/globals.css:1779-1784` and `src/components/CommandPalette.astro:1080-1085`
both wrap hover styling in `@media (hover: hover) and (pointer: fine)`. These
thirteen were simply missed.

## Target

**1.** Marquee:

```css
/* src/features/home/ui/TechMarquee.astro — target, appended to the <style> block */
/* Continuous horizontal drift is the one motion pattern that reliably triggers
   vestibular symptoms. Reduced motion parks both tracks; the list is still
   fully readable because it is real text at rest, not a scroller. */
@media (prefers-reduced-motion: reduce) {
  .marquee-track.left,
  .marquee-track.right {
    animation: none;
  }
}
```

The parked position matters: `scroll-right` starts at `translateX(-33.33%)`
(`:104-110`), so parking it with `animation: none` snaps it to `translateX(0)`
and the right-hand row will show a different slice of the list than it does
mid-scroll. Check that the row still reads as a full row of items at rest and
is not clipped mid-word; if it is, park it with an explicit
`transform: translateX(-33.33%)` inside the same block rather than relying on
the base rule.

And gate the pause:

```css
/* src/features/home/ui/TechMarquee.astro:113-115 — target */
@media (hover: hover) and (pointer: fine) {
  .tech-marquee:hover .marquee-track {
    animation-play-state: paused;
  }
}
```

**2.** Each of the thirteen: wrap the hover rule — and only the hover rule — in
`@media (hover: hover) and (pointer: fine)`.

```css
/* pattern, exemplar at src/styles/globals.css:1779-1784 */
@media (hover: hover) and (pointer: fine) {
  .thing:hover { transform: translateY(-2px); }
}
```

Colour and background changes on the same selector can stay ungated if they are
in a separate rule — a stuck colour after a tap is not a problem the way a stuck
displacement is. Where a single rule changes both, gate the whole rule; splitting
it is not worth the churn.

Two sites need care:

- **`listening.css:347` and `:381`** are long `:hover:not(...)` chains that also
  have `:focus-visible` twins in the same selector list. `:focus-visible` must
  stay **outside** the media query — keyboard users need the tonearm feedback on
  any device. Split the selector list: hover branch inside, focus branch outside.
  `blog-prose.css:706` and `:1053` have the same shape.
- **`portal.css:728`** sits inside `.theme-portal`, which has its own token
  scope. Keep the rule where it is; only wrap it.

## Repo conventions to follow

- Hover gating uses the full `@media (hover: hover) and (pointer: fine)` form
  site-wide (exemplars: `globals.css:1779`, `CommandPalette.astro:1080`,
  `globals.css:1518`).
- `src/lib/hover-indicator.ts:21-26` deliberately gates on `hover: hover` **only**,
  not `pointer: fine`, and its comment explains why (Sidecar iPads, tablets,
  certain trackpad modes report a coarse primary pointer). That is a JS-side
  decision for a whole-feature gate and does not change the CSS convention here.
  Do not "harmonise" the two.
- Comments state the tradeoff, not the mechanism.

## Steps

1. `src/features/home/ui/TechMarquee.astro` — add the reduced-motion block and
   gate the hover-pause. Verify the parked position (see Target 1).
2. Work the thirteen sites in table order. Each is an independent wrap.
3. For the four tonearm/thumb sites, split hover from `:focus-visible` first,
   then wrap only the hover branch.
4. Re-run the sweep to confirm nothing was missed:
   ```
   grep -rn ":hover" -A3 src/ --include="*.css" --include="*.astro" \
     | grep -B3 "transform:" | grep ":hover"
   ```
   Cross-check each hit against a `hover: hover` guard in the same file.

## Boundaries

- Do NOT add a site-wide `@media (prefers-reduced-motion: reduce) { * { animation: none } }`
  catch-all. Reduced motion means less movement, not less feedback — the repo
  already makes that call deliberately at `src/styles/globals.css:2439-2459`,
  where the view transition degrades to a crossfade rather than a cut. A
  blanket kill would undo that.
- Do NOT add reduced-motion handling to the other files that lack it in this
  pass. The marquee is singled out because it is continuous and unstoppable;
  the rest are discrete transitions and are a separate judgement.
- Do NOT change any duration, curve, or transform value.
- Do NOT move `:focus-visible` rules inside a hover media query. That would
  remove keyboard feedback on touch devices, which is a worse bug than the one
  being fixed.
- If a cited line does not match what you find, STOP and report.

## Verification

- **Mechanical**: `bun run check` and `bun run build` succeed.
- **Reduced motion**: DevTools → Rendering → emulate
  `prefers-reduced-motion: reduce`, load `/`. The marquee must be stationary and
  the row must read as a complete row of technologies, not a clipped fragment.
- **Touch emulation** is the real test for part 2. DevTools → device toolbar
  (iPhone), then tap each listed element and move on. Before: the element stays
  displaced. After: it does not move at all. Cover at minimum `/` Writing +
  Mood, `/blog` year rail, `/blog/tags`, `/mood` back-to-top, and the music card
  on a post.
- **Desktop unchanged**: with a real pointer, every one of the thirteen must
  behave exactly as on `main`. This is a pure gating change — if a desktop hover
  stopped working, the media query wrapped too much.
- **Keyboard**: tab to the Listening card and to a share button; the
  `:focus-visible` feedback must still fire. Then repeat in touch emulation — it
  must still fire there too.
- **Done when**: the marquee parks under reduced motion, no listed element moves
  on tap, desktop hover is unchanged, and keyboard focus feedback survives on
  both pointer types.
