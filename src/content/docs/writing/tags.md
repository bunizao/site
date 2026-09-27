---
title: Tags
description: Public tags and their archive routes, English labels for a Chinese blog, and internal tags that change a post.
group: Writing
order: 8
---

Tags come from Ghost, which has two kinds: *public* and *internal*. In the
editor the difference is one character. Public tags group posts and get archive
pages. Internal tags never show to readers and change how a post behaves.

## Public tags

A public tag is an ordinary tag. It groups posts and gets its own archive.

Each public tag with at least one post:

- gets a route at `/blog/tag/[slug]`
- appears in the directory at `/blog/tags`
- shows on post rows and cards

An empty tag gets none of these. It is filtered out of the directory, the home
page rail, and the archive routes, so a tag that was created and never used
never 404s from a stale link.

### Labels

The blog is written in Chinese and uses the tag name as-is. Everywhere else
(the English home page, agent-facing Markdown), the label is resolved in this
order:

1. The tag's **meta title**
2. The tag's **OG title**
3. The slug, title-cased (`design-systems` → `Design Systems`)

For example, a tag named `设计系统` reads correctly on the Chinese blog. If you
set its meta title, it shows `Design Systems` on the English home page. If
neither title is set, the slug is used, so choose slugs with care.

## Internal tags

In the Ghost editor, a tag whose name starts with `#` is internal. Ghost stores
it with a `hash-` slug prefix (`#no-toc` becomes `hash-no-toc`) and sets its
visibility to internal.

Readers never see internal tags. They are filtered out of the tag directory,
the home page rail, and the archive routes, so a request for
`/blog/tag/hash-no-toc` returns 404 instead of an empty archive. Their only job
is to change behaviour on a post.

### `#no-toc`

Turns off the table of contents on a post: both the desktop rail and the
section menu in the reading topbar.

A post gets a table of contents when it has **two or more** `h2`/`h3` headings
*and* is not tagged `#no-toc`. Use the tag on a post that is long enough for a
table of contents but reads worse split into sections.

The reading topbar still shows. It displays the post title with no section menu
behind it.

### Comment policy

Five tags control comments on a single post. Each one changes a single setting
on top of the site-wide default in `blog.comments` (`src/data/site.ts`).

| Tag | Effect |
| --- | --- |
| `#comments-off` | No comment section on the page at all. |
| `#comments-readonly` | Existing comments stay readable, but no new ones are accepted. The section says so where the comment box used to be. |
| `#no-comments` | Older name for `#comments-readonly`, with the same effect. Kept because posts already use it. |
| `#reactions-off` | Removes the heart from the post and its comments. Works independently of the three tags above: a post can take reactions with comments off, or refuse them on an open thread. |
| `#comments-verified` | Only a verified email address can comment. The email field becomes required, and the API rejects anonymous and unverified writers instead of holding them for moderation. |

These tags are the only per-post comment setting. There is no settings table or
admin screen, because the author already edits tags in the same place they
write the post.

The page and site-api read these tags through one function,
`commentPolicyFromTags` in `@bunizao/contracts/comments`:

- The page derives the policy at build time from the Admin API.
- site-api derives it on each request from the Content API, which returns
  internal tags when asked for `include=tags`.

So the page and the API can't disagree about a post, and a read-only thread is
read-only to `curl` as well as to a reader.

The tags don't override the site-wide default itself. That default exists twice:
`blog.comments` in this repo, and `COMMENTS_MODE` / `COMMENTS_REACTIONS` /
`COMMENTS_REQUIRE_VERIFIED_EMAIL` in site-api's `wrangler.jsonc`. Both hold the
same three settings, so change them together.

### `#not-by-ai`

This tag is historical. It has no effect, whether a post has it or not.

The human-authorship pledge it used to control has been removed. A post's
colophon now names the models it credits via
[`[!authors]`](/docs/writing/authors) and says nothing when there are none.
This replaced a claim printed on every post that readers had no way to check.
You don't need to add the tag to new posts.

## Add an internal tag

An internal tag lives in two places, and they must agree: the tag in Ghost and
the check in code.

```ts
const hasNoTocTag = post.tags.some(
  (tag) => tag.slug === 'hash-no-toc' || tag.name === '#no-toc',
);
```

The check matches both forms of the tag. The slug is what the Ghost Content API
returns, and the name is what a person typed. Matching either one means a tag
renamed in the editor keeps working.

Nothing else is needed. Internal tags are already hidden from every
reader-facing page by their visibility, so a new one can't leak into the
directory.

## Notes

- Tag visibility is read from the Ghost Content API and normalised in
  `src/features/posts/adapter/ghost/dataset.ts`.
- Directory and archive filtering: `src/features/posts/server/content.ts`.
- Label resolution: `src/features/posts/display.ts`.
