# Worker and Site

## Scope

This document explains the public Cloudflare Worker target for:

- Astro pages on `buxx.me` and `www.buxx.me`
- public API endpoints that still belong to the site
- compatibility proxying from `buxx.me/api/*` to `site-api`
- protected docs auth checks through the private admin session

Private admin, OAuth, notify, Telegram webhook, image ingest, queue, and cron work belong to the separate `site-api` Worker.

## Runtime Target

The public runtime is one Cloudflare Worker named `site`.

It serves:

- `buxx.me`
- `www.buxx.me`

Main files:

- [`src/worker.ts`](../src/worker.ts)
- [`src/lib/http/api-service-proxy.ts`](../src/lib/http/api-service-proxy.ts)
- [`wrangler.jsonc`](../wrangler.jsonc)

`src/worker.ts` is the Astro Cloudflare entrypoint. It no longer composes queue, cron, notify, or image-worker handlers.

## Private API Boundary

The private API Worker is `site-api`.

Canonical base URL:

- `https://api.buxx.me/v1/`

Public compatibility:

- `https://buxx.me/api/*` proxies through the `API` service binding.
- `/dev/*` and `/oauth*` proxy to private admin/OAuth routes without adding a `/v1` prefix.

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
- public mood feed/detail shells
- public mood rendering from `site-api`
- public SVG and oEmbed endpoints
- Ghost/listening/footer data hydration
- protected docs gating through `site-api /v1/admin/session`

The public Worker does not own:

- notify subscription, dispatch, schedule, retry, or email templates
- admin subscriber or broadcast APIs
- GitHub OAuth session issuance
- Telegram webhook ingress
- HD image ingest/storage routes
- queue consumers or cron triggers

## Ghost Publishing Hook

The Writing section is rendered at build time by `src/features/home/ui/Posts.astro`. Ghost post changes do not appear on `buxx.me` until the Cloudflare Worker is rebuilt and redeployed.

Production setup:

- Create a Cloudflare Workers Builds deploy hook for the production branch.
- Configure Ghost's `Post published` webhook to `POST` that Cloudflare deploy hook URL.
- Remove the old Vercel deploy hook URL from Ghost.
- Keep `GHOST_URL` and `GHOST_CONTENT_APIKEY` in the Cloudflare build environment.

## Bindings and Secrets

Direct public Worker bindings in [`wrangler.jsonc`](../wrangler.jsonc):

- `API` service binding to `site-api`

Public runtime vars:

- `SITE_URL`
- `PUBLIC_SITE_URL`
- `GHOST_URL`
- `LASTFM_USER`
- `PUBLIC_HD_IMAGE_URL`
- `PUBLIC_TURNSTILE_SITE_KEY`
- `CHANNEL`
- `TELEGRAM_HOST`

Secrets for notify, admin, Telegram webhook, D1, R2, queues, and cron belong to `site-api`.
