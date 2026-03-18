# Image Quality Upgrade Worker (`telegram-image-proxy`)

Cloudflare Worker that serves Telegram photos from R2 for the Mood section.

At a glance:
- The Worker serves image bytes directly from R2.
- Telegram can now call the Worker webhook route directly for real-time image ingest.
- The legacy site webhook (`/api/telegram-webhook`) can remain as a rollback target during rollout.
- The ingest step also pre-generates common responsive widths (`480`, `800`, `1200`, `1600`) and stores them in R2.
- Immediate notify handoff is queued durably and dispatched to the site from the Worker queue consumer.
- Runtime image requests read from R2 only.
- On R2 miss, the Worker returns `404` and the site should fallback to `/static/<telegram-url>`.

## Components

### 1. Worker

Location: `workers/telegram-image-proxy` (this folder)

Route:
- `POST /webhook`
- `GET /mood/:postId/:imageIndex`
- `HEAD /mood/:postId/:imageIndex`
- `GET /channel/avatar`
- `HEAD /channel/avatar`
- `POST /ingest/mood/:postId/:imageIndex`
- `POST /ingest/channel/avatar`
- `OPTIONS` is handled for CORS preflight

Environment bindings:
- `TELEGRAM_BOT_TOKEN` (secret)
- `HD_IMAGE_INGEST_TOKEN` (secret for ingest authorization)
- `TELEGRAM_WEBHOOK_SECRET` (secret for Telegram webhook auth)
- `NOTIFY_DISPATCH_SECRET` (secret shared with site `/api/notify/dispatch`)
- `NOTIFY_DISPATCH_URL` (site dispatch endpoint)
- `CHANNEL` (Telegram channel slug for media-group indexing)
- `TELEGRAM_CHANNEL_ID` (Telegram channel id for avatar refresh fallback)
- `TELEGRAM_HOST` (defaults to `t.me`)
- `MOOD_IMAGES` (R2 bucket binding)
- `NOTIFY_DISPATCH_QUEUE` (Cloudflare Queue producer/consumer binding)

### 2. R2 Bucket

Binding name: `MOOD_IMAGES`

Key format:
- `mood/<postId>/<imageIndex>`
- `channel/avatar`

### 3. Indexing Pipeline

Real-time indexing:
- `POST /webhook` receives `channel_post` updates from Telegram.
- The Worker fetches bytes from Telegram and writes image objects into R2.
- The Worker enqueues an immediate notify job and the queue consumer calls `POST /api/notify/dispatch`.

## Request API

Base route:

```text
GET https://<IMAGE_HOST>/mood/<postId>/<imageIndex>
```

Query params:
- `w` or `width` (optional): the Worker selects the nearest pre-generated width variant (`480`, `800`, `1200`, `1600`).
- `q` is accepted for compatibility and currently ignored.

Examples:

```text
https://image.example.com/mood/123/0
https://image.example.com/mood/123/0?w=1200&q=85
```

Response behavior:
- On R2 hit: returns the object immediately.
- On R2 miss: returns `404`.
- CORS is enabled (`Access-Control-Allow-Origin: *`) for cross-origin `<img>` usage.
- The response is cached aggressively (`Cache-Control: public, max-age=31536000, immutable`).

## Setup

### 1. Create the R2 Bucket

From `workers/telegram-image-proxy`:

```bash
bunx --bun wrangler r2 bucket create mood-images
```

Set `bucket_name` in `wrangler.toml` under `[[r2_buckets]]`.

### 2. Set the Worker Secret

From `workers/telegram-image-proxy`:

```bash
bunx --bun wrangler secret put TELEGRAM_BOT_TOKEN
bunx --bun wrangler secret put HD_IMAGE_INGEST_TOKEN
bunx --bun wrangler secret put TELEGRAM_WEBHOOK_SECRET
bunx --bun wrangler secret put NOTIFY_DISPATCH_SECRET
bunx --bun wrangler secret put CHANNEL
bunx --bun wrangler secret put TELEGRAM_CHANNEL_ID
```

### 3. Deploy the Worker

From `workers/telegram-image-proxy`:

```bash
bun install
bun run deploy
```

Optional (recommended): configure a custom domain in the Cloudflare dashboard:
- Workers & Pages -> `telegram-image-proxy` -> Triggers -> Custom Domains

### 4. Point the Site to the Worker

Set site environment variables:
- `PUBLIC_HD_IMAGE_URL=https://<IMAGE_HOST>`
- `HD_IMAGE_INGEST_TOKEN=<same_token_as_worker_secret>`

The HTML generation in `../../src/lib/telegram.ts` will then prefer:
- `https://<IMAGE_HOST>/mood/<postId>/<imageIndex>`

## Ingest API

Body:

```json
{
  "fileId": "<telegram_file_id>"
}
```

Auth:

```text
Authorization: Bearer <HD_IMAGE_INGEST_TOKEN>
```

Routes:
- `POST /ingest/mood/:postId/:imageIndex`
- `POST /ingest/channel/avatar`

The ingest route writes to R2 before it returns. Success is `200`; failures surface as `5xx` instead of being deferred in the background.

## Webhook API

Telegram webhook route:

```text
POST https://<IMAGE_HOST>/webhook
```

Auth:

```text
X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>
```

Behavior:
- Returns `401` for invalid secret.
- Returns `400` for invalid JSON.
- Returns `200` for authenticated deliveries even if image ingest fails after parsing.
- Returns `503` when media-group resolution fails or the notify queue handoff cannot be persisted.
- Queues `{ postId, deliveryModes: ['immediate'] }` for `/api/notify/dispatch`.

## Historical Backfill

Use this script to repair historical IDs by pulling public Telegram CDN images and writing them into R2:

```bash
npx tsx scripts/backfill-r2-from-telegram-public.ts --pages=12 --max-fixes=200 --concurrency=3
```

Useful flags:
- `--ids=3122,3112` to repair specific post IDs only.
- `--dry-run` to verify extraction without writing to R2.
- `--channel=tutumood` to override Telegram public channel slug.

After backfill, verify with:

```bash
curl -I "https://image.buxx.me/mood/<postId>/0?w=1200"
```

## Notes and Limitations

- This system stores image bytes in R2.
- The ingest route stores one original image and responsive variants (`480`, `800`, `1200`, `1600`).
- If an R2 object is missing, Worker returns `404`.
- Media groups (albums) are indexed through Telegram embed markup so each image can be written under its own `imageIndex`.
- If you update an existing object key, the Worker clears the cached `GET` route key.
- The site must handle fallback to `/static/` when HD URLs return `404`.

## Troubleshooting

- **404: "Image not available"**
  - R2 key is missing (`mood/<postId>/<imageIndex>` or `channel/avatar`).
  - Confirm `/api/telegram-webhook` can call Worker ingest routes.
- **401 on ingest**
  - `HD_IMAGE_INGEST_TOKEN` mismatch between site and Worker secret.
- **502: "Failed to fetch image from Telegram"**
  - `TELEGRAM_BOT_TOKEN` is missing/invalid on Worker ingest, or Telegram API failed.
  - Check Worker logs with `bun run tail`.
- **503 on `/webhook`**
  - Media-group resolution failed, or the Worker could not enqueue the notify handoff.
  - Check Worker logs and queue status before retrying cutover.

## Security Notes

- Treat `TELEGRAM_BOT_TOKEN` as a secret.
- Keep `/webhook` protected by `TELEGRAM_WEBHOOK_SECRET`.
- Keep `HD_IMAGE_INGEST_TOKEN` secret and rotate it periodically.
- Keep `NOTIFY_DISPATCH_SECRET` secret and aligned with the site environment.
