# Worker and Site

## Scope

This document explains the Cloudflare Worker target for:

- Astro site and API routes
- Telegram webhook ingress
- HD image storage and serving
- mood notification queue dispatch
- scheduled notify jobs

## Runtime Target

The target runtime is one Cloudflare Worker named `buxx-site`.

It serves:

- `buxx.me`
- `www.buxx.me`
- `image.buxx.me`

Main files:

- [`src/worker.ts`](../src/worker.ts)
- [`src/worker-tasks.ts`](../src/worker-tasks.ts)
- [`src/worker-routing.ts`](../src/worker-routing.ts)
- [`wrangler.jsonc`](../wrangler.jsonc)

`src/worker.ts` composes the Astro Cloudflare entrypoint with the existing Telegram image worker module. That keeps the deployed boundary small while preserving the image-ingest code path during migration.

The older standalone image worker and notify scheduler are rollback history until production cutover is verified. Do not describe them as the current production architecture.

## Responsibility Split Inside `buxx-site`

**Astro entrypoint** owns:

- public HTML routes
- API routes
- Telegram content parsing and mood pages
- subscriber state and email delivery through Resend
- idempotency and retry logic
- the admin portal under `/dev/portal/`

**Image worker module** owns:

- `POST https://image.buxx.me/webhook`
- `GET https://image.buxx.me/mood/:postId/:imageIndex`
- `GET https://image.buxx.me/channel/avatar`
- `POST https://image.buxx.me/ingest/...`
- R2 image reads and writes through `MOOD_IMAGES`

**Worker task handlers** own:

- `NOTIFY_DISPATCH_QUEUE` consumption
- Cloudflare Cron-triggered calls into `/api/notify/schedule`
- Cloudflare Cron-triggered calls into `/api/notify/retry`

Cloudflare Cron owns scheduled execution. The final cadence belongs in Cloudflare configuration and is not fixed by this document.

## Legacy Rollback Paths

`src/pages/api/telegram-webhook.ts` is a rollback-only endpoint for the older site-hosted Telegram webhook flow. It should stay documented as legacy until cleanup is explicitly approved.

The standalone worker directories also remain useful for rollback and test history:

- [`workers/telegram-image-proxy/`](../workers/telegram-image-proxy/)
- [`workers/notify-scheduler/`](../workers/notify-scheduler/)

They are not the Cloudflare-first runtime target.

## Site-Owned Mood Content

Core files:

- [`src/features/mood/server/telegram-source.ts`](../src/features/mood/server/telegram-source.ts)
- [`src/features/mood/shared/utils.ts`](../src/features/mood/shared/utils.ts)
- [`src/pages/api/moods.ts`](../src/pages/api/moods.ts)
- [`src/pages/mood.astro`](../src/pages/mood.astro)
- [`src/pages/mood/[id].astro`](../src/pages/mood/[id].astro)

Important boundary:

- the site still scrapes Telegram for post content
- the image worker code does not provide the canonical post body

What the site owns:

- feed and detail rendering
- post parsing and shaping
- related-link extraction
- comment scraping
- embed and RSS generation
- image fallback behavior through `/static/...`

## Notify Path

Core files:

- [`src/features/notify/server/service.ts`](../src/features/notify/server/service.ts)
- [`src/pages/api/notify/dispatch.ts`](../src/pages/api/notify/dispatch.ts)
- [`src/pages/api/notify/subscribe.ts`](../src/pages/api/notify/subscribe.ts)
- [`src/pages/api/notify/schedule.ts`](../src/pages/api/notify/schedule.ts)
- [`src/pages/api/notify/retry.ts`](../src/pages/api/notify/retry.ts)
- [`src/pages/api/notify/confirm.ts`](../src/pages/api/notify/confirm.ts)
- [`src/pages/api/notify/unsubscribe.ts`](../src/pages/api/notify/unsubscribe.ts)

Key rule:

- Worker code never sends email directly

Immediate delivery flow:

1. Telegram calls `https://image.buxx.me/webhook`.
2. The Worker ingests images and enqueues a notify job.
3. The queue consumer calls `/api/notify/dispatch` through the same Worker runtime.
4. The notify service loads the mood post, resolves recipients, sends email via Resend, records idempotency, and schedules retries when needed.

Notify service responsibilities:

- `requestMoodSubscription()` sends double opt-in mail and stores pending state
- `confirmMoodSubscription()` activates subscribers
- `unsubscribeMoodSubscription()` deactivates subscribers
- `dispatchMoodNotification()` handles immediate sends
- `dispatchScheduledMoodNotifications()` handles `every_5h` and `daily`
- `processNotifyRetries()` replays failed deliveries

## D1 and Internal Auth

Relevant files:

- [`src/features/notify/server/d1.ts`](../src/features/notify/server/d1.ts)
- [`src/features/notify/server/env.ts`](../src/features/notify/server/env.ts)
- [`src/features/notify/server/security.ts`](../src/features/notify/server/security.ts)

Storage target:

- `NOTIFY_DB` is the direct D1 binding for notify/admin state
- D1 HTTP API credentials are migration-era compatibility, not the preferred Cloudflare runtime path

Internal auth split:

- `/api/notify/dispatch` requires `NOTIFY_DISPATCH_SECRET`
- `/api/notify/schedule` accepts `CRON_SECRET` or `NOTIFY_DISPATCH_SECRET`
- `/api/notify/retry` accepts `CRON_SECRET` or `NOTIFY_DISPATCH_SECRET`
- subscribe intake is protected by rate limiting and optional Turnstile
- confirm and unsubscribe are token-based GET flows

## Bindings and Secrets

Direct bindings in [`wrangler.jsonc`](../wrangler.jsonc):

- `SESSION` KV binding for session storage
- `NOTIFY_DB` D1 binding for notify/admin state
- `MOOD_IMAGES` R2 binding for HD mood images
- `NOTIFY_DISPATCH_QUEUE` queue binding for immediate notification dispatch

Required runtime secrets and vars include:

- `RESEND_API_KEY`
- `NOTIFY_FROM_NAME`
- `NOTIFY_FROM_EMAIL`
- `NOTIFY_REPLY_TO_EMAIL`
- `EMAIL_NOTIFY_SECRET`
- `NOTIFY_DISPATCH_SECRET`
- `CRON_SECRET` or `NOTIFY_CRON_SECRET`
- `PUBLIC_SITE_URL`
- `PUBLIC_HD_IMAGE_URL`
- `HD_IMAGE_INGEST_BASE_URL`
- `HD_IMAGE_INGEST_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHANNEL_ID`
- `CHANNEL`
- `TELEGRAM_HOST`

## Failure Behavior

Important failure modes:

- if queue enqueue fails in the webhook, Telegram receives `503` and retries
- if image ingest fails but queue enqueue succeeds, webhook handling can still return success and the UI falls back to proxied Telegram media
- if image routes are unavailable, the site can still scrape Telegram content, but HD image URLs may fail
- retry durability is notify-service owned through `notify_retries`

## Existing Docs vs This Doc

Existing pipeline docs cover operations:

- [`docs/TELEGRAM-PIPELINE.md`](./TELEGRAM-PIPELINE.md)
- [`docs/EMAIL-NOTIFY.md`](./EMAIL-NOTIFY.md)

This document is narrower:

- it names the `buxx-site` runtime target
- it makes the Worker-internal ownership split explicit
- it documents endpoint auth, bindings, and rollback roles in one place
