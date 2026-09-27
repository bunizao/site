---
title: Status & Edge
description: Liveness checks, the footer status pill, and what the Cloudflare edge knows about your connection.
group: API
order: 3
---

Four small endpoints that tell you whether the site is alive and which edge
location you reach it through. Only the footer status is cached at the edge.
Two of them never return an error by design, which matters if you build a
status indicator on top of them.

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
per request, so a changing timestamp proves the response did not come from a
cache. `Cache-Control: no-store, max-age=0`.

A `200` proves the Worker booted and can run a handler. The endpoint does
**not** touch D1, KV, R2, or the queue, so it tells you nothing about whether
the mood archive is readable. Nothing behind this route can fail, which lets it
separate "the Worker is down" from "a dependency is down".

`/api/v2/health` is a legacy alias. It answers `GET`/`HEAD` with a redirect to
`/api/health`.

## Ping

```
GET  /api/ping
HEAD /ping
```

`204 No Content`, empty body, `Cache-Control: no-store, max-age=0`. No auth,
no rate limit.

Ping is cheaper than `/api/health` because there is no JSON to serialize. Use
it for a latency probe or an uptime monitor that polls every few seconds. Use
`/api/health` when you want to read something back, and `/api/ping` when you
only want the round-trip time.

## Footer status

```
GET /api/footer
```

The data behind the status pill in the site footer. Rate limit: 60 requests /
60s.

```json
{ "status": "operational", "provider": "betterstack", "updatedAt": "2026-08-23T05:12:44.310Z" }
```

`status` is one of `operational`, `degraded`, `down`, `maintenance`, or
`unknown`. The upstream is Better Stack's public status JSON. Its
`aggregate_state` maps across almost unchanged. The one rename is Better
Stack's `downtime`, which becomes `down` here.

| Response | Cache headers |
| --- | --- |
| A known status | `Cache-Control: public, max-age=30` with `Cloudflare-CDN-Cache-Control: public, max-age=45, stale-while-revalidate=120, stale-if-error=3600`, and no rate-limit headers |
| `status: "unknown"` or `429` | `no-store, max-age=0` |

### Handle `unknown`

**This endpoint never returns an error for an upstream failure.** If Better
Stack is unreachable, times out (there is a 5s abort), or sends something
unparseable, the handler logs a warning and still returns `200` with
`status: "unknown"`.

Render `unknown` as its own state. It means the status check itself failed. A
UI that treats it as "no data yet" shows a stale-looking pill forever.

The only non-`200` you will see is `429 {"error":"Too Many Requests"}` from the
rate limiter.

### Caching layers

Two caching layers sit in front of Better Stack, and they are easy to confuse:

- The edge keeps the response for 45 seconds, then serves it stale for up to
  two minutes while it revalidates.
- The Worker caches the Better Stack probe for 45 seconds.

At worst, the pill lags Better Stack by a few minutes. A failed probe is never
cached at either layer.

When Cloudflare reports a three-letter colo for the request, the response also
has `x-cloudflare-colo: <XXX>`. This is the cheapest way to tell whether two
callers hit the same edge location. The edge cache is per colo, so a cached
copy still names the colo that served it.

The site footer fetches this route only when the footer is about to scroll
into view.

## Edge

```
GET /api/edge
```

What Cloudflare knows about the connection that made the request. `Cache-Control:
no-store, max-age=0`, because these are per-visitor facts. Sharing them across
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

Every field is nullable, and nulls are common:

- `city`, `region`, and `network` are absent for plenty of real networks.
- `rtt` is missing on a connection Cloudflare has not measured yet.
- Everything is null when the request did not come through Cloudflare at all
  (local `astro dev`, for example).

Type the response as `Partial` and render around the gaps instead of asserting
them.

`colo` is validated against `/^[A-Z]{3}$/` before it is returned. `rtt` is
rounded to a whole millisecond and clamped at zero. Both are either
well-formed or `null`.
