# 027 — Replace `transition: all` with the properties actually intended

- **Status**: DONE (2026-08-01, `57d7844d`)
- **Severity**: MEDIUM
- **Category**: Performance / Correctness
- **Estimated scope**: 8 files, 13 rules

## Problem

Thirteen rules transition `all`. Every one of them animates more than its author
intended, because `all` includes whatever else the matching hover/active/state
rule happens to change — `box-shadow`, `border-color`, `filter`, `background`,
sometimes `width`.

The cost is twofold: unintended properties animate (a feel bug, usually a
too-slow border or shadow), and several of them are off-GPU (a performance bug).

**This plan cannot be executed mechanically.** Narrowing `all` to a property
list changes what animates, so each site needs its current behaviour read first.
That is the work.

## The thirteen sites

| # | Location | Element | Where you see it | Trigger |
| --- | --- | --- | --- | --- |
| 1 | [HomePreview.astro:226](../src/features/mood/ui/HomePreview.astro) | `.mood-dot` timeline dot | `/` Mood section | hover row |
| 2 | [HomePreview.astro:287](../src/features/mood/ui/HomePreview.astro) | `.mood-card` | `/` Mood section | hover row |
| 3 | [HomePreview.astro:375](../src/features/mood/ui/HomePreview.astro) | tag pill | `/` Mood section | hover |
| 4 | [CommentsSection.astro:651](../src/features/mood/ui/CommentsSection.astro) | comment CTA card | `/mood/<id>` | hover |
| 5 | [CommentsSection.astro:716](../src/features/mood/ui/CommentsSection.astro) | CTA body | `/mood/<id>` | hover |
| 6 | [CommentsSection.astro:751](../src/features/mood/ui/CommentsSection.astro) | CTA arrow | `/mood/<id>` | hover |
| 7 | [DetailArticle.astro:448](../src/features/mood/ui/DetailArticle.astro) | meta chip | `/mood/<id>` | hover |
| 8 | [DetailArticle.astro:1186](../src/features/mood/ui/DetailArticle.astro) | `tg-spoiler` mask | `/mood/<id>` body | click to reveal |
| 9 | [globals.css:646](../src/styles/globals.css) | `.item` | mood reaction area | hover |
| 10 | [globals.css:672](../src/styles/globals.css) | `.link` | mood reaction area | hover |
| 11 | [globals.css:697](../src/styles/globals.css) | bordered chip | mood reaction area | hover |
| 12 | [globals.css:1879](../src/styles/globals.css) | `.theme-dropdown-item` | site-wide, theme menu open | hover |
| 13 | [mood.astro:1382](../src/pages/mood.astro) | card corner link icon | `/mood` feed | hover card |

`src/components/coss/alert-dialog.tsx:32` and `dialog.tsx:39` use Tailwind's
`transition-all` on a backdrop-blurred overlay, and
`src/components/project-cards/ProjectStack.tsx:942`/`:1416` use it on the deck's
arrow buttons and progress dots. Those are vendored/island code with a different
review path — see Boundaries.

## Method, per site

For each rule:

1. Find every selector that changes a property on this element (`:hover`,
   `:active`, `:focus-visible`, any `.is-*` state class).
2. List the properties those selectors actually change. That list is the
   replacement.
3. Sort the list into GPU (`transform`, `opacity`) and non-GPU (everything
   else). Keep both — the goal is honesty about what animates, not removal.
4. If a non-GPU property in the list is one nobody would miss (a `border-color`
   riding a 250ms bounce curve, for example), that is a finding to raise, not to
   silently fix. Note it and move on.

Worked example, site 1:

```css
/* src/features/mood/ui/HomePreview.astro:220-230 — current */
#moods-section .mood-dot {
  border-radius: 50%;
  background: hsl(var(--background));
  border: 2px solid hsl(var(--foreground) / 0.15);
  margin-top: 12px;
  position: relative;
  z-index: 2;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

#moods-section .mood-item:not(.mood-item-skeleton):hover .mood-dot { /* :229 */
  /* → read this rule to get the real property list */
}
```

