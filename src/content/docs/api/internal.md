---
title: Internal Endpoints
description: The admin, webhook, and cron-triggered routes — what exists at each path, how it is gated, and why this page lists them instead of specifying them.
group: API
order: 11
badge: Gated
---

Everything on this page is part of the URL surface of `buxx.me`, so it belongs
in a complete route reference. None of it is callable by you.

This page gives the path, the method, the purpose, and the gate. It does not
give request or response contracts, because `site-api` is the private half of
the [public/private boundary](/docs/api/overview#who-answers-a-request) and
publishing the shape of an admin write endpoint on a public docs site is how
that boundary stops being one. Contracts for these live in the `site-api`
repository next to the handlers.

Paths are written in their bare form here. On `buxx.me` they carry the `/api`
prefix (`buxx.me/api/admin/session`); on `api.buxx.me` and `admin.buxx.me` they
do not — see [Path forms](/docs/api/overview#path-forms-api-is-a-prefix-not-a-directory).
The admin portal pages are the exception: they are host-gated to
`admin.buxx.me` and `308` there from anywhere else.

## Admin auth

Admin access is GitHub OAuth in front of a session cookie, with Cloudflare
Access as an additional layer where it is configured.

| Path | Method | What it does |
| --- | --- | --- |
| `/admin/auth/start` | `GET` | Begins the OAuth flow. `302` to the provider, or to `/oauth/login?error=config` when OAuth is not configured. Honors `?next=`, default `/admin`. |
| `/admin/auth/callback` | `GET` | Provider redirect target. Exchanges the code and sets the session cookie. |
| `/admin/auth/logout` | `GET` | Clears the session. |
| `/admin/session` | `GET`, `HEAD` | Returns the signed-in identity (`login`, `avatarUrl`) so the portal can render who you are. `HEAD` is a `204` liveness check. |
| `/oauth/login` | `GET` | The login landing page for the OAuth hub. |

Every other `/admin/*` route is guarded in middleware, before the handler runs.
An unauthenticated request gets `401` — not a `302` to a login page — because
these are API routes and a redirect would be indistinguishable from success to
a script. `/admin/session` is the only route that assumes a session already
exists, since middleware guarantees one by the time it is reached.

## Admin JSON API

All gated by the admin session.

| Path | Purpose |
| --- | --- |
| `/admin/audit` | Audit log entries. |
| `/admin/ai/test` | Exercises the AI provider configuration. |
| `/admin/broadcasts` | Newsletter broadcast list and creation. |
| `/admin/broadcasts/:id` | A single broadcast. |
| `/admin/broadcasts/:id/progress` | Send progress for a broadcast in flight. |
| `/admin/broadcasts/preview` | Renders a broadcast without sending it. |
| `/admin/subscribers` | Subscriber list. |
| `/admin/subscribers/:hash` | A single subscriber, addressed by hash rather than email. |
| `/admin/subscribers/:hash/blog-welcome` | Manually sends the blog welcome email. |
| `/admin/mood/search` | Admin-side mood search. |
| `/admin/mood/health` | Mood pipeline health — ingest, queue, and archive state. |
| `/admin/mood/ai-config` | Mood AI configuration. |
| `/admin/notify-gate` | Notify dispatch gate status. |
| `/admin/notify-gate/release` | Releases the gate so queued notifications send. |

Subscribers are addressed by `:hash`, never by email address, so an admin URL
in a log or a browser history does not carry a subscriber's address with it.

`/v2/admin/*` is a legacy alias and redirects to `/admin/*`.

## Admin portal pages

HTML, not JSON — the operator UI. Same session gate.

`/admin` · `/admin/analytics` · `/admin/newsletter` · `/admin/mascot` ·
`/admin/mood-embed` · `/admin/oauth` · `/admin/svg` ·
`/admin/portal/broadcasts` · `/admin/portal/broadcasts/:id` ·
`/admin/portal/subscribers` · `/admin/portal/subscribers/:hash`

## Webhooks

Called by third parties, never by a browser.

### Ghost

```
POST /webhooks/ghost
```

Ghost calls this when a post is published; it enqueues the blog notification.
Authenticated by an HMAC-SHA256 signature over the raw body, verified in
constant time against `GHOST_WEBHOOK_SECRET`, with a shared-secret bearer as an
alternative. Rate limit: 30 requests / 60s.

A bad or missing signature is `401 {"error":"Unauthorized"}`. A well-formed
call for a post that should not notify returns `200` with
`{"status":"ignored","reason":"not_published"|"unlisted"}` rather than an
error — Ghost retries on failure, and a `4xx` for "correctly received, nothing
to do" would produce a retry loop.

`/ghost/webhook` and `/v2/ghost/webhook` are legacy aliases that redirect here.

### Telegram

```
POST /webhooks/telegram
```

The mood ingest entry point. Handled in middleware rather than as a page route,
so it does not appear in the route tree alongside the others. Authenticated by
Telegram's own secret-token header, compared against `TELEGRAM_WEBHOOK_SECRET`.

## Cron and dispatch

These run the notification pipeline on a schedule. They are gated by a shared
secret presented as a bearer credential, not by an admin session, because a
cron trigger has no user to authenticate as.

| Path | Method | Purpose | Rate limit |
| --- | --- | --- | --- |
| `/notify/dispatch` | `POST` | Sends a notification batch. | 20 / 60s |
| `/notify/schedule` | `GET`, `POST` | Runs scheduled digest delivery. | 40 / 60s |
| `/notify/retry` | `GET`, `POST` | Reprocesses failed deliveries. | 40 / 60s |

All three answer `401 {"error":"Unauthorized"}` without the secret, and a
plain-text `405 Method Not Allowed` for other methods.

## Email preview

```
GET /notify/preview?mode=daily&sample=rich&timezone=Australia/Melbourne
```

Renders every notification email template as HTML strings in one JSON response,
so a change to an email template can be reviewed without sending mail. It
covers the subscribe confirmation, welcome, mood, digest, cancel, change-email,
email-changed, and delete-record templates, plus the notify callback pages.
`Cache-Control: no-store, max-age=0`.

| Parameter | Values | Default |
| --- | --- | --- |
| `mode` | `daily`, `every_5h` | `daily` |
| `sample` | `rich`, `live` | `rich` |
| `timezone` | any valid IANA zone | `Australia/Melbourne` |

**This endpoint has no auth gate and no rate limit.** With `sample=rich` it
renders fixture content, which is harmless. With `sample=live` it reads the
real latest mood post and channel metadata — all of it already public via
[`/api/mood`](/docs/api/mood), so nothing is disclosed that is not already
published, but it does mean an unauthenticated caller can make the Worker do a
D1 read and render eight email templates per request. Treat it as a development
tool that happens to be reachable, not as a deliberate public endpoint.
