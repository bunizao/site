# Telegram HD Image Proxy (`telegram-image-proxy`)

Cloudflare Worker that serves high-resolution Telegram photos for the Mood section.

At a glance:
- A Cloudflare KV namespace stores a lookup table from `(postId, imageIndex)` to Telegram `file_id`.
- The Worker resolves `file_id` to `file_path` via the Telegram Bot API, downloads the original bytes, and returns them with long-lived cache headers.
- Optional: Cloudflare Image Resizing (`?w=`/`?q=`) for responsive images.
- The site prefers the Worker URL when `PUBLIC_HD_IMAGE_URL` is set and falls back to the built-in `/static/` proxy if the Worker cannot serve an image.

## Components

### 1. Worker

Location: `workers/telegram-image-proxy` (this folder)

Route:
- `GET /mood/:postId/:imageIndex`
- `HEAD /mood/:postId/:imageIndex`
- `OPTIONS` is handled for CORS preflight

Environment bindings:
- `TELEGRAM_BOT_TOKEN` (secret)
- `MOOD_IMAGES` (KV namespace binding)

### 2. KV Namespace

Binding name: `MOOD_IMAGES`

Key format:
- `mood:{postId}:{imageIndex}`

Value:
- Telegram `file_id` (string)

### 3. Indexing Pipeline

Real-time indexing:
- `../../src/pages/api/telegram-webhook.ts` receives `channel_post` updates and writes photo `file_id`s into Cloudflare KV.

Backfill indexing:
- `../../scripts/index-telegram-history.ts` can write historical keys into Cloudflare KV (useful for older posts).

## Request API

Base route:

```text
GET https://<HD_IMAGE_HOST>/mood/<postId>/<imageIndex>
```

Query params:
- `w` or `width` (optional): resize width. The Worker clamps this to `2048`.
- `q` (optional): output quality. Clamped to `40..95` (default: `82`).

Examples:

```text
https://image.example.com/mood/123/0
https://image.example.com/mood/123/0?w=1200&q=85
```

Response behavior:
- `404` if the image is not indexed in KV.
- `502` if Telegram APIs fail or the file cannot be fetched.
- CORS is enabled (`Access-Control-Allow-Origin: *`) for cross-origin `<img>` usage.
- The response is cached aggressively (`Cache-Control: public, max-age=31536000, immutable`), and the Worker stores the response in `caches.default` keyed by full URL.

## Setup

### 1. Create the KV Namespace

From `workers/telegram-image-proxy`:

```bash
bunx wrangler kv namespace create MOOD_IMAGES
```

Copy the namespace id into `wrangler.toml` under `[[kv_namespaces]]`.

### 2. Set the Worker Secret

From `workers/telegram-image-proxy`:

```bash
bunx wrangler secret put TELEGRAM_BOT_TOKEN
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

Set the site environment variable:
- `PUBLIC_HD_IMAGE_URL=https://<HD_IMAGE_HOST>`

The HTML generation in `../../src/lib/telegram.ts` will then prefer:
- `https://<HD_IMAGE_HOST>/mood/<postId>/<imageIndex>`

If the Worker 404s, the `<img>` tag will fall back to the `/static/` Telegram proxy.

## Indexing Images Into KV

### Option A: Telegram Webhook (Recommended)

This is the intended "hands-off" flow for new posts.

1. Deploy the site with these environment variables set:
- `TELEGRAM_WEBHOOK_SECRET` - used to verify Telegram's `X-Telegram-Bot-Api-Secret-Token` header.
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account id.
- `CLOUDFLARE_API_TOKEN` - API token with KV write permission.
- `CLOUDFLARE_KV_NAMESPACE_ID` - namespace id for `MOOD_IMAGES`.

2. Configure the Telegram webhook to call the site endpoint:

```bash
curl -sS -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://<SITE_HOST>/api/telegram-webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

When a new channel post contains a photo, the endpoint writes:
- `mood:<message_id>:<imageIndex>` -> `<file_id>`

### Option B: Backfill Historical Posts

For older posts that predate webhook deployment, run this from the repo root:

```bash
TELEGRAM_BOT_TOKEN=... \
TELEGRAM_CHANNEL_ID=-100... \
CLOUDFLARE_ACCOUNT_ID=... \
CLOUDFLARE_API_TOKEN=... \
CLOUDFLARE_KV_NAMESPACE_ID=... \
npx tsx scripts/index-telegram-history.ts
```

Notes:
- Telegram bots have limited access to channel history; the script uses forwarding as a workaround.
- You may need a private temp chat/group (`TELEGRAM_TEMP_CHAT_ID`) where the bot can forward messages.

## Notes and Limitations

- This system does not permanently store image bytes. KV stores references (`file_id`), and the Worker caches the fetched bytes at the edge.
- Media groups (albums) are not fully indexed by default: `../../src/pages/api/telegram-webhook.ts` currently writes `imageIndex = 0` only. Other indices will fall back to `/static/` unless you backfill additional keys.
- Caching is keyed by the full request URL. If KV mappings change, you may need to purge the Worker cache or use a cache-busting query param.

## Troubleshooting

- **404: "Image not indexed"**
  - KV is missing `mood:<postId>:<imageIndex>` or the wrong namespace is configured.
  - Confirm your webhook is receiving updates and that it can write to the KV namespace.
- **502: "Telegram API error"**
  - `TELEGRAM_BOT_TOKEN` is missing/invalid, or Telegram is failing.
  - Check Worker logs with `bun run tail`.
- **Resizing not applied**
  - Cloudflare Image Resizing may not be enabled on the zone/account.
  - The Worker will fall back to returning the original image.

## Security Notes

- Treat `TELEGRAM_BOT_TOKEN` and `CLOUDFLARE_API_TOKEN` as secrets.
- Keep `/api/telegram-webhook` protected by `TELEGRAM_WEBHOOK_SECRET` (do not disable the header check).
