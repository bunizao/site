# 021 — Re-measure Safari, then delete the WebKit skip if it holds

- **Status**: TODO (manual measurement — cannot be done by an agent)
- **Commit**: 3ec02a76
- **Severity**: LOW
- **Category**: Cohesion / platform parity
- **Estimated scope**: 1–3 lines deleted in 2 files, or nothing
- **Depends on**: 017, 018 (this plan is only worth doing after them)

## Problem

Both layouts opt WebKit out of cross-document view transitions entirely:

```js
/* src/layouts/Layout.astro:203-213, src/layouts/BlogLayout.astro:161-170 — current */
if (navigator.vendor === 'Apple Computer, Inc.') {
  document.documentElement.classList.add('ua-webkit');
  const skip = (event) => event.viewTransition?.skipTransition();
  addEventListener('pageswap', skip);
  addEventListener('pagereveal', skip);
}
```

`src/styles/globals.css` records why, and records the exit condition:

> WebKit runs these morphs largely on the main thread […] even after flattening
> them to an opacity-only crossfade it still dropped a frame mid-tween […]
> Delete that skip once Safari composites view transitions.

That measurement is still the right call for the code it was taken against —
but it is no longer the code. It was measured with home → post running a
full-viewport root crossfade **plus three simultaneous per-slug title morphs**
(each stretching a text bitmap ~3× across the wider article measure) **plus** a
large hero image morph. Plans 017 and 018 delete all of that. What remains on
home → blog is a root crossfade and one 40–48px mark.

So the skip's premise should be re-tested against the cheaper transition before
it is treated as permanent. This is a measurement, not a code change: the change
is one-line and conditional on the result.

## Target

Either:

- **Safari is smooth** → delete the two `addEventListener` lines and the `skip`
  const from both layouts, keeping the `ua-webkit` class (it gates unrelated
  glass rules in `src/styles/progressive-blur.css:54-58` and
  `src/styles/blog.css:998` — do NOT remove it), and replace the "No WebKit
  override lives here on purpose" comment in `src/styles/globals.css` with a
  note recording the date and Safari version it was re-verified on.
- **Safari still stutters** → leave everything and update that comment with the
  date, Safari version, and what was observed, so the next audit doesn't redo
  this.

## Why not design a separate WebKit transition instead

Recorded so it isn't re-litigated:

- **A page-exit fade needs a snapshot.** Without one, the old page fades to
  blank and the new page hard-cuts in — a blank frame is worse than no
  transition.
- **An incoming-page CSS entrance** (`body { animation: page-in … both }`) is
  the only zero-JS option, and `from { opacity: 0 }` makes the LCP element
  non-paintable for the animation's duration, so it pushes LCP on every load —
  including the list → post path that is the actual reading experience. Paying
  a Core Web Vitals cost on every page for a cosmetic gain on one browser is a
  bad trade.
- **Anything JS-gated hits the documented VT-boundary trap**: an element whose
  painted state depends on a script does not match its own snapshot, which is
  the failure already recorded at `src/styles/blog-prose.css:100-115`.
- **What actually makes an instant navigation feel good is a fast one**, and
  that is already shipped: `astro.config.mjs:89-90` sets `prefetchAll: true`,
  so internal links are prefetched and Safari's cut lands on an already-warm
  document. That is the best practice here, and it is in place.

## Steps

1. Land 017 and 018 first.
2. On a local branch, comment out the two `addEventListener('pageswap'/'pagereveal', skip)`
   lines in `src/layouts/Layout.astro` and `src/layouts/BlogLayout.astro`.
3. `bun run build && bun preview` (the Cloudflare preview — dev's Node SSR is
   not representative of production timing).
4. In real Safari on the Mac, and in Safari on a real iPhone over the LAN:
   - `/blog/` → post → back → post, five times.
   - home (scrolled to Writing) → click the doorway.
   - home at scroll 0 → ⌘K → a post.
5. Watch for: a dropped frame at the snapshot swap, the mark or title landing
   after the page has already painted, any flash of background.
6. Record the verdict, the date, and the Safari version in the
   `src/styles/globals.css` WebKit comment either way.

## Boundaries

- Do NOT remove the `ua-webkit` class or the `navigator.vendor` check — other
  stylesheets depend on the class.
- Do NOT add a WebKit-only animation system (see rationale above).
- Do NOT change any duration or curve as part of this.
- Do NOT judge this from Playwright's WebKit build: it is not Safari, it has a
  different compositor path, and it runs headless. The measurement only counts
  in real Safari.

## Verification

- **Done when**: the WebKit comment in `src/styles/globals.css` states a date, a
  Safari version, and an outcome — and the skip is either gone or justified by
  that observation rather than by an older one.
