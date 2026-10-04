---
title: Email notifications
description: How site-api sends notify email through Resend, with its queues, schedules, secrets, and bindings.
group: Platform
order: 2
---

This page covers the notify runtime in `site-api`: what sends the mail, on
what schedule, and with which secrets and bindings. For the public subscribe,
confirm, unsubscribe, and manage endpoints (parameters, response schemas, and
error codes), see [Notify API](/docs/api/notify).

## Routes

The canonical base path is `/notify/*` (`NOTIFY_BASE_PATH` in
`@bunizao/contracts/routes`). `/v2/notify/*` stays alive as a legacy alias
(`LEGACY_NOTIFY_BASE_PATH`) that redirects to the same path under `/notify/*`.
On the public site, `https://buxx.me/api/notify/*` reaches them. In production
a Cloudflare route sends it straight to `site-api`. On preview deployments the
`site` Worker forwards it through the `API` service binding.

| Route | Methods | Gate | Documented in |
| --- | --- | --- | --- |
| `/notify/subscribe` | `POST` | Turnstile | [Notify API](/docs/api/notify#subscribe) |
| `/notify/confirm` | `GET` | Confirm token | [Notify API](/docs/api/notify#confirm) |
| `/notify/unsubscribe` | `GET`, `POST` | Unsubscribe token | [Notify API](/docs/api/notify#unsubscribe) |
| `/notify/manage` | `GET`, `PATCH` | Manage token | [Notify API](/docs/api/notify#manage) |
| `/notify/manage/request` | `POST` | Turnstile | [Notify API](/docs/api/notify#request-a-manage-link) |
| `/notify/manage/email` | `POST` | Manage token | [Notify API](/docs/api/notify#change-the-subscribed-address) |
| `/notify/change-email` | `GET`, `POST` | Change token | [Notify API](/docs/api/notify#change-the-subscribed-address) |
| `/notify/dispatch` | `POST` | Shared secret | [Internal](/dev/docs/api/endpoints#scheduled-notification-routes) |
| `/notify/schedule` | `GET`, `POST` | Shared secret | [Internal](/dev/docs/api/endpoints#scheduled-notification-routes) |
| `/notify/retry` | `GET`, `POST` | Shared secret | [Internal](/dev/docs/api/endpoints#scheduled-notification-routes) |
| `/webhooks/telegram` | `POST` | Telegram secret header | [Internal](/dev/docs/api/endpoints#webhooks) |

Callback pages can't be cached or framed, and they use a restrictive content
security policy. Browser forms have bounded request bodies.

## Email address changes

Changing an address takes two inboxes. A manage token for the current address
starts the change, and a link sent to the new address confirms it.

1. `POST /notify/manage/email?token=...` needs a fresh `manage` token for the current address. It stores a one-hour request tied to that subscriber generation (the version of the subscription the request was made against) and sends a confirmation link to the proposed address.
2. `GET /notify/change-email?token=...` only validates the one-time request and renders a confirmation page. It never changes subscriber data.
3. `POST /notify/change-email` needs a same-origin browser submission and commits the move atomically. The subscriber, send ledger, retry/dead-letter records, pending welcome email, and analytics identity move together.

The confirmation token is single-use. Replaying a consumed token is
idempotent, even after the token's one-hour cryptographic expiry: it renders
success, doesn't mint another manage token, and doesn't send another notice.
If the destination already has a subscription, the request gets the same
response as for an available destination, but no confirmation email is sent.

The HTML form has no fixed `action`, so it submits to the current browser URL.
That keeps both direct `/notify/change-email` links and public
`/api/notify/change-email` compatibility links working. Service-binding
requests carry `X-Forwarded-Origin`. The Worker accepts it for same-origin
validation only on the internal `site-api.internal` origin.

Subscription and admin writes use conditional generation checks and monotonic
timestamps. A stale request gets a conflict instead of recreating an older
email identity.

Consumed email-move markers stay for at least 180 days, which covers the
longest legacy unsubscribe token lifetime. Apply migration
`0008_email_change_requests.sql` before you activate the Worker, so these
revocation checks are available.

The change-request endpoint has its own Durable Object quota: five attempts
per client per hour. Other routes keep the shared observability limiter until
the plan to use the native Cloudflare Rate Limiting binding lands.

## Delivery modes

| Mode | When it sends |
| --- | --- |
| `immediate` | On publication, through the queue with a five-minute safety delay. |
| `every_5h` | On the five-hourly scheduled run. |
| `daily` | Once a day at `dailyHour` in the subscriber's `timezone`. Defaults are `9` and `Asia/Shanghai`. |

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
| `NOTIFY_FROM_NAME` | No | Display name next to the sender address. |
| `NOTIFY_REPLY_TO_EMAIL` | No | Reply-to on outgoing mail. |
| `EMAIL_NOTIFY_SECRET` | Yes | Signs and verifies every notify token (confirm, unsubscribe, manage, change, delete) and the newsletter tracking tokens. Rotating it invalidates every link already in someone's inbox. |
| `NOTIFY_DISPATCH_SECRET` | Yes | Bearer credential for `/notify/dispatch`. |
| `CRON_SECRET` | Yes | Bearer credential for the scheduled runs. |
| `PUBLIC_SITE_URL` | Yes | Base URL for every link in an email. |
| `PUBLIC_TURNSTILE_SITE_KEY` | No | Client-side widget key. |
| `TURNSTILE_SECRET_KEY` or `CLOUDFLARE_TURNSTILE_SECRET_KEY` | No | Server-side verification key. Without it the Turnstile gate can't verify. See the `503` branch in [Notify API](/docs/api/notify#subscribe). |
| `TELEGRAM_OPS_BOT_TOKEN`, `TELEGRAM_OPS_ALLOWED_USER_IDS` | No | The ops bot. Subscribe and unsubscribe notices, like every other owner notification, go to each allowlisted user from this bot; unset means no notice. |
| `TELEGRAM_WEBHOOK_SECRET` | Yes | Verifies Telegram's own secret-token header. |
| `TELEGRAM_BOT_TOKEN` | Yes | Bot API credential for media fetches. |
| `TELEGRAM_CHANNEL_ID` | Yes | The channel mood posts come from. |

Bindings:

| Binding | Kind | Holds |
| --- | --- | --- |
| `NOTIFY_DB` | D1 | Subscribers, delivery records, pending change and delete requests. |
| `MOOD_DB` | D1 | The mood archive that digests read. |
| `SESSION` | KV | Admin session state. |
| `MOOD_IMAGES` | R2 | Ingested mood originals and variants. |
| `NOTIFY_DISPATCH_QUEUE` | Queue | Delayed immediate-delivery jobs. |

## Scheduling

| Trigger | Path |
| --- | --- |
| Publication webhook (`immediate` subscribers) | Queue with a five-minute safety delay, then the consumer calls dispatch. |
| Authenticated dispatch targeting only `immediate` | The same delayed queue. |
| Scheduled digests | `/notify/schedule`. |
| Failed sends | `/notify/retry`. |

```text
Telegram/Ghost -> site-api publication webhook -> Cloudflare Queue (5 minute delay)
               -> queue consumer -> notify service -> Resend
```

The webhook and the queue worker never send email themselves.
`/notify/dispatch` handles delivery, idempotency, and retry scheduling.

## Admin portal

The subscriber and broadcast admin APIs live in `site-api` under `/admin/*`.
The public site reaches them in two ways:

| Path | How it reaches `site-api` |
| --- | --- |
| `/api/admin/*` | Like the rest of `/api/*`: straight to `site-api` in production. |
| `/dev/portal/api/admin/*` | The `site` Worker forwards it to `/api/admin/*` through the `API` service binding. |

The owner portal itself is `/dev/*`, rendered by the `site` Worker and gated by
Cloudflare Access. `/oauth*` is forwarded to `site-api` the same way; see
[Auth](/docs/platform/auth).

The old HTML pages that `site-api` served on `admin.buxx.me` are retired. Their
paths redirect to the matching screen of `/dev/portal`.
