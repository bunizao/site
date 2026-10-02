---
title: SEO and metadata
description: The names, titles, structured data, indexing rules, and sitemap that search engines see.
group: Platform
order: 5
---

This page covers how the site presents itself to search engines and link
previews: the names it uses, page titles, structured data, indexing rules, the
sitemap, Telegram Instant View, and favicons. Read it before you add a page,
change a title, or change what gets indexed.

## Public identity

The site has one name, `buxx.me`. It is the only string in `WebSite.name` and
`og:site_name` anywhere on the domain. Google keeps one site name per domain
and shows it on its own line above the result, so page titles don't repeat it.

| Role | Canonical name | Usage |
| --- | --- | --- |
| Website | `buxx.me` | `WebSite.name`, `og:site_name`, oEmbed provider |
| Person | `Lucian Bu` | Profile page, `Person` structured data, personal authorship |
| Personal alias | `Bunizao` | `alternateName`, account handles, historical credits |
| Pen name | `Murray` | Blog byline and the canonical Person's `alternateName` |
| Blog publication | `無人之境` | Masthead, `/blog` page title subject, `BlogPosting.publisher` |

Some of these names are easy to mix up:

- `Bunizao` is a personal alias. It is never the website name.
- The site never uses `Bunizao's Website` or `Lucian's Website`. Possessive
  template names like these blur the person, the site, and the publication.
- `無人之境` names the publication, never the site. It appears in the blog
  masthead and as the article publisher, never in `og:site_name`.

