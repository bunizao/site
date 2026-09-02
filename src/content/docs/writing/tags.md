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

### Comment policy

Five tags, one knob each, folded onto the site-wide default in
`blog.comments` (`src/data/site.ts`). They are the only per-post switch the
comment section has: there is no settings table and no admin screen, because a
tag is a field the author already edits in the same place they write the post.

| Tag | Effect |
| --- | --- |
| `#comments-off` | No comment section on the page at all. |
| `#comments-readonly` | Everything already written stays readable; nothing new is accepted. The section says so where the box used to be. |
| `#no-comments` | The older name for `#comments-readonly`, and the same thing. Kept because it is already on posts. |
| `#reactions-off` | The heart disappears — on the post and on its comments. Independent of the three above: a post can take reactions with comments off, or refuse them with an open thread. |
| `#comments-verified` | Only a verified email address may comment. The email field stops being optional and the API refuses anonymous and unverified writers rather than holding them for moderation. |

Both halves of the system read these tags through one function,
`commentPolicyFromTags` in `@bunizao/contracts/comments`: the page derives the
policy at build time from the Admin API, and site-api derives it per request
from the Content API, which returns internal tags when asked for
`include=tags`. So the page and the API cannot disagree about a post — and a
read-only thread is read-only to `curl` as well as to a reader.

What the tags do *not* override is the site-wide default itself. `blog.comments`
in this repo and `COMMENTS_MODE` / `COMMENTS_REACTIONS` /
`COMMENTS_REQUIRE_VERIFIED_EMAIL` in site-api's `wrangler.jsonc` are two copies
of the same three answers, and they have to be changed together.

### `#not-by-ai`

Historical. The human-authorship pledge is now the **default** at the foot of
every post, and is replaced only when a post carries an
[`[!authors]`](/docs/writing/authors) directive. The tag no longer gates
anything, and does not need to be applied to new posts.

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
