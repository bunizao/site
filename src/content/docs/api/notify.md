---
title: Notify API
description: Subscribe to mood-update emails and manage a subscription with Turnstile, token links, and HTML pages.
group: API
order: 5
---

The notify routes run one email subscription: subscribe, confirm, unsubscribe,
and manage it. There are nine public routes. Four of them (`confirm`,
`unsubscribe`'s `GET`, `change-email`, and `delete-record`) are links someone
clicks in an email client, so they render an HTML result page instead of JSON.
The rest return JSON for a form on the site to call directly. See
[API Overview](/docs/api/overview#auth) for how the Turnstile and token-in-URL
tiers fit into the site-wide auth picture.

| Route | Methods | Returns |
| --- | --- | --- |
| `/api/notify/subscribe` | `POST` | JSON |
| `/api/notify/confirm` | `GET`, `POST` | HTML |
| `/api/notify/unsubscribe` | `GET`, `POST` | HTML |
| `/api/notify/manage` | `GET`, `PATCH` | JSON |
| `/api/notify/manage/request` | `POST` | JSON |
| `/api/notify/manage/email` | `POST` | JSON |
| `/api/notify/change-email` | `GET`, `POST` | HTML |
| `/api/notify/manage/delete` | `POST` | JSON |
| `/api/notify/delete-record` | `GET`, `POST` | HTML |
| `/api/notify/redirect` | `GET` | `302` |

Dispatch, scheduling, retry, and preview are gated by cron and secrets, so they
are not public. They are listed in the owner-only
[Internal endpoints](/docs/api/endpoints#scheduled-notification-routes).

Every destructive change takes **two steps across two requests**. A JSON route
mails a confirmation link, and the recipient opens an HTML route to commit the
change. The first call never changes a subscriber record.

## Subscriber counts

```
GET /api/v2/notify/stats
```

Public aggregate counts of active, email-confirmed subscribers by the two
published feeds. Suppressed addresses, pending subscriptions, unsubscribed
records, and admin-created active records without confirmation are excluded.
An address subscribed to both feeds counts once in each feed.

```json
{
  "generatedAt": "2026-10-04T19:00:00.000Z",
  "channels": { "blog": 42, "mood": 51 }
}
```

The route reads only KV. A scheduled job refreshes the snapshot daily at
19:00 UTC. Successful responses use `Cache-Control: public, max-age=300` and
`Cloudflare-CDN-Cache-Control: public, max-age=3600, stale-while-revalidate=86400`.
An absent, invalid or unavailable snapshot returns uncached `503` with
`error.code: "subscriber_counts_unavailable"`. No addresses, identities,
subscription origins or individual records are exposed.

## Subscribe

```
POST /api/notify/subscribe
```

Rate limit: 120 requests / 10 min.

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
`deliveryMode` is `immediate` | `every_5h` | `daily`. `dailyHour` only matters
when `deliveryMode` is `daily`.

Optional `website` is a honeypot: a filled value returns the same successful
response and sends no mail. Optional `dwellToken` comes from
`GET /api/v2/comments/dwell-token`. The optional flat `clientFp`,
`interaction`, and `storageId` fields carry the same browser evidence as
comments. Missing or young dwell tokens and browser evidence contribute
risk hints; they do not reject older clients or any input method. Unknown
fields are ignored.

Optional `source` accepts `desk`, `blog`, or `mood`, naming the page where the
subscription began rather than the chosen email channels. Unknown values
are ignored. The first accepted signup records this origin; later requests,
preference changes and confirmation retries preserve it. Existing subscribers
without recorded origins stay unknown, and an address change preserves the
original origin. This is private metadata shown only in the admin portal.

The handler looks for the Turnstile token in four places before it rejects the
request:

- `turnstileToken`
- `cfTurnstileResponse`
- `captchaToken`
- the `cf-turnstile-response` header

Success is always `200`, and the response does not reveal whether the address
was already subscribed:

```json
{ "status": "confirmation_sent", "email": "you@example.com", "deliveryMode": "immediate" }
```

The public route always returns `confirmation_sent`. Existing subscriptions and
addresses suppressed after a permanent bounce or complaint get the same
response, so it does not prove that a new message was sent.
Confirmation mail has a six-hour per-address cooldown across synchronous
and queued delivery. Repeated requests during that window return the same
`200` without sending another confirmation, including requests that change
the requested preferences.

Blog newsletters reach all active Blog subscribers regardless of the Mood
delivery mode.

**Errors:**

- `400 {"error":"Invalid JSON body"}` for a malformed body.
- `400 {"error":"Turnstile verification failed","code":"..."}` for a rejected
  token.
- `503 {"error":"Turnstile verification unavailable","code":"verify_unavailable"|"not_configured"}`
  if Turnstile itself can't be reached. Retry this one, and don't tell the user
  their input was wrong.
- Domain errors from `NotifyServiceError` (bad email, unknown channel, and so
  on) surface as `{error.status} {"error":"<message>","code":"<code>"}`.

## Confirm

```
GET  /api/notify/confirm?token=...
POST /api/notify/confirm
```

**Not a JSON endpoint.** This is the link in the confirmation email. `GET`
shows a confirmation form and does not change the subscription. The form's
`POST` confirms the current request and opens the preferences page. Link
scanners that fetch the email URL therefore cannot activate a subscription.

A missing `token` renders the same error page instead of a 400 status, because
the only realistic caller is a person reading it in a browser.

Rate limit: 30 requests / 10 min, observability only, so it never rejects
today. If it ever rejects, the route returns a plain `429 Too Many Requests`
text response instead of the templated page.

## Unsubscribe

```
GET  /api/notify/unsubscribe?token=...
POST /api/notify/unsubscribe
```

The two methods on this path behave differently. Both are **HTML, not JSON**.

- **`GET`** is the link a person clicks in an email footer. It validates the
  token (`previewUnsubscribeToken`) but does **not** unsubscribe. It `302`s to
  `/subscribe/manage?token=...&intent=unsubscribe`, so the change happens on a
  page the person can see and confirm. The redirect response sets
  `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and a locked-down
  CSP, so the token doesn't leak through a `Referer` header on the next hop.
- **`POST`** is the real one-click unsubscribe. A mail client with
  `List-Unsubscribe-Post` support calls it automatically, with no page view. It
  unsubscribes immediately and returns the HTML result page with HTTP 200 on
  success. A persistence failure returns HTTP 503 so the mail client can retry.
  Token errors keep their service error status.

For `POST`, `readNotifyTokenFromRequest` reads `token` from a form field, a
query param, or a JSON body, whichever the sending mail client uses.

Rate limit: 30 requests / 10 min on both methods, counted in the same bucket.

## Manage

```
GET   /api/notify/manage?token=...
PATCH /api/notify/manage
```

This is the one pair of notify routes that **is** plain JSON. The
`/subscribe/manage` page on the site calls it to read and edit a subscription
in place. `token` always comes from the `?token=` query parameter, even on
`PATCH`.

**`GET`** returns the current subscription view (channels, delivery mode,
timezone, status). Rate limit: 120 requests / 10 min, observability only (it
never rejects).

**`PATCH`** applies a partial update. Send only the fields you're changing:

```json
{ "status": "unsubscribed", "channels": ["mood"], "deliveryMode": "daily", "timezone": "UTC", "dailyHour": 9 }
```

`timezone` and `dailyHour` accept an explicit `null`, which clears the
override. Omitting the field leaves it unchanged. The handler checks `typeof`
before forwarding, so an omitted key and an explicit `null` are different
requests.

Rate limit: **60 requests / 10 min, durable**. The durable limiter is a
strongly consistent Durable Object counter that rejects with `429`. Most notify
routes use the observability limiter instead, which only sends headers. This
is the only notify route that uses it to stop a client's own rapid toggle
requests from racing each other into an inconsistent state.

Both methods respond with `Cache-Control: no-store, max-age=0`.

**Errors** on both: `400 {"error":"Invalid JSON body"}` (`PATCH` only), or a
`NotifyServiceError` surfaced as `{status} {"error":"<message>","code":"<code>"}`.
The most common one is an expired or invalid token.

## Request a manage link

```
POST /api/notify/manage/request
```

Use this when someone has deleted the original email. Send an address, and if
that address has a subscription, the route mails a fresh manage link.

The route is Turnstile-gated exactly like `subscribe`, with the same three body
fields plus the header fallback. For the same enumeration reason, the success
response is vague:

```json
{ "status": "link_sent" }
```

Rate limit: 30 requests / 10 min. The Turnstile errors are the same `400`/`503`
split as `subscribe`.

## Change the subscribed address

Changing the address takes two requests. `manage/email` mails a confirmation to
the *proposed* address, and the recipient opens `change-email` to commit it.

### Request the change

```
POST /api/notify/manage/email?token={manageToken}
```

```json
{ "newEmail": "new@example.com" }
```

The manage token stays in the query string, and the new address goes in the
body. The body is capped at 16 KB. The route streams it and aborts mid-read
once the cap is exceeded, so an oversized payload never lands in memory.

Rate limit: **5 requests / 60 min, durable**. This endpoint puts mail in an
inbox the caller has not proven any relationship to. It is one of three notify
limits that reject requests: `manage` `PATCH`, `manage/email`, and
`manage/delete`. Every other notify limit on this page is observability only:
it sends `X-RateLimit-*` headers and never returns `429` today.

Success is always:

```json
{ "status": "change_email_sent" }
```

**This includes the case where the target address is already subscribed**,
and then no mail is sent at all. The two branches are timed to match: the
"already taken" path sleeps until at least 500 ms have passed, so response time
cannot tell it apart from the much slower real path. You cannot use this route
to probe whether an address has an account.

**Errors:**

| Response | Cause |
| --- | --- |
| `401 {"error":"Invalid manage link","code":"invalid_manage_token"}` | Missing or bad token |
| `400 …"code":"invalid_email"` | Malformed address, or one over 254 characters |
| `400 …"code":"email_unchanged"` | The new address equals the current one |
| `400 {"error":"Request body is too large"}` | Body over 16 KB |
| `405 Method Not Allowed` (plain text) | Any method other than `POST` |

### Confirm the change

```
GET  /api/notify/change-email?token={changeToken}
POST /api/notify/change-email
```

**HTML, not JSON.** This is the link in the confirmation email. `GET` previews
the change and renders a confirmation form, and the form's `POST` commits it.
The `POST` must be same-origin.

The change token is separate from the manage token and expires after **1
hour**. Rate limit: 30 / 10 min, observability only, so it never rejects
today. If it ever rejects, the route returns a plain `429 Too Many Requests`
instead of the templated page.

Opening an already-used link renders a **success** page ("that address is
already confirmed"). A mail client that prefetches links can open it a second
time, and that should not look like a failure to the person reading it.

## Delete the record

Deleting uses the same two-step shape, and the second step cannot be undone.

### Request the deletion

```
POST /api/notify/manage/delete?token={manageToken}
```

No body. Rate limit: **5 requests / 60 min, durable**. Success:

```json
{ "status": "delete_link_sent" }
```

The confirmation always goes to the subscriber's **current** address, never to
a historical one. An address that was on the record before a change may belong
to someone else by now, so it never counts as an authorization factor.

Calling this twice does not send two emails. While an unused, unexpired delete
request already exists for the record, the route returns the same
`delete_link_sent` and mails nothing. A leaked manage link therefore cannot be
used to amplify email to an inbox.

**Errors:**

- `401 …"code":"invalid_manage_token"`
- a `NotifyServiceError` surfaced as
  `{status} {"error":"<message>","code":"<code>"}`
- `500 {"error":"Internal Server Error"}`
- `405 Method Not Allowed` (plain text) for anything but `POST`

### Confirm the deletion

```
GET  /api/notify/delete-record?token={deleteToken}
POST /api/notify/delete-record
```

**HTML, not JSON.** `GET` renders the confirmation form, and the same-origin
`POST` performs the deletion. The delete token expires after **1 hour** and
works only once. Rate limit: 30 / 10 min.

## Outbound link redirect

```
GET /api/notify/redirect?url=...&sig=...
```

Mood emails don't link straight to other sites. Every external `href` in
the HTML part points here, and the route forwards with a `302` to `url`.
The plain-text part keeps the real URLs. Short `youtu.be` links are expanded
to `youtube.com/watch` before signing.

`sig` is an HMAC-SHA256 of the exact target URL, keyed by the notify secret.
The route only forwards to URLs that this service signed, so it can't be used
as an open redirect. A missing or forged signature, or a target that isn't
`http(s)`, redirects to `/mood` instead. Links have no expiry, so old emails
keep working.

Responses set `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
No click is recorded.

## Response headers

Every JSON route here sets `Cache-Control: no-store, max-age=0`. The HTML
result pages also set `Referrer-Policy: no-referrer` and a locked-down CSP. A
token in the URL then cannot leak to a third party through a `Referer` header,
either when the page loads or when the reader clicks onward.
