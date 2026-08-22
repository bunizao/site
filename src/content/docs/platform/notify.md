---
title: Email notifications
description: The Resend-backed notify runtime, its queues, and the admin surface that drives it.
group: Platform
order: 2
---

This document describes the reader-facing notification contract. The private
implementation lives in `site-api`; the public site exposes the same routes
under `/api/notify/*` through the `site` service binding. Direct Worker routes
use `/notify/*` and the versioned `/v2/notify/*` compatibility redirect.

## Overview

Canonical API:

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

Callback pages are non-cacheable, cannot be framed, and use a restrictive
content security policy. Browser forms have bounded request bodies.

## Email address changes

Changing an address is a two-inbox flow:

1. `POST /notify/manage/email?token=...` requires a fresh `manage` token for the current address. It stores a one-hour request bound to that subscriber generation and sends a confirmation link to the proposed address.
2. `GET /notify/change-email?token=...` only validates the one-time request and renders a confirmation page. It never changes subscriber data.
3. `POST /notify/change-email` requires a same-origin browser submission and commits the move atomically. The subscriber, send ledger, retry/dead-letter records, pending welcome email, and analytics identity move together.

The confirmation token is single-use. Replaying a consumed token is idempotent,
including after the token's one-hour cryptographic expiry: it renders success,
does not mint another manage token, and does not send another notice. A
destination that already has a subscription receives the same request response
as an available destination, but no confirmation email is sent.

The HTML form intentionally has no fixed `action`; it submits to the current
browser URL. This preserves both direct `/notify/change-email` links and public
`/api/notify/change-email` compatibility links. Service-binding requests carry
`X-Forwarded-Origin`, which is accepted only on the internal
`site-api.internal` origin for same-origin validation.

Subscription and admin writes use conditional generation checks and monotonic
timestamps. A stale request returns a conflict instead of recreating an older
email identity.

Consumed email-move markers remain for at least 180 days, covering the longest legacy
unsubscribe token lifetime. Migration `0008_email_change_requests.sql` must be
applied before activating the Worker so these revocation checks are available.

The request endpoint uses a dedicated Durable Object quota of five attempts per
client per hour. Other routes retain the shared observability limiter while the
native Cloudflare Rate Limiting binding plan remains pending.

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
