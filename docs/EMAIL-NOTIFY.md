# Email Notify (Resend)

This document describes how to deploy mood email notifications with Resend on Vercel.

## Overview

The implementation uses:

- `POST /api/notify/subscribe` for subscription requests (double opt-in)
- `GET /api/notify/confirm` for subscription confirmation
- `GET /api/notify/unsubscribe` for one-click unsubscribe
- `POST /api/notify/dispatch` for manual notification dispatch
- `GET/POST /api/notify/retry` for retrying failed deliveries
- `POST /api/telegram-webhook` as the automatic trigger when a new mood is posted

A failed send is stored in KV as a retry record and processed by Vercel Cron (`/api/notify/retry`).

## Environment Variables

Set these in Vercel project settings:

- `RESEND_API_KEY`
- `NOTIFY_FROM_EMAIL`
- `NOTIFY_REPLY_TO_EMAIL` (optional)
- `EMAIL_NOTIFY_SECRET` (long random string)
- `NOTIFY_DISPATCH_SECRET` (long random string)
- `PUBLIC_SITE_URL` (for email links, example: `https://buxx.me`)
- `CRON_SECRET`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_NOTIFY_KV_NAMESPACE_ID` (recommended)

If `CLOUDFLARE_NOTIFY_KV_NAMESPACE_ID` is not set, the code falls back to `CLOUDFLARE_KV_NAMESPACE_ID`.

## Cloudflare KV Data Keys

- `notify:subscriber:<emailHash>`
- `notify:sent:<postId>:<emailHash>`
- `notify:retry:<postId>:<emailHash>`
- `notify:dead:<postId>:<emailHash>:<timestamp>`

## Vercel Cron

`vercel.json` includes:

```json
{
  "crons": [{ "path": "/api/notify/retry", "schedule": "*/15 * * * *" }]
}
```

Cron calls include `Authorization: Bearer <CRON_SECRET>` automatically when `CRON_SECRET` is configured in Vercel.

## API Usage

Start subscription:

```bash
curl -X POST "https://your-domain.com/api/notify/subscribe" \
  -H "content-type: application/json" \
  -d '{"email":"user@example.com"}'
```

Manual dispatch for a specific mood post id:

```bash
curl -X POST "https://your-domain.com/api/notify/dispatch" \
  -H "content-type: application/json" \
  -H "authorization: Bearer <NOTIFY_DISPATCH_SECRET>" \
  -d '{"postId":"12345"}'
```

Manual retry run:

```bash
curl "https://your-domain.com/api/notify/retry" \
  -H "authorization: Bearer <NOTIFY_DISPATCH_SECRET>"
```

## Operational Notes

- The webhook dispatch is idempotent per `postId + emailHash`.
- Unsubscribe links are signed and time-limited.
- Failed deliveries are retried with backoff.
- Keep `NOTIFY_FROM_EMAIL` domain verified in Resend.
