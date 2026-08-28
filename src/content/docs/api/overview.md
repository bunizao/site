---
title: API Overview
description: Who serves buxx.me/api, how versions and auth work, and the response conventions every endpoint on this site follows — or doesn't.
group: API
order: -1
---

`buxx.me/api/*` looks like one API. It is served by two Cloudflare Workers,
versioned three different ways depending on when an endpoint was written, and
does not agree with itself on how it shapes an error. This page is the map —
each convention says which endpoints actually follow it, because several
don't.

## Who answers a request

| Environment | What serves `/api/*`, `/v2/*`, `/oauth*` |
| --- | --- |
| Production (`buxx.me`) | Cloudflare route patterns point directly at the **`site-api`** Worker. The public `site` Worker never sees the request. |
| Preview / deploy builds | `site`'s `[...path].ts` catch-alls forward the request to `site-api` over the `API` service binding (`src/lib/http/api-service-proxy.ts`). |
| Local dev (`astro dev`) | `site` proxies over plain HTTP to `API_DEV_ORIGIN` (default `https://buxx.me`, or a local `wrangler dev site-api` via `bun dev:api`). |

`site-api` is a separate, private repository — it owns D1, KV, R2, queues,
crons, the Telegram webhook, and every concrete handler under `/api`, `/v1`,
`/v2`, `/notify`, `/admin`, and `/oauth`. `site` never re-implements a
handler, it only forwards. That split is deliberate: `site-api` is where
secrets and write access live, so keeping it a separate deploy target is the
actual public/private security boundary, not just a code-organization
choice.

## Path forms: `/api` is a prefix, not a directory

Every path in this reference is written the way you call it on `buxx.me` — with
the `/api` prefix. Inside `site-api` that prefix does not exist: the Worker
strips a leading `/api` at ingress (`normalizeApiIngressRequest`) before its
router sees the request, so `buxx.me/api/footer` is handled by the route file
that also answers `api.buxx.me/footer`.

| Origin | How to call `footer` |
| --- | --- |
| `buxx.me` (canonical) | `https://buxx.me/api/footer` |
| `api.buxx.me` | `https://api.buxx.me/footer` — the whole hostname is the API, so no prefix |
| `admin.buxx.me` | Admin portal and `/admin/*` only; public pages redirect back to `buxx.me` |

Both prefixed and bare forms work on either host — the strip is unconditional —
but use the prefixed form on `buxx.me` and the bare form on `api.buxx.me`.
Mixing them (`api.buxx.me/api/footer`) resolves, and is a coin-flip against a
future ingress change.

## Versioning: three generations, one worker

| Prefix | What it is | Status |
| --- | --- | --- |
| `/api/v1/mood*` | The live Telegram-mirror reader. Talks to `t.me` on every miss, cached at the edge in seconds. | Stable, used as the freshness fallback |
| `/api/v2/*` | The current generation: D1-backed archive reads, KV-backed stats, admin, notify, OAuth. | Stable for `mood`, `moods`, `notify`; **`/v2/posts*` is a disabled placeholder** — it 404s with `{"error":{"code":"not_found"}}` until the `ENABLE_POSTS_API` flag ships |
| `/api/moods`, `/api/comments`, unversioned `/musickit/token`, `/ghost/webhook` | Pre-`/v2` routes kept alive as aliases (`LEGACY_*_PATH` in `@bunizao/contracts/routes`) | Stable, but new integrations should use the `/v2` path where one exists |

There is no `Accept`-based or header-based version negotiation — the version
is the URL. A route that has both a legacy and a `/v2` form serves the same
data through two paths; pick `/v2` unless you specifically need the live
Telegram mirror's freshness.

## Auth

Four tiers, and most of the public JSON surface is the first one:

1. **None.** `mood`, `moods`, `comments`, `oembed.json`, the SVG badges, RSS,
   `health`, `ping`. Anyone can call these; they're rate-limited, not gated.
2. **Turnstile token.** `notify/subscribe` and `notify/manage/request` require
   a Cloudflare Turnstile token in the body (`turnstileToken`,
   `cfTurnstileResponse`, or `captchaToken` — any one field, or the
   `cf-turnstile-response` header) before the handler runs at all. A missing
   or failing token returns `400`; Turnstile itself being unreachable returns
   `503`, not `400` — a client should treat those differently.
3. **Bearer token in the URL.** `notify/confirm`, `notify/unsubscribe`, and
   `notify/manage` (`GET`/`PATCH`) take a single-purpose `?token=` issued by
   email. It authorizes one subscriber's own record, nothing else, and most
   of these routes render an HTML result page rather than JSON — see
   [Notify API](/docs/api/notify).
