---
title: Overview
description: What buxx.me is, the surfaces it exposes, and where each one is documented.
group: Start
order: 0
---

buxx.me is one Astro site deployed to Cloudflare Workers. It carries a handful of
distinct surfaces — a home page, a publication, a running mood feed, a component
register — and a small set of public endpoints that let other sites embed pieces
of it.

These docs cover the parts that are addressable from outside: what you can call,
what it returns, and what it costs you in caching. Anything about the internals
that does not change what a caller sees is deliberately absent.

## The surfaces

| Surface | Path | What it is |
| --- | --- | --- |
| Home | `/` | Profile, selected projects, recent writing, now-playing. |
| Blog | `/blog` | The publication 無人之境. Posts are authored in Ghost and rendered here. |
| Mood | `/mood` | A running short-form feed, mirrored from Telegram into a structured archive. |
| Components | `/components` | The interactive pieces this site is built from, each installable. |
| Docs | `/docs` | You are here. |

## What is callable

Three families of public endpoint, all under `buxx.me`:

- **[oEmbed and the mood widget](/docs/api/oembed)** — put a mood post, or the
  live feed, on someone else's page. Standard oEmbed discovery plus a plain
  `<iframe>` route if you would rather skip the protocol.
- **[SVG endpoints](/docs/api/svg)** — server-rendered badges and cards for
  GitHub READMEs and anywhere else that only accepts a static image.
- **[Feeds and machine-readable output](/docs/api/feeds)** — RSS, `llms.txt`,
  and Markdown content negotiation for anything reading the site programmatically.

None of them need a key. All of them are rate-limited and cached at the edge, so
read the cache notes before you point a poller at one.

## How the site is deployed

The public Worker (`site`) serves every route above. A second, private Worker
(`site-api`) owns the database, queues, crons, and admin surface; production
traffic to `buxx.me/api/*` routes straight to it. The split is a security
boundary, not a performance one — everything a visitor or an embedder touches
lives in the public half.

Writing follows its own path, from Ghost through a deploy hook — see
[Publishing](/docs/writing/publishing).
