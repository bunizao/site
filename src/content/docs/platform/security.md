---
title: Security
description: Rate limits, Turnstile, signed URLs, the static media proxy guards, and response hardening.
group: Platform
order: 4
---

This page maps each security mechanism to what it protects and which Worker
runs it. There is no central security middleware: each endpoint applies its
own protections. Read it when you add a public route or need to know why a
request was rejected.

| Mechanism | Owner | Protects |
| --- | --- | --- |
| Rate limiting | Both Workers, separate implementations | Every public API route, and the static media proxy |
| Turnstile verification | `site-api` | Subscribe and manage-link requests, blog and mood comments, reactions, and owner messages |
| Signed URLs | `site-api` | Selected generated resources, such as the activity SVG |
| Static proxy allowlist | `site` | The `/static/*` media proxy |
| Response hardening | Per response type | Embeds and SVG documents, not the site shell |

## Rate limiting

The two Workers don't share a limiter. The difference matters when you read
the response headers.

| Property | `site` | `site-api` |
| --- | --- | --- |
| Implementation | [`src/lib/security/rate-limit.ts`](https://github.com/bunizao/site/blob/main/src/lib/security/rate-limit.ts), an in-memory bucket store | A Durable Object counter, the Workers Rate Limiting binding (analytics beacons), or a counting-only observability mode |
| Durability | Per isolate, resets with it | Strongly consistent in `durable` mode |
| Actually rejects? | Best effort | Only in `durable` and `native` modes. See [Rate limits](/docs/api/overview#rate-limits) |
| Used by | `/static/*` and Mood Markdown | Nearly every `/api/*` route |

The `site` limiter keys on `{prefix}:{clientIp}`. It starts a fresh window
when an expired bucket is next read. It caps the store at 10,000 keys and
evicts the oldest first, so a flood of unique IPs can't grow it without bound.

The client IP is `cf-connecting-ip`. Cloudflare sets it on every request and
overwrites it if a client sends its own. Without that header (local dev),
every request shares the `anonymous` bucket. Other forwarding headers are
ignored.

Both Workers answer with `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
`X-RateLimit-Reset`, and `Retry-After` on rejection.
[API Overview](/docs/api/overview#rate-limits) documents the header contract
and the split between enforced and advertised limits.

## Turnstile verification

`site-api` runs the check (`src/lib/security/turnstile.ts` there). The
verifier:

- reads the secret from build or runtime env
- posts to Cloudflare Turnstile, forwarding `remoteip` when available
- validates the challenge hostname against the current request host
- optionally validates `action`
- optionally checks `cdata` against the anonymous session id (comments and
  reactions)
- returns structured result codes instead of throwing

Five routes carry a check today. `POST /api/v2/comments` expects one of two
actions, depending on the comment's `surface`:

| Route | Expected action |
| --- | --- |
| `notify/subscribe` | `notify_subscribe` |
| `notify/manage/request` | `notify_manage` |
| `POST /api/v2/comments` on a blog post | `blog_comment_create` |
| `POST /api/v2/comments` with `surface: "mood"` | `mood_comment_create` |
| `POST /api/v2/reactions/toggle` | `blog_reaction` |
| `POST /api/v2/messages` | `owner_message_create` |

A reaction skips the check when the browser holds a `__Host-reader_pass`
cookie, which `site-api` issues after a verified token and which lasts one
hour.

The comment and reaction routes solve invisibly in managed mode, so in
practice a reader never sees a widget. A failed Turnstile check on a comment
gets a plain `400` or `503`. After it, two more checks can refuse in the
open, with nothing stored: `429`, and `403 email_required`. Every other check
answers `201`, with the comment
published or held (see [The risk stack](/docs/api/comments#the-risk-stack)).

For the notify routes, the four accepted token carriers and the `400` versus
`503` failure split are in [Notify API](/docs/api/notify#subscribe).

## Signed URLs

`site-api` signs with HMAC-SHA256. The signed payload is the public path
(`/api/...`) plus the search params sorted by key. Ingress strips the prefix,
and the verifier puts it back.

- `sig` is excluded from the payload.
- `exp` is required.
- Expired signatures are rejected.

Today signing protects the activity SVG endpoint, and only when
`ACTIVITY_PANEL_SIGNING_SECRET` is set.
[SVG Endpoints](/docs/api/svg#errors-and-validation) spells out that caveat.

## Static proxy restrictions

The `/static/*` media proxy lives in
[`src/pages/static/[...path].ts`](https://github.com/bunizao/site/blob/main/src/pages/static/%5B...path%5D.ts).
It applies these guards:

| Guard | Behavior |
| --- | --- |
| Host allowlist | Telegram family and its subdomains, plus exact matches for the `PUBLIC_HD_IMAGE_URL` host, the legacy `image.buxx.me` host, and the YouTube poster and avatar hosts. Every redirect hop is re-checked. |
| Loopback block | `localhost` and `127.0.0.1` are rejected, even when configured as the HD image host. |
| Redirect depth | At most three hops. |
| Content type | Only `image/*`, `video/*`, `audio/*`, `font/*`. Anything else is `415`. |
| Rate limit | The shared in-memory limiter above, 240 / 60s. |

The YouTube route (`/static/youtube/<11-character-id>/<quality>.jpg`) accepts
only `maxresdefault` and `hqdefault`, rejects query strings, and maps those
values to `i.ytimg.com` server-side. That host joins the redirect allowlist
only per request, for a validated poster path. The arbitrary-target proxy path
can't reach it.

## Response hardening

Hardening applies per response type. There is no site-wide policy.

| Response type | Hardening |
| --- | --- |
| Normal HTML pages | No site-wide CSP in [`Layout.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Layout.astro) |
| Embed responses | Stricter CSP and framing headers in [`embed-response.ts`](https://github.com/bunizao/site/blob/main/src/lib/embed-response.ts) |
| SVG API responses | `default-src 'none'` CSP, `nosniff`, `no-referrer`, set in `site-api` |
| Notify HTML result pages | `no-store`, `no-referrer`, and a locked-down CSP, so a token in the URL can't leak through `Referer` |
