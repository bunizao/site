---
title: Worker site
description: How the public Cloudflare Worker serves buxx.me and proxies private API surfaces.
public: true
---

The public runtime is one Cloudflare Worker named `site`. It serves `buxx.me` and `www.buxx.me`.

Private admin, OAuth, notify, Telegram webhook, image ingest, queue, and cron work belong to the separate `site-api` Worker at `https://api.buxx.me/v2/`.

## Ghost Publishing Hook

The Writing section is prerendered from Ghost during the Cloudflare build. Ghost post changes need a fresh Cloudflare build before they appear on `buxx.me`.

Configure Ghost's `Post published` webhook to `POST` the Cloudflare Workers Builds deploy hook for the production branch. The old Vercel deploy hook should be removed because it only rebuilds the previous Vercel deployment.

`GHOST_URL` and `GHOST_CONTENT_APIKEY` must be present in the Cloudflare build environment, not only as Worker runtime secrets.

## What runs where

The public Worker owns:

- public pages
- public mood feed/detail shells
- public mood rendering from `site-api`
- SVG, oEmbed, Ghost, listening, footer, ping, and health endpoints
- protected docs checks through the private admin session endpoint

The private `site-api` Worker owns:

- `/v2/notify/*`
- `/v2/admin/*`
- `/oauth*`
- `/dev/*`
- `/v2/telegram/webhook`
- mood image ingest and serving
- queue consumers and cron-triggered notify work

## Compatibility proxy

`buxx.me/api/*` remains the public compatibility surface. Requests that are no longer public-site-owned proxy to `site-api` through the `API` service binding.

The public Worker also proxies `/dev/*` and `/oauth*` to private admin/OAuth routes without adding a `/v1` prefix.

## D1 and bindings

The public Worker only needs the `API` service binding to call `site-api`.

Notify D1, mood D1, R2 image storage, queue bindings, session KV, Telegram secrets, Resend secrets, and cron triggers belong to `site-api`.

## Failure behavior

- If the `API` service binding is missing, proxied private routes return 503.
- Protected docs deny access when `site-api /v2/admin/session` is unavailable.
- Public mood pages fail closed when the private mood API is unavailable.

## Related docs

- [Telegram ingestion](/docs/pipeline/telegram) — the private webhook and image flow.
- [OAuth hub](/docs/infra/oauth-hub) — the auth boundary between human admins, sandboxes, and connectors.
