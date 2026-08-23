---
title: Status & Edge
description: Liveness checks, the footer status pill, and the per-visitor edge facts — four small endpoints that never cache and never fail loudly.
group: API
order: 3
---

Four endpoints that answer "is anything alive, and where am I talking to it
from". None of them are cached at the edge, and two of them are deliberately
incapable of returning an error — read on for why that matters when you build
a status indicator on top of them.

## Health

```
GET  /api/health
HEAD /health
```

No auth, no rate limit, no query parameters. Always `200`:

```json
{ "status": "ok", "service": "site-api", "checkedAt": "2026-08-23T05:12:44.310Z" }
```

`HEAD` returns the same headers with an empty body. `checkedAt` is generated
per request, so a changing timestamp is your proof the response is not coming
from a cache. `Cache-Control: no-store, max-age=0`.

This endpoint proves the Worker booted and can run a handler. It does **not**
touch D1, KV, R2, or the queue — a `200` here tells you nothing about whether
the mood archive is readable. Nothing behind this route can fail, which is the
point: it is the check that isolates "the Worker is down" from "a dependency
is down".

`/api/v2/health` is a legacy alias and answers `GET`/`HEAD` with a redirect
to `/api/health`.

## Ping

```
GET  /api/ping
HEAD /ping
```

`204 No Content`, empty body, `Cache-Control: no-store, max-age=0`. No auth,
no rate limit.

Cheaper than `/api/health` — there is no JSON to serialize — so it is the better
target for a latency probe or an uptime monitor polling every few seconds. Use
`/api/health` when you want to read something back, `/api/ping` when you only want the
round-trip time.

## Footer status

```
GET /api/footer
```

The data behind the status pill in the site footer. Rate limit: 60 requests /
60s. `Cache-Control: no-store, max-age=0`.

```json
{ "status": "operational", "provider": "betterstack", "updatedAt": "2026-08-23T05:12:44.310Z" }
```

`status` is one of `operational`, `degraded`, `down`, `maintenance`, or
`unknown`. Upstream is Better Stack's public status JSON, whose
`aggregate_state` maps across almost verbatim — the one rename is Better
Stack's `downtime`, which becomes `down` here.

**This endpoint never returns an error for an upstream failure.** If Better
Stack is unreachable, times out (there is a 5s abort), or answers with
something unparseable, the handler logs a warning and still returns `200` with
`status: "unknown"`. So `unknown` is not a null value you can skip — it is the
signal that the status check itself failed, and a UI that treats it as "no
data yet" will silently show a stale-looking pill forever. Render it as its own
state.

The only non-`200` you will see is `429 {"error":"Too Many Requests"}` from the
rate limiter.

Two caching layers are at work and they are easy to confuse: the response you
get is `no-store` and never cached, but the Better Stack probe behind it is
cached inside the Worker for 45 seconds. So `updatedAt` can be up to 45s old on
a response that was itself generated just now.

Responses also carry `x-cloudflare-colo: <XXX>` when Cloudflare reports a
three-letter colo for the request, which is the cheapest way to tell whether
two callers are hitting the same edge location.

## Edge

```
GET /api/edge
```

What Cloudflare knows about the connection that asked. `Cache-Control:
no-store, max-age=0` — these are per-visitor facts and sharing them across
requests would hand one visitor another's location.

```json
{
  "colo": "MEL",
  "country": "AU",
  "city": "Melbourne",
  "region": "Victoria",
  "protocol": "HTTP/3",
  "tls": "TLSv1.3",
  "rtt": 12,
  "network": "Telstra Limited"
}
```

Every field is nullable and frequently null — `city`, `region`, and `network`
are absent for plenty of real networks, `rtt` is missing on a connection
Cloudflare has not measured yet, and everything is null when the request did
not arrive through Cloudflare at all (local `astro dev`, for instance). Type
the response as `Partial` and render around the gaps rather than asserting
them.

`colo` is validated against `/^[A-Z]{3}$/` before it is returned, and `rtt` is
rounded to a whole millisecond and clamped at zero, so neither can surprise you
with a malformed value — they are either well-formed or `null`.
