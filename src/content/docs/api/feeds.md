---
title: Feeds & Machine Output
description: RSS feeds, llms.txt, the sitemap, and Markdown versions of pages for anything reading the site in code.
group: API
order: 6
---

You can read every long-form page on this site without a browser. Subscribe
through RSS, fetch a page as Markdown, or start from `llms.txt`. The sitemap
lists every indexable page.

## RSS

| Feed | Path | Contents | Rendering |
| --- | --- | --- | --- |
| Blog | `/blog/rss.xml` | Full posts from 無人之境, newest first. | Prerendered at build time |
| Mood | `/mood/rss.xml` | The short-form feed, newest 50 items. | Rendered per request |

Both feeds are `application/rss+xml`, but they are built differently. That
matters if you poll them.

`/blog/rss.xml` is a static file generated at build time. It only changes when
the site deploys, so polling it more often than that wastes requests.

`/mood/rss.xml` is rendered on every request from the D1 archive and capped at
50 items. It sends `Cache-Control: public, max-age=0, s-maxage=300`: no browser
caching, and five minutes at the Cloudflare edge. A new mood shows up within
about five minutes, with no deploy. A failure returns a plain-text `500`
instead of an empty feed, so a reader keeps its last good copy and your
subscription does not silently empty.

## Markdown pages

Append `/index.md` to a supported page URL to get Markdown. No special request
header is needed:

```bash
curl https://buxx.me/docs/writing/poem/index.md
curl https://buxx.me/blog/index.md
```

The shorter `<page>.md` form permanently redirects to the `/index.md` URL:
`/docs/writing/authors.md` becomes `/docs/writing/authors/index.md`.

Content negotiation also works. Send `Accept: text/markdown` to the canonical
page URL and it returns the same Markdown instead of HTML:

```bash
curl -H 'Accept: text/markdown' https://buxx.me/blog
curl -H 'Accept: text/markdown' https://buxx.me/mood
```

Pages with a Markdown version advertise its `/index.md` URL in their `<head>`,
so agents and crawlers can find it:

```html
<link rel="alternate" type="text/markdown" href="https://buxx.me/blog/index.md" />
```

Supported pages:

| Path | Returns |
| --- | --- |
| `/` | Profile, projects, recent posts. |
| `/blog` | The post index. |
| `/blog/{slug}` | One post, in full. |
| `/blog/tags`, `/blog/tag/{slug}` | Tag directory and tag archives. |
| `/mood` | The feed, paginated by cursor. |
| `/mood/{id}` | One mood post. |
| `/privacy` | The privacy policy. |
| `/docs`, `/docs/{path}` | The documentation index and source content. |

Every page under `/docs` also has a **Copy page** control beside its
breadcrumb. It fetches the page's `/index.md` and copies it to the clipboard.
The menu next to it opens the same URL in a tab for reading.

Responses include an `x-markdown-tokens` header with an approximate token count
of the body, so a client can budget before it reads.

Any other page falls through to HTML. Header negotiation respects quality
values: `Accept: text/html, text/markdown;q=0.9` gets you HTML.

## llms.txt

```
GET /llms.txt
```

A Markdown map of the site that follows the [llms.txt](https://llmstxt.org/)
convention: a title, a one-line summary, then sections of links, each with a
short note on why a model would open it. It is generated from the same site
data the pages render from, so it stays in sync with them.

Use it as the entry point. Read `llms.txt`, pick a URL, then append `/index.md`
or fetch the canonical URL with `Accept: text/markdown`.

## Sitemap

```
GET /sitemap.xml
```

The only sitemap. It lists every indexable public page:

- the fixed sections
- each docs and components entry
- every listed blog article, in each indexed language form
- every public tag

It skips anything `noindex`: mood detail pages, previews, embeds, dev
harnesses, and API endpoints. The retired `/sitemap-index.xml` and
`/sitemap-0.xml` redirect here. [SEO and metadata](/docs/platform/seo#sitemap-and-robotstxt)
covers the policy and what goes into it.
