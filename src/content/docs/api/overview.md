---
title: API Overview
description: What buxx.me/api is, who can call it, and how versions, auth, rate limits, errors and CORS work.
group: API
order: -1
---

`buxx.me/api/*` is the HTTP API behind this site. It serves mood posts, blog
comments and reactions, email notifications, listening data, oEmbed, and SVG
badges. Anyone can call the public endpoints, and most reads need no auth.

This page covers the rules the endpoints share, and where they differ. Two
Cloudflare Workers serve the API, endpoints are versioned three ways depending
on when they were written, and errors come in two shapes. Each section says
which endpoints a rule applies to. For a single endpoint, go to
its topic page, such as the [Mood API](/docs/api/mood) or the
[Blog Comments API](/docs/api/comments).

## Who answers a request

| Environment | What serves `/api/*`, `/v2/*`, `/oauth*` |
| --- | --- |
| Production (`buxx.me`) | Cloudflare route patterns send the request straight to the **`site-api`** Worker. The public `site` Worker never sees it. |
| Preview and deploy builds | The `[...path].ts` catch-alls in `site` forward the request to `site-api` over the `API` service binding (`src/lib/http/api-service-proxy.ts`). |
| Local dev (`astro dev`) | `site` proxies over plain HTTP to `API_DEV_ORIGIN` (default `https://buxx.me`, or a local `wrangler dev site-api` via `bun dev:api`). |

`site-api` is a separate, private repository. It holds D1, KV, R2, queues,
crons, the Telegram webhook, and every handler under `/api`, `/v1`, `/v2`,
`/notify`, `/admin`, and `/oauth`. `site` never reimplements a handler. It only
forwards requests.

Secrets and write access live in `site-api`, so keeping it a separate deploy
target is what makes it the public/private security boundary.

## Path forms

Every path in this reference is written the way you call it on `buxx.me`, with
the `/api` prefix. `site-api` itself has no such prefix. The Worker strips a
leading `/api` at ingress (`normalizeApiIngressRequest`) before its router sees
the request, so `buxx.me/api/footer` and `api.buxx.me/footer` reach the same
route file.

| Origin | How to call `footer` |
| --- | --- |
| `buxx.me` (canonical) | `https://buxx.me/api/footer` |
| `api.buxx.me` | `https://api.buxx.me/footer`. The whole hostname is the API, so there is no prefix. |
| `admin.buxx.me` | Admin portal and `/admin/*` only. Public pages redirect back to `buxx.me`. |

The strip is unconditional, so both forms work on either host. Use the prefixed
form on `buxx.me` and the bare form on `api.buxx.me`. A mixed form such as
`api.buxx.me/api/footer` resolves today, but a future ingress change could
break it.

## Versioning

The version is part of the URL. There is no version negotiation through
`Accept` or any other header.

| Prefix | What it is | Status |
| --- | --- | --- |
| `/api/v1/mood*` | The live Telegram-mirror reader. It calls `t.me` on every cache miss, and the edge caches it for seconds. | Stable. Used as the freshness fallback. |
| `/api/v2/*` | The current generation: D1-backed archive reads, KV-backed stats, admin, notify, OAuth. | Stable for `mood`, `moods`, `notify`, `comments`, `reactions`, `reader`. **`/v2/posts*` is a disabled placeholder.** It returns 404 with `{"error":{"code":"not_found"}}` until the `ENABLE_POSTS_API` flag ships. |
| `/api/moods`, `/api/comments`, unversioned `/musickit/token`, `/ghost/webhook` | Routes from before `/v2`, kept as aliases (`LEGACY_*_PATH` in `@bunizao/contracts/routes`). | Stable. New integrations should use the `/v2` path where one exists. |

When a route has both a legacy and a `/v2` form, both paths serve the same
data. Use `/v2` unless you need the freshness of the live Telegram mirror.

## Auth

The API has four auth tiers. Most public JSON endpoints are in the first one.
There is no API-key tier: nothing public accepts a long-lived bearer credential
from a third party.

### No auth

Anyone can call these. They are rate-limited but not gated.

- `mood`, `moods`, `comments`, `oembed.json`
- the SVG badges, RSS, `health`, `ping`
- reads from the [Blog Comments API](/docs/api/comments): `v2/comments` `GET`,
  `v2/reactions`, `v2/reader/me`, `v2/reader/avatar/*`

The first time someone writes a blog comment, the API sets a `reader_anon`
cookie automatically. The cookie marks who owns their anonymous rows. It does
not grant access and is not an auth tier of its own.

### Turnstile token

These routes need a Cloudflare Turnstile token. The token is checked before the
handler runs.

