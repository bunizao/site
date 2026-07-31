# Mood media into R2

**Scope.** Take Telegram out of the read path for mood video/audio/document/
animation media, and make the currently-unplayable oversize files play.

**Depends on.** Nothing.
**Blocks.** Nothing.
**Repos.** `site-api` (primary), `site` (one small frontend change).

**Implementation status.** The additive `site-api` code foundation is complete
on `main`: versioned lifecycle state, R2-first reads, signed bounded work/report
endpoints, the streaming VPS package, and the dry-run-first backfill. Nothing has
been deployed or applied. The D1 migration, Worker secrets, backfill, systemd
installation, browser seeking proof, and `site` cleanup remain gated.

---

## Decisions already made

- **R2, not Cloudflare Stream.** The whole corpus is 18 videos / 253 MB /
  **16 minutes** (max 4.3 min). Stream bills $5 per 1,000 minutes stored with a
  $5 minimum purchase — $60/year to hold 16 minutes — plus $1 per 1,000 minutes
  delivered. R2 holds the same bytes inside the 10 GB-month free tier for $0.
  Stream sells adaptive bitrate, encoding, and a player; 4-minute clips need
  none of it. *Revisit if long-form original video lands (~>10 h stored, or any
  source needing ABR).*
- **The 20 MB ceiling is already solved.** `scripts/mood-reconcile/` runs GramJS
  (MTProto) on a VPS under systemd. The 20 MB cap belongs to the Bot API HTTP
  wrapper, not MTProto — the same bot token over `upload.getFile` pulls full
  files. No new infrastructure.
- **`MOOD_IMAGES` and `BLOG_IMAGES` stay separate buckets.** Different ingest,
  lifecycle, and retention.

## Implementation state

- Migration `0009_mood_media_objects.sql` adds explicit generation state with
  `pending`, `ready`, `failed`, `retiring`, and `retired` states. Additive
  migration `0010_mood_media_lifecycle.sql` backfills a private lifecycle ID;
  work and reports echo it so delayed results from a reactivated generation fail
  closed. Compatibility triggers cover older Worker inserts and reactivations
  during rollout or rollback. Neither migration has been applied to production.
- The public media route is `/api/v2/media/mood/{id}/{kind}`. A ready unversioned
  request redirects to the immutable `?v=<sourceVersion>` form; the Worker maps
  that version to its server-owned R2 object key.
- `MOOD_IMAGES` is optional. R2 hits support `GET`, `HEAD`, open, bounded, and
  suffix ranges without Telegram credentials. Missing state tables, D1 lookup
  failures, and R2 misses preserve the legacy R2/Telegram fallback.
- `scripts/mood-media-sync/` owns its MTProto state, streams bounded work directly
  into R2 through the S3 API, deletes retired generations, and reports
  deterministic idempotent results. Its private protocol package is also used by
  the Worker, keeping routes, media kinds, limits, DTOs, and parsers identical.
- The five-file and 200 MiB limits apply to uploads, not deletion work. The
  Worker returns explicit deferred counts and byte totals; the VPS rejects a
  response that omits them and includes them in its completion log.
- `scripts/backfill-mood-media-state.ts` is read-only by default and writes only
  with `--execute` after the operator reviews its inventory.
- `mood-reconcile` remains unchanged and retains its one-read MTProto budget.

## Steps

### 1. New systemd unit `mood-media-sync`

Implemented as a self-contained package in `site-api/scripts/mood-media-sync/`.
Installing or enabling the unit remains a production rollout action.

Do **not** add downloads to `reconcile.mjs`. Downloads are N unbounded
`upload.getFile` calls; folding them in breaks the one-read budget, the flood
discipline, and the failure semantics of the safety valve — a download timeout
would fail a run that correctly detected deletions.

Create `site-api/scripts/mood-media-sync/` mirroring `mood-reconcile/`:
`sync.mjs`, `package.json`, `.env.example`, `.service`, `.timer`, `README.md`,
same `sudo cp` → `/opt/` deploy story.

- **Separate state file.** Do not share `state.json` — both processes write the
  session string, which is a race. Own file, own session, same bot token.
