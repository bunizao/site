---
title: SEO and metadata
description: Public identity strings, structured data, sitemaps, and per-page metadata.
group: Platform
order: 5
---

## Public Identity

Search and sharing metadata use four distinct names:

| Role | Canonical name | Usage |
| --- | --- | --- |
| Person | `Lucian Bu` | Profile page, `Person` structured data, personal authorship |
| Personal alias | `Bunizao` | `alternateName`, account handles, historical credits |
| Pen name | `Murray` | Blog byline and the canonical Person's `alternateName` |
| Website | `buxx.me` | `WebSite.name`, `og:site_name`, non-blog title suffixes, oEmbed provider |
| Blog publication | `無人之境` | Blog title suffixes, `og:site_name`, `BlogPosting.publisher` |

`Bunizao` is not the website name. `Bunizao's Website` and `Lucian's Website`
are intentionally not used because possessive template names blur the person,
site, and publication entities.

The shared identity source is [`src/data/site.ts`](https://github.com/bunizao/site/blob/main/src/data/site.ts).
[`src/lib/seo.ts`](https://github.com/bunizao/site/blob/main/src/lib/seo.ts) derives structured data and the standard
non-blog title suffix from it.

## Titles

- The home page leads with the person: `Lucian Bu — Student, Developer & Blogger`.
- Non-blog sections use `<topic> — buxx.me`.
- The Blog index is `無人之境`.
- Blog articles use `<article title> — 無人之境`.
- Google may still rewrite a title when it believes another form better matches
  a query. Source titles must remain stable and should not imitate a rewritten
  search result.

## Structured Data

The home page emits two linked entities:

- `WebSite` named `buxx.me`, published by the canonical `Person`.
- `ProfilePage` named `Lucian Bu`, whose `mainEntity` is that `Person` and whose
  aliases include `Bunizao`.

Blog article pages emit `BlogPosting`. The article author is a `Person`; the
publisher is the `無人之境` publication with the thinking-woman mark as its
logo. When Ghost supplies the `Murray` byline, the author still uses the
canonical `https://buxx.me/#person` entity, with `Lucian Bu` as its name and
`Murray` as its `alternateName`. Structured data supplements visible title,
canonical, Open Graph, and favicon metadata rather than replacing them.

## Indexing

- `/mood` is indexable.
- `/mood/[id]` emits `noindex, follow` so crawlers can discover the directive
  without the detail archive crowding out editorial results.
- Blog indexes, tags, and articles remain indexable and canonical under
  `https://buxx.me/blog/`.
- Sitemap priority is not used as a result-balancing mechanism.

For direct-link-only articles, see [Unlisted posts](/docs/writing/publishing#unlisted-posts).
That page documents the exact Ghost marker and the corresponding sitemap, feed,
search, Markdown, and crawler behavior.

## Search Favicons

The Blog keeps its thinking-woman favicon in browser chrome. Search engines
normally choose one favicon per hostname, so `/blog/*` cannot reliably show a
different Google result favicon from other `buxx.me` paths. The Blog mark is
also supplied as the `BlogPosting.publisher.logo`, which is the standard place
to express publication identity for article metadata.
