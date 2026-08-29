---
title: Tags
description: Public tags, the archive routes they generate, English labels for a Chinese blog, and the internal tags that change how a post renders.
group: Writing
order: 8
---

Tags come from Ghost and split into two kinds. Ghost calls them *public* and
*internal*; the difference is one character in the editor and a large difference
in what happens.

## Public tags

An ordinary tag. It groups posts and gets its own archive.

Each public tag that carries at least one post gets a route at
`/blog/tag/[slug]`, appears in the directory at `/blog/tags`, and shows on post
rows and cards. An empty tag gets nothing — it is filtered out of the directory,
the home page rail, and the archive routes, so a tag created and never used never
404s from a stale link.

### Labels

The blog runs in Chinese, and the tag name is used as-is there. Elsewhere — the
English home page, agent-facing Markdown — a label is resolved in this order:

1. The tag's **meta title**
2. The tag's **OG title**
3. The slug, title-cased (`design-systems` → `Design Systems`)

So a tag named `设计系统` reads correctly on the Chinese blog and shows
`Design Systems` on the English home page if you set its meta title. Otherwise the
slug is the fallback, which is why slugs are worth choosing deliberately.

## Internal tags

In the Ghost editor, a tag whose name starts with `#` is internal. Ghost stores
it with a `hash-` slug prefix — `#no-toc` becomes `hash-no-toc` — and marks its
visibility internal.

Internal tags never surface to a reader. They are filtered out of the tag
directory, the home page rail, and archive routes entirely: requesting
`/blog/tag/hash-no-toc` is a 404, not an empty archive. They exist to flip
behaviour on a post.

### `#no-toc`

Suppresses the table of contents on a post — both the desktop rail and the
section menu in the reading topbar.

A post gets a table of contents when it has **two or more** `h2`/`h3` headings
*and* is not tagged `#no-toc`. The tag is the author's override for a post that
is technically long enough but reads worse chopped into sections.

The reading topbar itself still shows; it just carries the post title with no
section menu behind it.

### `#not-by-ai`

Historical, and now inert in both directions. The human-authorship pledge it
once gated has been removed altogether: a post's colophon declares the models
it credits via [`[!authors]`](/docs/writing/authors) and says nothing when
there are none, rather than printing a claim on every post that a reader has no
way to check. The tag gates nothing and does not need to be applied to new
posts.

## Adding an internal tag

Two places, and they must agree:

```ts
const hasNoTocTag = post.tags.some(
  (tag) => tag.slug === 'hash-no-toc' || tag.name === '#no-toc',
);
```

Both forms are checked because the slug is what the Ghost Content API returns and
the name is what a human typed. Match on either and a tag renamed in the editor
does not silently stop working.

Nothing else is required — internal tags are already excluded from every
reader-facing surface by visibility, so a new one cannot leak into the directory.

## Notes

- Tag visibility is read from the Ghost Content API and normalised in
  `src/features/posts/adapter/ghost/dataset.ts`.
- Directory and archive filtering: `src/features/posts/server/content.ts`.
- Label resolution: `src/features/posts/display.ts`.
