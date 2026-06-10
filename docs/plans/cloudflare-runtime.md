# Cloudflare Runtime Migration Plan

Even for such a small project, Vercel's free tier is too constrained for the current runtime shape. This project already uses Cloudflare for image infrastructure, queues, D1-backed notification state, and scheduling, so the next infrastructure move is to finish the migration and run the site on Cloudflare.

This PR is scoped to the Vercel migration only. It should not implement the public/private repository split, Ghost-backed posts, or Astro 7 beta upgrade work.

## Intent

Move `buxx.me` from Astro on Vercel plus separate Cloudflare support workers to a Cloudflare-first runtime.

The target architecture is one primary Cloudflare Worker script for the site runtime:

- Astro static output served through Cloudflare Workers Static Assets.
- Astro on-demand routes handled by `@astrojs/cloudflare`.
- Existing public routes, admin routes, docs routes, and API routes preserved.
- Vercel redirects, cron behavior, analytics, and deployment previews replaced with Cloudflare equivalents.
- Existing Cloudflare image, queue, D1, R2, and scheduled work folded into the Cloudflare runtime where it stays simple.

This is not a feasibility spike. The work is a controlled migration away from Vercel.

## Scope

In scope:

- replace `@astrojs/vercel` with `@astrojs/cloudflare`
- add root Wrangler configuration for the Astro site
- deploy the site as a Cloudflare Worker with Workers Static Assets
- preserve the current static-first Astro behavior
- port Vercel redirects into Cloudflare/Astro routing
- replace Vercel Cron with Cloudflare Cron Triggers
- replace Vercel Analytics and Speed Insights with Cloudflare Worker Observability or Analytics Engine if runtime metrics are needed
- move production D1 access from Cloudflare HTTP API to direct Worker binding
- consolidate `image.buxx.me` into the primary Worker
- keep the current external blog redirect behavior
- make deploy previews/builds run from GitHub push using Cloudflare's recommended Git integration or CI path

Out of scope:

- public/private repository split
- private API package extraction
- Ghost-backed `/posts` or same-domain blog rendering
- Astro 7 beta upgrade
- redesign or project showcase changes
- broad component refactors unrelated to the runtime move

## Current Baseline

The current `main` baseline is Vercel-hosted Astro with Cloudflare support workers:

- `astro.config.mjs` imports `@astrojs/vercel` and uses `adapter: vercel()`.
- `astro.config.mjs` keeps `output: 'static'`; dynamic routes opt out with `export const prerender = false`.
- `vercel.json` owns the daily notify fallback cron and legacy blog redirects to `https://blog.buxx.me`.
- `src/layouts/Layout.astro` mounts Vercel Analytics and Speed Insights.
- `workers/telegram-image-proxy` owns Telegram webhook ingress, R2 image writes, R2 image reads, and queue-backed notify dispatch.
- `workers/notify-scheduler` owns scheduled notify calls into the site app.
- The Astro app reaches D1 through Cloudflare's HTTP API instead of a Worker binding.

## Platform Direction

Use Cloudflare Workers, not Cloudflare Pages, for this migration.

Reasons:

- Astro's Cloudflare adapter targets Cloudflare Workers for on-demand routes and runtime features.
- Workers Static Assets supports static files and Worker code in the same deployed Worker.
- `assets.run_worker_first` can intercept dynamic paths while static assets stay cheap.
- Cron Triggers, Queues, D1, R2, secrets, observability, and deployments can all live in the Cloudflare platform.

Primary references:

- Astro Cloudflare adapter: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- Astro Cloudflare deployment: https://docs.astro.build/en/guides/deploy/cloudflare/
- Astro on-demand rendering: https://docs.astro.build/en/guides/on-demand-rendering/
- Cloudflare Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Static asset binding and `run_worker_first`: https://developers.cloudflare.com/workers/static-assets/binding/
- Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Cloudflare D1 bindings: https://developers.cloudflare.com/d1/worker-api/
- Cloudflare Workers Observability: https://developers.cloudflare.com/workers/observability/
- Cloudflare Analytics Engine: https://developers.cloudflare.com/analytics/analytics-engine/

## Target Runtime

