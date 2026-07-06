---
title: Email notify
description: How subscribers get mail through the private API Worker.
internal: true
---

Mood email notifications are deployed with Resend from `site-api`.

## Endpoints

Canonical private API:

- `POST https://api.buxx.me/v2/notify/subscribe`
- `GET https://api.buxx.me/v2/notify/confirm`
- `GET https://api.buxx.me/v2/notify/unsubscribe`
- `POST https://api.buxx.me/v2/notify/dispatch`
- `GET|POST https://api.buxx.me/v2/notify/schedule`
- `GET|POST https://api.buxx.me/v2/notify/retry`
- `POST https://api.buxx.me/webhooks/telegram`

Public compatibility:

- `https://buxx.me/api/notify/*` proxies to `site-api` through the public Worker's `API` service binding.

## Subscribing

`POST /v2/notify/subscribe`:

- `deliveryMode`: `immediate` | `every_5h` | `daily`
- `timezone`: required for accurate local-day behavior in `daily` mode
- `dailyHour`: hour `0..23` for `daily` mode
- `turnstileToken`: recommended when Turnstile is enabled

```bash
curl -X POST "https://api.buxx.me/v2/notify/subscribe" \
  -H "content-type: application/json" \
  -d '{"email":"user@example.com","deliveryMode":"daily","timezone":"Asia/Shanghai","dailyHour":9,"turnstileToken":"<TURNSTILE_TOKEN>"}'
```

If `TURNSTILE_SECRET_KEY` or `CLOUDFLARE_TURNSTILE_SECRET_KEY` is set, subscribe requires a valid Turnstile token.

## Environment

`site-api` needs:

- `RESEND_API_KEY`, `NOTIFY_FROM_NAME` (optional), `NOTIFY_FROM_EMAIL`, `NOTIFY_REPLY_TO_EMAIL` (optional)
- `EMAIL_NOTIFY_SECRET`, `NOTIFY_DISPATCH_SECRET`, `CRON_SECRET`
- `PUBLIC_SITE_URL`
- `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (optional)
- `NOTIFY_ADMIN_TELEGRAM_CHAT_ID` (optional)
- `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`

Bindings:

- `NOTIFY_DB` D1
- `SESSION` KV
- `MOOD_DB` D1
- `MOOD_IMAGES` R2
- `NOTIFY_DISPATCH_QUEUE`

## Scheduling

- Immediate sends are triggered by `POST /webhooks/telegram`.
- Scheduled sends are triggered by `/v2/notify/schedule`.
- Failed sends are retried by `/v2/notify/retry`.

### Immediate flow

```text
Telegram -> site-api /webhooks/telegram -> Cloudflare Queue
         -> queue consumer -> /v2/notify/dispatch
         -> notify service -> Resend
```

The webhook and queue worker do not send email directly. `/v2/notify/dispatch` remains the notify entrypoint for delivery, idempotency, and per-subscriber retry scheduling.

## Admin portal

Admin pages are served by the public `site` Worker. Admin data and auth endpoints are served by `site-api`:

- public UI: `/dev/*`, `/oauth/login`
- private API: `/v2/admin/*`

Protected docs on the public site check `site-api /v2/admin/session` through the `API` service binding.

## Operational notes

- Webhook dispatch is idempotent per `postId + emailHash`.
- Unsubscribe links are signed and time-limited.
- Failed deliveries are retried with backoff.
- Keep `NOTIFY_FROM_EMAIL` domain verified in Resend.
