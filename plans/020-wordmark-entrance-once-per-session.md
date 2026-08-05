# 020 — Play the masthead wordmark's entrance once per session, not on every return

- **Status**: DONE (2026-08-01)
- **Commit**: 3ec02a76
- **Severity**: MEDIUM
- **Category**: Purpose & frequency
- **Estimated scope**: 2 files, ~25 lines

## Problem

The 無人之境 masthead lockup plays a three-part literary entrance every time
`/blog/` loads:

```css
/* src/components/SiteWordmark.astro:76-79, 87-89, 109 — current */
.site-wordmark__character {
  animation: site-wordmark-ink 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards;
  animation-delay: calc(var(--wordmark-index) * 90ms);
}
.site-wordmark__latin {
  animation: site-wordmark-draw 0.8s cubic-bezier(0.32, 0.9, 0.3, 1) 0.42s backwards;
}
.site-wordmark__wake {
  animation: site-wordmark-wake-once 1.15s cubic-bezier(0.33, 0.9, 0.32, 1) 0.62s backwards;
}
```

Four characters at a 90ms stagger, then an 0.8s clip-draw, then a 1.15s shimmer:
the last pixel settles at ~1.77s.

`/blog/` is a hub, not a destination. A reader goes list → post → back → post →
back, and `src/pages/blog/[slug].astro:143` and `:148` both link straight to it,
as does the topbar mark on every page. So a first-visit flourish replays on the
third, fourth and fifth arrival of a single reading session, each time taking
1.77s to finish assembling a title the reader has already read.

Rare, high-emotion moments earn a delight budget. A hub you pass through several
times per session does not.

## Target

Full entrance on the first `/blog/` of a session; instant on every later one.

Gate with a `sessionStorage` flag written by the blog layout's existing inline
no-FOUC script, so the class is on `<html>` before first paint and the incoming
page of a view transition already matches (the same reasoning
`src/layouts/BlogLayout.astro:158-160` gives for `ua-webkit`).

```html
<!-- src/layouts/BlogLayout.astro — add inside the existing is:inline script at
     line 154-183, directly after the ua-webkit block -->
<!-- The masthead lockup's 1.77s entrance is a first-arrival flourish. /blog/ is
     a hub a reader passes through repeatedly in one session, so replaying it
     every time turns delight into a wait. The class must be set before first
     paint, and before the view transition captures this document. -->
try {
  if (sessionStorage.getItem('wordmark-seen')) {
    document.documentElement.classList.add('wordmark-seen');
  } else {
    sessionStorage.setItem('wordmark-seen', '1');
  }
} catch (e) {}
```

```css
/* src/components/SiteWordmark.astro — add to the component's <style> block,
   after the @keyframes and before the reduced-motion block */

/* Second and later arrivals in a session: the lockup is simply there. Only the
   blog masthead is gated — the home doorway's copy plays once per home visit,
   already held back by the Writing section's reveal. */
:global(html.wordmark-seen) .site-wordmark--blog .site-wordmark__character,
:global(html.wordmark-seen) .site-wordmark--blog .site-wordmark__latin,
:global(html.wordmark-seen) .site-wordmark--blog .site-wordmark__wake {
  animation: none;
}
```

The hover behaviour (`letter-spacing` on `__latin`, `background-position` on
`__wake`, both `transition`-driven) is untouched and keeps working, because only
the `animation` shorthand is cleared.

## Repo conventions to follow

- Pre-paint state goes in the layout's `is:inline` script and is expressed as a
  class on `<html>`; exemplar `src/layouts/BlogLayout.astro:161-170` and
  `src/pages/index.astro:61-68`.
- `sessionStorage` access is always wrapped in `try/catch`; exemplar
  `src/layouts/BlogLayout.astro:171-174`.
- Variant-scoped rules use the `.site-wordmark--blog` selector; exemplar
  `src/components/SiteWordmark.astro:49-53`.
- Astro scoped styles need `:global()` to reach `<html>`; exemplar
  `src/features/home/ui/Posts.astro:159-163`.

## Steps

1. `src/layouts/BlogLayout.astro` — insert the `try/catch` block above into the
   existing `is:inline` script, immediately after the `ua-webkit` `if` block
   (after line 170) and before the `let stored = null;` theme code.
2. `src/components/SiteWordmark.astro` — add the `html.wordmark-seen` rule to
   the `<style>` block, after `@keyframes site-wordmark-wake-once` (line 133)
   and before the `@media (prefers-reduced-motion: reduce)` block (line 135).

## Boundaries

- Do NOT gate the home variant (`.site-wordmark--home`). It is already held
  until the Writing section reveals (`src/features/home/ui/Posts.astro:159-163`)
  and plays at most once per homepage visit.
- Do NOT change any duration, delay or curve in the entrance itself — the first
  play must be identical to today's.
- Do NOT touch the hover `transition` declarations.
- Do NOT use `localStorage`; the flourish should return on a new session.
- If a cited line does not match what you find, STOP and report.

## Verification

- **Mechanical**: `bun run check` passes; `bun run build` succeeds.
- **Feel check** (Chrome):
  - Fresh tab → `/blog/`: the four characters ink in on their stagger, the
    latin draws, the shimmer runs. Unchanged from today.
  - Click a post, then "← All posts": the wordmark is simply present, no
    re-assembly, no shimmer.
  - Hover the wordmark on that second arrival: letter-spacing opens and the
    wake still sweeps. If either is dead, the rule cleared too much.
  - Open a new tab (new session) → `/blog/`: the full entrance is back.
  - DevTools → Rendering → `prefers-reduced-motion: reduce`: static in both
    cases, as before.
- **Done when**: the entrance plays on exactly the first `/blog/` of a browsing
  session and hover behaviour is unaffected.
