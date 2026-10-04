---
title: Overview
description: What buxx.me is, what you can embed or call from it, and where each part is documented.
group: Start
order: 0
---

buxx.me is a personal site: one Astro site deployed to Cloudflare Workers. It has
a home page, a blog, a short-form mood feed and a component register. A few
public endpoints let other sites embed parts of it.

These docs cover the public API (what you can call, what it returns, and how it
is cached), how to write a post, and how the site and its two Workers are
built. Two things are left out. Admin, webhook and cron routes, and the
moderation internals (the comment risk stack, its thresholds and the ban
tooling), are internal pages of this same reference. They are encrypted in the
public repository and locked in place: the sidebar lists them with a lock, and
only the owner can open them. Internal request and response shapes stay in the
private `site-api` repository.

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
| `site` | Public | Renders the pages and static assets: the surfaces above, the `/mood/embed` widget, the feeds and `/logo/{id}.svg`. |
| `site-api` | Private | Answers every request under `buxx.me/api/*`, including `/api/oembed.json`, the mood JSON and the `/api/*.svg` badges. Production traffic to `buxx.me/api/*` goes straight to it. It also runs OAuth and the admin surface, and owns the database, queues and crons. |

The split is a security boundary. The database, queues, crons and admin routes
live only in `site-api`, and the public `site` Worker talks to it through the
`API` service binding. If you call anything under `/api/`, `site-api` answers.

Blog posts take their own path, from Ghost through a deploy hook. See
[Publishing](/docs/writing/publishing).
