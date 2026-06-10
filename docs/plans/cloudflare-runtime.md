# Cloudflare Runtime Migration Plan

## Intent

Move `buxx.me` from the current Astro/Vercel split to a Cloudflare-first runtime without turning the project into a deploy maze.

The target architecture is one primary Cloudflare Worker script for the public site runtime:

- Astro static output served through Cloudflare Workers Static Assets.
- Astro on-demand routes handled by `@astrojs/cloudflare`.
- Existing `/api/*`, `/mood`, `/docs`, `/dev/portal`, and OAuth surfaces preserved.
- Existing Cloudflare primitives moved from HTTP handoff to direct bindings where practical.
- Existing image and scheduler workers consolidated only after the site Worker is stable.

This is not a feasibility spike. Astro-on-Cloudflare is the expected direction. This branch is the migration control plane.

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

- Astro's Cloudflare adapter now targets Cloudflare Workers for on-demand routes and features.
- Workers Static Assets supports static files and Worker code in the same deployed Worker.
- `assets.run_worker_first` lets the runtime intercept only dynamic paths such as `/api/*`, `/mood*`, `/dev/*`, `/oauth*`, and protected `/docs*` while static files stay cheap.
- Cron Triggers, Queues, D1, R2, and secrets all become native Worker bindings instead of cross-platform HTTP glue.

Primary references:

- Astro Cloudflare adapter: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- Astro Cloudflare deployment: https://docs.astro.build/en/guides/deploy/cloudflare/
- Astro on-demand rendering: https://docs.astro.build/en/guides/on-demand-rendering/
- Cloudflare Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Static asset binding and `run_worker_first`: https://developers.cloudflare.com/workers/static-assets/binding/
- Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Cloudflare D1 bindings: https://developers.cloudflare.com/d1/worker-api/

## Final Shape

### One Primary Worker

Use one primary Worker script, tentatively `buxx-site`, for:

- `https://buxx.me/*`
- `https://www.buxx.me/*`
- optional route handling for `https://image.buxx.me/*` after image-worker consolidation

The Worker should route by hostname and pathname:

- `buxx.me` and `www.buxx.me` serve Astro assets and Astro request handlers.
- `image.buxx.me` keeps the current image API shape if consolidated later.
- Cron and queue handlers live in the same Worker module when consolidation is safe.

### Static First, Dynamic Where Needed

Keep the current static-first Astro model initially:

- preserve `output: 'static'`
- keep route-level `export const prerender = false` for SSR endpoints and pages
- avoid switching the whole site to `output: 'server'` unless the route audit proves that most pages need request-time rendering

This keeps `/`, `/projects`, static docs assets, SVG endpoints that can be prerendered, and other build-time pages fast.

### Bindings

The production Worker should eventually use direct bindings:

- `NOTIFY_DB` D1 binding for notify/admin state
- `MOOD_IMAGES` R2 binding for HD image storage
- `NOTIFY_DISPATCH_QUEUE` Queue binding for immediate notification handoff
- Worker secrets for Telegram, Ghost, Resend, OAuth, notify dispatch, and internal cron auth
- optional KV/session binding if Astro sessions or OAuth state need it under the Cloudflare adapter

Do not keep the D1 HTTP API path as the long-term default once the site runs inside Workers. It was useful for Vercel. On Cloudflare it is extra latency, extra secret scope, and extra failure surface.

## Migration Phases

### Phase 1: Runtime Adapter

Goal: make the Astro app deployable to Cloudflare Workers without changing product behavior.

Tasks:

- replace `@astrojs/vercel` with `@astrojs/cloudflare`
- add `wrangler.jsonc` at the app root
- add `wrangler` as a root dev dependency
- keep `output: 'static'` unless the build requires a stricter mode
- configure Workers Static Assets for Astro output
- configure `assets.run_worker_first` only for dynamic app paths
- port Vercel redirects into Astro config or Worker routing
- remove Vercel-only runtime imports behind a provider abstraction or feature flag
- add scripts:
  - `deploy:cloudflare`
  - `preview:cloudflare`
  - `tail:cloudflare`
  - `types:cloudflare`

Acceptance:

- `bun run check`
- `bun run build`
- `bunx --bun wrangler deploy --dry-run` or equivalent non-mutating validation
- local preview can load `/`, `/projects`, `/mood`, `/docs`, `/api/health`, and `/oauth/login`

### Phase 2: Route and Redirect Parity

Goal: make Cloudflare serve the same URLs Vercel serves today.

Tasks:

- port all `vercel.json` blog redirects
- verify trailing slash behavior for docs, mood detail pages, and legacy blog slugs
- preserve `/static/*` Telegram fallback behavior
- preserve `sitemap.xml`, RSS, oEmbed, SVG APIs, and Open Graph metadata
- keep protected docs auth behavior unchanged
- update `PUBLIC_SITE_URL`, canonical URLs, and privacy documentation

Acceptance:

- route snapshot covering homepage, docs, mood feed, mood detail, API health, OAuth start/callback, legacy blog redirects, and static fallback
- no public route silently changes status code without an explicit note in this PR

### Phase 3: Native Cloudflare Data Bindings

Goal: remove Vercel-era HTTP glue where the app can use direct Cloudflare bindings.

Tasks:

