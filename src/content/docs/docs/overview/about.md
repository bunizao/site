---
title: About this site
description: What buxx.me is, how it is built, and how these docs are organized.
public: true
---

buxx.me is a personal site with a small set of deliberately public surfaces: a home page, a Telegram-backed mood feed, embeddable SVG/oEmbed endpoints, and a private admin portal. The public site is the part readers see. The private worker is where ingestion, admin APIs, notifications, and durable operational state live.

These docs are the maintainer map for that split. They explain what each surface owns, which worker is responsible for each route, which source of truth backs the data, and which pages are safe to expose publicly.

## How the site is shaped

- **Public site** — Astro, React where it earns its keep, TailwindCSS, Starlight docs, and Cloudflare Workers runtime.
- **Private API** — the sibling `site-api` Worker, which owns D1, KV, R2, queues, cron jobs, admin APIs, Telegram webhook ingest, image processing, and notification dispatch.
- **Content sources** — Ghost for writing, Last.fm/iTunes for listening, GitHub for project/activity data, Telegram for mood posts, and Better Stack for status.
- **Embeds** — SVG and oEmbed routes that make selected parts of the site portable without exposing private implementation details.

## How these docs are organized

Start with [Architecture](/docs/overview/architecture) for the system map. Then jump by surface:

- [Home](/docs/surfaces/home) covers the landing page sections and their data paths.
- [Mood feed](/docs/surfaces/mood-feed) covers feed/detail rendering, comments, embeds, RSS, and the live-v1/archive-v2 taxonomy.
- [Telegram ingestion](/docs/pipeline/telegram) covers the private webhook and image pipeline.
- [Worker site](/docs/infra/worker-site) covers Cloudflare deployment boundaries.
- [OAuth hub](/docs/infra/oauth-hub) covers admin identity and future machine credential exchange.

## Visibility model

Pages with `public: true` in frontmatter render without authentication. Everything else stays behind the admin identity gate and gets a protected badge in the page body. The sidebar does not split public and protected pages because the information architecture should describe the system, not the permissions implementation.

The source repository still contains the Markdown. If raw source visibility matters, the repository visibility is the control plane. Deployed docs visibility only controls what the site serves at runtime.