- **Work list** from a new signed site-api endpoint (reuse the
  `MOOD_DELETE_SYNC_SECRET` HMAC pattern the reconciler already uses) returning
  `{ messageId, kind, fileSize }` for a bounded batch. Do not read D1 from the VPS.
- **Stream the download** (`client.downloadMedia` / `iterDownload`), never
  buffering a whole file.
- **Cap per run** — start at 5 files or 200 MB, whichever comes first — so the
  backfill spreads across ticks. Log what was deferred.

### 2. Upload straight to R2 over the S3 API

VPS → `https://<account>.r2.cloudflarestorage.com/mood-images/...`, not through
a Worker. The bytes already stream on the VPS; a 99 MB body through a Worker is
waste.

- New `.env` entries (mode 600, as `mood-reconcile` does):
  `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Scope the R2 API
  token to **object read/write on `mood-images` only**.
- **Versioned key scheme
  `mood/media/{channel}/{postId}/{kind}/{sourceVersion}`.** The Worker owns and
  returns the exact key; the VPS never derives it. Edited or replaced Telegram
  media therefore cannot reuse an immutable cache entry.
- `httpMetadata.contentType` from the Telegram mime type;
  `cacheControl: 'public, max-age=31536000, immutable'` (constants already exist
  in the image proxy). `source` and `updatedAt` in `customMetadata`.
- Single PUT is fine at today's 99 MB max; add multipart only past ~100 MB.
- **Report back** to a signed endpoint so the next run's work list shrinks. Must
  be idempotent — re-uploading an existing key is harmless.

### 3. Read path: R2 first, Telegram as fallback

In `telegram-media-proxy.ts`:

1. Add `MOOD_IMAGES?: R2BucketLike` to `TelegramMediaProxyEnv`. Reuse the
   `R2BucketLike` shape from `telegram-image-proxy.ts` — lift it to a shared
   module rather than declaring a second one.
2. Resolve a ready generation from `mood_media_objects`, redirect an unversioned
   request to `?v=<sourceVersion>`, and read the exact stored `object_key`.
3. Before the migration is available, preserve legacy R2 reads. On a miss or D1
   failure, fall through to the existing `getFile` path, still capped at 20 MB.
4. Keep 404 only when durable storage misses and Telegram cannot serve the file.

**Range support is the fiddly part.** Scrubbing needs `206` + a correct
`Content-Range`. R2's `get(key, { range: { offset, length } })` returns bytes but
you build `Content-Range` and `Content-Length` yourself from `object.size`, and
echo `Accept-Ranges: bytes`. Getting it subtly wrong shows up as Safari refusing
to seek while Chrome looks fine. Cover with tests, not eyeballs:

- full `GET` → 200, correct `Content-Length`
- `Range: bytes=0-` → 206, `Content-Range: bytes 0-{size-1}/{size}`
- `Range: bytes=100-199` → 206, exactly 100 bytes
- unsatisfiable range → 416
- `HEAD` → no body, correct headers

Keep the existing `caches.default` behaviour, including the bypass for range
requests.

### 4. Frontend cleanup (`site`)

`src/features/mood/shared/feed-media.ts` `isTooBigVideoDocument()` matches the
literal title `"media is too big"`. Keep the detector but make it lose to a real
media item: if the post now carries a playable `video`/`audio` entry, render
that and drop the card. Check every `findTooBigVideoMedia` caller agrees —
`FeedShell.astro`, `initial-feed.ts`, `lcp-preload.ts`.

## Acceptance

- All ≤99 MB mood media served from `/api/v2/media/mood/{id}/{kind}` with zero
  Telegram calls on a warm path.
- The 5 currently-oversize items (3 video, 1 document, 1 audio) play.
- Seeking works in Safari and Chrome.
- `mood-reconcile` still reports exactly one MTProto read per run.
- R2 storage after full backfill ≈ 0.35 GB.

## Non-goals

- Cloudflare Stream.
- A self-hosted `telegram-bot-api` server — MTProto already covers it.
- Any change to `mood-reconcile`'s one-read-per-run contract.
- Caching third-party assets (YouTube posters, og:images). Those belong in the
  static proxy, not R2 — see [static-proxy-hardening.md](static-proxy-hardening.md).
