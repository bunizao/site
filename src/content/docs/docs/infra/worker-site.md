---
title: Worker site
description: How the public Cloudflare Worker serves buxx.me and proxies private API surfaces.
public: true
---

The public runtime is one Cloudflare Worker named `site`. It serves `buxx.me` and `www.buxx.me`.

Private admin, OAuth, notify, Telegram webhook, image ingest, queue, cron work, and concrete public API implementations belong to the separate `site-api` Worker.

## Ghost Publishing Hook

The Writing section is prerendered from Ghost during the Cloudflare build. Ghost post changes need a fresh Cloudflare build before they appear on `buxx.me`.

Configure Ghost's `Post published` webhook to `POST` the Cloudflare Workers Builds deploy hook for the production branch. The old Vercel deploy hook should be removed because it only rebuilds the previous Vercel deployment.

`PUBLIC_GHOST_URL` and `GHOST_CONTENT_API_KEY` must be present in the Cloudflare build environment, not only as Worker runtime secrets.

As of the blog migration, `blog.buxx.me` is not routed to the public Worker. Ghost admin and Ghost app/API paths must keep reaching the Ghost origin. Legacy public path redirects belong in Cloudflare Redirect Rules, not Worker routes.
The build-environment `PUBLIC_GHOST_URL` must point at the Ghost origin itself, such as the Ghost(Pro) or upstream hostname, never `blog.buxx.me`; the CI wrapper refuses production builds that point at a self-routed host.

## What runs where

The public Worker owns:

- public pages
- public mood feed/detail shells
- public mood rendering from `site-api`
- local and preview fallback proxying for public API URLs
- protected docs checks through the private admin session endpoint

The private `site-api` Worker owns:

- `/v2/notify/*`
- `/v2/admin/*`
- `/api/*`
- `/oauth*`
- `/dev/*`
- `/webhooks/telegram`
- mood image ingest and serving
- queue consumers and cron-triggered notify work

## Compatibility proxy

`buxx.me/api/*` remains the public compatibility surface, but production traffic is directly routed to `site-api`. The public Worker keeps a thin `/api/*` service-binding fallback for local and preview environments.

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
