---
title: Worker and site
description: What the public site Worker serves, how it reaches site-api, and how Ghost changes get deployed.
group: Platform
order: 0
---

This page covers the public Cloudflare Worker, `site`: what it serves, how it
hands API traffic to `site-api`, how Ghost changes reach the blog, and which
vars it reads. Read it when you change routing, deploy settings, or the build.

## Scope

The `site` Worker handles:

- Astro pages on `buxx.me` and `www.buxx.me`
- public API fallback proxying to `site-api`
- the owner portal at `/dev/*`, gated by Cloudflare Access

Private admin, OAuth, notify, the Telegram webhook, image ingest, queues, and
cron belong to the separate `site-api` Worker.

## Runtime target

The public runtime is one Cloudflare Worker named `site`. `wrangler.jsonc`
routes two patterns to it:

- `buxx.me/*`
- `www.buxx.me/*`

`blog.buxx.me` is not routed to this Worker. Its redirects into
`buxx.me/blog` are Cloudflare zone rules (see [Blog cutover](#blog-cutover)).

| File | Role |
| --- | --- |
| [`src/worker.ts`](https://github.com/bunizao/site/blob/main/src/worker.ts) | The Astro Cloudflare entrypoint. It no longer composes queue, cron, notify, or image-worker handlers |
| [`src/lib/http/api-service-proxy.ts`](https://github.com/bunizao/site/blob/main/src/lib/http/api-service-proxy.ts) | Proxies requests to `site-api` through the `API` service binding |
| [`wrangler.jsonc`](https://github.com/bunizao/site/blob/main/wrangler.jsonc) | Routes, bindings, and vars |

## Private API boundary

The private API Worker is `site-api`. On its own host, `https://api.buxx.me`,
paths have no `/api` prefix (see [Path forms](/docs/api/overview#path-forms)).

Public URLs reach it in four ways:

- In production, Cloudflare route patterns send `https://buxx.me/api/*`
  straight to `site-api`. The `site` Worker never sees those requests.
- Everywhere else, the `site` Worker's thin `/api/*` fallback forwards them.
  On preview deployments and under `bun preview` (`wrangler dev`), it uses the
  `API` service binding. Under `astro dev`, which has no bindings, it uses
  plain HTTP to `API_DEV_ORIGIN` (default `https://buxx.me`).
- `/oauth` and `/oauth/*` go to the `site-api` OAuth routes through the `API`
  binding, without adding a version prefix. `/oauth/login` is the exception:
  the `site` Worker answers it with a redirect.
- `/dev/portal/api/admin/*` goes to `site-api` `/api/admin/*` through the `API`
  binding. The rest of `/dev/*` is the owner portal, which the `site` Worker
  renders itself.

The `API` binding stays live in production. The `site` Worker uses it for
`/oauth*`, the `/reader/*` pages, the `/dev/portal` pages and their API proxy,
and server-side mood reads.

`wrangler.jsonc` binds the public Worker to the private one:

```json
{
  "services": [
    { "binding": "API", "service": "site-api" }
  ]
}
```

## Responsibilities

| The public Worker handles | It does not handle |
| --- | --- |
| Public HTML routes | Concrete public API endpoints under `buxx.me/api/*` |
| Legacy Ghost path redirects on `buxx.me` into `/blog` | Notify subscription, dispatch, schedule, retry, and email templates |
| Public mood feed and detail shells | Admin subscriber and broadcast APIs |
| Public mood rendering from `site-api` | GitHub OAuth session issuance |
| Local and preview fallback proxying for public API URLs | Telegram webhook ingress and HD image ingest routes |
| The `/dev/*` owner portal, gated by Cloudflare Access | Queue consumers and cron triggers |
| Forwarding `/oauth` and `/oauth/*` to `site-api` | `blog.buxx.me` redirects, which are zone rules |

## Blog cutover

`blog.buxx.me` is not routed to the public `site` Worker, because Ghost admin
and Ghost's own app and API paths must keep reaching the Ghost origin. Its
public URLs redirect through Cloudflare Single Redirect rules in the zone
ruleset instead. `scripts/legacy-blog-redirects.ts` holds the rules and writes
them with `--apply`. The rules match URL shapes, so a new post needs no entry:

- `https://blog.buxx.me/` -> `https://buxx.me/blog`
- any one-segment root path that isn't a Ghost namespace -> `https://buxx.me/blog/<slug>`
- `/tags` and `/tag/<slug>` -> the matching `/blog/tags` or `/blog/tag/<slug>` route

[SEO](/docs/platform/seo#legacy-host) lists the full rule set and its health
check.

Old Ghost paths on `buxx.me` itself are a separate list in
[`public/_redirects`](https://github.com/bunizao/site/blob/main/public/_redirects),
served by the Worker's static assets:

- legacy root Ghost slugs, such as `/sacrifice`, redirect to their new
  `/blog/<slug>` permalink.
- legacy Ghost taxonomy routes redirect to the matching `/blog/tags` or
  `/blog/tag/<slug>` route.

## Ghost publishing hook

The build renders the Writing section and the `/blog` routes from the Ghost
Content API. A Ghost post change doesn't appear on `buxx.me` until the Worker
is rebuilt and redeployed.

To set this up in production:

1. Create a Cloudflare Workers Builds deploy hook for the production branch.
2. Set the build command to `bun run build:cloudflare` and keep the deploy command on `bunx wrangler deploy --config dist/server/wrangler.json`. The generated Wrangler config runs the deploy guard automatically.
3. Configure Ghost's `Post published` webhook to `POST` that Cloudflare deploy hook URL.
4. Remove the old Vercel deploy hook URL from Ghost.
5. Keep `PUBLIC_GHOST_URL` and `GHOST_CONTENT_API_KEY` in the Cloudflare build environment.
6. Keep the same values in GitHub Actions for preview builds. `preview-smoke.yml` builds static `/blog` HTML before `wrangler versions upload`, so the workflow must receive `PUBLIC_GHOST_URL` and `GHOST_CONTENT_API_KEY` as build-time environment variables.

Keep these in mind when you deploy:

- Updating Worker runtime vars or secrets in the Cloudflare dashboard creates
  a new Worker version, but it doesn't rerun Astro prerendering or update
  static HTML.
- Cloudflare builds require live Ghost content and reject mock fallback flags.
- Every build installs a Wrangler pre-upload hook in
  `dist/server/wrangler.json`. The hook blocks fixture or empty blog
  artifacts, even when someone runs `wrangler versions upload` directly.
- Use `bun run upload:cloudflare -- --message "..."` for version uploads, so
  the guard also shows up explicitly in deployment logs.

### Asset carry-over

`build:cloudflare` keeps the previous deploy's hashed `/_astro/*` files for
one more deploy. A rollout isn't atomic across the edge. For a moment, old
HTML (fresh, or from the old version's cache) is still served while the asset
layer already answers from the new version, and open tabs keep lazy-loading
old chunks. Without the carry-over, those requests 404.

1. Each build publishes `/_astro-files.json`, listing its own assets.
2. The next build reads that list from the live site and copies the files it
   no longer produces into `dist/client/_astro`.

Carry-over failures only warn. They never block a deploy.

### Unlisted posts

Add Ghost's internal `#unlisted` tag (`hash-unlisted`) to publish a
direct-link-only post. The build still emits `/blog/<slug>`, but leaves the
post out of:

- the homepage, blog and tag lists
- RSS and sitemaps
- Pagefind and palette data
- `llms.txt`
- adjacent navigation
- generated agent Markdown indexes and assets

The HTML and the direct Markdown response both carry crawler exclusion
directives.

`site-api` applies the same internal-tag check at the Ghost content-source and
webhook boundaries. Unlisted posts never enter immediate notifications,
retries, digest windows, welcome emails, or the public latest-writing cache.

## Bindings and secrets

[`wrangler.jsonc`](https://github.com/bunizao/site/blob/main/wrangler.jsonc)
declares three bindings:

| Binding | Kind | What uses it |
| --- | --- | --- |
| `API` | Service binding to `site-api` | Every server-side call to `site-api`: the `/api/*` fallback, `/oauth*`, the `/reader/*` pages, the portal, and server-side mood reads |
| `ASSETS` | Static assets (`./dist`) | `src/worker.ts` tries it before rendering a page. The blog also reads built Markdown and the translation manifest from it |
| `SESSION` | KV namespace | Session storage for the Astro Cloudflare adapter's default session driver. No site code reads it directly |

Public runtime vars are all non-secret. Those with a `PUBLIC_` prefix are
readable in the browser bundle.

| Variable | What it feeds |
| --- | --- |
| `SITE_URL`, `PUBLIC_SITE_URL` | Canonical base URLs for links, previews, and health checks. |
| `PUBLIC_GHOST_URL` | Ghost origin the blog reads from. |
| `PUBLIC_BLOG_OG_IMAGE_ENDPOINT` | OGIS endpoint for generated `/blog` Open Graph images. |
| `PUBLIC_HD_IMAGE_URL` | HD mood image base URL served by `site-api`. |
| `MOOD_READ_SOURCE` | Default source for server-side mood reads, `archive` or `live`. Production sets `archive`. Unset or invalid means `live`. |
| `PUBLIC_TURNSTILE_SITE_KEY` | Turnstile widgets on the subscribe, manage-link, comment, reaction, and message forms. |
| `CHANNEL`, `TELEGRAM_HOST` | Telegram channel slug and host for embed lookups. |

`keep_vars` is on, so values set in the Cloudflare dashboard survive a deploy.
Outside `wrangler.jsonc`, the Worker reads only portal settings:

| Variable | What it feeds |
| --- | --- |
| `CLOUDFLARE_ACCESS_TEAM_DOMAIN`, `CLOUDFLARE_ACCESS_AUD`, `CLOUDFLARE_ACCESS_AUDS`, `CLOUDFLARE_ACCESS_ALLOWED_EMAILS` | The Cloudflare Access check on `/dev/*`. |
| `GHOST_ADMIN_API_KEY` | Ghost draft previews in the portal. |
| `ACTIVITY_PANEL_SIGNING_SECRET` | Signed activity SVG links on the portal's SVG page. |

Secrets for notify, the admin session, the Telegram webhook, D1, R2, queues,
and cron live in `site-api` and never here. That split is the public/private
security boundary.