| Route | Turnstile action | Where to send the token |
| --- | --- | --- |
| `notify/subscribe` | `expectedAction: 'notify_subscribe'` | `turnstileToken`, `cfTurnstileResponse`, or `captchaToken` body field, or the `cf-turnstile-response` header |
| `notify/manage/request` | `expectedAction: 'notify_manage'` | Same as `notify/subscribe` |
| `v2/comments` `POST` | `expectedAction: 'blog_comment_create'` | `turnstileToken` body field only |
| `v2/reactions/toggle` | `expectedAction: 'blog_reaction'` | `turnstileToken` body field only |
| `v2/messages` | `expectedAction: 'owner_message_create'` | `turnstileToken` body field only |

A missing or failing token returns `400`. If Turnstile itself is unreachable,
the route returns `503` instead, so your client should handle the two
differently.

`v2/reactions/toggle` also accepts a one-hour `__Host-reader_pass` cookie in
place of a fresh token. The route issues that cookie after an earlier verified
token (see [Reactions](/docs/api/comments#reactions)).

### Email token

`notify/confirm`, `notify/unsubscribe`, `notify/manage` (`GET`/`PATCH`), and
`v2/reader/verify` take a single-purpose bearer token sent by email. Each token
authorizes one record (a subscriber, or a comment writer's address) and nothing
else.

- The notify routes take it as `?token=` and mostly render an HTML result page.
  See [Notify API](/docs/api/notify).
- `v2/reader/verify` takes it as a JSON body field and always answers in JSON.
  See [Blog Comments API](/docs/api/comments#lazy-email-verification).

### Admin session or Cloudflare Access

Everything under `/admin/*` and the OAuth hub. This reference doesn't cover
them. See [Auth and OAuth hub](/docs/platform/auth).

## Rate limits

Nearly every route is rate-limited. Limits are set per route; there is no
account-wide budget. Every rate-limited route sends the same four headers, on
success and on failure:

```
X-RateLimit-Limit: 180
X-RateLimit-Remaining: 180
X-RateLimit-Reset: 1755900000
X-RateLimit-Mode: <observability|durable|native>
```

`X-RateLimit-Reset` is a Unix timestamp in seconds, not a delta.

### Limiter modes

**Read `X-RateLimit-Mode` before you trust the other three headers.** It tells
you which limiter answered. Only two of the three modes enforce anything.

| Mode | Behavior |
| --- | --- |
| `durable` | One strongly consistent counter backed by a Durable Object. It counts and rejects. |
| `native` | Cloudflare's Workers Rate Limiting binding: a per-colo, eventually consistent counter. It rejects, but only reports allow or deny. The response has `X-RateLimit-Limit` and `X-RateLimit-Mode` (plus `Retry-After` on a `429`), and no `X-RateLimit-Remaining` or `X-RateLimit-Reset`. If the binding is missing, the route falls back to `durable`. |
| `observability` | Counts nothing and rejects nothing. The headers are computed from the route's configured limit and sent for measurement. `X-RateLimit-Remaining` always equals `X-RateLimit-Limit`, and every request is let through. |

Which routes use which mode:

- **`durable`**: `notify/manage`'s `PATCH`, `notify/manage/email`, and
  `notify/manage/delete`. On these three, letting a request through twice would
  let a caller race their own state or send mail to an inbox. The whole
  [Blog Comments API](/docs/api/comments) is `durable` too. It has no login
  gate, so its spam, abuse, and bot defenses depend on limits that reject.
- **The `GET /v2/reactions` exception**: an anonymous, cookie-less read counts
  against the same per-colo binding as the two `native` routes. A signed-in
  reader's own read stays `durable`, which keeps an exact count against the
  shared D1 budget. Neither read path sends `X-RateLimit-Mode`.
- **`native`**: the two analytics beacons, `POST /api/analytics/event` and
  `POST /api/v2/analytics/listening`. They need a flood guard, and a per-colo
  count is enough for that. A request is charged only after the origin and bot
  checks pass.
- **`observability`**: everything else.

### Handle 429 responses

The limits in the table below are the intended budget and the numbers you see
in the headers. They are not always a wall you will hit. A route outside the
`durable` and `native` lists above can't return `429` today, so a client that
relies on `429` for backpressure has no protection on those routes.

Don't read the absence of `429`s as permission to poll hard. The mode can
change per route without notice. The services behind the API (Ghost, GitHub,
Telegram, D1) also have their own limits, and this API doesn't shield you from
them.

A request over a `durable` or `native` limit gets `429` with
`Retry-After: <seconds>`. Depending on the route, the body is
`{"error":"Too Many Requests"}` or plain text (see
[Error shapes](#error-shapes)).

### Limits by route

| Route family | Window | Max | Enforced |
| --- | --- | --- | --- |
| `moods`, `v2/mood` (normal) | 60s | 180 | No |
| `moods`, `v2/mood` with `?fresh=1` (bypasses cache) | 60s | 30 | No |
| `v2/mood/search` | 60s | 30 | No |
| `v2/moods/live-counts`, `v1/mood/meta` | 60s | 240 | No |
| `v2/listening`, `writing`, `footer`, `github/contributions` | 60s | 60 | No |
| `musickit/token` | 60s | 30 | No |
| `oembed.json` | 60s | 120 | No |
| `static/*` (media proxy, on the `site` Worker) | 60s | 240 | No |
| `webhooks/ghost` | 60s | 30 | No |
| `notify/subscribe` | 10 min | 120 | No |
| `notify/manage/request` | 10 min | 30 | No |
| `notify/manage` `GET` | 10 min | 120 | No |
| `notify/confirm`, `notify/unsubscribe` | 10 min | 30 | No |
| `notify/change-email`, `notify/delete-record` | 10 min | 30 | No |
| **`notify/manage` `PATCH`** | 10 min | 60 | **Yes** |
| **`notify/manage/email`** | 60 min | 5 | **Yes** |
| **`notify/manage/delete`** | 60 min | 5 | **Yes** |
| **`v2/comments` `POST`** | 1 min / 60 min | 3 / 10 | **Yes** (3 dimensions: session, IP, fingerprint) |
| **`v2/comments/:id` `PATCH`** | 1 min | 10 | **Yes** |
| **`v2/reactions/toggle`** | 1 min | 30 | **Yes** |
| **`v2/reader/verify`** | 1 min | 10 | **Yes** |
| **`v2/reader/resend`** | 1 min | 5 | **Yes** (per IP; a separate per-address send suppression applies silently and never returns `429`) |
| **`v2/messages` `POST`** | 10 min / 24 h | 3 / 8 | **Yes** (3 dimensions: session, IP, fingerprint) |

## Error shapes

Error bodies come in two shapes: one for the mood feed family and one for
everything else.

**Mood feed, detail, comments, and stats** (`mood-api-routes.ts`,
`v2/mood/stats.ts`) return a nested object:

```json
{ "error": { "code": "mood_not_found", "message": "Mood document was not found." } }
```

**Notify, search, and everything built on `jsonError()`**
(`lib/http/json-response.ts`) return a flat string, sometimes with an extra
`code` field:

```json
{ "error": "Invalid JSON body" }
{ "error": "Turnstile verification failed", "code": "verify_unavailable" }
```

Check `typeof body.error` before you read `.message` or `.code` from it. In one
family `error` is a string, and in the other it is an object. There is no
version-wide error schema in `@bunizao/contracts`. Each feature defines its own
shape.

## Caching

Routes use one of three `Cache-Control` policies. The policy tells you how
stale a response can be.

| Policy | Meaning | Example routes |
| --- | --- | --- |
| `no-store, max-age=0` | Never cached anywhere. Used for visitor-specific responses and writes. | `notify/*`, `edge`, `?fresh=1` on any mood route |
| `public, max-age=0, s-maxage=N` | Not cached by the browser. Cached at the Cloudflare edge for `N` seconds. | `v2/mood` (30s latest / 300s history), `v2/moods/live-counts` (60s), `v2/mood/search` (300s) |
| `public, max-age=N, stale-while-revalidate=M` | The browser can cache it too. | `v2/mood/stats` (300s, then served stale for up to an hour while it refreshes) |

`?fresh=1` on any mood route forces `no-store` and skips the edge cache read
for that one request. Use it for a freshness check, not for routine polling. It
also moves you into the tighter `?fresh` rate limit (30/min instead of
180/min).

On the feed, `probe=1` skips the in-worker cache, but the CDN can still serve
it for up to 15s (see [Mood](/docs/api/mood)). Add `fresh=1` when a probe must
read through.

## CORS

Only four things on `site-api` set `Access-Control-Allow-Origin`:

- the two Telegram media/image proxies
- the Telegram webhook
- the oEmbed `html`/embed-widget response (`lib/embed-response.ts`, both `*`)

Every JSON endpoint in the [Mood API](/docs/api/mood) and
[Notify API](/docs/api/notify) (`mood`, `v2/mood`, `search`, `stats`,
`live-counts`, `notify/*`) sends no CORS headers. The browser blocks a
`fetch()` to them from another origin, even though the same request works from
`curl` or a server.

To use this data on a page hosted elsewhere, use the [oEmbed](/docs/api/oembed)
endpoint, proxy the request through your own backend, or ask for the route to
be added to the CORS allowlist. Don't try to route around it client-side.
