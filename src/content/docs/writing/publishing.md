---
title: Publishing
description: How a Ghost post reaches the live site, what blocks it, and how unlisted posts and translations work.
group: Writing
order: 9
---

The publication 無人之境 lives at `/blog`. You write posts in Ghost, and this
site renders them at build time. Ghost is the editor and the database, but it
never serves a visitor.

## How a post goes live

1. You publish in Ghost.
2. Ghost sends its `Post published` webhook to a Cloudflare Workers Builds
   deploy hook.
3. Cloudflare rebuilds the `site` Worker. During the build, the site fetches
   posts from the Ghost Content API and renders them into static HTML.
4. The new Worker goes live. The post is now a prerendered page, an entry in
   `/blog/rss.xml`, and a row on the home page.

**A post is not live until a build finishes.** Editing in Ghost and refreshing
`/blog` does nothing. If a change hasn't appeared, check whether the deploy
ran, not whether a cache expired.

## Configuration

| Variable | Where it must exist | Purpose |
| --- | --- | --- |
| `PUBLIC_GHOST_URL` | Cloudflare **build** environment | The Content API origin. |
| `GHOST_CONTENT_API_KEY` | Cloudflare **build** environment | Read access to published posts. |

The build reads both variables. Nothing reads them at request time. Setting
them only as Worker runtime secrets isn't enough: the pages are prerendered, so
the fetch happens during the build or not at all.

## Set up the deploy hook

1. In Cloudflare, create a Workers Builds deploy hook for the production
   branch.
2. In Ghost, point the `Post published` webhook at that URL.
3. Keep the event as `Post published`. A broader event also fires builds for
   drafts.

## Rendering

Ghost returns content in its own format (`.kg-*` cards: images, galleries,
embeds, callouts, code). This site restyles those cards instead of theming
Ghost, so a published post uses this site's typography and palette in both
light and dark mode. The build also:

- rehighlights code fences
- gives images a blur-up placeholder
- replaces YouTube and Apple Music embeds with local, privacy-preserving
  components

`src/features/posts/server/rich-content.ts` is the shared rich-source compiler
for published posts and authenticated Ghost draft previews. In one fixed order,
it normalizes directive source cards (Ghost code cards in which every non-empty
line is a [directive](/docs/writing/directives) marker), runs registered directives, and
promotes conversation blocks. The compiler defines the feature list for both
callers.

Write plain Ghost content and let this site style it. Custom HTML in a post
still renders, but it doesn't use the type scale or adapt to the theme.

## Unlisted posts

Add Ghost's internal `#unlisted` tag when a post should work as a direct link
but stay out of the blog's lists, feeds, and search. Ghost exposes this tag
with the slug `hash-unlisted`, and the site treats that exact internal tag as
the marker. A public post with any other tag stays listed.

The build keeps two post collections separate:

| Collection | Source | Includes `#unlisted` posts | Used by |
| --- | --- | --- | --- |
| Accessible | `getAccessiblePosts()` | Yes | `/blog/<slug>` static paths and direct slug lookup |
| Listed | `getListedPosts()` | No | Home and blog indexes, tag directories and archives, adjacent links, RSS, sitemap, Pagefind, palette data, `llms.txt`, and generated agent Markdown indexes |

An unlisted post has a stable URL, but readers can only reach it if they
already have that URL. For an unlisted post:

- The article response emits `noindex, nofollow, noarchive, nosnippet` in the
  `robots` meta tag.
- The layout marks the whole document with `data-pagefind-ignore="all"` and
  leaves out its `text/markdown` alternate link.
- The build skips the generated static Markdown asset. A direct request with
  `Accept: text/markdown`, or to `<post URL>/index.md`, renders at runtime and
  returns the same robots directives in `X-Robots-Tag`.

Removing the tag doesn't make the post discoverable right away. The Ghost
publish webhook starts a new site build, and the post shows up in listings only
after that build deploys. The rule is defined in
[`src/features/posts/unlisted.ts`](https://github.com/bunizao/site/blob/main/src/features/posts/unlisted.ts),
and the collection split lives in
[`src/features/posts/adapter/provider.ts`](https://github.com/bunizao/site/blob/main/src/features/posts/adapter/provider.ts).

## Translations

A translation is a second Ghost post with one internal tag that names the post
it translates:

```
#<locale>              this post is written in <locale>
#<locale>:<canonical>  this post is the <locale> version of <canonical>
```

To publish an English version of `/blog/lun-chenmo`:

1. Write it as its own post. Its slug doesn't matter, because it never becomes
   a public URL. The title and excerpt do matter, because they are what search
   results show.
2. Add the internal tag `#en:lun-chenmo`. The tag **name** must include the
   colon. Ghost drops the colon from the tag's slug, and the site reads the
   name.
3. Leave the original post alone. Publishing a translation changes only one
   post, so you can't end up with a tagged translation and a forgotten
   original.
4. Leave Ghost's *Canonical URL* field empty on both posts. The site derives
   every canonical URL from the scheme below, and a value here would override
   it.

The build fails, instead of publishing something half-right, when:

- the tag names a slug that doesn't exist
- two posts claim the same language for one article
- the locale isn't one the site has copy for (`blog.copy` in
  `src/data/site.ts`, today `zh` and `en`)

A bare internal tag that names no language the site publishes, such as
`#comments-off` or `#no-toc`, is not a language tag, and the build ignores it.

What readers and crawlers get:

| Version | URL | In listings, feeds, search | Indexable |
| --- | --- | --- | --- |
| Original | `/blog/lun-chenmo` | Yes | Yes, `x-default` |
| Translation | `/blog/en/lun-chenmo` | No | Yes, self-canonical, `hreflang="en"` |
| Translation's Ghost slug | `/blog/on-silence` | n/a | `301` to the version URL |

Every version links to every other version through `hreflang`, the article's
language switcher, and its own `text/markdown` alternate. A post written in
English with no Chinese original uses the bare `#en` tag instead, and lives at
its own slug like any other post. A translation of an `#unlisted` article is
unlisted too.

The tag grammar and URL builder live in
[`src/features/posts/i18n.ts`](https://github.com/bunizao/site/blob/main/src/features/posts/i18n.ts).
The parser is shared with `site-api` through `@bunizao/contracts`.
