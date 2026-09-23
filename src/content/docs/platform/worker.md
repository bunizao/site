---
title: Worker and site
description: "The public Cloudflare Worker: routing, the API fallback binding, and static asset delivery."
group: Platform
order: 0
---

## Scope

This document explains the public Cloudflare Worker target for:

- Astro pages on `buxx.me` and `www.buxx.me`
- public API fallback proxying to `site-api`
- protected docs auth checks through the private admin session

Private admin, OAuth, notify, Telegram webhook, image ingest, queue, and cron work belong to the separate `site-api` Worker.

## Runtime target

The public runtime is one Cloudflare Worker named `site`.

It serves:

- `buxx.me`
- `www.buxx.me`
- `blog.buxx.me` redirects into `buxx.me/blog`

Main files:

- [`src/worker.ts`](https://github.com/bunizao/site/blob/main/src/worker.ts)
- [`src/lib/http/api-service-proxy.ts`](https://github.com/bunizao/site/blob/main/src/lib/http/api-service-proxy.ts)
- [`wrangler.jsonc`](https://github.com/bunizao/site/blob/main/wrangler.jsonc)

`src/worker.ts` is the Astro Cloudflare entrypoint. It no longer composes queue, cron, notify, or image-worker handlers.

## Private API boundary

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

## Public site responsibilities

| The public Worker owns | It does not own |
| --- | --- |
| Public HTML routes | Concrete public API endpoints under `buxx.me/api/*` |
| Legacy Ghost and blog-subdomain redirects into `/blog` | Notify subscription, dispatch, schedule, retry, and email templates |
| Public mood feed and detail shells | Admin subscriber and broadcast APIs |
| Public mood rendering from `site-api` | GitHub OAuth session issuance |
| Local and preview fallback proxying for public API URLs | Telegram webhook ingress and HD image ingest routes |
| Protected docs gating through `site-api /v2/admin/session` | Queue consumers and cron triggers |

## Blog cutover

`blog.buxx.me` is not routed to the public `site` Worker. Ghost admin and
Ghost's own app/API paths must keep reaching the Ghost origin. Legacy public
path redirects belong in Cloudflare Redirect Rules, not Worker routes.

- `https://blog.buxx.me/` -> `https://buxx.me/blog`
- known legacy article slugs -> `https://buxx.me/blog/<slug>`
- legacy root Ghost slugs on `buxx.me`, such as `/sacrifice`, also redirect to
  their new `/blog/<slug>` permalink.
- legacy Ghost taxonomy routes redirect to the matching `/blog/tags` or
  `/blog/tag/<slug>` route.

## Ghost publishing hook

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

### Unlisted posts

Add Ghost's internal `#unlisted` tag (`hash-unlisted`) to publish a direct-link-only post. The build still emits `/blog/<slug>`, but the post is excluded from the homepage, blog and tag lists, RSS, sitemaps, Pagefind, palette data, `llms.txt`, adjacent navigation, and generated agent Markdown indexes and assets. The HTML and direct Markdown response both carry crawler exclusion directives. `site-api` applies the same internal-tag check at the Ghost content-source and webhook boundaries, so unlisted posts do not enter immediate notifications, retries, digest windows, welcome emails, or the public latest-writing cache.

## Bindings and secrets

One binding, in [`wrangler.jsonc`](https://github.com/bunizao/site/blob/main/wrangler.jsonc):
`API`, a service binding to `site-api`.

Public runtime vars — all non-secret, all readable in the browser bundle where
they carry a `PUBLIC_` prefix:

| Variable | What it feeds |
| --- | --- |
| `SITE_URL`, `PUBLIC_SITE_URL` | Canonical base URLs for links, previews, and health checks. |
| `PUBLIC_GHOST_URL` | Ghost origin the blog reads from. |
| `PUBLIC_BLOG_OG_IMAGE_ENDPOINT` | OGIS endpoint for generated `/blog` Open Graph images. |
| `PUBLIC_HD_IMAGE_URL` | HD mood image base URL served by `site-api`. |
| `PUBLIC_TURNSTILE_SITE_KEY` | Turnstile widget on the subscribe form. |
| `LASTFM_USER` | Whose scrobbles the listening card reads. |
| `CHANNEL`, `TELEGRAM_HOST` | Telegram channel slug and host for embed lookups. |

Secrets for notify, admin, the Telegram webhook, D1, R2, queues, and cron
belong to `site-api`, not here. That is the boundary, not an oversight.
