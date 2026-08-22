---
title: Notify API
description: Subscribe, confirm, unsubscribe, and manage a mood-update email subscription — the Turnstile gate, the token-in-URL auth model, and which routes return HTML instead of JSON.
group: API
order: 1
---

The notify surface is one email subscription flowing through five routes.
Two of them (`confirm`, and `unsubscribe`'s `GET`) are meant to be clicked
from an email client, not called by a script — they render an HTML result
page, not JSON. The rest are JSON for a form on the site to call directly.
See [API Overview](/docs/api/overview#auth) for how the Turnstile and
token-in-URL tiers fit into the site-wide auth picture.

## Subscribe

```
POST /notify/subscribe
```

Body:

```json
{
  "email": "you@example.com",
  "channels": ["mood"],
  "deliveryMode": "immediate",
  "timezone": "Australia/Melbourne",
  "dailyHour": 8,
  "turnstileToken": "..."
}
```

`channels` is any subset of `mood` | `blog` | `privacy` | `announcement`.
`deliveryMode` is `immediate` | `every_5h` | `daily`; `dailyHour` only
matters when `deliveryMode` is `daily`. The Turnstile token can arrive as
`turnstileToken`, `cfTurnstileResponse`, `captchaToken`, or the
`cf-turnstile-response` header — the handler checks all four before
rejecting. Rate limit: 120 requests / 10 min.

Success is always `200`, and it does not reveal whether the address was
already subscribed:

```json
{ "status": "confirmation_sent", "email": "you@example.com", "deliveryMode": "immediate" }
```

`status` is `"confirmation_sent"` for a new signup or `"already_subscribed"`
for an address already active — a client should show the same "check your
inbox" message either way, since distinguishing them would let a caller
enumerate subscribed addresses.

**Errors:** `400 {"error":"Invalid JSON body"}` for a malformed body;
`400 {"error":"Turnstile verification failed","code":"..."}` for a rejected
token; `503 {"error":"Turnstile verification unavailable","code":"verify_unavailable"|"not_configured"}`
if Turnstile itself can't be reached — retry this one, don't tell the user
their input was wrong. Domain errors from `NotifyServiceError` (bad email,
unknown channel, etc.) surface as `{error.status} {"error":"<message>","code":"<code>"}`.

## Confirm

```
GET /notify/confirm?token=...
```

**Not a JSON endpoint.** This is the link from the confirmation email —
opening it in a browser confirms the subscription and renders a full HTML
result page (`renderNotifyPage`), success or failure, styled like the rest
of the site. A missing `token` renders the same error page rather than a
400 status, since a human reading it in a browser is the only realistic
caller. Rate limit: 30 requests / 10 min; a rate-limited hit gets a plain
`429 Too Many Requests` text response instead of the templated page.

## Unsubscribe

```
GET  /notify/unsubscribe?token=...
POST /notify/unsubscribe
```

Two different behaviors sharing one path, both **HTML, not JSON**:

- **`GET`** is the link a human clicks from an email footer. It validates
  the token (`previewUnsubscribeToken`) but does **not** unsubscribe on its
  own — it `302`s to `/subscribe/manage?token=...&intent=unsubscribe` so the
  actual state change happens on a page the person can see and confirm,
  with `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and a
  locked-down CSP on the redirect response so the token doesn't leak via a
  `Referer` header on the next hop.
- **`POST`** is the actual one-click unsubscribe — this is what a mail
  client's `List-Unsubscribe-Post` support calls automatically, no page
  view required. It unsubscribes immediately and returns the HTML result
  page directly (still HTML — this is not meant for programmatic callers
  either).

`token` for `POST` is read via `readNotifyTokenFromRequest`, which accepts
either a `token` form field/query param or a JSON body — whatever the
sending mail client uses. Rate limit: 30 requests / 10 min on both methods,
tracked under the same bucket.

## Manage

```
GET   /notify/manage?token=...
PATCH /notify/manage
```

The one pair of notify routes that **is** plain JSON — this is what the
`/subscribe/manage` page on the site calls to read and edit a subscription
in place. `token` is always read from the `?token=` query parameter, even
on `PATCH`.

**`GET`** returns the current subscription view (channels, delivery mode,
timezone, status). Rate limit: 120 requests / 10 min, edge-counted.

**`PATCH`** applies a partial update — send only the fields you're
changing:

```json
{ "status": "unsubscribed", "channels": ["mood"], "deliveryMode": "daily", "timezone": "UTC", "dailyHour": 9 }
```

`timezone` and `dailyHour` accept `null` explicitly (clear the override),
distinct from omitting the field (leave it unchanged) — the handler checks
`typeof` before forwarding, so an omitted key and an explicit `null` are not
the same request. Rate limit: **60 requests / 10 min, durable** (a
strongly-consistent Durable Object counter, not the usual edge counter) —
this route is the one place in the whole API where the durable limiter is
used specifically to stop a client's own rapid-fire toggle requests from
racing each other into an inconsistent state. Both methods respond with
`Cache-Control: no-store, max-age=0`.

**Errors** on both: `400 {"error":"Invalid JSON body"}` (PATCH only), or a
`NotifyServiceError` surfaced as `{status} {"error":"<message>","code":"<code>"}`
— most commonly an expired or invalid token.

## Request a manage link

```
POST /notify/manage/request
```

For someone who deleted the original email: send an address, get a fresh
manage-link email if that address has a subscription. Turnstile-gated
exactly like `subscribe` (same three body fields plus the header
fallback), and deliberately vague on success for the same enumeration
reason:

```json
{ "status": "link_sent" }
```

Rate limit: 30 requests / 10 min. Same `400`/`503` Turnstile error split as
`subscribe`.
