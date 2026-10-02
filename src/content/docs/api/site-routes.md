---
title: Site Worker Routes
description: The routes the public site Worker answers itself, from the media proxy and API forwarders to static JSON.
group: API
order: 10
---

Every other API page documents routes served by `site-api`. This page covers
the routes the **public `site` Worker** answers itself: a media proxy, four
forwarders that hand a request to `site-api`, the dev portal routes, and a
handful of static JSON files the front end fetches lazily.

Knowing the split helps when you debug. A `404` from `/static/…` and a `404`
from `/api/…` come from different deploys, and only one of them is in this
repository. See [who answers a request](/docs/api/overview#who-answers-a-request).

## Media proxy

```
GET  /static/<encoded-target-url>
HEAD /static/<encoded-target-url>
```

The proxy fetches an image, video, audio file, or font from an allowlisted
upstream and re-serves it from this origin. This lets the site embed
Telegram-hosted mood media and YouTube thumbnails without leaking a visitor's
IP to those hosts, and without the mixed-origin CSP problem that hotlinking
causes.

Rate limit: 240 requests / 60s. Successful responses get
`Cache-Control: public, max-age=86400, s-maxage=86400` unless the upstream sent
its own.

### Allowed hosts

| Host | Used for | Match |
| --- | --- | --- |
| `t.me`, `telegram.org`, `telegram.me`, `telegram.dog`, `telesco.pe`, `cdn-telegram.org`, `cdn1`–`cdn5.telegram-cdn.org` | Telegram media | The host and its subdomains |
| The `PUBLIC_HD_IMAGE_URL` host | HD images | Exact |
| `image.buxx.me` | Legacy image host | Exact |
| `i.ytimg.com` | YouTube posters | Exact |
| `yt3.googleusercontent.com` / `yt3.ggpht.com` | YouTube channel avatars | Exact |

Only Telegram hosts admit their subdomains. Every other host must match
exactly, so the HD image host never admits its siblings.

The proxy follows at most three redirects and **re-checks every hop against
the allowlist**. An allowlisted host cannot bounce the proxy somewhere else.

### Response headers and content types

Every response carries the same fixed set of headers:

```
access-control-allow-origin: *
content-disposition: inline
content-security-policy: default-src 'none'; sandbox
x-content-type-options: nosniff
```

The proxy strips `set-cookie` and hop-by-hop headers from the upstream
response. It passes through only `image/*`, `video/*`, `audio/*`, and `font/*`
content types, and answers anything else with `415` and an empty body. It is a
media proxy, so it never returns an HTML page or a JSON document, whatever you
point it at.

### Errors

All error bodies are plain text, not JSON.

| Response | Cause |
| --- | --- |
| `400 Invalid target URL.` | The target is not allowlisted, or cannot be parsed |
| `415` | Disallowed content type |
| `429 Too Many Requests.` | Rate limited |
| `502 Upstream fetch failed.` | The upstream fetch failed |

### Unsigned URLs

Proxy URLs are not signed. The upstreams are public media hosts anyone can
fetch directly, so a signature would protect nothing, and the host allowlist
is the boundary. Unsigned URLs also stay stable, which matters because both
Workers bake them into cached and archived HTML.

### YouTube metadata

```
GET /static/youtube/<11-char-video-id>/metadata.json
```

This path on the same route is a lookup, not a proxy fetch. It returns
`{"channelName": "…", "channelUrl": "…"|null}` with
`access-control-allow-origin: *` and `public, max-age=86400, s-maxage=86400`.
If the lookup fails, it returns `502 YouTube channel avatar unavailable.`

The path must have no query string. With one, the proxy treats it as a normal
proxy target instead.

## API forwarders

Four routes exist only to hand a request to `site-api`:

| Route | Behavior |
| --- | --- |
| `/api/*` | Forwards over the `API` service binding (deploy/preview) or over HTTP to `API_DEV_ORIGIN` (dev). All methods. |
| `/oauth`, `/oauth/*` | Same forwarder, for the OAuth hub. All methods. |
| `/v2/*` | **Not a proxy.** A `308` redirect to `/api/v2/*`. |

`/v2/*` catches people out. On the public site the canonical path is
`/api/v2/…`, and a bare `/v2/…` only redirects there. If your client does not
follow redirects, or downgrades `POST` on redirect, the request appears to
vanish.

When neither the service binding nor a dev origin resolves, the forwarder
answers `503 {"error":"API service binding unavailable"}`.

In production the `/api/*` forwarder never runs. Cloudflare route patterns send
`buxx.me/api/*` straight to `site-api`, so the `site` Worker never sees those
requests. The other two still run in production: `/oauth` and `/oauth/*` go
over the `API` binding, and `/v2/*` answers its `308`.

### OAuth login

`/oauth/login` is the one exception: the `site` Worker answers it locally
instead of forwarding it. It returns a `302` to the `?next=` path with
`Cache-Control: no-store, max-age=0`, defaulting to `/dev/portal`. The Worker
resolves `next` against the site origin first. Any value that resolves to
another origin falls back to the default, so the redirect never leaves the
site.

## Dev portal

```
ALL /dev                                → 302 /dev/portal
ALL /dev/blog                           → 302 /dev/portal/blog
GET /dev/portal/api/ghost-posts         → Ghost Admin API post list, answered locally
GET /dev/portal/api/notify-preview      → site-api /api/notify/preview, params whitelisted
GET /dev/portal/api/activity-panel-src  → signed activity panel SVG paths, answered locally
ALL /dev/portal/api/*                   → forwarded to site-api, admin paths and three analytics reads
```

The `/dev/portal/api/*` forwarder is registered as a catch-all but narrows
itself. It forwards any method on paths under `admin` (to site-api's
`/api/admin/*`), plus three `GET` reads that the analytics and home screens
draw: `analytics/summary`, `analytics/events` and `analytics/article/:slug` (to
the same paths under site-api's `/api/analytics/`). Request headers, the Access
JWT included, pass through. Any other path or method, and any path with a `.`
or `..` segment, gets `404 {"error":"Not found"}` with `no-store`. It is a
narrow window onto the admin API and not a second general proxy. See
[Internal Endpoints](/docs/api/internal). In local dev with portal demo mode
on, an in-memory demo API answers the same paths instead.

Three static sibling routes take priority over the catch-all, because literal
paths win over the rest parameter. They are the same-origin data sources for
portal screens. All three sit behind the portal's Cloudflare Access gate, send
`no-store`, and accept only GET (`405` otherwise):

| Path | Behavior |
| --- | --- |
| `/dev/portal/api/ghost-posts` | Answered locally. Lists up to 100 Ghost posts (id, uuid, slug, title, status, updated/published timestamps) straight from the Ghost Admin API, using `GHOST_ADMIN_API_KEY` + `PUBLIC_GHOST_URL`. Backs the live list in the blog preview workspace. Missing configuration is `503` with a hint, an upstream timeout is `504`, and other upstream failures are `502`. In local dev with portal demo mode on, missing configuration answers a fixed demo list (mock blog slugs, `X-Portal-Demo: 1`) instead of the `503`. |
| `/dev/portal/api/notify-preview` | Forwards to site-api's `/api/notify/preview`, passing through only `mode`, `sample`, and `timezone`. Edge access rules reject a direct browser fetch of `buxx.me/api/notify/preview`, but not the service binding path. Backs the email template screen. In local dev with portal demo mode on, it answers demo templates built locally (`X-Portal-Demo: 1`) and never reaches site-api. |
| `/dev/portal/api/activity-panel-src` | Answered locally. Signs the `/api/activity-panel.svg` paths for both themes with `ACTIVITY_PANEL_SIGNING_SECRET`, valid for one hour, so the secret stays on the server. Backs the SVG gallery screen. Without the secret the paths come back unsigned, and the panel itself answers `401`. |

The portal deep-links by query string:

- `/dev/portal/comments?status=held&c=<id>` opens one comment. A bare `#<id>`
  is turned into `c`.
- `/dev/portal/messages?m=<id>` opens one message in whichever tray holds it.
  An older `/messages/<id>` or `#<id>` link is rewritten to `m`.

site-api's Telegram owner cards build both links from its `PORTAL_URL` var.

`/dev/portal/blog` is the blog preview workspace. It shows a Ghost post list
grouped into drafts, scheduled, and published, and re-polls
`/dev/portal/api/ghost-posts` every 5 seconds while visible. Beside the list,
an iframe shows the selected post's `/dev/blog/<id>` live preview, at desktop
or phone width (`?post=<id>&width=phone`). `/dev/blog/*` pages send
`frame-ancestors 'self'` so that iframe can load them. Every other `/dev` path
keeps `frame-ancestors 'none'`.

## Static JSON

The build prerenders these files, and the edge serves them as static assets.
They have no auth, no rate limits, and no query parameters.

| Path | Contents |
| --- | --- |
| `/docs/search.json` | The docs search index: every non-draft page's title, description, group, H2/H3 headings, and up to 4000 characters of body text. The docs search dialog fetches the whole file the first time it opens. |
| `/palette.json` | `{"posts":[{"title","path"}]}`: the four newest blog posts, for the site-wide command palette. It is separate from the page so `/mood` never pays for a Ghost fetch during SSR. |
| `/r/<name>` and `/r/<name>.json` | Component registry items in the shadcn registry format, so you can install a component from `/components` by URL. Both paths serve the same document; the `.json` variant re-exports the other. Built from the `components` content collection (non-draft entries whose `install.type` is `registry`) plus a generated `utils` item. |

`/mood/rss.xml` is the exception in this group. The mood feed changes between
deploys, so the Worker renders it on each request instead of prerendering it:
`public, max-age=0, s-maxage=300`, up to 50 items, read from the D1 archive. If
the archive read throws, it returns a plain-text
`500 Failed to generate RSS feed.`

The blog feed, `llms.txt`, and the sitemap are all static files built at build
time. See [Feeds & Machine Output](/docs/api/feeds).

## Earlier comment review

`/reader/comments` shows the signed-in reader their matching unclaimed
comments so they can pick which ones to claim. Loading the page does not claim
any history. Reads and selected claims go through `/api/v2/reader/claims` with
a verified reader session. A reader who is not signed in sees an instruction to
sign in.
