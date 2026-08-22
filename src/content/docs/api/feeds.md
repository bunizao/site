---
title: Feeds & Machine Output
description: RSS, llms.txt, sitemaps, and Markdown content negotiation for anything reading the site programmatically.
group: API
order: 2
---

Every long-form surface on this site is readable without a browser. There are
three ways in, in rough order of how much you care about presentation.

## RSS

| Feed | Path | Contents |
| --- | --- | --- |
| Blog | `/blog/rss.xml` | Full posts from 無人之境, newest first. |
| Mood | `/mood/rss.xml` | The short-form feed. |

Both are `application/rss+xml` and prerendered at build time, so they are static
assets served from the edge. The blog feed changes only on deploy; the mood feed
is rebuilt on its own cadence.

## Markdown content negotiation

Send `Accept: text/markdown` to a page URL and you get Markdown back instead of
HTML — the same content, minus the layout, navigation, and scripts. This is meant
for language models and scrapers that would otherwise burn tokens parsing a
rendered page.

```bash
curl -H 'Accept: text/markdown' https://buxx.me/blog
curl -H 'Accept: text/markdown' https://buxx.me/mood
```

Pages that carry a Markdown representation advertise it in their `<head>`:

```html
<link rel="alternate" type="text/markdown" href="https://buxx.me/blog" />
```

Currently negotiable:

| Path | Returns |
| --- | --- |
| `/` | Profile, projects, recent posts. |
| `/blog` | The post index. |
| `/blog/{slug}` | One post, in full. |
| `/blog/tags`, `/blog/tag/{slug}` | Tag directory and tag archives. |
| `/mood` | The feed, paginated by cursor. |
| `/mood/{id}` | One mood post. |
| `/privacy` | The privacy policy. |

Responses carry an `x-markdown-tokens` header with an approximate token count of
the body, so a client can budget before it reads.

Anything else falls through to HTML. Negotiation is strict about quality values:
`Accept: text/html, text/markdown;q=0.9` gets you HTML, as it should.

## llms.txt

```
GET /llms.txt
```

A Markdown map of the site following the [llms.txt](https://llmstxt.org/)
convention — a title, a one-line summary, then link sections with a short note on
why a model would open each one. It is generated from the same site data the
pages render from, so it does not drift.

Use it as the entry point: read `llms.txt`, pick a URL, then fetch that URL with
`Accept: text/markdown`.

## Sitemap

```
GET /sitemap.xml
```

Standard sitemap index. Deliberately narrow — it lists the canonical public pages
and skips preview routes, embeds, and API endpoints.
