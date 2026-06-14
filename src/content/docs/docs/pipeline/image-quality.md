---
title: Image quality
description: How HD mood images move from Telegram into R2 and back out to readers.
internal: true
---

Mood photos are served through the private `site-api` Worker to improve image quality and cache results at the edge. This page covers the boundary with the public site.

## Why a worker

Telegram CDN URLs work, but their image quality, caching headers, and uptime are out of our control. Putting a worker in front lets us:

- Pull the largest available photo file from Telegram once and store it in R2.
- Pre-generate width variants so feed scrolling doesn't redownload full-size images.
- Cache reads at the Cloudflare edge.
- Serve a stable URL shape (`/mood/:postId/:imageIndex`) that doesn't churn when Telegram changes its CDN.

## Read path

The site embeds `PUBLIC_HD_IMAGE_URL` image links in feed payloads and mood detail HTML. The private image worker selects the closest pre-generated width variant for each request and caches at the edge. Cache miss -> R2 read -> edge cache populated.

If the worker URL returns 404, the browser falls back to the Telegram CDN through the site's `/static/...` proxy. Email links can't auto-fallback after delivery — so a worker outage during email send means broken HD URLs in delivered mail.

## Write path

Three ways images land in R2:

- **Webhook ingest** — `POST https://api.buxx.me/v2/telegram/webhook` validates the Telegram secret, parses `channel_post`, fetches photo bytes, writes original + variants.
- **Authenticated backfill** — private `/v2/images/*` write paths with `HD_IMAGE_INGEST_TOKEN` when enabled.
- **Avatar refresh** — private image refresh routes update the channel avatar object.

## Site contract

The public site reads the image base through:

- `PUBLIC_HD_IMAGE_URL` — base URL the site embeds in payloads (read).

Write-side ingest configuration belongs to `site-api`.

## Failure handling

When R2 returns no object for a requested key, the worker returns 404. The site's mood card renderer has a one-shot fallback: if the HD URL fails, swap to `data-fallback-src` (Telegram CDN through `/static/`). For email, there's no fallback after send — Ops Health watches for fresh HD URLs and surfaces ingest failures.
