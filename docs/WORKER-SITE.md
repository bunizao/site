# Worker and Site

## Scope

This document explains how the Astro/Vercel app and Cloudflare workers collaborate for:

- Telegram webhook ingress
- HD image storage and serving
- mood notification dispatch
- scheduled notify jobs

## Responsibility Split

The system is intentionally split:

- Cloudflare image worker owns webhook durability, image ingest, R2 storage, and public image reads.
- Astro/Vercel app owns Telegram content parsing, public mood pages, subscriber state, email delivery, idempotency, and retry logic.
- Scheduler worker owns periodic calls into the notify APIs.

## Cloudflare Image Worker

Main files:

- [`workers/telegram-image-proxy/src/index.ts`](../workers/telegram-image-proxy/src/index.ts)
- [`workers/telegram-image-proxy/wrangler.toml`](../workers/telegram-image-proxy/wrangler.toml)

Primary production ingress:

- `POST https://image.buxx.me/webhook`

Responsibilities:

- validate `X-Telegram-Bot-Api-Secret-Token`
- parse `channel_post`
- resolve media-group image indexes
- fetch avatar and mood image bytes from Telegram
- write originals and width variants into R2
- enqueue immediate notify jobs

Public read endpoints:

- `GET /mood/:postId/:imageIndex`
- `GET /channel/avatar`

Read behavior:

- reads from R2
- selects the closest pre-generated width variant
- caches at the edge
- returns `404` on miss

## Astro/Vercel Fallback Webhook

File: [`src/pages/api/telegram-webhook.ts`](../src/pages/api/telegram-webhook.ts)

Role:

- rollback path for the older Vercel-owned webhook flow

Behavior:

- validates the Telegram secret
- resolves media-group indexing
- calls worker ingest routes with `HD_IMAGE_INGEST_TOKEN`
- refreshes the channel avatar
- triggers `dispatchMoodNotification()` inside the site app

This route is not the preferred production path.

## Site-Owned Mood Content

Core files:

- [`src/lib/telegram.ts`](../src/lib/telegram.ts)
- [`src/lib/mood-utils.ts`](../src/lib/mood-utils.ts)
- [`src/pages/api/moods.ts`](../src/pages/api/moods.ts)
- [`src/pages/mood.astro`](../src/pages/mood.astro)
- [`src/pages/mood/[id].astro`](../src/pages/mood/[id].astro)

Important boundary:

- the site still scrapes Telegram for post content
- workers do not provide the canonical post body

What the site owns:

- feed and detail rendering
- post parsing and shaping
- related-link extraction
- comment scraping
- embed and RSS generation
- image fallback behavior through `/static/...`

## Notify Path

Core files:

- [`src/lib/notify/service.ts`](../src/lib/notify/service.ts)
- [`src/pages/api/notify/dispatch.ts`](../src/pages/api/notify/dispatch.ts)
- [`src/pages/api/notify/subscribe.ts`](../src/pages/api/notify/subscribe.ts)
- [`src/pages/api/notify/schedule.ts`](../src/pages/api/notify/schedule.ts)
- [`src/pages/api/notify/retry.ts`](../src/pages/api/notify/retry.ts)
- [`src/pages/api/notify/confirm.ts`](../src/pages/api/notify/confirm.ts)
- [`src/pages/api/notify/unsubscribe.ts`](../src/pages/api/notify/unsubscribe.ts)

Key rule:

- workers never send email directly

Immediate delivery flow:

1. Telegram calls the image worker webhook.
2. The worker ingests images and enqueues a notify job.
3. The queue consumer calls `POST /api/notify/dispatch`.
4. The site app loads the mood post, resolves recipients, sends email via Resend, records idempotency, and schedules retries when needed.

Notify service responsibilities:

- `requestMoodSubscription()` sends double opt-in mail and stores pending state
- `confirmMoodSubscription()` activates subscribers
- `unsubscribeMoodSubscription()` deactivates subscribers
- `dispatchMoodNotification()` handles immediate sends
- `dispatchScheduledMoodNotifications()` handles `every_5h` and `daily`
- `processNotifyRetries()` replays failed deliveries

## D1 and Internal Auth

Relevant files:

- [`src/lib/notify/d1.ts`](../src/lib/notify/d1.ts)
- [`src/lib/notify/env.ts`](../src/lib/notify/env.ts)
- [`src/lib/notify/security.ts`](../src/lib/notify/security.ts)

Storage model:

- the Vercel app talks to Cloudflare D1 over Cloudflare's HTTP API
- there is no local D1 binding inside the Astro app

This is why the site requires:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_NOTIFY_D1_DATABASE_ID`

Internal auth split:

- `/api/notify/dispatch` requires `NOTIFY_DISPATCH_SECRET`
- `/api/notify/schedule` accepts `CRON_SECRET` or `NOTIFY_DISPATCH_SECRET`
- `/api/notify/retry` accepts `CRON_SECRET` or `NOTIFY_DISPATCH_SECRET`
- subscribe intake is protected by rate limiting and optional Turnstile
- confirm and unsubscribe are token-based GET flows

## Scheduler Worker

Main files:

- [`workers/notify-scheduler/src/index.ts`](../workers/notify-scheduler/src/index.ts)
- [`workers/notify-scheduler/wrangler.toml`](../workers/notify-scheduler/wrangler.toml)

Role:

- primary scheduler for non-immediate notify work

Behavior:

- every scheduled run posts to:
  - `/api/notify/schedule`
  - `/api/notify/retry`
- authenticated with `Authorization: Bearer <NOTIFY_CRON_SECRET>`
- also exposes a manual trigger guarded by `WORKER_MANUAL_TOKEN`

## Environment Boundary

Cloudflare image worker needs:

- `TELEGRAM_BOT_TOKEN`
- `HD_IMAGE_INGEST_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `NOTIFY_DISPATCH_SECRET`
- `NOTIFY_DISPATCH_URL`
- `CHANNEL`
- `TELEGRAM_CHANNEL_ID`
- `TELEGRAM_HOST`
- `MOOD_IMAGES` R2 binding
- `NOTIFY_DISPATCH_QUEUE` queue binding

Astro/Vercel site needs:

- `RESEND_API_KEY`
- `NOTIFY_FROM_NAME`
- `NOTIFY_FROM_EMAIL`
- `NOTIFY_REPLY_TO_EMAIL`
- `EMAIL_NOTIFY_SECRET`
- `NOTIFY_DISPATCH_SECRET`
- `CRON_SECRET`
- `PUBLIC_SITE_URL`
- `PUBLIC_HD_IMAGE_URL`
- `HD_IMAGE_INGEST_BASE_URL`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_NOTIFY_D1_DATABASE_ID`

Telegram env vars are also still needed on the site if the fallback webhook stays enabled.

## Fallback and Failure Behavior

Important failure modes:

- if queue enqueue fails in the worker webhook, Telegram receives `503` and retries
- if image ingest fails but queue enqueue succeeds, webhook handling can still return success and the UI falls back to proxied Telegram media
- if the worker is unavailable, the site can still scrape Telegram content, but HD image URLs may fail
- retry durability is site-owned through `notify_retries`

## Existing Docs vs This Doc

Existing pipeline docs already cover operations well:

- [`docs/TELEGRAM-PIPELINE.md`](./TELEGRAM-PIPELINE.md)
- [`docs/EMAIL-NOTIFY.md`](./EMAIL-NOTIFY.md)

This document is narrower:

- it focuses on code ownership boundaries
- it makes the worker-vs-site split explicit
- it documents endpoint auth and fallback roles in one place