- adapt `src/features/notify/server/d1.ts` to support direct D1 binding and the existing HTTP API fallback during rollout
- migrate production config to `NOTIFY_DB`
- preserve prepared statements and explicit bind parameters
- add D1 migration instructions for remote and local development
- keep HTTP API fallback only for local/dev flows that cannot access bindings cleanly
- verify admin subscriber and broadcast flows

Acceptance:

- notify service unit/e2e tests pass
- D1 reads and writes use prepared statements
- the app no longer requires `CLOUDFLARE_API_TOKEN` in production runtime for notify database access

### Phase 4: Cron Consolidation

Goal: replace Vercel cron and the separate scheduler Worker with a scheduled handler in the primary Worker.

Tasks:

- move notify schedule and retry trigger logic into the primary Worker scheduled handler
- configure Wrangler `triggers.crons`
- keep manual trigger endpoint guarded by `WORKER_MANUAL_TOKEN` or an equivalent admin-only secret
- remove Vercel cron fallback after Cloudflare scheduled runs are verified
- update docs that currently call the scheduler a separate Worker

Acceptance:

- `scheduled()` can run schedule and retry paths independently
- local testing uses Wrangler's scheduled trigger test flow
- production cron propagation window is documented

### Phase 5: Queue and Image Worker Consolidation

Goal: collapse Telegram image ingress and queue consumption into the primary Worker if it stays simple.

Tasks:

- lift image-worker routing into a Worker module that can route by hostname
- preserve `image.buxx.me/webhook`, `/mood/:postId/:imageIndex`, `/channel/avatar`, and authenticated ingest routes
- keep R2 cache headers and 404 fallback contract unchanged
- keep Queue idempotency and retry behavior explicit
- avoid mixing image-byte logic into Astro route files

Acceptance:

- current `workers/telegram-image-proxy/tests/index.e2e.test.ts` behavior is preserved or moved into equivalent root tests
- `image.buxx.me` can be served by the primary Worker route
- rollback path exists before deleting the old Worker deploy

Decision rule:

- consolidate only if the routing remains small and obvious
- keep a separate Worker if hostname routing or deploy blast radius makes the single Worker harder to operate

### Phase 6: Ghost and Posts

Goal: bring Ghost content under the same domain without letting Ghost own docs.

Tasks:

- keep Starlight as the owner of `/docs`
- use Ghost Content API for `/posts` or legacy blog slug rendering
- preserve canonical URLs and decide whether canonical should point to `buxx.me` or `blog.buxx.me`
- add cache strategy for Ghost fetches
- port old `vercel.json` blog redirects into Cloudflare/Astro routing
- update sitemap and RSS behavior

Acceptance:

- `/docs` remains Starlight-backed
- posts render from Ghost data under the same domain
- old blog links redirect or render consistently
- Ghost failures degrade cleanly without taking down the homepage

### Phase 7: Astro 7 Beta

Goal: upgrade Astro only after the Cloudflare runtime is stable.

Tasks:

- open a separate `upgrade/astro-7-beta` branch
- upgrade Astro and integrations together
- verify `@astrojs/cloudflare`, Starlight, React integration, transitions, and build output
- rerun site e2e after runtime migration tests pass

Decision rule:

- Astro 7 beta does not belong in the Cloudflare runtime migration branch
- if adapter or Starlight peer ranges lag the beta, defer the upgrade

## Branch Boundaries

This branch should carry Cloudflare runtime planning and migration work only.

Do not include:

- project showcase redesign work
- posts UI redesign
- Astro 7 beta upgrade
- private API repository split
- broad component refactors

Expected follow-up branches:

- `refactor/private-api-core`
- `feat/posts-ghost-unified-domain`
- `upgrade/astro-7-beta`

## Validation Matrix

Required before merge:

- `bun install --frozen-lockfile`
- `bun run check`
- `bun run build`
- `bun run test:unit`
- targeted Playwright smoke for `/`, `/projects`, `/mood`, `/docs`, `/api/health`, and legacy redirects
- worker tests for image ingest/read behavior if Phase 5 is included
- Wrangler config validation or dry-run deploy

Manual production checks:

- Cloudflare route points to the correct Worker script
- secrets exist and are scoped to the right environment
- D1 binding points to the existing notify database
- R2 binding points to the existing mood image bucket
- queue binding points to the existing notify queue
- scheduled trigger appears in Cloudflare dashboard
- analytics/privacy docs no longer claim Vercel hosting after cutover

## Rollback

Keep rollback boring:

- leave Vercel production untouched until Cloudflare preview passes route parity
- keep the old image Worker deployed until the consolidated Worker has served real traffic
- keep the D1 HTTP fallback until direct binding has passed production reads and writes
- move DNS only after Cloudflare preview passes the route snapshot
- if cutover fails, move DNS back to Vercel and keep the Cloudflare Worker deployed for inspection

## Open Decisions

- Should `image.buxx.me` be consolidated into the primary Worker in this PR, or left as a follow-up?
- Should `/posts/*` render Ghost content directly, or should legacy root slugs render posts while `/posts` becomes the index?
- Which analytics stack replaces Vercel Analytics and Speed Insights?
- Should preview deployments use Wrangler environments, Workers Builds, or a GitHub Actions workflow?
- Should the public UI repository keep route handlers as thin proxies, or should all private API routes move to a separate private package first?