4. **Admin session / Cloudflare Access.** Everything under `/admin/*` and the
   OAuth hub. Out of scope for this reference — see
   [Auth and OAuth hub](/docs/platform/auth).

There is no API-key tier. Nothing on the public surface accepts a
long-lived bearer credential from a third party.

## Rate limits

Every rate-limited route (which is nearly all of them) answers with the same
four headers, success or failure:

```
X-RateLimit-Limit: 180
X-RateLimit-Remaining: 180
X-RateLimit-Reset: 1755900000
X-RateLimit-Mode: <observability|durable>
```

`X-RateLimit-Reset` is a Unix timestamp in seconds, not a delta.

**Read `X-RateLimit-Mode` before you trust the other three.** It reports which
limiter answered, and only one of the two actually enforces anything:

| Mode | Behavior |
| --- | --- |
| `durable` | A single strongly-consistent counter backed by a Durable Object. Really counts, really rejects. |
| `observability` | Counts nothing and rejects nothing. The headers are computed from the route's configured limit and emitted for measurement; `X-RateLimit-Remaining` always equals `X-RateLimit-Limit`, and every request is admitted. |

Today `durable` is used by exactly three endpoints — `notify/manage`'s `PATCH`,
`notify/manage/email`, and `notify/manage/delete` — the three places where
double-admitting would let a caller race their own state or put mail in an
inbox. Everything else on the surface runs in `observability` mode.

So the per-route limits below describe the *intended* budget and the numbers
you will see in the headers, not a wall you will hit. A `429` from any route
outside those three is currently unreachable, and client code that only handles
`429` for backpressure is, in practice, unprotected. Do not read the absence of
`429`s as licence to poll hard — the mode can be switched per route without
notice, and the underlying resources (Ghost, GitHub, Telegram, D1) have their
own limits that this surface does not shield you from.

A request that does exceed a `durable` limit gets `429` plus
`Retry-After: <seconds>`; the body is either `{"error":"Too Many Requests"}` or
plain text depending on the route (see
[Error shapes](#error-shapes-there-are-two)).

Limits are per-route, not a single account-wide budget:

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

## Error shapes — there are two

This is the sharpest edge on the whole surface: the mood-feed family and
everything else disagree about what an error body looks like.

**Mood feed / detail / comments / stats** (`mood-api-routes.ts`,
`v2/mood/stats.ts`) return a nested object:

```json
{ "error": { "code": "mood_not_found", "message": "Mood document was not found." } }
```

**Notify, search, and everything built on `jsonError()`**
(`lib/http/json-response.ts`) return a flat string, sometimes with an extra
`code` field bolted on:

```json
{ "error": "Invalid JSON body" }
{ "error": "Turnstile verification failed", "code": "verify_unavailable" }
```

Check `typeof body.error` before reading `.message` or `.code` off it — one
family's `error` is a string, the other's is an object. There is no
version-wide error schema in `@bunizao/contracts`; each feature owns its own
shape.

## Caching tiers

Three different `Cache-Control` policies show up across the surface, and
which one a route uses tells you how stale a response can be:

| Policy | Meaning | Example routes |
| --- | --- | --- |
| `no-store, max-age=0` | Never cached, anywhere. Visitor-specific, or a write. | `notify/*`, `edge`, `?fresh=1` on any mood route |
| `public, max-age=0, s-maxage=N` | Not cached by the browser; cached at the Cloudflare edge for `N` seconds. | `v2/mood` (30s latest / 300s history), `v2/moods/live-counts` (60s), `v2/mood/search` (300s) |
| `public, max-age=N, stale-while-revalidate=M` | Cacheable by the browser too. | `v2/mood/stats` (300s, then stale-served for up to an hour while it refreshes) |

`?fresh=1` (or `probe=1`) on any mood route forces `no-store` and skips the
edge cache read on that one request — use it for a freshness check, not for
routine polling, since it also drops you into the tighter `?fresh` rate
limit bucket (30/min instead of 180/min).

## CORS

Only four things on `site-api` set `Access-Control-Allow-Origin`: the two
Telegram media/image proxies, the Telegram webhook, and the oEmbed
`html`/embed-widget response (`lib/embed-response.ts`, both `*`). Every JSON
endpoint documented in [Mood API](/docs/api/mood) and
[Notify API](/docs/api/notify) — `mood`, `v2/mood`, `search`, `stats`,
`live-counts`, `notify/*` — sets no CORS header at all. `fetch()` from
browser JS on another origin will be blocked by the browser even though the
same request works fine from `curl` or a server. If you need this data in a
page hosted elsewhere, use the [oEmbed](/docs/api/oembed) endpoint, proxy the
request through your own backend, or ask for the route to be added to the
CORS allowlist rather than routing around it client-side.
