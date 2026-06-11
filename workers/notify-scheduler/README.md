# Notify Scheduler Worker

Cloudflare Worker that drove notification scheduling before the consolidated `buxx-site` Worker owned Cloudflare Cron.

## What It Does

Every 15 minutes it calls:

- `POST /api/notify/schedule` - dispatches scheduled notifications (`every_5h`, `daily`)
- `POST /api/notify/retry` - retries failed deliveries

Both requests send `Authorization: Bearer <NOTIFY_CRON_SECRET>`.

## Required Site APIs

This worker expects the site runtime to expose:

- `https://<SITE>/api/notify/schedule`
- `https://<SITE>/api/notify/retry`

## Configuration

`wrangler.toml`:

- `NOTIFY_BASE_URL` - site base URL (example `https://buxx.me`)
- cron trigger: `*/15 * * * *`

Secrets:

- `NOTIFY_CRON_SECRET` - set to the same value as site `CRON_SECRET`
- `WORKER_MANUAL_TOKEN` (optional) - for manual POST trigger auth

## Deploy

```bash
cd workers/notify-scheduler
bun install
bunx wrangler secret put NOTIFY_CRON_SECRET
bunx wrangler secret put WORKER_MANUAL_TOKEN
bun run deploy
```

## Manual Trigger

```bash
curl -X POST "https://<worker-domain>" \
  -H "authorization: Bearer <WORKER_MANUAL_TOKEN>"
```

## Notes

- The consolidated `buxx-site` Worker is the primary scheduler target for `every_5h` and `daily` modes.
- Keep this standalone worker as rollback history until production cutover is verified.
