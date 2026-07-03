# Architecture Audit — July 2026

Full-system audit of the two-repo Cloudflare deployment: `site` (public worker, this repo) and `site-api` (private worker, sibling repo). Three review rounds were run with the owner; scope corrections from the owner are folded in and recorded in the Decisions Log below. Every finding cites code evidence.

- Audit base: `site` at the `plan-new-blog-era` lineage tip (`375c790`), spot-checked against `main` (`f70e8ce`) — all cited findings hold on `main`. `site-api` at `main` (`0568937`).
- Companion documents: each remediation workstream has its own executive plan under `docs/plans/` in the repo it touches, delivered as a separate PR. See the Roadmap section for the index.

---

## 1. System overview

- `site` — Astro 7 + React islands + Tailwind on Cloudflare Workers. Routes `buxx.me/*`, `www.buxx.me/*`, `blog.buxx.me/*`. Public renderer plus thin `/api/*` service-binding fallback.
- `site-api` — Astro 6 used as a JSON API host on Cloudflare Workers. Routes `buxx.me/api/*`, `api.buxx.me` (custom domain), `image.buxx.me` (custom domain). Owns D1 (`site-mood`, `site-notify`), KV (`SESSION`), R2 (`mood-images`, `blog`), a queue (`telegram-notify-dispatch`), two crons, a Durable Object (`BroadcastJobDO`), the Telegram webhook, and the image proxy.
- Shared contract types are duplicated byte-for-byte as `@bunizao/contracts` in both repos; `site` is canonical, synced by `scripts/sync-contracts.ts` in `site-api`.
- Mood data has two sources by design: v1 = live Telegram mirror (HTML scrape of `t.me`), v2 = structured D1 archive fed by the Telegram webhook.

## 2. What is worth keeping

- **`MoodReadRepository` + `createMoodFeedRoute`** (`site-api/src/features/mood/server/`): clean repository/route separation; the pivot point for every read-path change.
- **D1 mood schema** (`site-api/migrations/`): full `raw` retention, structured columns, FTS5, separate tags table, `PRIMARY KEY (channel, message_id)` — healthy and extensible.
- **Ingest layering** (`ingest/telegram-normalizer.ts` / `telegram-persistence.ts`).
- **Zone routing**: `buxx.me/api/*` routes directly to `site-api`; production traffic does not stack proxies.
- **Frontend fundamentals**: correct prerender split (home/blog/projects static, mood SSR), only two React islands (`client:visible`), responsive images with eager-first/lazy-rest + AVIF/WebP, `font-display: optional` on the primary mono, Lighthouse in CI.
- **Notify idempotency**: `hasBeenSent` checks plus Resend idempotency keys prevent duplicate sends even under batch retries.

## 3. Findings

### 3.1 Ingest and queue reliability (highest impact)

- The Telegram webhook does all heavy work inline before answering Telegram (`site-api/src/features/mood/image-proxy/telegram-image-proxy.ts:585`): media-group resolution via a `t.me` embed fetch, avatar ingest, `getFile` + image download + R2 write, sequential D1 writes, **synchronous OpenAI sentiment classification**, then a queue send. The handler does not receive an `ExecutionContext`, so `waitUntil` is unavailable. Any slow step makes Telegram retry the whole update; mid-flight 502/503 responses re-run already-succeeded steps.
- The queue consumer (`worker-tasks.ts:161`) hides the native `MessageBatch` behind a custom type with no `ack()`/`retry()`; the first failure throws and retries the entire batch. The consumer config has **no `dead_letter_queue`** — after 5 retries messages are silently dropped.
- No `db.batch()` anywhere in `site-api`; `telegram-persistence.ts` issues 4+N sequential statements per record with no atomicity.
- Cron and queue work is dispatched through **fake HTTP self-calls**: `worker-tasks.ts` builds `https://api.buxx.me/v2/notify/…` requests with a `CRON_SECRET` bearer and feeds them to the worker's own `fetch`. Types are erased, errors degrade to strings, and a drifted `NOTIFY_BASE_URL` would silently turn in-process calls into public-network calls. `notify-source.ts` already proves direct repository calls work fine.

### 3.2 Platform and binding hygiene

