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

Pages that sit under a section — `/docs/*` and `/components/*` — emit a
`BreadcrumbList` that mirrors their visible breadcrumb (`buxx.me › Docs ›
Title`). `breadcrumbJsonLd` in `src/lib/seo.ts` builds it from canonical
paths; pass the result through the `structuredData` prop of `Layout.astro`.

## Indexing

- Public page URLs are extensionless and have no trailing slash. `/` is the only
  natural exception. Alternate slash forms receive a permanent `308`, while
  canonical tags, sitemaps, feeds, and internal links emit the slashless form.
- Every page declares `https://buxx.me` as its canonical origin regardless of
  the host it was rendered on, so `www.buxx.me` and Worker preview hosts
  consolidate onto the apex rather than competing with it.
- `/mood` is indexable.
- `/mood/[id]` emits `noindex, follow` so crawlers can discover the directive
  without the detail archive crowding out editorial results.
- Blog indexes, tags, and articles remain indexable and canonical under
  `https://buxx.me/blog`.
- Dev harnesses (`/lab/*`), component preview frames (`/components/preview/*`),
  the safe-area probe, the mood embed, the reader and subscription flows, and
  the portal all carry `noindex`. `tests/unit/seo-policy.test.ts` pins the
  list, so a new harness that forgets the tag fails CI.

### Sitemap and robots.txt

`/sitemap.xml` ([`src/pages/sitemap.xml.ts`](https://github.com/bunizao/site/blob/main/src/pages/sitemap.xml.ts))
is the only sitemap. It is built at deploy time from the same sources the
pages render from: the fixed public sections (`/`, `/projects`, `/mood`,
`/privacy`, `/blog`, `/blog/tags`, `/docs`, `/components`), every non-draft
docs and components entry, every listed blog article in each indexed language
form, and every public tag. It omits `priority` and `changefreq` — Google
ignores both — and carries `lastmod` only where a real edit date exists, which
today means blog articles. The retired `@astrojs/sitemap` output
(`/sitemap-index.xml`, `/sitemap-0.xml`) permanently redirects here.

`public/robots.txt` disallows only surfaces that have no indexable HTML or sit
behind Cloudflare Access: `/api/`, `/v2/`, `/oauth`, and `/dev`. Everything
that must stay out of results uses a `noindex` tag instead, and stays
crawlable so the directive is actually seen. AI crawlers are not singled out;
the site's content is meant to be citable.

For direct-link-only articles, see [Unlisted posts](/docs/writing/publishing#unlisted-posts).
That page documents the exact Ghost marker and the corresponding sitemap, feed,
search, Markdown, and crawler behavior.

## Telegram Instant View

Blog articles carry a Telegram Instant View template. Telegram hosts the
template itself, so nothing in this repo deploys it: the source lives in
`config/instant-view/buxx.me.iv`, and publishing is a manual step at
[instantview.telegram.org](https://instantview.telegram.org/my).

Publishing returns an **rhash**. Until Telegram adopts a template for the whole
domain — their decision, on their timetable — only a link carrying
`?rhash=<hash>` renders as Instant View, so the hash is the feature rather than
an optimisation. It is set in `blog.instantView.rhash` (`src/data/site.ts`) and
applied in exactly one place: the Telegram button in the article share row.
Canonical tags, `og:url`, feeds, the copy-link button and the native share sheet
all stay clean, because `rhash` means nothing outside Telegram. An empty hash —
the state before a template is published — leaves every link untouched and the
share button still works, just without Instant View.

The template addresses the article page's own class names and the `article:*`
meta tags above. `tests/e2e/blog.pw.ts` pins that structure so a rename fails
CI rather than quietly degrading links already shared into chats;
`config/instant-view/README.md` has the publishing loop.

## Search Favicons

The Blog keeps its thinking-woman favicon in browser chrome. Search engines
normally choose one favicon per hostname, so `/blog/*` cannot reliably show a
different Google result favicon from other `buxx.me` paths. The Blog mark is
also supplied as the `BlogPosting.publisher.logo`, which is the standard place
to express publication identity for article metadata.
