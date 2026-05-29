---
title: Security
description: Rate limiting, Turnstile, signed URLs, and where response hardening starts and stops.
---

Security on buxx.me is endpoint-focused, not centralized in one middleware layer. Rate limiting is the common baseline; Turnstile, signed URLs, and CSP are layered in where the threat model demands.

## Rate limiting

`src/lib/security/rate-limit.ts` is an in-memory IP-based bucket store. Keys are `{prefix}:{clientIp}`; expired entries are cleaned on access; the store is size-capped.

IP resolution order:

1. Runtime IP from platform locals.
2. Trusted proxy headers.
3. `x-forwarded-for`.
4. Fallback client headers.
5. `anonymous`.

Responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` on rejection.

Operational caveat: state is process-local and not durable — Vercel's serverless instances each maintain their own buckets. This is acceptable for the current traffic shape; it would not be acceptable for a high-volume API.

## Turnstile

`src/lib/security/turnstile.ts` reads the secret from build env or runtime env, posts verification to Cloudflare Turnstile, forwards `remoteip` when available, validates the challenge hostname against the current request host, optionally validates `action`, and returns structured result codes instead of throwing.

Currently used by `src/pages/api/notify/subscribe.ts` with the expected action `notify_subscribe`. When `TURNSTILE_SECRET` is unset, the check is skipped — useful in local dev, dangerous in production.

## Signed URLs

`src/lib/security/signed-url.ts` signs `pathname + normalized search params` with HMAC-SHA256, excludes `sig` from the signing payload, requires a numeric `exp`, and rejects expired signatures.

Currently protects selected generated resources, like `/api/activity-panel.svg` when `ACTIVITY_PANEL_SIGNING_SECRET` is configured.

## Static proxy restrictions

`src/pages/static/[...path].ts` is the allowlisted proxy for Telegram-related static assets. It blocks localhost and private-network targets, limits redirect chains, and uses the shared rate limiter. Security-adjacent infrastructure even though it doesn't live under `src/lib/security/`.

## Response hardening

Hardening is selective.

- Public HTML pages do **not** apply a site-wide CSP via `src/layouts/Layout.astro`. The mood embed and SVG endpoints are stricter, but the main site is permissive enough that inline scripts and third-party analytics work.
- Embed responses use stricter headers in `src/lib/embed-response.ts` — frame-ancestors, sandbox-friendly defaults.
- SVG responses use CSP and hardening headers in `src/lib/svg-response.ts`.

This is the trade we've made: the public site stays compatible with broad analytics and embeds; isolated surfaces (embed, SVG) carry the strict policies that matter.

## Disclosure

Security issues should go through GitHub's private vulnerability reporting on [bunizao/site](https://github.com/bunizao/site/security/advisories). I'll respond as quickly as I can — this is a personal site, not a 24/7 SOC, but I treat reports seriously.
