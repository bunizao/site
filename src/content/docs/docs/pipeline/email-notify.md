---
title: Email notify
description: How subscribers get mail — the Resend integration, double opt-in, scheduling, and the admin portal.
internal: true
---

Mood email notifications are deployed with Resend. Subscribers double-opt-in, choose a delivery cadence (`immediate`, `every_5h`, `daily`), and receive mail through the same path the admin uses for broadcasts.

## Endpoints

- `POST /api/notify/subscribe` — subscription requests (double opt-in).
- `GET /api/notify/confirm` — token-based subscription confirmation.
- `GET /api/notify/unsubscribe` — one-click unsubscribe.
- `POST /api/notify/dispatch` — manual or webhook-driven per-post dispatch.
- `GET|POST /api/notify/schedule` — scheduled delivery modes (`every_5h`, `daily`).
- `GET|POST /api/notify/retry` — retry failed deliveries.
- `POST https://image.buxx.me/webhook` — automatic real-time dispatch on new mood posts (`immediate` mode).

## Subscribing

`POST /api/notify/subscribe`:

- `deliveryMode`: `immediate` | `every_5h` | `daily`
- `timezone`: required for accurate local-day behavior in `daily` mode (defaults to `Asia/Shanghai`)
- `dailyHour`: hour `0..23` for `daily` mode (defaults to `9`)
- `turnstileToken`: recommended when Turnstile is enabled

```bash
curl -X POST "https://buxx.me/api/notify/subscribe" \
  -H "content-type: application/json" \
  -d '{"email":"user@example.com","deliveryMode":"daily","timezone":"Asia/Shanghai","dailyHour":9,"turnstileToken":"<TURNSTILE_TOKEN>"}'
```

If `TURNSTILE_SECRET_KEY` (or `CLOUDFLARE_TURNSTILE_SECRET_KEY`) is set, subscribe requires a valid Turnstile token.

## Environment

`site` needs:

- `RESEND_API_KEY`, `NOTIFY_FROM_NAME` (optional), `NOTIFY_FROM_EMAIL`, `NOTIFY_REPLY_TO_EMAIL` (optional).
- `EMAIL_NOTIFY_SECRET`, `NOTIFY_DISPATCH_SECRET`, `CRON_SECRET` (long random strings).
- `PUBLIC_SITE_URL`.
- `NOTIFY_DB` D1 binding.
- `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (optional).
- `NOTIFY_ADMIN_TELEGRAM_CHAT_ID` (optional, sends admin alerts on confirmed subscribe and unsubscribe).

The queue consumer also needs `NOTIFY_DISPATCH_SECRET`; it must match the value accepted by `/api/notify/dispatch`.

## D1 tables

- `notify_subscribers` (with `channels` column, default `["mood"]`)
- `notify_sent`
- `notify_retries`
- `notify_dead_letters`
- `notify_audit`
- `notify_broadcasts` (admin-authored manual sends)

Schema: `scripts/sql/notify-d1.sql`. Incremental migrations live under `scripts/sql/migrations/` — apply in date order. KV migration script: `scripts/migrate-notify-kv-to-d1.ts`.

```bash
# First time only
bunx wrangler d1 create site-notify

# Apply schema
bunx wrangler d1 execute site-notify --remote --file scripts/sql/notify-d1.sql

# Apply admin portal migration to an existing DB
bunx wrangler d1 execute site-notify --remote --file scripts/sql/migrations/2026-05-21-admin-portal.sql

# Migrate existing notify:* records from KV to D1
bunx tsx scripts/migrate-notify-kv-to-d1.ts
```

## Scheduling

- **Immediate** — triggered by Telegram webhook events.
- **Scheduled** (`every_5h`, `daily`) — triggered by `/api/notify/schedule`.
- **Failed** — retried by `/api/notify/retry`.

### Immediate flow

```
Telegram → Cloudflare Worker /webhook → Cloudflare Queue
        → Worker queue consumer → POST /api/notify/dispatch on buxx.me
        → notify service → Resend
