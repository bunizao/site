---
title: Security
description: Headers, rate limits, Turnstile, embed isolation, and the static asset guard.
group: Platform
order: 4
---

## Scope

This document covers shared security and security-adjacent behavior:

- rate limiting
- Turnstile verification
- signed URLs
- static proxy restrictions
- response hardening boundaries

## Rate Limiting

File: [`src/lib/security/rate-limit.ts`](https://github.com/bunizao/site/blob/main/src/lib/security/rate-limit.ts)

Implementation:

- in-memory IP-based bucket store
- key format is `{prefix}:{clientIp}`
- expired entries are cleaned on access
- store size is capped

IP resolution order:

- runtime IP from platform locals
- trusted proxy headers
- `x-forwarded-for`
- fallback client headers
- `anonymous`

Response headers:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `Retry-After` on rejection

Operational constraint:

- state is process-local and not durable

## Turnstile Verification

File: [`src/lib/security/turnstile.ts`](https://github.com/bunizao/site/blob/main/src/lib/security/turnstile.ts)

Behavior:

- reads secret from build env or runtime env
- posts verification requests to Cloudflare Turnstile
- forwards `remoteip` when available
- validates challenge hostname against the current request host
- optionally validates `action`
- returns structured result codes instead of throwing

Current primary usage:

- `site-api /v2/notify/subscribe` with expected action `notify_subscribe`

## Signed URLs

Owner: `site-api`

Behavior:

- signs `pathname + normalized search params` with HMAC-SHA256
- excludes `sig` from the signing payload
- requires numeric `exp`
- rejects expired signatures

Current usage:

- protects selected generated resources such as the activity SVG endpoint

## Static Proxy Restrictions

File: `[src/pages/static/[...path].ts](https://github.com/bunizao/site/blob/main/src/pages/static/[...path].ts)`

Role:

- allowlisted proxy for Telegram-related static assets
- bounded YouTube poster route at `/static/youtube/<11-character-id>/<quality>.jpg`
- blocks localhost and private-network misuse
- limits redirect chains
- uses the shared rate limiter

The YouTube route accepts only `maxresdefault` and `hqdefault`, rejects query strings, and maps those values to `i.ytimg.com` server-side. That host is added only to the per-request redirect allowlist for a validated YouTube poster path; it is not available through the legacy arbitrary-target proxy path.

This is security-adjacent infrastructure, even though it is not under `src/lib/security`.

## Response Hardening Boundaries

Hardening is selective rather than centralized.

Current boundaries:

- normal HTML pages do not apply a site-wide CSP in [`src/layouts/Layout.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Layout.astro)
- embed responses use stricter headers in [`src/lib/embed-response.ts`](https://github.com/bunizao/site/blob/main/src/lib/embed-response.ts)
- SVG API responses use CSP and hardening headers in `site-api`

## Implementation Summary

- security is endpoint-focused, not centralized in one middleware layer
- rate limiting is the common baseline across public APIs
- Turnstile protects subscription intake
- signed URLs protect selected generated resources
- response hardening exists for specific response types, not for the full site shell
