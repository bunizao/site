# Email Notify (Resend)

This document describes the private API notify runtime in `site-api`.

## Overview

Canonical private API:

- `POST https://api.buxx.me/v2/notify/subscribe`
- `GET https://api.buxx.me/v2/notify/confirm`
- `GET https://api.buxx.me/v2/notify/unsubscribe`
- `GET|PATCH https://api.buxx.me/v2/notify/manage`
- `POST https://api.buxx.me/v2/notify/manage/request`
- `POST https://api.buxx.me/v2/notify/manage/email`
- `GET https://api.buxx.me/v2/notify/change-email`
- `POST https://api.buxx.me/v2/notify/dispatch`
- `GET|POST https://api.buxx.me/v2/notify/schedule`
- `GET|POST https://api.buxx.me/v2/notify/retry`
- `POST https://api.buxx.me/webhooks/telegram`

Public compatibility:

- `https://buxx.me/api/notify/*` proxies to `site-api` through the public Worker's `API` service binding.

## Delivery Modes

`POST /v2/notify/subscribe` accepts:

- `deliveryMode`: `immediate` | `every_5h` | `daily`
- `timezone`: required for accurate local-day behavior in `daily` mode
- `dailyHour`: hour in `0..23` for `daily` mode
- `turnstileToken` when Turnstile is enabled

Example:

```bash
curl -X POST "https://api.buxx.me/v2/notify/subscribe" \
  -H "content-type: application/json" \
  -d '{"email":"user@example.com","deliveryMode":"daily","timezone":"Asia/Shanghai","dailyHour":9,"turnstileToken":"<TURNSTILE_TOKEN>"}'
```

## Environment

Set these as Cloudflare Worker secrets or vars for `site-api`:

- `RESEND_API_KEY`
- `NOTIFY_FROM_NAME` (optional)
- `NOTIFY_FROM_EMAIL`
- `NOTIFY_REPLY_TO_EMAIL` (optional)
- `EMAIL_NOTIFY_SECRET`
- `NOTIFY_DISPATCH_SECRET`
- `CRON_SECRET`
- `PUBLIC_SITE_URL`
- `PUBLIC_TURNSTILE_SITE_KEY` (optional)
- `TURNSTILE_SECRET_KEY` or `CLOUDFLARE_TURNSTILE_SECRET_KEY` (optional)
- `NOTIFY_ADMIN_TELEGRAM_CHAT_ID` (optional)
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHANNEL_ID`

Bindings:

- `NOTIFY_DB` D1
- `SESSION` KV
- `MOOD_DB` D1
- `MOOD_IMAGES` R2
- `NOTIFY_DISPATCH_QUEUE`

## Scheduling Strategy

- Immediate-delivery subscriptions are triggered by publication webhooks and enter the queue with a five-minute safety delay.
- Authenticated dispatch requests explicitly targeting only `immediate` delivery use the same delayed queue.
- Scheduled sends are triggered by `/v2/notify/schedule`.
- Failed sends are retried by `/v2/notify/retry`.

```text
Telegram/Ghost -> site-api publication webhook -> Cloudflare Queue (5 minute delay)
               -> queue consumer -> notify service -> Resend
```

The webhook and queue worker do not send email directly. `/v2/notify/dispatch` owns delivery, idempotency, and retry scheduling.

## Admin Portal

Admin pages and APIs now live in `site-api` and are reached from the public site through compatibility proxy routes:

- `/dev/*`
- `/oauth*`
- `/api/admin/*`

Protected docs on the public site check `site-api /v2/admin/session` through the `API` service binding.
