---
title: Worker site
description: How the Cloudflare Worker target owns the site, image routes, queues, and scheduled notify tasks.
public: true
---

The target runtime is one Cloudflare Worker named `site`. It serves `buxx.me`, `www.buxx.me`, and `image.buxx.me`.

## Ghost Publishing Hook

The Writing section is prerendered from Ghost during the Cloudflare build. Ghost post changes need a fresh Cloudflare build before they appear on `buxx.me`.

Configure Ghost's `Post published` webhook to `POST` the Cloudflare Workers Builds deploy hook for the production branch. The old Vercel deploy hook should be removed because it only rebuilds the previous Vercel deployment.

`GHOST_URL` and `GHOST_CONTENT_APIKEY` must be present in the Cloudflare build environment, not only as Worker runtime secrets.

## What runs where

`src/worker.ts` composes three pieces inside the same Worker boundary:

- Astro's Cloudflare entrypoint for public pages, API routes, and the admin portal.
- The existing Telegram image worker module for webhook, ingest, and public image routes.
- Worker task handlers for queue consumption and Cloudflare Cron-triggered notify work.

The older standalone image worker and notify scheduler remain rollback history until production cutover is verified. They are not the Cloudflare-first runtime target.

## Image routes

The image worker module owns:

- `POST https://image.buxx.me/webhook`
- `GET https://image.buxx.me/mood/:postId/:imageIndex`
- `GET https://image.buxx.me/channel/avatar`
- `POST https://image.buxx.me/ingest/...`

It validates Telegram webhook requests, resolves media-group image indexes, writes images and width variants into R2 through `MOOD_IMAGES`, and serves cached public reads.

`/api/telegram-webhook` is rollback-only for the older site-hosted webhook flow.

## Notify path

1. Telegram POSTs `https://image.buxx.me/webhook`.
2. The Worker validates, ingests images into R2, and enqueues a notify job.
3. The queue consumer calls `/api/notify/dispatch` through the same Worker runtime.
4. The notify service loads the post, resolves recipients, sends through Resend, records idempotency, and schedules retries on failure.

`/api/notify/dispatch` requires `NOTIFY_DISPATCH_SECRET`. `/api/notify/schedule` and `/api/notify/retry` accept either `CRON_SECRET` or `NOTIFY_DISPATCH_SECRET`. Subscribe intake is rate-limited and gated by Turnstile when configured. Confirm and unsubscribe are token-based GET flows.

Cloudflare Cron owns scheduled notify and retry execution every 15 minutes.

## D1 and bindings

The Cloudflare runtime target uses direct bindings from `wrangler.jsonc`:

- `SESSION` for session storage.
- `NOTIFY_DB` for notify/admin state.
- `MOOD_IMAGES` for HD mood images.
- `NOTIFY_DISPATCH_QUEUE` for immediate notification dispatch.

D1 HTTP API credentials are migration-era compatibility, not the preferred Cloudflare runtime path.

## Failure behavior

- If the Worker can't enqueue notify, it returns 503 to Telegram and Telegram retries.
- If image ingest fails but enqueue succeeds, the webhook can still return 200; the UI falls back to the Telegram CDN proxy.
- If image routes are unavailable, the site can still scrape Telegram content, but HD image URLs may 404. Email links can't auto-fallback after delivery.
- Retry durability is notify-service owned via the `notify_retries` table.

## Related docs

- [Telegram ingestion](/docs/pipeline/telegram) — the full webhook flow and failure modes.
- [OAuth hub](/docs/infra/oauth-hub) — the auth boundary between human admins, sandboxes, and connectors.
