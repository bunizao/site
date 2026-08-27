---
title: Site Worker Routes
description: The endpoints the public site Worker answers itself — the media proxy, the API forwarders, the registry, and the static JSON the front end fetches.
group: API
order: 10
---

Everything on the other API pages is served by `site-api`. This page covers the
routes the **public `site` Worker** owns and answers itself: a media proxy, four
forwarders that hand a request to `site-api`, and a handful of static JSON files
the front end fetches lazily.

The split matters when you are debugging. A `404` from `/static/…` came from a
different deploy than a `404` from `/api/…`, and only one of them is in this
repository. See [who answers a request](/docs/api/overview#who-answers-a-request).

## Media proxy

```
GET  /static/<encoded-target-url>
HEAD /static/<encoded-target-url>
```

Fetches an image, video, audio file, or font from an allowlisted upstream and
re-serves it from this origin. It exists so Telegram-hosted mood media and
YouTube thumbnails can be embedded without leaking a visitor's IP to those
hosts, and without the mixed-origin CSP problem that comes with hotlinking.

Rate limit: 240 requests / 60s. Successful responses get
`Cache-Control: public, max-age=86400, s-maxage=86400` unless the upstream sent
its own.

Allowlisted hosts are the Telegram family (`t.me`, `telegram.org`,
`telegram.me`, `telegram.dog`, `telesco.pe`, `cdn-telegram.org`,
`cdn1`–`cdn5.telegram-cdn.org`) plus `i.ytimg.com` for YouTube posters and
`yt3.googleusercontent.com` / `yt3.ggpht.com` for channel avatars. Redirects are
followed at most three deep, and **every hop is re-checked against the
allowlist** — an allowlisted host cannot bounce the proxy to somewhere else.

Every response carries a deliberately boring set of headers:

```
access-control-allow-origin: *
content-disposition: inline
content-security-policy: default-src 'none'; sandbox
x-content-type-options: nosniff
```

`set-cookie` is stripped from the upstream response, as are hop-by-hop headers.
Only `image/*`, `video/*`, `audio/*`, and `font/*` content types are passed
through; anything else is `415` with an empty body. That is the property worth
understanding: this is a media proxy, not a general-purpose fetcher, and it
will not return you an HTML page or a JSON document no matter what you point it
at.

**Errors:** `400 Invalid target URL.` (not allowlisted, or unparseable);
`403 Invalid static proxy signature.`; `429 Too Many Requests.`;
`502 Upstream fetch failed.`; `415` for a disallowed content type. All are
plain text, not JSON.

### Request signing

Proxy URLs are signed. `STATIC_PROXY_MODE` decides how strictly that is
enforced:

| Mode | Unsigned URL | Invalid signature |
| --- | --- | --- |
| `observe` (default) | Served, logged | Served, logged |
| `accept-both` | Served, logged | `403` |
| `enforce` | `403` | `403` |

The staged rollout is intentional: `observe` lets an already-published page's
old unsigned URLs keep working while new ones ship signed. Build proxy URLs
through the site's own helper rather than hand-assembling them, or they will
break the day the mode advances.

### YouTube metadata

```
GET /static/youtube/<11-char-video-id>/metadata.json
```

A special case on the same route — not a proxy fetch but a resolved lookup.
Returns `{"channelName": "…", "channelUrl": "…"|null}` with
`access-control-allow-origin: *` and `public, max-age=86400, s-maxage=86400`.
`502 YouTube channel avatar unavailable.` if the lookup fails. The path must
carry no query string, or it is treated as a normal proxy target instead.

## API forwarders

Four routes exist only to hand a request to `site-api`:

| Route | Behavior |
| --- | --- |
| `/api/*` | Forwards over the `API` service binding (deploy/preview) or HTTP to `API_DEV_ORIGIN` (dev). All methods. |
| `/oauth`, `/oauth/*` | Same forwarder, for the OAuth hub. All methods. |
| `/v2/*` | **Not a proxy** — a `308` redirect to `/api/v2/*`. |

`/v2/*` catching people out is worth calling out: on the public site the
canonical path is `/api/v2/…`, and a bare `/v2/…` only redirects there. A client
that does not follow redirects, or that downgrades `POST` on redirect, will see
a request that appears to vanish.

When neither the service binding nor a dev origin resolves, the forwarder
answers `503 {"error":"API service binding unavailable"}`. In production none
of this runs at all — Cloudflare route patterns send `/api/*` straight to
`site-api` and the `site` Worker never sees the request.

`/oauth/login` is the one exception: it is answered locally, not forwarded. It
`302`s to the `?next=` path with `Cache-Control: no-store, max-age=0`, defaulting
to `/dev/portal`. `next` is rejected unless it is a same-site absolute path —
values starting `//`, containing a backslash, or naming another origin fall back
to the default rather than redirecting off-site.

## Dev portal

```
ALL /dev                    → 302 /dev/portal
ALL /dev/portal/api/*       → forwarded to site-api, admin paths only
```

The forwarder is registered as a catch-all but narrows itself: only paths under
`admin` are forwarded (to site-api's `/api/admin/*`), and anything else is
`404 {"error":"Not found"}` with `no-store`. It is a narrow window onto the
admin API, not a second general proxy — see [Internal Endpoints](/docs/api/internal).

## Static JSON

Prerendered at build time and served as static assets from the edge. No auth,
no rate limits, no query parameters.

| Path | Contents |
| --- | --- |
| `/docs/search.json` | The docs search index — every non-draft page's title, description, group, H2/H3 headings, and up to 4000 characters of body text. Fetched whole on first open of the docs search dialog. |
| `/palette.json` | `{"posts":[{"title","path"}]}` — the four newest blog posts, for the site-wide command palette. Separate from the page so `/mood` never pays for a Ghost fetch during SSR. |
| `/r/<name>` and `/r/<name>.json` | Component registry items, in the shadcn registry format, so a component on `/components` can be installed by URL. Both paths serve the identical document; the `.json` variant re-exports the other. Built from the `components` content collection, non-draft entries whose `install.type` is `registry`, plus a generated `utils` item. |

`/mood/rss.xml` is the exception in this group — it is server-rendered per
request (`public, max-age=0, s-maxage=300`, up to 50 items, read from the D1
archive), not prerendered, because the mood feed changes between deploys. It
returns a plain-text `500 Failed to generate RSS feed.` if the archive read
throws. The blog feed, `llms.txt`, and the sitemap are all build-time static —
see [Feeds & Machine Output](/docs/api/feeds).