Use one primary Worker script, tentatively `buxx-site`, for:

- `https://buxx.me/*`
- `https://www.buxx.me/*`
- `https://image.buxx.me/*`

Routing rules:

- `buxx.me` and `www.buxx.me` serve Astro assets and Astro request handlers.
- `image.buxx.me` preserves the current image API shape:
  - `POST /webhook`
  - `GET /mood/:postId/:imageIndex`
  - `GET /channel/avatar`
  - authenticated `/ingest/*` routes
- scheduled notify work runs from the Worker's `scheduled()` handler.
- queue consumption runs from the Worker's `queue()` handler.

Keep hostname routing explicit. If the Worker starts needing clever routing abstractions, that is the warning sign to stop and split code by boring modules, not by clever framework layers.

## Static First, Dynamic Where Needed

Keep the current static-first Astro model initially:

- preserve `output: 'static'`
- keep route-level `export const prerender = false` for SSR endpoints and pages
- avoid switching the whole site to `output: 'server'` unless the route audit proves that most pages need request-time rendering

This keeps `/`, `/projects`, docs shell assets, and other build-time pages fast while still allowing dynamic APIs, mood pages, OAuth, admin portal pages, and protected docs behavior to run on demand.

## Bindings

The production Worker should use direct bindings:

- `NOTIFY_DB` D1 binding for notify/admin state
- `MOOD_IMAGES` R2 binding for HD image storage
- `NOTIFY_DISPATCH_QUEUE` Queue binding for immediate notification handoff
- Worker secrets for Telegram, Ghost home-card fetches, Resend, OAuth, notify dispatch, and internal cron auth
- optional KV/session binding if the Cloudflare adapter needs durable OAuth or admin session support

Do not keep the D1 HTTP API path as the long-term production default once the site runs inside Workers. It was useful for Vercel. On Cloudflare it is extra latency, extra secret scope, and extra failure surface.

## Migration Phases

### Phase 1: Adapter and Worker Build

Goal: make the Astro app build and run on Cloudflare Workers without changing product behavior.

Tasks:

- replace `@astrojs/vercel` with `@astrojs/cloudflare`
- add root `wrangler.jsonc`
- add `wrangler` as a root dev dependency
- keep the current static-first Astro output
- configure Workers Static Assets for Astro output
- configure `assets.run_worker_first` for dynamic paths:
  - `/api/*`
  - `/mood*`
  - `/dev/*`
  - `/oauth*`
  - `/docs*` only where protected docs need request-time auth
  - `image.buxx.me/*` through hostname routing
- remove Vercel-only runtime imports
- add scripts:
  - `deploy:cloudflare`
  - `preview:cloudflare`
  - `tail:cloudflare`
  - `types:cloudflare`

Acceptance:

- `bun install --frozen-lockfile`
- `bun run check`
- `bun run build`
- Wrangler config validation or a non-mutating deploy validation
- local preview can load `/`, `/projects`, `/mood`, `/docs`, `/api/health`, and `/oauth/login`

### Phase 2: Route and Redirect Parity

Goal: make Cloudflare serve the same URLs Vercel serves today.

Tasks:

- port all `vercel.json` redirects
- keep the current blog redirect behavior to `https://blog.buxx.me`
- do not implement same-domain posts in this PR
- verify trailing slash behavior for docs, mood detail pages, and legacy blog slugs
- preserve `/static/*` Telegram fallback behavior
- preserve `sitemap.xml`, RSS, oEmbed, SVG APIs, and Open Graph metadata
- keep protected docs auth behavior unchanged
- update `PUBLIC_SITE_URL`, canonical URLs, and privacy documentation where they currently name Vercel

Acceptance:

- route snapshot covers homepage, projects, docs, mood feed, mood detail, API health, OAuth start/callback, legacy blog redirects, and static fallback
- no public route silently changes status code without an explicit note in this PR

### Phase 3: Native D1 Binding

Goal: remove Vercel-era D1 HTTP glue from production runtime.

Tasks:

