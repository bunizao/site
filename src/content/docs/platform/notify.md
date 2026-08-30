---
title: Email notifications
description: The Resend-backed notify runtime, its queues, and the admin surface that drives it.
group: Platform
order: 2
---

This document describes the private API notify runtime in `site-api`. For
the public-facing subscribe/confirm/unsubscribe/manage endpoints — parameters,
response schemas, and error codes — see [Notify API](/docs/api/notify).

## Routes

Canonical path is `/notify/*` (`NOTIFY_BASE_PATH` in `@bunizao/contracts/routes`);
`/v2/notify/*` is kept alive as a legacy alias (`LEGACY_NOTIFY_BASE_PATH`) and
resolves to the same handlers. On the public site,
`https://buxx.me/api/notify/*` reaches them through the `API` service binding.

| Route | Methods | Gate | Documented in |
| --- | --- | --- | --- |
| `/notify/subscribe` | `POST` | Turnstile | [Notify API](/docs/api/notify#subscribe) |
| `/notify/confirm` | `GET` | Confirm token | [Notify API](/docs/api/notify#confirm) |
| `/notify/unsubscribe` | `GET`, `POST` | Unsubscribe token | [Notify API](/docs/api/notify#unsubscribe) |
| `/notify/manage` | `GET`, `PATCH` | Manage token | [Notify API](/docs/api/notify#manage) |
| `/notify/manage/request` | `POST` | Turnstile | [Notify API](/docs/api/notify#request-a-manage-link) |
| `/notify/manage/email` | `POST` | Manage token | [Notify API](/docs/api/notify#change-the-subscribed-address) |
| `/notify/change-email` | `GET`, `POST` | Change token | [Notify API](/docs/api/notify#change-the-subscribed-address) |
| `/notify/dispatch` | `POST` | Shared secret | [Internal](/docs/api/internal#cron-and-dispatch) |
| `/notify/schedule` | `GET`, `POST` | Shared secret | [Internal](/docs/api/internal#cron-and-dispatch) |
| `/notify/retry` | `GET`, `POST` | Shared secret | [Internal](/docs/api/internal#cron-and-dispatch) |
| `/webhooks/telegram` | `POST` | Telegram secret header | [Internal](/docs/api/internal#telegram) |

Request and response contracts live on those pages and are not repeated here.
This page is the runtime: what sends the mail, on what schedule, with which
secrets.

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

## Delivery modes

| Mode | When it sends |
| --- | --- |
| `immediate` | On publication, through the queue with a five-minute safety delay. |
| `every_5h` | On the five-hourly scheduled run. |
| `daily` | Once a day at `dailyHour` in the subscriber's `timezone`, defaults `9` and `Asia/Shanghai`. |

Example subscribe call:

```bash
curl -X POST "https://api.buxx.me/notify/subscribe" \
  -H "content-type: application/json" \
  -d '{"email":"user@example.com","deliveryMode":"daily","timezone":"Asia/Shanghai","dailyHour":9,"turnstileToken":"<TURNSTILE_TOKEN>"}'
```

## Environment

Cloudflare Worker secrets and vars on `site-api`:

| Variable | Required | What it does |
| --- | --- | --- |
| `RESEND_API_KEY` | Yes | Resend credential. Without it nothing sends. |
| `NOTIFY_FROM_EMAIL` | Yes | Envelope sender. |
| `NOTIFY_FROM_NAME` | No | Display name beside the sender address. |
| `NOTIFY_REPLY_TO_EMAIL` | No | Reply-to on outgoing mail. |
| `EMAIL_NOTIFY_SECRET` | Yes | Signs and verifies every notify token — confirm, unsubscribe, manage, change, delete — and the newsletter tracking tokens. Rotating it invalidates every link already in someone's inbox. |
| `NOTIFY_DISPATCH_SECRET` | Yes | Bearer credential for `/notify/dispatch`. |
| `CRON_SECRET` | Yes | Bearer credential for the scheduled runs. |
| `PUBLIC_SITE_URL` | Yes | Base URL every link in an email is built from. |
| `PUBLIC_TURNSTILE_SITE_KEY` | No | Client-side widget key. |
| `TURNSTILE_SECRET_KEY` or `CLOUDFLARE_TURNSTILE_SECRET_KEY` | No | Server-side verification key. Absent means the Turnstile gate cannot verify — see the `503` branch in [Notify API](/docs/api/notify#turnstile). |
| `NOTIFY_ADMIN_TELEGRAM_CHAT_ID` | No | Where operational alerts go. |
| `TELEGRAM_WEBHOOK_SECRET` | Yes | Verifies Telegram's own secret-token header. |
| `TELEGRAM_BOT_TOKEN` | Yes | Bot API credential for media fetches. |
| `TELEGRAM_CHANNEL_ID` | Yes | The channel mood posts come from. |

Bindings:

| Binding | Kind | Holds |
| --- | --- | --- |
| `NOTIFY_DB` | D1 | Subscribers, delivery records, pending change and delete requests. |
| `MOOD_DB` | D1 | The mood archive read by digests. |
| `SESSION` | KV | Admin session state. |
| `MOOD_IMAGES` | R2 | Ingested mood originals and variants. |
| `NOTIFY_DISPATCH_QUEUE` | Queue | Delayed immediate-delivery jobs. |

## Scheduling strategy

| Trigger | Path |
| --- | --- |
| Publication webhook (`immediate` subscribers) | Queue with a five-minute safety delay, then the consumer calls dispatch. |
| Authenticated dispatch targeting only `immediate` | The same delayed queue. |
| Scheduled digests | `/v2/notify/schedule`. |
| Failed sends | `/v2/notify/retry`. |

```text
Telegram/Ghost -> site-api publication webhook -> Cloudflare Queue (5 minute delay)
               -> queue consumer -> notify service -> Resend
```

The webhook and queue worker do not send email directly. `/v2/notify/dispatch` owns delivery, idempotency, and retry scheduling.

## Admin portal

Admin pages and APIs now live in `site-api` and are reached from the public site through compatibility proxy routes:

- `/dev/*`
- `/oauth*`
- `/api/admin/*`

Protected docs on the public site check `site-api /v2/admin/session` through the `API` service binding.
