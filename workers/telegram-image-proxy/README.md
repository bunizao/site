# Image Quality Upgrade Worker (`telegram-image-proxy`)

Cloudflare Worker that serves Telegram photos from R2 for the Mood section.

At a glance:
- The Worker serves image bytes directly from R2.
- The site webhook (`/api/telegram-webhook`) calls Worker ingest routes to pull image bytes from Telegram once and store them in R2.
- The ingest step also pre-generates common responsive widths (`480`, `800`, `1200`, `1600`) and stores them in R2.
- Runtime image requests read from R2 only.
- On R2 miss, the Worker returns `404` and the site should fallback to `/static/<telegram-url>`.

## Components

### 1. Worker

Location: `workers/telegram-image-proxy` (this folder)

Route:
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
- `MOOD_IMAGES` (R2 bucket binding)

### 2. R2 Bucket

Binding name: `MOOD_IMAGES`

Key format:
- `mood/<postId>/<imageIndex>`
- `channel/avatar`

### 3. Indexing Pipeline

Real-time indexing:
- `../../src/pages/api/telegram-webhook.ts` receives `channel_post` updates and calls the ingest routes.
- The Worker fetches bytes from Telegram and writes image objects into R2.

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
- Media groups (albums) are still indexed as `imageIndex = 0` in `../../src/pages/api/telegram-webhook.ts`.
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

## Security Notes

- Treat `TELEGRAM_BOT_TOKEN` as a secret.
- Keep `/api/telegram-webhook` protected by `TELEGRAM_WEBHOOK_SECRET` (do not disable the header check).
- Keep `HD_IMAGE_INGEST_TOKEN` secret and rotate it periodically.