The hover rule at `:229` is the answer key. Whatever it sets — likely
`transform` and `border-color` — is the transition list. Note that the curve
(`0.34, 1.56, 0.64, 1`) overshoots, so `border-color` currently bounces past its
target colour and back. That is almost certainly not intended and is exactly the
kind of thing this pass surfaces.

## Repo conventions to follow

- Mood component styles live in each `.astro` file's `<style>` block, not in a
  shared sheet. Keep them there.
- Comments state the tradeoff, not the mechanism.
- If plan 022 has landed, use `var(--ease-*)` / `var(--dur-*)` where the value
  already matches a token; if it has not, keep the literals. Do not retune.

## Steps

1. Work sites 1–13 in the order listed. They are independent; each is a
   self-contained edit.
2. For each, follow Method above and replace `all` with the derived list.
3. Keep a running note of any property that turns out to be animating
   unintentionally (especially anything riding an overshoot curve). Append it to
   this plan under a `## Findings` heading as you go — the next reviewer should
   not have to re-derive it.

## Boundaries

- Do NOT change any duration or curve. This plan narrows property lists only.
- Do NOT remove a property from the transition just because it is off-GPU. If
  `background` was animating before, it animates after. Record the concern;
  do not act on it here.
- Do NOT touch `src/components/coss/*` — vendored component code, changed only
  via its own upgrade path.
- Do NOT touch `ProjectStack.tsx:942` or `:1416`. Those are Tailwind utility
  classes on a React island; changing them is a different review with a
  different verification story, and site 13's fix does not depend on them.
- If a cited line does not match what you find, STOP and report.

## Verification

- **Mechanical**: `bun run check` and `bun run build` succeed.
- **Per site**, hover/activate the element and confirm the intended change still
  animates and nothing that used to move now snaps. The failure mode is a
  property left off the list: it jumps instead of transitioning. Check
  specifically for `border-color`, `box-shadow` and `background` — those are the
  three that `all` was silently carrying.
- **Site 8** is the one non-hover case: click a spoiler in a `/mood/<id>` post
  body and confirm the reveal still fades rather than cutting.
- **Site 12** is site-wide: open the theme dropdown from any page's header and
  hover Light/Dark/System.
- **Done when**: no `transition: all` remains outside `src/components/coss/` and
  `ProjectStack.tsx`, every listed element animates as it did, and the Findings
  section records what `all` was carrying that nobody asked for.

## Findings

What `all` was carrying that nobody asked for, recorded per the Method step 4.
None of these were fixed — narrowing the property list is this plan's whole
scope, and each of these is a feel decision that needs its own call.

**1. Site 1 (`.mood-dot`) — colour riding an overshoot curve.** The curve is
`cubic-bezier(0.34, 1.56, 0.64, 1)`, which overshoots by design for the
`scale(1.3)`. `border-color` and `background` were riding it too, so both
bounce *past* their target colour and settle back. Almost certainly unintended:
a colour has no momentum to overshoot with. The cheap fix is to split the
declaration so the two colours take a plain ease and only `transform` keeps the
bounce. Not done here.

**2. Site 9 (`.item`) — the only thing it animates is layout.** The hover
changes `padding-left` and nothing else, so narrowing `all` produced
`transition: padding-left 150ms ease` — an honest declaration of a transition
that forces layout on every hover frame. `transform: translateX(8px)` would be
the composited equivalent and would look the same on a block element with no
background or border to shift. This is the clearest candidate for a follow-up.

**3. Site 4 (`.mood-comments-load-more`) — a five-property list.** `color`,
`border-color`, `box-shadow`, `transform` and `opacity` all genuinely change
across `:hover`, `:active` and `:disabled`. Nothing here is accidental, but the
`box-shadow` tween is the expensive one and the button already carries two
stacked shadows plus a `::before` gradient overlay.

**4. Sites 2, 5 (`.mood-card`, CTA body) — `box-shadow` on a hover-follow.**
Both animate `box-shadow` as part of a hover lift. Off-GPU and repainting, but
visible and intended. Recorded only because narrowing made it explicit.

### Discrepancy against the plan as written

Every one of the thirteen cited lines matched. No STOP condition was hit.
