# Worker and Site

## Scope

This document explains the public Cloudflare Worker target for:

- Astro pages on `buxx.me` and `www.buxx.me`
- public API fallback proxying to `site-api`
- protected docs auth checks through the private admin session

Private admin, OAuth, notify, Telegram webhook, image ingest, queue, and cron work belong to the separate `site-api` Worker.

## Runtime Target

The public runtime is one Cloudflare Worker named `site`.

It serves:

- `buxx.me`
- `www.buxx.me`
- `blog.buxx.me` redirects into `buxx.me/blog`

Main files:

- [`src/worker.ts`](../src/worker.ts)
- [`src/lib/http/api-service-proxy.ts`](../src/lib/http/api-service-proxy.ts)
- [`wrangler.jsonc`](../wrangler.jsonc)

`src/worker.ts` is the Astro Cloudflare entrypoint. It no longer composes queue, cron, notify, or image-worker handlers.

## Private API Boundary

The private API Worker is `site-api`.

Canonical base URL:

- `https://api.buxx.me/v2/`

Public compatibility:

- `https://buxx.me/api/*` is directly routed to `site-api` in production.
- The public `site` Worker keeps a thin `/api/*` fallback proxy through the `API` service binding for local and preview environments.
- `/dev/*` and `/oauth*` proxy to private admin/OAuth routes without adding a version prefix.

`wrangler.jsonc` binds the public Worker to the private Worker:

```json
{
  "services": [
    { "binding": "API", "service": "site-api" }
  ]
}
```

## Public Site Responsibilities

The public Worker owns:

- public HTML routes
- legacy Ghost/blog-subdomain redirects into `/blog`
- public mood feed/detail shells
- public mood rendering from `site-api`
- local and preview fallback proxying for public API URLs
- protected docs gating through `site-api /v2/admin/session`

The public Worker does not own:

- notify subscription, dispatch, schedule, retry, or email templates
- admin subscriber or broadcast APIs
- GitHub OAuth session issuance
- Telegram webhook ingress
- HD image ingest/storage routes
- concrete public API endpoints under `buxx.me/api/*`
- queue consumers or cron triggers

## Blog Cutover

`blog.buxx.me` is not routed to the public `site` Worker. Ghost admin and
Ghost's own app/API paths must keep reaching the Ghost origin. Legacy public
path redirects belong in Cloudflare Redirect Rules, not Worker routes.

- `https://blog.buxx.me/` -> `https://buxx.me/blog`
- known legacy article slugs -> `https://buxx.me/blog/<slug>`
- legacy root Ghost slugs on `buxx.me`, such as `/sacrifice`, also redirect to
  their new `/blog/<slug>` permalink.
- legacy Ghost taxonomy routes redirect to the matching `/blog/tags` or
  `/blog/tag/<slug>` route.

## Ghost Publishing Hook

The Writing section and `/blog` routes are rendered at build time from the Ghost
Content API. Ghost post changes do not appear on `buxx.me` until the Cloudflare
Worker is rebuilt and redeployed.

Production setup:

- Create a Cloudflare Workers Builds deploy hook for the production branch.
- Set the build command to `bun run build:cloudflare` and keep the deploy command on `bunx wrangler deploy --config dist/server/wrangler.json`; the generated Wrangler config runs the deploy guard automatically.
- Configure Ghost's `Post published` webhook to `POST` that Cloudflare deploy hook URL.
- Remove the old Vercel deploy hook URL from Ghost.
- Keep `PUBLIC_GHOST_URL` and `GHOST_CONTENT_API_KEY` in the Cloudflare build environment.
- Keep the same values in GitHub Actions for preview builds. `preview-smoke.yml` builds static `/blog` HTML before `wrangler versions upload`, so the workflow must receive `PUBLIC_GHOST_URL` and `GHOST_CONTENT_API_KEY` as build-time environment variables.
- Updating Worker runtime vars or secrets in the Cloudflare dashboard creates a new Worker version, but it does not rerun Astro prerendering or update static HTML.
- Cloudflare builds require live Ghost content and reject mock fallback flags.
- Every build installs a Wrangler pre-upload hook in `dist/server/wrangler.json`. The hook blocks fixture or empty blog artifacts even when someone runs `wrangler versions upload` directly.
- Use `bun run upload:cloudflare -- --message "..."` for version uploads so the guard is also explicit in deployment logs.

## Bindings and Secrets

Direct public Worker bindings in [`wrangler.jsonc`](../wrangler.jsonc):

- `API` service binding to `site-api`

Public runtime vars:

- `SITE_URL`
- `PUBLIC_SITE_URL`
- `PUBLIC_GHOST_URL`
- `PUBLIC_BLOG_OG_IMAGE_ENDPOINT`
- `LASTFM_USER`
- `PUBLIC_HD_IMAGE_URL`
- `PUBLIC_TURNSTILE_SITE_KEY`
- `CHANNEL`
- `TELEGRAM_HOST`

Static proxy rollout vars:

- `STATIC_PROXY_MODE` — `observe` by default, then `accept-both`, then `enforce`
- `STATIC_PROXY_KEY_ID`
- `STATIC_PROXY_PREVIOUS_KEY_ID` during key rotation

Static proxy secrets:

- `STATIC_PROXY_SECRET`
- `STATIC_PROXY_PREVIOUS_SECRET` during key rotation

Secrets for notify, admin, Telegram webhook, D1, R2, queues, and cron belong to `site-api`.
