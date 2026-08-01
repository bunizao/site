# 017 — Only the activated, on-screen element may morph across a navigation

- **Status**: DONE (2026-08-01)
- **Commit**: 3ec02a76
- **Severity**: HIGH
- **Category**: Physicality & origin
- **Estimated scope**: 1 new file, 4 edited files, ~90 lines net

## Problem

`view-transition-name` is currently baked into markup, so an element claims a
morph slot whether or not it has any business morphing on *this* navigation.
Two consequences, both shipped today.

**1. Off-screen sources fly across the whole viewport.**

`src/features/home/ui/Posts.astro:43` and `:67` name the Writing section's mark
and its three teaser titles:

```astro
<!-- src/features/home/ui/Posts.astro:43 — current -->
<span class="writing-portal__mark" style="view-transition-name:blog-mark" aria-hidden="true">
```

```astro
<!-- src/features/home/ui/Posts.astro:65-68 — current -->
<span
  class="post-title"
  style={`view-transition-name:${postTitleTransitionName(post.slug)};view-transition-class:post-title`}
>{post.title}</span>
```

The Writing section sits ~2000px down the homepage. Measured at 1440×900,
scroll 0, on the dev server:

| Name | Home (viewport top) | `/blog/` (viewport top) | Travel |
| --- | --- | --- | --- |
| `blog-mark` | 1957 | 40 | 1917px up |
| `post-demo-effects` | 2042 | 449 | 1593px up, 216px → 672px wide |
| `post-quiet-architecture` | 2090 | 566 | 1524px up |
| `post-notes-from-the-links-lab` | 2139 | 682 | 1457px up |

So navigating home → `/blog/` or home → a post *without ever scrolling to the
Writing section* (⌘K palette, footer link, browser back/forward) produces:
the destination renders with its excerpts, dates and tags already in place but
**no titles and no mark**, then those elements fly up ~1900px from below the
fold, crossing over the rows they pass. On the article page the H1 slot is
empty and the headline drifts up through the middle of the prose.

**2. List → list navigations morph several titles at once.**

`src/features/posts/ui/PostRow.astro:33-36` is used by both
`src/pages/blog/index.astro:37` and `src/pages/blog/tag/[slug].astro:53`, so
`/blog/` → `/blog/tag/craft/` pairs every title the two lists share and yanks
them all simultaneously. Nothing the user clicked is among them.

A shared-element morph is a claim that two things are the same object. It is
only legitimate when the user acted on that object and could see it when they
did. Neither holds here.

## Target

One broker decides, per navigation, which single element may morph. Markup
declares a *candidate* name via `data-vt-name`; the real `view-transition-name`
is attached in `pageswap` (outgoing) and `pagereveal` (incoming), and only when:

- the user activated that element (click, in the capture phase), **and**
- the element's border box actually intersects the viewport at that moment.

Everything else falls back to the tuned root dissolve, which already reads well.

Persistent chrome is exempt: `.blog-mark` in `src/layouts/BlogLayout.astro:189`
keeps its static `view-transition-name` because it is genuinely the same element
in the same position on every page of the blog zone, so its "morph" is a no-op
that holds the mark still through the fade. Do not route it through the broker.

New module:

```ts
// src/lib/view-transition-names.ts — target
/**
 * Broker for cross-document view-transition names.
 *
 * A shared-element morph asserts that two elements are the same object. That is
 * only true for the element the user actually activated, and only if it was on
 * screen when they did. Baking `view-transition-name` into markup makes the
 * claim unconditionally — so a teaser title 2000px down the homepage would fly
 * the full height of the viewport into the article headline on a navigation the
 * user started from the command palette.
 *
 * Markup declares a candidate with `data-vt-name`; this module promotes exactly
 * one of them per navigation. Anything it declines falls back to the root
 * dissolve, which is the honest motion for "these are different pages".
 */
const HANDOFF_KEY = 'vt-morph';
const ATTR = 'data-vt-name';

/** Names are earned by visibility: an element the user cannot see cannot morph. */
const isOnScreen = (el: Element): boolean => {
  const box = el.getBoundingClientRect();
  return (
    box.bottom > 0 &&
    box.top < window.innerHeight &&
    box.right > 0 &&
    box.left < window.innerWidth
  );
};

const findCandidate = (name: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[${ATTR}="${CSS.escape(name)}"]`);

const readHandoff = (): string | null => {
  try {
    const name = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY);
    return name;
  } catch {
    return null;
  }
};

/**
 * What the reader touched. The named element is usually *inside* the link (a
 * row's `<h2>`, the doorway's mark), so resolving the source means walking up
 * to the activated link and then back down — `closest()` alone finds nothing.
 */
const ACTIVATION = `a[href], [${ATTR}]`;