- adapt `src/features/notify/server/d1.ts` to support direct D1 binding
- keep the existing HTTP API path only as a rollout or local fallback
- migrate production config to `NOTIFY_DB`
- preserve prepared statements and explicit bind parameters
- add remote and local D1 migration commands
- verify admin subscriber and broadcast flows

Acceptance:

- notify service unit/e2e tests pass
- D1 reads and writes use prepared statements
- production runtime no longer needs `CLOUDFLARE_API_TOKEN` for notify database access

### Phase 4: Cron Migration

Goal: replace Vercel cron and the separate scheduler Worker with Cloudflare Cron Triggers.

Tasks:

- move notify schedule and retry trigger logic into the primary Worker's `scheduled()` handler
- configure Wrangler `triggers.crons`
- keep a manual trigger endpoint guarded by `WORKER_MANUAL_TOKEN` or an equivalent admin-only secret
- remove Vercel cron fallback after Cloudflare scheduled runs are verified
- update docs that currently describe Vercel cron or the scheduler as separate production runtime

Acceptance:

- `scheduled()` can run schedule and retry paths independently
- local testing uses Wrangler's scheduled trigger test flow
- production cron propagation window is documented

### Phase 5: Image and Queue Consolidation

Goal: consolidate the current image Worker into the primary Cloudflare Worker.

Tasks:

- move image-worker routing into the root Worker runtime
- preserve `image.buxx.me/webhook`, `/mood/:postId/:imageIndex`, `/channel/avatar`, and authenticated ingest routes
- keep R2 cache headers and 404 fallback contract unchanged
- keep Queue idempotency and retry behavior explicit
- keep image-byte logic outside Astro page components
- remove the old image Worker deployment only after the consolidated Worker has served real traffic

Acceptance:

- current `workers/telegram-image-proxy/tests/index.e2e.test.ts` behavior is preserved or moved into equivalent root tests
- `image.buxx.me` is served by the primary Worker route
- webhook, ingest, R2 reads, and queue dispatch all pass targeted tests
- rollback path exists before deleting the old Worker deploy

### Phase 6: Deployment and Observability

Goal: make Cloudflare the normal deployment path.

Tasks:

- configure GitHub push-triggered Cloudflare builds using the recommended Cloudflare path for Workers
- keep preview and production environments explicit
- define environment-specific secrets and bindings in Wrangler
- replace Vercel Analytics and Speed Insights with Worker Observability
- add Analytics Engine only if product metrics need custom event writes
- remove Vercel deployment dependency after Cloudflare preview and production checks pass

Acceptance:

- pushes to `cloudflare-runtime` create a Cloudflare preview deployment
- production deploy path is documented and repeatable
- Cloudflare logs/metrics are available for request failures, cron runs, queue failures, and image route errors
- Vercel preview is no longer treated as the migration signal

## Validation Matrix

Required before merge:

- `bun install --frozen-lockfile`
- `bun run check`
- `bun run build`
- `bun run test:unit`
- targeted Playwright smoke for `/`, `/projects`, `/mood`, `/docs`, `/api/health`, and legacy redirects
- worker tests for image ingest/read behavior
- Wrangler config validation or dry-run deploy validation

Manual production checks:

- Cloudflare route points to the correct Worker script
- secrets exist and are scoped to the right environment
- D1 binding points to the existing notify database
- R2 binding points to the existing mood image bucket
- queue binding points to the existing notify queue
- scheduled trigger appears in Cloudflare dashboard
- Worker Observability is available for production debugging
- analytics/privacy docs no longer claim Vercel hosting after cutover

## Rollback

Keep rollback boring:

- leave Vercel production untouched until Cloudflare preview passes route parity
- keep the old image Worker deployed until the consolidated Worker has served real traffic
- keep the D1 HTTP fallback until direct binding has passed production reads and writes
- move DNS only after Cloudflare preview passes the route snapshot
- if cutover fails, move DNS back to Vercel and keep the Cloudflare Worker deployed for inspection

## Explicit Non-Goals

- Do not implement `/posts`.
- Do not move Ghost content to the same domain.
- Do not extract private API packages.
- Do not change the public/open-source split.
- Do not upgrade to Astro 7 beta in this PR.
- Do not continue Vercel-specific preview/build work except as a temporary fallback during migration.