- **`SESSION` KV is a god-namespace**: admin sessions (security-critical), mood-stats snapshots (cache), mood AI config, MusicKit token cache, and image-proxy data share one namespace. Code already supports a dedicated `MUSICKIT_TOKEN_CACHE` binding (`musickit/server/token.ts:34`) that was never declared in `wrangler.jsonc`.
- `SESSION` is declared **without a namespace id** — deployable only via provisioning; the id should be pinned to prevent silent namespace swaps on environment rebuilds.
- `notify/server/d1.ts` keeps a **Cloudflare REST API fallback** (account API token + `CLOUDFLARE_NOTIFY_D1_DATABASE_ID`/`CLOUDFLARE_ACCOUNT_ID` vars) for a database that has a binding. Legacy of the pre-cutover era; enlarges the attack surface.
- In-memory rate limiting (`lib/security/rate-limit.ts`, module-level `Map`) is per-isolate/per-PoP — decorative at global scale. Real protection is the zone WAF rules; the code should either use the Workers Rate Limiting binding or stop emitting misleading 429 headers.
- `preview_urls: true` on the private worker exposes endpoints on `workers.dev` URLs that bypass the zone WAF/rate-limit rules.
- The Ghost webhook secret falls back to `NOTIFY_DISPATCH_SECRET` — one secret, two duties.
- `site/src/worker.ts` still exports a queue handler (`api-queue-bridge.ts`) although `site` has no queue binding — dead cutover code.
- Owner-confirmed design intent (kept as-is): `/api/footer`, `/api/github/contributions`, `/api/listening` are deliberately uncached (realtime data). Their `s-maxage` headers are dead weight on worker routes and should become `no-store` so declaration matches behavior.

### 3.3 API surface

- The route tree is duplicated three ways because the two ingresses differ in path shape (`buxx.me/api/*` carries `/api`, `api.buxx.me/*` does not). ~90 files under `site-api/src/pages/`, nearly half re-exports or redirects. One implementation answers at up to four public URL shapes (`buxx.me/api/v2/…`, `buxx.me/v2/…` via the `site` catch-all proxy, `api.buxx.me/v2/…`, `api.buxx.me/api/v2/…`).
- Semantic contradiction: `/api/v1/mood` serves live data while `/v1/mood` 308-redirects to `/v2/mood`.
- notify/admin/ghost/musickit/health have no v1 — their `/v2/` prefix is a fake version.
- No CI check runs `sync-contracts --check`; contract drift between the repos would only surface at runtime.

### 3.4 Frontend performance (site)

- **`/mood` and `/mood/[id]` LCP is held hostage by the `t.me` round-trip.** The code documents it itself (`telegram-source.ts:1816`): "every cold isolate paid the full ~3s t.me round-trip — which is ~65% of the mood LCP". Existing mitigations are short-TTL, per-PoP layers (LRU 5–10 min, `caches.default` for raw HTML, fetch timeout + skeleton fallback, 60s HTML edge cache for `/mood` only). The detail page is outside the middleware cache (`pathname === '/mood'` only) and ships no cache headers — cold-PoP detail views pay the scrape in SSR.
- **Double payload on `/mood`**: `FeedShell.astro` inlines the full initial-feed JSON (`data-mood-initial-feed`, including `mediaHtml` strings) *and* SSR-renders the critical posts markup — the same content twice per response.
- `Layout.astro` (~1390 lines) ships four bundled script blocks (~1000 lines: spotlight overlay, theme dropdown, GSAP nav collapse, nav underline) plus an inline ~60-line visualViewport handler repeated in every HTML response.
- Fonts: two overlapping mono families; JetBrains Mono (113 KB) is the largest single asset. Geist Mono is preloaded with `font-display: optional` (good); JetBrains Mono is not subset.
- `Hero.astro:216` statically imports GSAP (eager chunk on the home page) while every other consumer lazy-imports it.
- Astro `prefetch` is not enabled.

### 3.5 Boundary notes

- The admin portal UI runs on the **public** worker (`site/src/pages/dev/portal/**`) and reaches the private API through a three-hop proxy chain; auth logic and `CLOUDFLARE_ACCESS_*` config are duplicated across both repos. Owner accepted migrating the portal into `site-api` behind `admin.buxx.me` + Cloudflare Access; no third deployable.
- E2E fixture branches sit first in production request paths (`/api/[...path].ts`, api-client).
- `bun dev` proxies `/api/*` to production by default.

## 4. Decisions log (owner-confirmed)

| Topic | Decision |
| --- | --- |
| Live Telegram reads for mood | Intentional (realtime reactions/comments); do not archive comments (write-amplification/attack surface). Keep live semantics. |
| listening / contributions / footer caching | Intentionally uncached (realtime data); only align headers. |
| Two repos (`site` open source, `site-api` private) | Keep split; no monorepo. |
| Image proxy worker | Keep in `site-api` (serves mood + blog, two R2 buckets); only extract the webhook out of the image-proxy module. |
| Admin portal | Migrate into `site-api` behind `admin.buxx.me`; then remove the portal + proxies from `site`. |
| Mood read path | Adopt the hybrid design: D1 archive for structure/SSR, live meta patching for reactions/comment counts. See the `claude/audit-mood-hybrid-read` workstream PR. |

