# Email Notify (Resend)

This document describes how mood email notifications are deployed with Resend.

## Overview

The implementation uses:

- `POST /api/notify/subscribe` for subscription requests (double opt-in)
- `GET /api/notify/confirm` for subscription confirmation
- `GET /api/notify/unsubscribe` for one-click unsubscribe
- `POST /api/notify/dispatch` for manual per-post dispatch
- `GET/POST /api/notify/schedule` for scheduled delivery modes (`every_5h`, `daily`)
- `GET/POST /api/notify/retry` for retrying failed deliveries
- `POST https://image.buxx.me/webhook` for automatic real-time dispatch on new mood posts (`immediate` mode)

Related references:

- [`docs/TELEGRAM-PIPELINE.md`](./TELEGRAM-PIPELINE.md)
- [`docs/debug/README.md`](./debug/README.md) for local-only investigation notes

## Delivery Modes

`POST /api/notify/subscribe` accepts:

- `deliveryMode`: `immediate` | `every_5h` | `daily`
- `timezone`: required for accurate local-day behavior in `daily` mode (defaults to `Asia/Shanghai`)
- `dailyHour`: hour in `0..23` for `daily` mode (defaults to `9`)
- `turnstileToken` (recommended when Turnstile is enabled on server)

Example:

```bash
curl -X POST "https://your-domain.com/api/notify/subscribe" \
  -H "content-type: application/json" \
  -d '{"email":"user@example.com","deliveryMode":"daily","timezone":"Asia/Shanghai","dailyHour":9,"turnstileToken":"<TURNSTILE_TOKEN>"}'
```

## Environment Variables

Set these in Vercel project settings:

- `RESEND_API_KEY`
- `NOTIFY_FROM_NAME` (optional, example: `Mood`)
- `NOTIFY_FROM_EMAIL`
- `NOTIFY_REPLY_TO_EMAIL` (optional)
- `EMAIL_NOTIFY_SECRET` (long random string)
- `NOTIFY_DISPATCH_SECRET` (long random string)
- `PUBLIC_SITE_URL` (for email links, example: `https://buxx.me`)
- `CRON_SECRET`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_NOTIFY_D1_DATABASE_ID`
- `PUBLIC_TURNSTILE_SITE_KEY` (optional, frontend widget site key)
- `TURNSTILE_SECRET_KEY` (optional, enables anti-bot verification for subscribe endpoint)

If `TURNSTILE_SECRET_KEY` (or `CLOUDFLARE_TURNSTILE_SECRET_KEY`) is set, `POST /api/notify/subscribe` requires a valid Turnstile token.

Telegram webhook and image ingest now use:
- `PUBLIC_HD_IMAGE_URL`
- `HD_IMAGE_INGEST_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHANNEL_ID`
- `CHANNEL`
- `TELEGRAM_HOST`

The Cloudflare Worker also needs:

- `NOTIFY_DISPATCH_SECRET`

That secret must match the Vercel production value because the Worker queue consumer calls `POST /api/notify/dispatch`.

`CLOUDFLARE_KV_NAMESPACE_ID` is no longer required for Telegram image lookup after the R2 migration.

## Notify D1 Tables

- `notify_subscribers`
- `notify_sent`
- `notify_retries`
- `notify_dead_letters`

Schema file:

- [`scripts/sql/notify-d1.sql`](../scripts/sql/notify-d1.sql)

KV migration script:

- [`scripts/migrate-notify-kv-to-d1.ts`](../scripts/migrate-notify-kv-to-d1.ts)

### D1 Setup Commands

```bash
# Create database (first time only)
bunx wrangler d1 create site-notify

# Apply schema
bunx wrangler d1 execute site-notify --remote --file scripts/sql/notify-d1.sql

# Migrate existing notify:* records from KV to D1
bunx tsx scripts/migrate-notify-kv-to-d1.ts
```

## Scheduling Strategy

- Real-time sends (`immediate`) are triggered by Telegram webhook events.
- Scheduled sends (`every_5h`, `daily`) are triggered by `/api/notify/schedule`.
- Failed sends are retried by `/api/notify/retry`.

### Immediate Delivery Flow

Current production path:

```text
Telegram -> Cloudflare Worker /webhook -> Cloudflare Queue
         -> Worker queue consumer -> POST /api/notify/dispatch on buxx.me
         -> existing notify service -> Resend
```

Notes:

- The Worker does not send email directly.
- `/api/notify/dispatch` remains the notify entrypoint for actual delivery, idempotency, and per-subscriber retry scheduling.
- The queue exists only to make the Worker-to-Vercel notify handoff durable.

### Vercel Cron

`vercel.json` keeps a low-frequency fallback cron:

```json
{
  "crons": [{ "path": "/api/notify/retry", "schedule": "0 3 * * *" }]
}
```

This daily fallback exists for Vercel Hobby plan compatibility.

### Primary Scheduler (Cloudflare Worker)

Use `workers/notify-scheduler` as the primary scheduler (every 15 minutes).

It calls:

- `POST /api/notify/schedule`
- `POST /api/notify/retry`

with `Authorization: Bearer <CRON_SECRET>`.

## API Usage

Manual dispatch for a specific mood post id:

```bash
curl -X POST "https://your-domain.com/api/notify/dispatch" \
  -H "content-type: application/json" \
  -H "authorization: Bearer <NOTIFY_DISPATCH_SECRET>" \
  -d '{"postId":"12345"}'
```

Manual schedule run:

```bash
curl -X POST "https://your-domain.com/api/notify/schedule" \
  -H "authorization: Bearer <CRON_SECRET>"
```

Manual retry run:

```bash
curl -X POST "https://your-domain.com/api/notify/retry" \
  -H "authorization: Bearer <CRON_SECRET>"
```

## Operational Notes

- Webhook dispatch is idempotent per `postId + emailHash`.
- Immediate webhook-triggered dispatch now enters through the Cloudflare Worker and queue before reaching `/api/notify/dispatch`.
- Unsubscribe links are signed and time-limited.
- Failed deliveries are retried with backoff.
- Keep `NOTIFY_FROM_EMAIL` domain verified in Resend.
- Use `NOTIFY_FROM_NAME` when you want a display name without embedding it in `NOTIFY_FROM_EMAIL`.
