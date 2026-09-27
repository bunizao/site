---
title: Overview
description: What buxx.me is, what you can embed or call from it, and where each part is documented.
group: Start
order: 0
---

buxx.me is a personal site: one Astro site deployed to Cloudflare Workers. It has
a home page, a blog, a short-form mood feed and a component register. A few
public endpoints let other sites embed parts of it.

These docs cover what you can reach from outside: what you can call, what it
returns, and how it is cached. Internals that don't change what a caller sees
are left out.

## Where to start

| If you want to | Read |
| --- | --- |
| Embed a mood post or call a public endpoint | [API overview](/docs/api/overview) |
| Run the site on your machine | [Local development](/docs/development) |
| See which Worker serves what, and how caching works | [Architecture](/docs/architecture) |
| Write or publish a blog post | [How a post is built](/docs/writing/overview) |

## Surfaces

A surface is a top-level section of the site with its own path.

| Surface | Path | What it is |
| --- | --- | --- |
| Home | `/` | Profile, selected projects, recent writing, now-playing. |
| Blog | `/blog` | The publication 無人之境. Posts are written in Ghost and rendered here. |
| Mood | `/mood` | A running short-form feed, mirrored from Telegram into a structured archive. |
| Components | `/components` | The interactive pieces this site is built from. Each one is installable. |
| Docs | `/docs` | You are here. |

## Public endpoints

There are three groups of public endpoint, all on `buxx.me`:

- **[oEmbed and the mood widget](/docs/api/oembed)**: put a mood post, or the
  live feed, on another page. Use standard oEmbed discovery, or a plain
  `<iframe>` route if you'd rather skip the protocol.
- **[SVG endpoints](/docs/api/svg)**: server-rendered badges and cards for
  GitHub READMEs and anywhere else that only accepts a static image.
- **[Feeds and machine-readable output](/docs/api/feeds)**: RSS, `llms.txt`,
  and Markdown content negotiation for programs that read the site.

None of them need a key. All of them are rate-limited and cached at the edge, so
read the cache notes before you point a poller at one.

## Deployment

Two Workers serve buxx.me:

| Worker | Visibility | What it does |
| --- | --- | --- |
| `site` | Public | Serves every route above. |
| `site-api` | Private | Owns the database, queues, crons and the admin surface. Production traffic to `buxx.me/api/*` goes straight to it. |

The split is a security boundary. Everything a visitor or an embedder touches
lives in the public half.

Blog posts take their own path, from Ghost through a deploy hook. See
[Publishing](/docs/writing/publishing).