## 5. Hybrid mood read (the flagship change)

Post content is not realtime data; only reactions and comment counts are — and precisely those are unreliable in D1 (Bot API `channel_post`/`edited_channel_post` updates do not carry reaction changes). The hybrid keeps each concern on the source that is authoritative for it:

- SSR (`/mood`, `/mood/[id]`) reads the D1 archive through the service binding (~10–50 ms instead of ~3 s), rendering the same `MoodFeedItem` contract — markup and components unchanged.
- After hydration the client calls a new lightweight `GET /v1/mood/meta?ids=…` endpoint and patches only the reaction/comment-count text nodes in place (same pattern as the existing update-notice flow — no re-render, no layout shift).
- Comments stay client-fetched from live (unchanged). The existing 75 s update watcher keeps detecting newer live posts and can trigger a server-side reconcile, turning the webhook single point into a self-healing one.
- Rollout behind a `MOOD_READ_SOURCE` env switch (the `source` parameter already exists in `api-client.ts`); a parity diff between live and archive serializations gates the cutover. Deleting the 1,917-line `telegram-source.ts` scraper is an explicit phase 2 after stability.

Expected effect: removes the documented ~65% LCP share on cold paths for `/mood`, gives `/mood/[id]` (today: zero cache protection) the same win, makes new-post latency better (webhook push vs 5-minute LRU window), and shrinks the blast radius of a Telegram DOM change from "site front page" to "reaction counters".

## 6. Roadmap

Each workstream is a separate PR carrying its executive plan under `docs/plans/<slug>.md`; implementation lands on the same branch.

### site-api

| Branch | Impact / risk | Scope |
| --- | --- | --- |
| `claude/audit-ingest-reliability` ([site-api#5](https://github.com/bunizao/site-api/pull/5)) | High / medium | Webhook slimming (ExecutionContext, async offload, module extraction), queue DLQ + per-message ack/retry, `db.batch()`, cron/queue direct function calls |
| `claude/audit-platform-bindings` ([site-api#6](https://github.com/bunizao/site-api/pull/6)) | Medium / low | KV split + pinned ids, `MUSICKIT_TOKEN_CACHE`, delete D1 REST fallback, Rate Limiting binding, `preview_urls` off, Ghost secret, header alignment, AI Gateway (optional) |
| `claude/audit-route-consolidation` ([site-api#7](https://github.com/bunizao/site-api/pull/7)) | High / medium-high | Entry-path normalization, alias-tree deletion, de-versioning fake-versioned paths, 308 window, external registration switch-list |
| `claude/audit-mood-live-meta` ([site-api#8](https://github.com/bunizao/site-api/pull/8)) | High value / low | New `GET /v1/mood/meta` endpoint (prerequisite of hybrid read) |
| `claude/audit-notify-service-split` ([site-api#9](https://github.com/bunizao/site-api/pull/9)) | Maintainability / low | Split the 2,757-line notify service into four modules; zero behavior change |
| `claude/audit-admin-portal-migration` ([site-api#10](https://github.com/bunizao/site-api/pull/10)) | High / medium | Portal UI into `site-api` behind `admin.buxx.me` + Cloudflare Access |

### site

| Branch | Impact / risk | Scope |
| --- | --- | --- |
| `claude/audit-mood-hybrid-read` ([#65](https://github.com/bunizao/site/pull/65)) | High / medium | Default read source to archive, client meta patching, reconcile hook, parity gate; scraper deletion as phase 2. Depends on `audit-mood-live-meta` |
| `claude/audit-frontend-performance` ([#66](https://github.com/bunizao/site/pull/66)) | Medium / low | `/mood` payload dedup, layout script cleanup, font subsetting, GSAP lazy import, `prefetch`, dead queue-bridge removal |
| `claude/audit-route-contracts` ([#67](https://github.com/bunizao/site/pull/67)) | Medium / low | `routes.ts` path constants in contracts, `sync-contracts --check` in both CIs, `/v2` catch-all 308, e2e fixture branch out of the hot path. Pairs with `audit-route-consolidation` |
| `claude/audit-admin-portal-removal` ([#68](https://github.com/bunizao/site/pull/68)) | Medium / low | Remove portal UI + `/dev/portal/api` + `/oauth` catch-alls + duplicated Access config. Depends on `audit-admin-portal-migration` |

Dependency order: `ingest-reliability`, `platform-bindings`, `notify-service-split`, `frontend-performance` are independent; `route-contracts` precedes/pairs with `route-consolidation`; `mood-live-meta` → `mood-hybrid-read`; `admin-portal-migration` → `admin-portal-removal`.
