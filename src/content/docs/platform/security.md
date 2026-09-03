---
title: Security
description: Headers, rate limits, Turnstile, embed isolation, and the static asset guard.
group: Platform
order: 4
---

Security here is endpoint-focused rather than centralized in one middleware
layer. This page is the map of which mechanism protects what, and which Worker
owns it.

| Mechanism | Owner | Protects |
| --- | --- | --- |
| Rate limiting | Both Workers, separate implementations | Every public API route, and the static media proxy |
| Turnstile verification | `site-api` | Subscription intake |
| Signed URLs | `site-api` | Selected generated resources, such as the activity SVG |
| Static proxy allowlist | `site` | The `/static/*` media proxy |
| Response hardening | Per response type | Embeds and SVG documents, not the site shell |

## Rate limiting

The two Workers do not share a limiter, and the difference matters when you
are reading headers.

| Property | `site` | `site-api` |
| --- | --- | --- |
| Implementation | [`src/lib/security/rate-limit.ts`](https://github.com/bunizao/site/blob/main/src/lib/security/rate-limit.ts) — an in-memory bucket store | A Durable Object counter, or a counting-only observability mode |
| Durability | Per isolate, resets with it | Strongly consistent in `durable` mode |
| Really rejects? | Best effort | Only in `durable` mode — see [Rate limits](/docs/api/overview#rate-limits) |
| Used by | `/static/*` | Nearly every `/api/*` route |

The `site` implementation keys on `{prefix}:{clientIp}`, cleans expired entries
on access, and caps the store at 10,000 keys so a flood of unique IPs cannot
grow it without bound. Client IP is resolved in this order:

1. Runtime IP from platform locals
2. Trusted proxy headers
3. `x-forwarded-for`
4. Fallback client headers
5. `anonymous`

Both Workers answer with `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
`X-RateLimit-Reset`, and `Retry-After` on rejection. The header contract and
the enforced-versus-advertised split are documented once, in
[API Overview](/docs/api/overview#rate-limits).

## Turnstile verification

Owned by `site-api` (`src/lib/security/turnstile.ts` there). It reads the
secret from build or runtime env, posts to Cloudflare Turnstile, forwards
`remoteip` when available, validates the challenge hostname against the current
request host, optionally validates `action`, and returns structured result
codes rather than throwing.

Four routes carry a check today:

| Route | Expected action |
| --- | --- |
| `notify/subscribe` | `notify_subscribe` |
| `notify/manage/request` | — |
| `POST /api/v2/comments` | `blog_comment_create` |
| `POST /api/v2/reactions/toggle` | `blog_reaction` |

The two comment routes solve invisibly in managed mode, so in practice a
reader never sees a widget; a failure there is the one step of the comment
risk stack that answers plainly rather than silently (see
[Post a comment](/docs/api/comments#post-a-comment)). The four accepted token
carriers and the `400` versus `503` failure split are in
[Notify API](/docs/api/notify#subscribe).

## Signed URLs

Owned by `site-api`. Signs `pathname` plus normalized search params with
HMAC-SHA256, excludes `sig` from the signing payload, requires a numeric `exp`,
and rejects expired signatures. It currently protects the activity SVG endpoint
— and only when `ACTIVITY_PANEL_SIGNING_SECRET` is set, which is the caveat
spelled out in [SVG Endpoints](/docs/api/svg#errors-and-validation).

## Static proxy restrictions

File: [`src/pages/static/[...path].ts`](https://github.com/bunizao/site/blob/main/src/pages/static/%5B...path%5D.ts)

| Guard | Behavior |
| --- | --- |
| Host allowlist | Telegram family plus the YouTube poster and avatar hosts. Every redirect hop is re-checked. |
| Private network block | Localhost and private-range targets are rejected. |
| Redirect depth | At most three hops. |
| Content type | Only `image/*`, `video/*`, `audio/*`, `font/*`; anything else is `415`. |
| Rate limit | The shared in-memory limiter above, 240 / 60s. |
| Signing | `STATIC_PROXY_MODE` decides whether an unsigned or badly signed URL is served or `403`ed — see [Request signing](/docs/api/site-routes#request-signing). |

The YouTube route (`/static/youtube/<11-character-id>/<quality>.jpg`) accepts
only `maxresdefault` and `hqdefault`, rejects query strings, and maps those
values to `i.ytimg.com` server-side. That host is added only to the per-request
redirect allowlist for a validated poster path; it is not reachable through the
arbitrary-target proxy path.

## Response hardening boundaries

Hardening is selective, not site-wide.

| Response type | Hardening |
| --- | --- |
| Normal HTML pages | No site-wide CSP in [`Layout.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Layout.astro) |
| Embed responses | Stricter CSP and framing headers in [`embed-response.ts`](https://github.com/bunizao/site/blob/main/src/lib/embed-response.ts) |
| SVG API responses | `default-src 'none'` CSP, `nosniff`, `no-referrer` — set in `site-api` |
| Notify HTML result pages | `no-store`, `no-referrer`, locked-down CSP so a token in the URL cannot leak through `Referer` |