[`src/data/site.ts`](https://github.com/bunizao/site/blob/main/src/data/site.ts)
holds the shared identity.
[`src/lib/seo.ts`](https://github.com/bunizao/site/blob/main/src/lib/seo.ts)
derives the structured data from it.

## Titles

- The home page leads with the person: `Lucian Bu — Student, Developer & Blogger`.
- Every other page's `<title>` is the subject alone: `Projects`, `Docs`,
  `<doc title>`. There is no site-name suffix. Search engines show `buxx.me`
  from the structured data and social cards read `og:site_name`, so a suffix
  would only repeat what the result already shows.
- The Blog index is `無人之境 — Lucian's Blog`. The English descriptor after the
  publication name tells a reader who can't read the name what the result is.
  Blog articles use the article title alone.
- Google may still rewrite a title if it thinks another form fits a query
  better. Source titles must stay stable and should not imitate a rewritten
  search result.

## Structured data

The home page emits two linked entities:

- `WebSite` named `buxx.me`, published by the canonical `Person`.
- `ProfilePage` named `Lucian Bu`, whose `mainEntity` is that `Person` and whose
  aliases include `Bunizao`.

Blog article pages emit `BlogPosting`. The article author is a `Person`. The
publisher is the `無人之境` publication, with the thinking-woman mark as its
logo. When Ghost supplies the `Murray` byline, the author still uses the
canonical `https://buxx.me/#person` entity, with `Lucian Bu` as its name and
`Murray` as its `alternateName`.

Structured data sits alongside the visible title, canonical, Open Graph, and
favicon metadata. It never replaces them.

Pages under a section (`/docs/*` and `/components/*`) emit a `BreadcrumbList`
that mirrors their visible breadcrumb (`buxx.me › Docs ›
Title`). `breadcrumbJsonLd` in `src/lib/seo.ts` builds it from canonical
paths. Pass the result through the `structuredData` prop of `Layout.astro`.

## Indexing

- **URL form.** Public page URLs have no extension and no trailing slash. `/`
  is the only exception. Other slash forms get a permanent `308`. Canonical
  tags, sitemaps, feeds, and internal links all use the slashless form.
- **Canonical host.** `www.buxx.me` answers a single `301` to the same path on
  the apex (`redirectCanonicalUrl`), so it never renders a copy. Every page
  declares `https://buxx.me` as its canonical origin, whatever host rendered
  it. A response from any other hostname (the phone tunnel, a Worker preview
  URL) carries `X-Robots-Tag: noindex, nofollow` (`isNonCanonicalHost` in
  `src/middleware.ts`). Local hosts are exempt.
- **Markdown alternates.** `/index.md` and `Accept: text/markdown` responses
  send an HTTP `Link: <html url>; rel="canonical"` header. A crawler that
  indexes `text/markdown` as a document then folds it into the HTML page
  instead of ranking a second copy of every article.
- **Mood feed.** `/mood` is indexable only in its bare form. With any query
  string (a post anchor, `?tag=`, `?source=`, `?subscribe=1`) it is the same
  feed and renders with `noindex, follow`.
- **Mood detail.** `/mood/[id]` emits `noindex, follow`, so crawlers can
  discover the directive without the detail archive crowding out editorial
  results.
- **Blog.** Blog indexes, tags, and articles stay indexable and canonical under
  `https://buxx.me/blog`.
- **Translations.** A translated article has its own page at
  `/blog/<locale>/<slug>` (`/blog/en/lun-chenmo`). It is self-canonical, with
  `hreflang` links between every version and `x-default` on the original. The
  response never depends on `Accept-Language` or a cookie, so each URL is one
  document to every crawler, which is the form Google asks for. The
  translation's Ghost slug and the retired `?lang=` form each answer a single
  `301` (`redirectLegacyBlogUrl`). To publish one, see
  [Translations](/docs/writing/publishing#translations).
- **Noindex pages.** Dev harnesses (`/lab/*`), component preview frames
  (`/components/preview/*`), the safe-area probe, the mood embed, the reader
  and subscription flows, and the portal all carry `noindex`.
  `tests/unit/seo-policy.test.ts` pins the list, so a new harness that forgets
  the tag fails CI.

### Legacy host

`blog.buxx.me` is still the Ghost origin. The editor lives at `/ghost`, and
the site reads the Content API from it. Only its public URLs moved.

Google keeps ranking whichever host answers `200` with a self-canonical. So
every public Ghost URL must answer a single `301` to its `buxx.me/blog` twin,
and the paths Ghost itself needs (`/ghost/*`, `/members/*`, `/p/*`, previews,
assets) must not redirect.

The redirects are Cloudflare Single Redirect rules on the zone, outside this
Worker. The Worker is routed on `buxx.me` and `www.buxx.me` only, and a
`blog.buxx.me/*` route would put a program in front of the editor. The rules
match URL shapes: any one-segment root path that isn't a Ghost namespace is an
article. A new post redirects the day it is published, with no per-slug entry.

| File | What it does |
| --- | --- |
| `scripts/legacy-blog-redirects.ts` | Holds the five rules. Prints the merged ruleset as a dry run, and writes it with `--apply` using a token that has `Zone > Single Redirect > Edit` |
| `tests/ops/legacy-blog-redirect-health.test.ts` | Reads every published post and page from the Content API. Fails when one no longer redirects, when a permalink stops being root-level, or when a Ghost path starts redirecting |

### Sitemap and robots.txt

`/sitemap.xml` ([`src/pages/sitemap.xml.ts`](https://github.com/bunizao/site/blob/main/src/pages/sitemap.xml.ts))
is the only sitemap. The build generates it at deploy time from the same
sources the pages render from:

- the fixed public sections (`/`, `/projects`, `/mood`, `/privacy`, `/blog`,
  `/blog/tags`, `/docs`, `/components`)
- every non-draft docs and components entry
- every listed blog article, in each indexed language form
- every public tag

The sitemap omits `priority` and `changefreq`, because Google ignores both. It
includes `lastmod` only where a real edit date exists, which today means blog
articles. The retired `@astrojs/sitemap` output (`/sitemap-index.xml`,
`/sitemap-0.xml`) permanently redirects here.

`public/robots.txt` disallows only paths that have no indexable HTML or sit
behind Cloudflare Access: `/api/`, `/v2/`, `/oauth`, and `/dev`. Anything else
that must stay out of results uses a `noindex` tag instead and stays
crawlable, so crawlers actually see the tag. AI crawlers are not singled out,
because the site's content is meant to be citable.

Direct-link-only articles are covered in
[Unlisted posts](/docs/writing/publishing#unlisted-posts): the exact Ghost
marker, and how the sitemap, feeds, search, Markdown, and crawlers treat them.

## Telegram Instant View

Blog articles have a Telegram Instant View template. Telegram hosts the
template, so nothing in this repo deploys it. The source is
`config/instant-view/buxx.me.iv`, and you publish it by hand at
[instantview.telegram.org](https://instantview.telegram.org/my).

Publishing returns an **rhash**. Until Telegram adopts the template for the
whole domain (Telegram decides if and when), only a link with `?rhash=<hash>`
renders as Instant View. The site no longer emits such a link. The article
share row offers copy-link and the native share sheet, and every URL the site
produces is clean. So the template applies only once Telegram adopts it
domain-wide, or to a link a reader builds by hand.

The template targets the article page's own class names and its `article:*`
meta tags. `tests/e2e/blog.pw.ts` pins that structure, so a rename fails CI
instead of degrading links already shared into chats.
`config/instant-view/README.md` has the publishing steps and the last rhash.

## Search favicons

The Blog keeps its thinking-woman favicon in browser chrome. Search engines
usually pick one favicon per hostname, so `/blog/*` can't reliably show a
different Google result favicon from other `buxx.me` paths. The Blog mark is
also the `BlogPosting.publisher.logo`, which is the standard place to state
publication identity in article metadata.
