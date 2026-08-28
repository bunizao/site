---
title: Feeds & Machine Output
description: RSS, llms.txt, sitemaps, and Markdown content negotiation for anything reading the site programmatically.
group: API
order: 6
---

Every long-form surface on this site is readable without a browser. There are
three ways in, in rough order of how much you care about presentation.

## RSS

| Feed | Path | Contents | Rendering |
| --- | --- | --- | --- |
| Blog | `/blog/rss.xml` | Full posts from 無人之境, newest first. | Prerendered at build time |
| Mood | `/mood/rss.xml` | The short-form feed, newest 50 items. | Rendered per request |

Both are `application/rss+xml`, but they are not built the same way and it
matters if you poll them.

`/blog/rss.xml` is a static asset baked at build time. Its contents change only
on deploy, so polling it more often than the site ships is pure waste.

`/mood/rss.xml` is server-rendered on every request against the D1 archive and
capped at 50 items. It answers `Cache-Control: public, max-age=0, s-maxage=300`
— no browser caching, five minutes at the Cloudflare edge — so a new mood shows
up within about five minutes without a deploy. A failure renders as a plain-text
`500` rather than an empty feed, so a reader keeps the last good copy instead of
silently emptying your subscription.

## Markdown pages

Append `/index.md` to a supported page URL and it returns Markdown directly,
without requiring a special request header. Pages advertise this explicit URL
in their `<head>`, so agents and crawlers can discover it:

```bash
curl https://buxx.me/docs/writing/poem/index.md
curl https://buxx.me/blog/index.md
```

The shorter `<page>.md` form permanently redirects to the explicit alternate:
`/docs/writing/authors.md` becomes `/docs/writing/authors/index.md`.

Content negotiation remains available. Send `Accept: text/markdown` to the
canonical page URL and it returns the same Markdown instead of HTML:

```bash
curl -H 'Accept: text/markdown' https://buxx.me/blog
curl -H 'Accept: text/markdown' https://buxx.me/mood
```

Pages that carry a Markdown representation advertise it in their `<head>`:

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

Every page under `/docs` also carries a **Copy page** control beside its
breadcrumb. It fetches that page's `/index.md` and writes it to the clipboard;
the menu beside it opens the same URL in a tab for reading.

Responses carry an `x-markdown-tokens` header with an approximate token count of
the body, so a client can budget before it reads.

Anything else falls through to HTML. Header negotiation is strict about quality values:
`Accept: text/html, text/markdown;q=0.9` gets you HTML, as it should.

## llms.txt

```
GET /llms.txt
```

A Markdown map of the site following the [llms.txt](https://llmstxt.org/)
convention — a title, a one-line summary, then link sections with a short note on
why a model would open each one. It is generated from the same site data the
pages render from, so it does not drift.

Use it as the entry point: read `llms.txt`, pick a URL, then append `/index.md`
or fetch the canonical URL with `Accept: text/markdown`.

## Sitemap

```
GET /sitemap.xml
```

Standard sitemap index. Deliberately narrow — it lists the canonical public pages
and skips preview routes, embeds, and API endpoints.
