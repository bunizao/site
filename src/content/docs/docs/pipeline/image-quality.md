---
title: Image quality
description: How HD mood images move from Telegram into R2 and back out to readers.
internal: true
---

Mood photos are served through a Cloudflare Worker to improve image quality and cache results at the edge. The canonical reference for the worker itself is `workers/telegram-image-proxy/README.md`; this page covers the boundary with the site.

## Why a worker

Telegram CDN URLs work, but their image quality, caching headers, and uptime are out of our control. Putting a worker in front lets us:

- Pull the largest available photo file from Telegram once and store it in R2.
- Pre-generate width variants so feed scrolling doesn't redownload full-size images.
- Cache reads at the Cloudflare edge.
- Serve a stable URL shape (`/mood/:postId/:imageIndex`) that doesn't churn when Telegram changes its CDN.

## Read path

The site embeds `https://image.buxx.me/mood/:postId/:imageIndex` in feed payloads, mood detail HTML, and email image links. The worker selects the closest pre-generated width variant for each request and caches at the edge. Cache miss → R2 read → edge cache populated.

If the worker URL returns 404, the browser falls back to the Telegram CDN through the site's `/static/...` proxy. Email links can't auto-fallback after delivery — so a worker outage during email send means broken HD URLs in delivered mail.

## Write path

Three ways images land in R2:

- **Webhook ingest** — `POST https://image.buxx.me/webhook` validates the Telegram secret, parses `channel_post`, fetches photo bytes, writes original + variants. The primary path.
- **Authenticated backfill** — `POST https://image.buxx.me/ingest/...` with `HD_IMAGE_INGEST_TOKEN`. Used by the legacy webhook fallback and any scripted backfill.
- **Avatar refresh** — `POST https://image.buxx.me/ingest/channel/avatar` to refresh `https://image.buxx.me/channel/avatar`.

## Site contract

The site reaches into the worker through these env vars:

- `PUBLIC_HD_IMAGE_URL` — base URL the site embeds in payloads (read).
- `HD_IMAGE_INGEST_BASE_URL` — internal base URL for ingest calls (write).
- `HD_IMAGE_INGEST_TOKEN` — bearer token for `/ingest/*`.

`PUBLIC_HD_IMAGE_URL` and `HD_IMAGE_INGEST_BASE_URL` may differ when the public domain has extra Cloudflare protections that block server-to-server writes — keep ingest hitting the worker's `*.workers.dev` (or `image-internal.buxx.me`) directly while reads go through the public domain.

## Failure handling

When R2 returns no object for a requested key, the worker returns 404. The site's mood card renderer has a one-shot fallback: if the HD URL fails, swap to `data-fallback-src` (Telegram CDN through `/static/`). For email, there's no fallback after send — Ops Health watches for fresh HD URLs and surfaces ingest failures.
