---
title: Analytics API
description: Same-origin write endpoints the site's own pages call, plus Cloudflare Access-gated reads for the admin portal.
group: API
order: 9
---

The analytics routes record how people read and listen on the site, and let
the admin portal read the results back. The seven routes fall into three groups
that authenticate in different ways:

| Group | Routes | Auth |
| --- | --- | --- |
| Writes | `event`, `v2/analytics/listening` | Open to any request that looks like it came from a page on `buxx.me`. No token or session, only an `Origin`/`Referer` check and a bot filter. |
| Reads | `events`, `summary`, `article/{slug}` | **Cloudflare Access only.** An admin session cookie does not open them. |
| Newsletter pixels | `newsletter/open`, `newsletter/click` | An HMAC token minted into the email authenticates the *event*, not the caller. |

These routes are not a general-purpose analytics ingest. The write endpoints
exist so the site can measure itself, and the origin gate keeps them from
becoming a public way to write into D1.

## The same-origin gate

Both write endpoints run the same check first. It rejects more than you might
expect:

1. The Worker collects `Origin` and `Referer`. **If both are absent, it
   rejects the request.** The usual CSRF pattern treats a missing `Origin` as
   same-origin; this gate does the opposite. A bare `curl` with no headers gets
   `403`.
2. A `localhost` / `127.0.0.1` origin is accepted **only** when the request
   itself arrived on `localhost` / `127.0.0.1`. You cannot claim a local origin
   against production.
3. Otherwise the origin must exactly match `https://buxx.me`,
   `https://www.buxx.me`, or the deployment's own `PUBLIC_SITE_URL` /
   `SITE_URL`.

A failed check returns `403 {"error":"origin_rejected"}`.

The gate is an anti-spam measure. It is not a security boundary: `Origin` is a
header, and a non-browser client can send any value it likes. The gate stops
casual drive-by writes but not a determined one.

The bot filter runs alongside the gate. If the `User-Agent` matches
`bot|spider|crawl|slurp|preview|facebookexternalhit|whatsapp|telegrambot`, the
Worker **accepts the request and discards it**: `204`, no body, nothing
written, whatever the body held. A `204` is not an error. It means the event
was understood and intentionally not recorded.

