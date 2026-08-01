# 018 — Home → blog is a threshold: the mark is the only shared element

- **Status**: DONE (2026-08-01)
- **Commit**: 3ec02a76
- **Severity**: HIGH
- **Category**: Cohesion & physicality
- **Estimated scope**: 2 files, ~15 lines net
- **Depends on**: 017 (the visibility gate; without it this plan only removes
  half the problem)

## Problem

The homepage's Writing section morphs its three teaser titles into the article
headline via a shared per-slug `view-transition-name`
(`src/features/home/ui/Posts.astro:65-68`). That borrows the *intra*-publication
vocabulary for an *inter*-publication move, and it contradicts the section's own
design thesis, stated at `src/features/home/ui/Posts.astro:2-9`:

> The blog is its own publication (separate mark, voice, tagline). So this
> section's job is to *introduce the place and step back*.

A morph asserts "this is the same object, re-laid-out". A 16px Inter teaser on a
personal homepage and a 34px headline inside 無人之境 are not the same object;
saying so with motion undercuts the separation the whole section exists to
create.

It also looks wrong. The two boxes are 216px and 672px wide, so the outgoing
snapshot is a bitmap stretched ~3× across the article measure. Recorded at 1/8
speed on the dev server, the frame at ~35% of the transition shows the real
headline with a giant faint echo of itself trailing behind it, plus the same
ghosting on all three rows during home → `/blog/`.

The element that *is* the same object across this boundary is the publication
mark — and `src/styles/globals.css:2292-2297` already says so:

```css
/* src/styles/globals.css:2292-2295 — current */
/* The publication mark is the thread of continuity across the whole navigation.
   On home the Writing doorway carries the same `blog-mark` name (Posts.astro),
   so clicking "Enter" lifts that mark up into the blog masthead — one element
   the eye tracks through the fade instead of everything dissolving at once. */
```

That is the right idea. The title morph is the part that should not be there.

## Target

Two vocabularies, one per kind of move:

- **Crossing into the publication (home → `/blog/`, home → post): follow the
  sign.** `blog-mark` is the only named pair. Everything else dissolves.
- **Inside the publication (`/blog/` → post): follow the piece you chose.** The
  clicked row title morphs into the headline; the hovered preview grows into the
  hero. Unchanged.

Concretely, the homepage teaser titles stop carrying a transition name at all:

```astro
<!-- src/features/home/ui/Posts.astro:57-68 — target -->
<a
  href={postPath(post.slug)}
  class="post-item"
  data-reveal-item
  style={`--reveal-delay: ${800 + index * 60}ms; --reveal-duration: 400ms`}
>
  {/* No `view-transition-name` here on purpose. The blog is its own
      publication (see this file's header); morphing a 16px teaser into a 34px
      headline in another typographic register asserts a sameness the design
      denies — and stretches the outgoing snapshot ~3x across the wider article
      measure. Crossing the threshold follows the publication mark instead
      (`blog-mark`, below). The title morph stays where it is true: list row →
      headline inside the blog zone. */}
  <span class="post-title">{post.title}</span>
```

`postTitleTransitionName` stays exported — `PostRow.astro` and `[slug].astro`
still use it — but `Posts.astro` no longer imports it.

The mark's morph is unchanged in CSS and, with plan 017 in place, only fires
when the doorway is on screen:

```css
/* src/styles/globals.css:2298-2301 — unchanged */
::view-transition-group(blog-mark) {
  animation-duration: 460ms;
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}
```

When the doorway was *not* on screen, `blog-mark` exists only on the incoming
side. A new-only capture gets the UA's default fade, which runs on its own
schedule and can land out of step with the 460ms root rise. Pin it to the root's
curve so the mark arrives with the page rather than after it:

```css
/* src/styles/globals.css — add directly after the blog-mark group rule */
/* No outgoing counterpart (the doorway was off screen, or the reader arrived
   from outside the site): the mark has nothing to travel from, so it simply
   arrives with the page instead of on the UA's default fade schedule. */
::view-transition-new(blog-mark):only-child {
  animation: vt-root-in 460ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
```

## Repo conventions to follow

- View-transition rules live in one block at the end of
  `src/styles/globals.css` (from line 2240), each with a comment saying what it
  buys. Match that voice.
- Astro comments in `.astro` markup use `{/* … */}`; exemplar
  `src/features/home/ui/Posts.astro:63-64`.
- Reuse the existing `vt-root-in` keyframe (`src/styles/globals.css:2272`) —
  do not author a near-duplicate.

## Steps

1. `src/features/home/ui/Posts.astro:67` — delete the `style` attribute from the
   `.post-title` span, leaving `<span class="post-title">{post.title}</span>`.
   Replace the existing comment at lines 63-64 with the target comment above.
2. `src/features/home/ui/Posts.astro:12` — drop `postTitleTransitionName` from
   the import; keep `postPath`.
3. `src/features/home/ui/Posts.astro:43` — keep the mark's
   `data-vt-name="blog-mark"` from plan 017 exactly as it is.
4. `src/styles/globals.css` — after the `::view-transition-group(blog-mark)`
   rule at line 2298-2301, add the `:only-child` rule above.

## Boundaries

- Do NOT remove `postTitleTransitionName` from `src/features/posts/format.ts`;
  `PostRow.astro` and `[slug].astro` still need it.
- Do NOT touch the `.post-title` group rule at `src/styles/globals.css:2287` —
  it still governs the blog-zone list → headline morph.
- Do NOT touch `blog-hero` (`src/styles/globals.css:2314-2330`).
- Do NOT restyle the Writing section. Motion only.
- If a cited line does not match what you find, STOP and report.

## Verification

- **Mechanical**: `bun run check` passes; `bun run build` succeeds;
  `bun run test:e2e:site` passes.
- **Feel check** (Chrome):
  - Scroll to Writing, click a teaser title. The article arrives on a clean
    dissolve with the mark carried up into the topbar. No oversized ghost text
    behind the headline at any frame.
  - Scroll to Writing, click "Enter 無人之境". Same — one mark travelling,
    nothing else.
  - DevTools → Animations, playback 10%, home → post: exactly one named group
    (`blog-mark`) plus `root`.
  - From `/blog/`, click a row. The title morph must still be there. If it
    disappeared, step 1 was applied to the wrong file.
  - Arrive at `/blog/` from outside the site (paste the URL): the mark fades in
    with the page, not visibly after it.
- **Done when**: no `post-*` view-transition name is emitted anywhere under
  `src/features/home/` (`grep -rn "view-transition-name" src/features/home/`
  returns nothing), and the blog-zone title morph is intact.
