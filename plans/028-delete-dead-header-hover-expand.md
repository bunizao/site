# 028 — Delete the header hover-expand: ~120 lines of JS that can never run

- **Status**: TODO
- **Severity**: LOW
- **Category**: Dead code
- **Estimated scope**: 2 files, ~140 lines removed

## Where this is

`src/layouts/Layout.astro:891-1052` — a script block titled "GSAP Header Button
Animations" that expands header action buttons on hover to reveal a text label,
by tweening `width` and `padding` with GSAP.

The header action cluster is the fixed group at the top right of every page.

## Problem

The animation targets nothing. It never has, on any page.

```js
// src/layouts/Layout.astro:905 — the selector
const buttons = headerActions.querySelectorAll<HTMLElement>(
  '.header-action-btn:not([data-theme-toggle]):not(.menu-trigger)'
);
```

`[data-header-actions]` (`src/layouts/Layout.astro:344-399`) contains exactly
three things:

| Element | Class | Result |
| --- | --- | --- |
| Search key (⌘K) | `.header-action-btn.header-action-btn--cmdk` | matches the selector |
| Theme toggle | `.header-action-btn[data-theme-toggle]` | excluded by `:not([data-theme-toggle])` |
| Menu trigger | `.header-action-btn.menu-trigger` | excluded by `:not(.menu-trigger)` |

So `buttons` resolves to the search key alone — and the search key is filtered
out one step later:

```js
// src/layouts/Layout.astro:919-920
const measureButton = (btn: HTMLElement) => {
  const label = btn.querySelector<HTMLElement>('.header-action-btn-label');
  if (!label) return null;   // ← SearchButton exits here
```

`SearchButton.astro:7` says so in its own comment: "it deliberately has no
`.header-action-btn-label`, so the header hover-expand GSAP leaves it inert."

Net effect: `buttonData` is always empty, no `mouseenter`/`mouseleave` listener
is ever attached, `loadGsap()` is never called (its only call sites are inside
`animateIn`/`animateOut`, which have no callers), and
`window.headerBtnAnimations.register` — the escape hatch for dynamically added
buttons — is called from nowhere in the repository:

```
$ grep -rn "headerBtnAnimations" src/
src/layouts/Layout.astro:1025:          window.headerBtnAnimations = {
```

Three pieces of CSS and one piece of markup exist only to serve it:

```css
/* src/styles/globals.css:1452-1458 */
  /* Only transition colors, GSAP handles width/transform */
  transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease, gap 0.2s ease;
}

.header-action-btn.is-hovered {   /* `is-hovered` is added only by animateIn */
  gap: 6px;
}
```

```css
/* src/styles/globals.css:1525-1537 */
/* Text labels - GSAP controls visibility via opacity/scale */
.header-action-btn-label {
  display: inline-block;
  max-width: 0;      /* permanently */
  opacity: 0;        /* permanently */
  overflow: hidden;
  /* ... */
}
```

```astro
<!-- src/layouts/Layout.astro:368 — renders a label that can never be seen -->
<span class="header-action-btn-label" data-theme-label>System</span>
```

The `data-theme-label` span is also written to by the theme script, so deleting
it needs a check (see Steps).

## Target

Delete all of it. There is nothing to preserve: no behaviour is lost because no
behaviour exists.

If the hover-expand is wanted **as a feature**, it should be rebuilt in CSS
(`grid-template-columns: 0fr → 1fr`, gated behind
`@media (hover: hover) and (pointer: fine)` and `prefers-reduced-motion`) rather
than revived — the original animated `width`/`padding` from JS, which is layout
work on a hover, on fixed-position chrome. That is a new plan, not this one.

## Repo conventions to follow

- Astro `<style>` blocks are scoped, so a preview component that redeclares a
  class is self-contained. `src/features/components/previews/MoodButtonPreview.astro:76-95`
  redeclares `.header-action-btn-label` **in full**, including `max-width: 0`,
  `opacity: 0` and its own `max-width`/`opacity` transition. It does not depend
  on the global rule and must not be touched.
- Comments state the tradeoff, not the mechanism.

## Steps

1. `src/layouts/Layout.astro:891-1052` — delete the comment line, the entire
   `<script>` block, and nothing else. Confirm the neighbouring blocks
   (`</script>` at :889 and the "Site Navigation" comment at :1054) are intact.
2. `src/styles/globals.css:1456-1458` — delete the `.header-action-btn.is-hovered`
   rule. On `:1452-1453`, drop `gap 0.2s ease` from the transition list (nothing
   changes `gap` any more) and rewrite the stale comment.
3. `src/styles/globals.css:1525-1537` — delete the `.header-action-btn-label`
   rule and its comment.
4. `src/layouts/Layout.astro:368` — check whether `data-theme-label` is read
   anywhere:
   ```
   grep -rn "data-theme-label\|themeLabel" src/
   ```
   - If the theme script writes the current theme name into it, **keep the span**
     and give it `.sr-only` (or whatever this repo's visually-hidden class is) so
     it stops pretending to be a visible label. It may be serving screen readers.
   - If nothing reads it, delete the span.
   Record which branch you took in the commit message.
5. Search for other references before finishing:
   ```
   grep -rn "header-action-btn-label\|is-hovered\|headerBtnAnimations" src/
   ```
   The only surviving hits should be inside `MoodButtonPreview.astro`.

## Boundaries

- Do NOT touch `src/components/SearchButton.astro`. Update the comment at its
  `:7` only if it now references something that no longer exists — its
  `.header-action-btn-keys` markup stays.
- Do NOT touch `src/features/components/previews/MoodButtonPreview.astro`. It is
  a self-contained specimen of what this pattern *would* look like, and its
  styles are scoped.
- Do NOT touch the theme dropdown, the menu trigger, or any other
  `.header-action-btn` styling in `src/styles/globals.css:1433-1454` beyond the
  two edits in step 2.
- Do NOT remove GSAP from `package.json`. It is still used by
  `src/features/home/ui/Hero.astro`, `src/layouts/Layout.astro` (nav typewriter),
  and two mood clients.
- If a cited line does not match what you find, STOP and report.

## Verification

- **Mechanical**: `bun run check` and `bun run build` succeed.
- **Bundle**: confirm the deleted script is gone —
  `grep -r "headerBtnAnimations" dist/` returns nothing.
- **Visual, on `/`, `/blog`, `/mood`, `/components`** (the last one exercises the
  `has-brand-home-bar` variant): the header cluster at top right must look
  pixel-identical to `main` — same three controls, same 32px squares, same
  spacing. Hover each one: colour and background still transition, and nothing
  expands (which is also true before the change).
- **Theme control still works**: click the theme toggle, pick each of
  Light/Dark/System, and confirm the icon swaps. This is the step that catches a
  step-4 mistake.
- **Screen reader**, if step 4 kept the span: confirm the theme button still
  announces its current state.
- **Done when**: the block is gone, the header is visually unchanged, and the
  only remaining `.header-action-btn-label` in `src/` is the preview's.
