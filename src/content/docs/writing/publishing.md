---
title: Publishing
description: How a post gets from a Ghost draft to a deployed page, and what breaks when it doesn't.
group: Writing
order: 9
---

The publication 無人之境 lives at `/blog`. Posts are authored in Ghost and
rendered by this site at build time — Ghost is the editor and the database, but
it never serves a visitor.

## The path a post takes

1. You publish in Ghost.
2. Ghost fires its `Post published` webhook at a Cloudflare Workers Builds deploy
   hook.
3. Cloudflare rebuilds the `site` Worker. During the build, the site fetches
   posts from the Ghost Content API and renders them into static HTML.
4. The new Worker goes live. The post is now a prerendered page, an entry in
   `/blog/rss.xml`, and a row on the home page.

The consequence worth internalising: **a post is not live until a build finishes.**
Editing in Ghost and refreshing `/blog` does nothing. If a change has not appeared,
the question is always "did the deploy run", not "did the cache expire".

## Configuration

| Variable | Where it must exist | Why |
| --- | --- | --- |
| `PUBLIC_GHOST_URL` | Cloudflare **build** environment | The Content API origin. |
| `GHOST_CONTENT_API_KEY` | Cloudflare **build** environment | Read access to published posts. |

Both are read at build time, not at request time. Setting them as Worker runtime
secrets alone is not enough — the pages are prerendered, so the fetch happens
during the build or not at all.

## Wiring the hook

- In Cloudflare, create a Workers Builds deploy hook for the production branch.
- In Ghost, point the `Post published` webhook at that URL.
- Keep the event as `Post published`. A broader event fires builds for drafts.

## Rendering

Ghost returns its own content contract (`.kg-*` cards: images, galleries,
embeds, callouts, code). Those are restyled here rather than themed in Ghost, so
the published post reads in this site's typography and palette, in both light and
dark. Code fences are rehighlighted, images get a blur-up placeholder, and
YouTube and Apple Music embeds are replaced with local, privacy-preserving
components.

`src/features/posts/server/rich-content.ts` is the shared rich-source compiler
for published posts and authenticated Ghost draft previews. It normalizes exact
directive source cards, runs registered directives, and promotes conversation
blocks in one fixed order. The compiler owns the feature list for both callers.

The practical rule: write plain Ghost content and let this site style it. Custom
HTML in a post will render, but it will not inherit the type scale and it will
not adapt to the theme.

## Unlisted posts

Use Ghost's internal `#unlisted` tag when a post should work as a direct link
without entering the publication's discovery surfaces. Ghost exposes this tag
with the slug `hash-unlisted`; the site treats that exact internal tag as the
marker. A public post with any other tag remains listed.

The build keeps two post collections separate:

| Collection | Source | Includes `#unlisted` posts | Used by |
| --- | --- | --- | --- |
| Accessible | `getAccessiblePosts()` | Yes | `/blog/<slug>` static paths and direct slug lookup |
| Listed | `getListedPosts()` | No | Home and blog indexes, tag directories and archives, adjacent links, RSS, sitemap, Pagefind, palette data, `llms.txt`, and generated agent Markdown indexes |

An unlisted post therefore has a stable URL, but readers must already have the
URL. The article response emits `noindex, nofollow, noarchive, nosnippet` in
the `robots` meta tag. The layout also marks the whole document with
`data-pagefind-ignore="all"` and suppresses its `text/markdown` alternate link.
The generated static Markdown asset is omitted; a direct request with
`Accept: text/markdown`, or through `<post URL>/index.md`, renders at runtime
and returns the same directives in `X-Robots-Tag`.

Do not remove the tag from a post and assume the page is immediately discoverable.
The Ghost publish webhook starts a new site build, and the post enters listed
surfaces only after that build deploys. The source of truth for this rule is
[`src/features/posts/unlisted.ts`](https://github.com/bunizao/site/blob/main/src/features/posts/unlisted.ts);
the collection split lives in
[`src/features/posts/adapter/provider.ts`](https://github.com/bunizao/site/blob/main/src/features/posts/adapter/provider.ts).

## Translations

A translation is a second Ghost post that carries one internal tag naming the
post it translates:

```
#<locale>              this post is written in <locale>
#<locale>:<canonical>  this post is the <locale> version of <canonical>
```

To publish an English version of `/blog/lun-chenmo`:

1. Write it as its own post. Its slug does not matter — it never becomes a
   public URL — but the title and the excerpt do, because they are the search
   result.
2. Add the internal tag `#en:lun-chenmo`. The **name** must carry the colon;
   Ghost drops it from the tag's slug, and the site reads the name.
3. Leave the original alone. Publishing a translation touches one post, so
   "tagged the translation, forgot the original" is not a state that exists.
4. Leave Ghost's *Canonical URL* field empty on both posts. The site derives
   every canonical from the URL scheme below, and a value here would override it.

The build fails, rather than publishing something half-right, when the tag
names a slug that does not exist, when two posts claim the same language for
one article, or when the locale is not one the site has copy for
(`blog.copy` in `src/data/site.ts`, today `zh` and `en`).

What the reader and the crawler get:

| Version | URL | In listings, feeds, search | Indexable |
| --- | --- | --- | --- |
| Original | `/blog/lun-chenmo` | Yes | Yes, `x-default` |
| Translation | `/blog/en/lun-chenmo` | No | Yes, self-canonical, `hreflang="en"` |
| Translation's Ghost slug | `/blog/on-silence` | — | `301` to the version URL |

Every version links every other through `hreflang`, the article's language
switcher, and its own `text/markdown` alternate. A post written in English
with no Chinese original carries the bare `#en` tag instead and lives at its own
slug like any other post. A translation of an `#unlisted` article is unlisted
with it.

The tag grammar and URL builder live in
[`src/features/posts/i18n.ts`](https://github.com/bunizao/site/blob/main/src/features/posts/i18n.ts);
the parser is shared with `site-api` through `@bunizao/contracts`.