Both checks read headers only and run before the rate limiter, so rejected and
bot traffic never uses quota. After them come the rate limit (`native` mode,
see [Rate limits](/docs/api/overview#rate-limits)) and the body size check: the
raw body must be **4096 bytes or fewer** (`413 {"error":"body_too_large"}`).

## Record a reading event

```
POST /api/analytics/event
```

The blog reader posts this event as someone scrolls a post. Rate limit: 60 /
60s per IP and colo (`native`). A reader sends about one post a minute; the
rest is headroom for tab switches and a household behind one IP.

```json
{
  "eventId": "b7f1c4e2-9a3d-4f8b-9c21-6d0e5a7b8c9d",
  "slug": "some-post-slug",
  "visitorId": "a-stable-anonymous-id",
  "sessionId": "optional",
  "dwellMs": 42000,
  "scrollDepth": 0.62,
  "completed": false,
  "referrer": "https://news.ycombinator.com/"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `eventId` | yes | A v1–v8 UUID |
| `slug` | yes | No `/`, no control characters |
| `visitorId` | yes | 8 characters or more |
| `dwellMs` | no | Clamped to `0`–`7200000` (2 hours), then to the server's own clock (below) |
| `scrollDepth` | no | Clamped to `0`–`1` |
| `completed` | no | Stored as `true` if you send `completed: true` **or** if `scrollDepth >= 0.9`. Sending `completed: false` with a scroll depth of `0.95` still stores `true`. |
| `referrer` | no | Falls back to the request's own `Referer` header when omitted |

### Repeat posts for one page view

The write is an upsert keyed on `eventId`. The numeric columns merge with
`max()`, so `dwell_ms`, `scroll_depth`, and `completed` only ever go up.

Generate one `eventId` per page view and post it again as the reader
progresses. A later post with a *lower* dwell or scroll value does nothing,
which also means you cannot correct an inflated number by re-sending.

The stored dwell never exceeds the time the server has seen pass since the
first post of that `eventId`, plus two minutes. A client can claim any
`dwellMs`; it cannot make a page view last longer than the clock allows.

The server also records what it can see for itself: IP, country, region, city,
ASN and AS org, Cloudflare colo, user agent, parsed browser / OS / device type,
platform, and language. None of this comes from the payload, so a client can
neither spoof it nor suppress it. The first post of an `eventId` captures these
values; later posts only advance the progress columns and `updated_at`.

### Responses

| Response | Meaning |
| --- | --- |
| `200 {"status":"ok"}` | Accepted |
| `204` | Dropped: a bot, or the site already wrote its daily share of reading events |
| `400 {"error":"invalid_event_id"}`, `invalid_slug`, `invalid_visitor_id`, `invalid_body`, `invalid_json` | Validation failed |
| `403 origin_rejected` | Failed the origin gate |
| `413 body_too_large` | Body over 4096 bytes |
| `429` | Rate limited |
| `500 {"error":"analytics_event_failed"}` | A failure before the write starts |

Errors use the flat error shape. Once the body validates, the D1 write runs after the response (`waitUntil`).
A `200` therefore means "valid and queued". If storage fails, the error is
logged server-side instead of returned as a `500`. The `500` is left for
failures before the write starts, such as a missing database binding.

## Record a playback event

```
POST /api/v2/analytics/listening
```

This route works like the reading event: same gate, same caps, same `native`
60 / 60s limit, and the same write after the response. The first post of a
`playbackId` fixes the request metadata. The payload and its enums are
documented with the player in
[Listening API](/docs/api/listening#report-a-playback-event). The unhandled
failure code is `listening_analytics_event_failed`.

## Read analytics

```
GET /api/analytics/events?limit=50
GET /api/analytics/summary?days=30
GET /api/analytics/article/{slug}?days=30
```

All three call `requireCloudflareAccessIdentity` and answer
`401 {"error":"unauthorized"}` without it.

This is the one place in the API where the two admin gates differ. **The admin
session cookie that opens `/api/admin/*` does not open these routes.** They need
a Cloudflare Access JWT (`cf-access-jwt-assertion`). If a request works against
`/api/admin/subscribers` but gets `401` here, that is why.

| Parameter | Default | Range |
| --- | --- | --- |
| `limit` | `50` | 1–200 |
| `days` | `30` | 1–365 |

The Worker reads both with `Number()` and uses the default when the result is
not finite. The query layer then clamps the value. An out-of-range value is
clamped without an error, so `?days=100000` returns 365 days.
`article/{slug}` also returns `400 {"error":"slug_required"}` for an empty slug.

The response bodies are admin-facing aggregates. Like every admin route,
they are not specified here.

None of these routes return `405`. Only `GET` is exported, so any other method
falls through to Astro's router and gets a bare `404`. The write endpoints
behave the same way: `GET /api/analytics/event` is a `404`, not a `405`.

## Track newsletter opens and clicks

```
GET /api/analytics/newsletter/open?t={token}
GET /api/analytics/newsletter/click?t={token}
```

These URLs are embedded in outgoing email, so they are built to stay harmless
when anything goes wrong.

`t` is an HMAC token signed with `EMAIL_NOTIFY_SECRET`. It holds the event
type, email type, message and campaign ids, subscriber hash, and, for a click,
the destination URL. The token authenticates the event. There is no caller
auth, because the caller is a stranger's mail client.

**Both routes fail open and never report an error:**

| Route | Always returns | On a missing, invalid, expired, or wrong-type token |
| --- | --- | --- |
| `newsletter/open` | `200`, a 43-byte transparent GIF, `Content-Type: image/gif`, `Cache-Control: no-store, max-age=0` | The same pixel. A broken token looks the same as a good one. |
| `newsletter/click` | `302` | Redirects to `PUBLIC_SITE_URL` / `SITE_URL`, or `/blog` as a last resort, instead of the intended target. |

Both routes catch and log a D1 write failure, so the pixel still renders and
the click still redirects. A tracking failure should never put a broken image
in someone's inbox or strand them on an error page after clicking a link.

The click route takes its redirect target from the signed token, never from a
query parameter. It is not an open redirect: minting a new destination requires
`EMAIL_NOTIFY_SECRET`.

Because these are `GET` requests in email, expect inflated counts from mail
clients and security scanners that prefetch links and images. Neither route
runs the user-agent bot filter from the write endpoints, so nothing strips
those requests out. The recorder does drop an event whose
`subscriberCreatedAt` does not match the stored subscriber. That catches
replayed tokens from a since-deleted record, but not a scanner following a
live link.
