---
title: Analytics API
description: Seven routes that split cleanly in two — same-origin write endpoints the site's own pages call, and Cloudflare Access-gated read endpoints only the admin portal can reach.
group: API
order: 9
---

Seven routes, two halves that behave nothing alike:

- **Writes** (`event`, `v2/analytics/listening`) are open to anyone whose
  request looks like it came from a page on `buxx.me`. No token, no session —
  an `Origin`/`Referer` check and a bot filter.
- **Reads** (`events`, `summary`, `article/{slug}`) are gated by
  **Cloudflare Access only**. An admin session cookie does not open them.
- **Newsletter pixels** (`newsletter/open`, `newsletter/click`) authenticate
  the *event*, not the caller, with an HMAC token minted into the email.

Nothing here is a general-purpose analytics ingest. The write endpoints exist
so the site can measure itself, and the origin gate is what keeps them from
becoming a public write surface into D1.

## The same-origin gate

Both write endpoints start with the same check, and it rejects more than you
might expect:

1. Collect `Origin` and `Referer`. **If both are absent, reject** — this is
   the opposite of the usual CSRF pattern, where a missing `Origin` is
   treated as same-origin. A bare `curl` with no headers gets `403`.
2. A `localhost` / `127.0.0.1` origin is accepted **only** when the request
   itself arrived on `localhost` / `127.0.0.1`. You cannot claim a local
   origin against production.
3. Otherwise the origin must exactly match `https://buxx.me`,
   `https://www.buxx.me`, or the deployment's own `PUBLIC_SITE_URL` /
   `SITE_URL`.

Failure is `403 {"error":"origin_rejected"}`.

This is an anti-spam measure, not a security boundary — `Origin` is a header
and a non-browser client can send whatever it likes. It stops casual
drive-by writes; it does not stop a determined one.

After the gate, both endpoints apply the same two limits: the raw body must be
**4096 bytes or fewer** (`413 {"error":"body_too_large"}`), and a request whose
`User-Agent` matches `bot|spider|crawl|slurp|preview|facebookexternalhit|whatsapp|telegrambot`
is **accepted and discarded** — `204`, no body, nothing written. A `204` is
not an error; it means "understood, deliberately not recorded".

## Record a reading event

```
POST /api/analytics/event
```

Rate limit: 600 / 60s. What the blog reader posts as someone scrolls a post.

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

**Required:** `eventId` (a v1–v8 UUID), `slug` (no `/`, no control
characters), `visitorId` (8 characters or more). `dwellMs` is clamped to
`0`–`7200000` (2 hours) and `scrollDepth` to `0`–`1`.

`completed` is computed, not just accepted: it is `true` if you send
`completed: true` **or** if `scrollDepth >= 0.9`. Sending `completed: false`
alongside a scroll depth of `0.95` still stores `true`.

`referrer` falls back to the request's own `Referer` header when omitted.

### Repeat posts merge, they don't duplicate

The write is an upsert keyed on `eventId`, and the numeric columns merge with
`max()` — `dwell_ms`, `scroll_depth`, and `completed` only ever go up. So the
intended client pattern is to generate one `eventId` per page view and post it
repeatedly as the reader progresses. Posting a *lower* dwell or scroll value
later is a no-op, which also means you cannot correct an inflated number by
re-sending.

Alongside the body, the server records what it can see for itself: IP,
country, region, city, ASN and AS org, Cloudflare colo, user agent, parsed
browser / OS / device type, platform, and language. None of that comes from
the payload, so a client cannot spoof it — and cannot suppress it either.

Responses: `200 {"status":"ok"}` stored, `204` dropped as a bot, or a flat
error — `400 {"error":"invalid_event_id"}`, `invalid_slug`,
`invalid_visitor_id`, `invalid_body`, `invalid_json`; `403 origin_rejected`;
`413 body_too_large`; `500 {"error":"analytics_event_failed"}`.

## Record a playback event

```
POST /api/v2/analytics/listening
```

Same gate, same caps, 600 / 60s. The payload and its enums are documented
with the player itself — see
[Listening API](/docs/api/listening#report-a-playback-event). Its unhandled
failure code is `listening_analytics_event_failed`.

## Reads are Cloudflare Access only

```
GET /api/analytics/events?limit=50
GET /api/analytics/summary?days=30
GET /api/analytics/article/{slug}?days=30
```

All three call `requireCloudflareAccessIdentity` and answer
`401 {"error":"unauthorized"}` without it. This is worth stating plainly
because it is the one place on the surface where the two admin gates diverge:
**the admin session cookie that opens `/api/admin/*` does not open these.**
They need a Cloudflare Access JWT (`cf-access-jwt-assertion`). If a request
works against `/api/admin/subscribers` and `401`s here, that is why — see
[Internal Endpoints](/docs/api/internal#admin-auth).

`limit` and `days` are read with `Number()` and fall back to `50` / `30` when
the result is not finite, then clamped inside the query layer — `limit` to
1-200, `days` to 1-365. An out-of-range value is silently clamped rather than
rejected, so `?days=100000` returns 365 days and no error.
`article/{slug}` additionally returns `400 {"error":"slug_required"}` for an
empty slug.

Response bodies are admin-facing aggregates and are not specified here, on the
same grounds as the rest of [Internal Endpoints](/docs/api/internal).

Note there is no `405` on any of these: only `GET` is exported, so any other
method falls through to Astro's router and returns a bare `404`. That is true
of the write endpoints too — `GET /api/analytics/event` is a `404`, not a
`405`.

## Newsletter open and click tracking

```
GET /api/analytics/newsletter/open?t={token}
GET /api/analytics/newsletter/click?t={token}
```

These are embedded in outgoing email, so they are built to be harmless when
anything goes wrong. `t` is an HMAC token signed with `EMAIL_NOTIFY_SECRET`
carrying the event type, email type, message and campaign ids, subscriber
hash, and — for a click — the destination URL. The token authenticates the
event; there is no caller auth, because the caller is a stranger's mail
client.

**Both fail open, and neither ever reports an error:**

| Route | Always returns | On a missing, invalid, expired, or wrong-type token |
| --- | --- | --- |
| `newsletter/open` | `200`, a 43-byte transparent GIF, `Content-Type: image/gif`, `Cache-Control: no-store, max-age=0` | The same pixel. A broken token is indistinguishable from a good one. |
| `newsletter/click` | `302` | Redirects to `PUBLIC_SITE_URL` / `SITE_URL`, or `/blog` as a last resort, instead of the intended target. |

A D1 write failure is caught and logged on both — the pixel still renders and
the click still redirects. The reasoning is that a tracking failure must never
show a broken image in someone's inbox or strand them on an error page from a
link they clicked in good faith.

The click redirect target comes out of the signed token, never from a query
parameter, so this is not an open redirect: minting a new destination requires
`EMAIL_NOTIFY_SECRET`.

Since these are `GET`s in email, expect inflated counts from mail clients and
security scanners that prefetch links and images. Neither route runs the
user-agent bot filter that the write endpoints use, so nothing strips those
out. The recorder does drop an event whose `subscriberCreatedAt` does not
match the stored subscriber, which catches replayed tokens from a since-deleted
record but not a scanner following a live link.