```

The worker doesn't send email directly. `/api/notify/dispatch` is the notify entrypoint for delivery, idempotency, and per-subscriber retry scheduling. The queue exists only to make immediate notify dispatch durable.

### Scheduler

Cloudflare Cron owns scheduled notify and retry execution for `site` every 15 minutes.

The standalone `workers/notify-scheduler` deployment is rollback history until production cutover is verified.

### Manual

```bash
# Dispatch a specific post
curl -X POST "https://buxx.me/api/notify/dispatch" \
  -H "content-type: application/json" \
  -H "authorization: Bearer <NOTIFY_DISPATCH_SECRET>" \
  -d '{"postId":"12345"}'

# Run schedule
curl -X POST "https://buxx.me/api/notify/schedule" \
  -H "authorization: Bearer <CRON_SECRET>"

# Run retry
curl -X POST "https://buxx.me/api/notify/retry" \
  -H "authorization: Bearer <CRON_SECRET>"
```

## Admin portal

`/dev/portal` (GitHub-OAuth gated) replaces the older `/dev/preview` and `/dev/newsletter-preview` pages. It exposes:

- `/dev/portal` — overview cards (subscribers, last broadcast, mascot library, templates) and a recent audit feed.
- `/dev/portal/subscribers` — list, filter (status, channel, delivery mode), create, edit, soft-delete to `unsubscribed`.
- `/dev/portal/broadcasts` — compose (markdown or raw HTML) with audience filter, debounced live preview, send confirmation, history.
- `/dev/portal/broadcasts/[id]` — broadcast detail with rendered email, audience, send counts.
- `/dev/portal/mascot` — runtime map, brand behavior, tracking stage, full asset library.
- `/dev/portal/newsletter` — wraps the existing `TemplatePreview`.

Old paths 301: `/dev/preview` → `/dev/portal/mascot`, `/dev/newsletter-preview` → `/dev/portal/newsletter`.

### Auth

Cloudflare OAuth, allowlist of one (`ADMIN_CLOUDFLARE_EMAIL`). HMAC-SHA256 signed HttpOnly session cookie (`admin_session`, 7-day expiry, format `<base64url(payload)>.<base64url(hmac)>`). State-cookie CSRF protection on the OAuth handshake.

Required env: `CLOUDFLARE_OAUTH_CLIENT_ID`, `CLOUDFLARE_OAUTH_CLIENT_SECRET`, `ADMIN_CLOUDFLARE_EMAIL`, `ADMIN_SESSION_SECRET` (32-byte random base64).

OAuth callback URL: `${PUBLIC_SITE_URL}/api/admin/auth/callback`.

Local debugging: `bun run dev:portal` sets `ADMIN_DEV_BYPASS=1`, which lets `/api/admin/auth/start` mint a normal signed session cookie only under `astro dev` on loopback hosts. Production builds ignore it. `ADMIN_DEV_LOGIN` and `ADMIN_DEV_AVATAR_URL` are local-only display.

### Subscriber channels

`notify_subscribers.channels` is a JSON list of `NotifyChannel` values: `mood | blog | privacy | announcement`. Existing rows default to `["mood"]`. Broadcasts intersect their audience with channel membership before dispatch — a subscriber who has unsubscribed from `privacy` will never receive a `privacy` broadcast.

### Broadcasts

Admin broadcasts share infrastructure with mood emails: `sendEmailWithResend`, the retry table, and the `notify_audit` event log. Each row records `subject`, sanitized `body_html`, `body_text`, audience JSON, recipient/sent/failed counts, status, and `sent_by` (the GitHub login). Any recipient failure marks the broadcast `failed` so partial delivery stays visible. Per-recipient sends use `Idempotency-Key: broadcast-<id>-<emailHash>`.

## Operational notes

- Webhook dispatch is idempotent per `postId + emailHash`.
- Immediate webhook-triggered dispatch enters through the Cloudflare worker and queue before reaching `/api/notify/dispatch`.
- Unsubscribe links are signed and time-limited.
- Confirmed subscribe and unsubscribe events can send a Telegram admin alert when `NOTIFY_ADMIN_TELEGRAM_CHAT_ID` is set.
- Failed deliveries are retried with backoff.
- Keep `NOTIFY_FROM_EMAIL` domain verified in Resend.
- Use `NOTIFY_FROM_NAME` for display names without embedding them in `NOTIFY_FROM_EMAIL`.