export const initViewTransitionNames = (): void => {
  // Capture phase: record the intent before anything can navigate away.
  let armed: string | null = null;
  document.addEventListener(
    'click',
    (event) => {
      armed = null;
      const target = event.target instanceof Element ? event.target : null;
      const activated = target?.closest<HTMLElement>(ACTIVATION) ?? null;
      if (!activated) return;
      const source = activated.matches(`[${ATTR}]`)
        ? activated
        : activated.querySelector<HTMLElement>(`[${ATTR}]`);
      if (source && isOnScreen(source)) armed = source.getAttribute(ATTR);
    },
    true,
  );

  // Outgoing document. `pageswap` runs before the old snapshot is taken, so a
  // name set here is the one the capture sees.
  window.addEventListener('pageswap', (event) => {
    const name = armed;
    armed = null;
    if (!(event as PageSwapEvent).viewTransition || !name) return;
    const source = findCandidate(name);
    if (!source || !isOnScreen(source)) return;
    source.style.viewTransitionName = name;
    try {
      sessionStorage.setItem(HANDOFF_KEY, name);
    } catch {
      /* Private mode: no handoff, no morph. The root dissolve still plays. */
    }
  });

  // Incoming document. Always consume the handoff — a stale key must never
  // morph a later navigation.
  window.addEventListener('pagereveal', (event) => {
    const name = readHandoff();
    if (!(event as PageRevealEvent).viewTransition || !name) return;
    findCandidate(name)?.style.setProperty('view-transition-name', name);
  });
};
```

Markup moves from `style="view-transition-name:…"` to `data-vt-name="…"` in
three places (`view-transition-class` stays inline — it is inert without a
name, and `globals.css` keys the title timing off it):

```astro
<!-- src/features/home/ui/Posts.astro:43 — target -->
<span class="writing-portal__mark" data-vt-name="blog-mark" aria-hidden="true">
```

```astro
<!-- src/features/posts/ui/PostRow.astro:33-36 — target -->
<h2
  class="blog-row__title"
  data-vt-name={titleVT}
  style="view-transition-class:post-title"
>{post.title}</h2>
```

```astro
<!-- src/pages/blog/[slug].astro:155-158 — target -->
<h1
  class="blog-article__title"
  data-vt-name={titleVT}
  style="view-transition-class:post-title"
>{post.title}</h1>
```

Resulting behaviour:

| Navigation | Before | After |
| --- | --- | --- |
| Home → `/blog/`, Writing off screen | mark + 3 titles fly ~1900px | root dissolve only |
| Home → post, Writing off screen | headline drifts up through the prose | root dissolve only |
| Home → post, doorway on screen | title morphs + stretches | title morphs (plan 018 removes this pairing) |
| `/blog/` → post | clicked title morphs | unchanged |
| `/blog/` → `/blog/tag/x/` | every shared title yanks | root dissolve only |
| Back / forward | same as forward | root dissolve only (no click to arm) |

Because the source is resolved *inside* the activated link, "you morph what you
touched" falls out for free: clicking the Writing doorway (mark + wordmark)
lifts the mark, while the plain "Enter 無人之境" text link below it — which
wraps no named element — simply dissolves.

## Repo conventions to follow

- Client modules live in `src/lib/*.ts`, export a single `init*` function, and
  are imported from a layout's `<script>` block. Exemplar:
  `src/lib/home-reveal.ts` + `src/pages/index.astro:70-80`.
- Comments explain *why*, in English, in the voice of
  `src/lib/home-reveal.ts:1-16`.
- `PageSwapEvent` / `PageRevealEvent` may not exist in the installed
  `lib.dom.d.ts`. If `bun run check` rejects the casts, declare a minimal local
  interface in the module rather than adding a dependency or using `any`.

## Steps

1. Create `src/lib/view-transition-names.ts` with exactly the module above.
2. `src/layouts/Layout.astro` — add to the existing bundled `<script>` block
   (not the `is:inline` one):
   ```ts
   import { initViewTransitionNames } from '@/lib/view-transition-names';
   initViewTransitionNames();
   ```
   If Layout.astro has no non-inline `<script>` block, add one at the end of
   `<body>`.
3. `src/layouts/BlogLayout.astro` — add the same two lines to the existing
   bundled `<script>` at line 220-225.
4. `src/features/home/ui/Posts.astro:43` — replace
   `style="view-transition-name:blog-mark"` with `data-vt-name="blog-mark"`.
5. `src/features/home/ui/Posts.astro:65-68` — replace the inline
   `view-transition-name:…;view-transition-class:post-title` with
   `data-vt-name={postTitleTransitionName(post.slug)}` plus
   `style="view-transition-class:post-title"`.
6. `src/features/posts/ui/PostRow.astro:33-36` — same substitution using the
   existing `titleVT` const.
7. `src/pages/blog/[slug].astro:155-158` — same substitution.
8. Leave `src/layouts/BlogLayout.astro:189` (`.blog-mark`) and
   `src/styles/blog.css:461` (`.blog-preview.is-visible`) exactly as they are.

## Boundaries

- Do NOT touch `src/styles/globals.css` — plans 018 and 019 own that file.
- Do NOT change the reveal system (`src/lib/home-reveal.ts`,
  `src/styles/home-reveal.css`).
- Do NOT remove the WebKit `skipTransition` opt-out in either layout; it is a
  documented tradeoff (`src/layouts/Layout.astro:203-213`).
- Do NOT add dependencies.
- If a cited line does not match what you find, STOP and report.

## Verification

- **Mechanical**: `bun run check` passes. `bun run test:e2e:site` passes.
- **Feel check** (Chrome; Safari skips transitions by design):
  - Load `/`, do not scroll, open the ⌘K palette and navigate to a post. The
    article must fade in whole — no headline sliding up through the prose, no
    empty H1 slot at any frame.
  - Load `/`, do not scroll, click the footer's blog link. `/blog/` must arrive
    with its titles already in their rows.
  - Scroll to Writing, click a teaser title. Exactly one element morphs.
  - From `/blog/`, click a row: the title still glides into the headline and the
    hovered preview still grows into the hero. This is the reference behaviour —
    it must not regress.
  - From `/blog/`, click a tag chip: no titles yank.
  - Press Back from any of the above: plain dissolve, nothing flies.
  - DevTools → Animations, playback 10%: during any navigation at most one
    named group is animating.
- **Done when**: no navigation animates an element that was off screen when it
  was activated, and `/blog/` → post is unchanged.
