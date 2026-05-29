---
title: Worker site
description: Where the Cloudflare worker ends and the Vercel app begins.
---

The site has two production runtimes: an Astro app on Vercel and Cloudflare workers. The split is deliberate.

## What runs where

**Cloudflare image worker** (`workers/telegram-image-proxy/`) owns:

- Telegram webhook durability.
- Image ingest from Telegram.
- R2 storage for HD images, including width variants.
- Public image reads (`/mood/:postId/:imageIndex`, `/channel/avatar`).

**Cloudflare scheduler worker** (`workers/notify-scheduler/`) owns:

- Periodic POSTs to `/api/notify/schedule` and `/api/notify/retry`, authenticated with `Bearer NOTIFY_CRON_SECRET`.
- A manual trigger guarded by `WORKER_MANUAL_TOKEN`.

**Astro/Vercel app** owns:

- Telegram content parsing and the mood pages.
- Subscriber state, email delivery via Resend, idempotency, retry logic.
- The admin portal under `/dev/portal/`.

The two never share a process. They talk over HTTP — secrets gate every internal call.

## Why the split

Cloudflare has the right primitives for ingest: queues for durable handoff, R2 for image storage, edge caching for public reads, and webhook listeners that survive Vercel cold starts. But Resend, GitHub OAuth, D1 over the HTTP API, and the React admin console are easier to write in the Astro app.

The split is "stuff Telegram talks to first" on Cloudflare; "stuff users talk to" on Vercel. Email never sends from a worker. The site never reads image bytes from Telegram.

## Notify path

1. Telegram POSTs `https://image.buxx.me/webhook`.
2. The worker validates, ingests images into R2, and enqueues a `telegram-notify-dispatch` queue message.
3. The queue consumer POSTs `/api/notify/dispatch` on Vercel with `NOTIFY_DISPATCH_SECRET`.
4. The site loads the post, resolves recipients, sends through Resend, records idempotency, and schedules retries on failure.

`/api/notify/dispatch` requires `NOTIFY_DISPATCH_SECRET`. `/api/notify/schedule` and `/api/notify/retry` accept either `CRON_SECRET` or `NOTIFY_DISPATCH_SECRET`. Subscribe intake is rate-limited and gated by Turnstile when configured. Confirm and unsubscribe are token-based GET flows.

## D1

The Vercel app reaches D1 over Cloudflare's HTTP API — there's no local binding in Astro. That's why the site needs `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_NOTIFY_D1_DATABASE_ID`.

## Failure behavior

- If the worker can't enqueue notify, it returns 503 to Telegram and Telegram retries.
- If image ingest fails but enqueue succeeds, the webhook still returns 200; the UI falls back to the Telegram CDN proxy.
- If the worker is down, the site can still scrape Telegram content, but HD image URLs may 404. Email links can't auto-fallback after delivery.
- Retry durability is site-owned via the `notify_retries` table.

## Related docs

- [Telegram ingestion](/docs/pipeline/telegram) — the full webhook flow and failure modes.
- [OAuth hub](/docs/infra/oauth-hub) — the auth boundary between human admins, sandboxes, and connectors.
