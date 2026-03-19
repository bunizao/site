# Security

## Scope

This document covers shared security and security-adjacent behavior:

- rate limiting
- Turnstile verification
- signed URLs
- static proxy restrictions
- response hardening boundaries

## Rate Limiting

File: `[src/lib/security/rate-limit.ts](../src/lib/security/rate-limit.ts)`

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

File: `[src/lib/security/turnstile.ts](../src/lib/security/turnstile.ts)`

Behavior:

- reads secret from build env or runtime env
- posts verification requests to Cloudflare Turnstile
- forwards `remoteip` when available
- validates challenge hostname against the current request host
- optionally validates `action`
- returns structured result codes instead of throwing

Current primary usage:

- `[src/pages/api/notify/subscribe.ts](../src/pages/api/notify/subscribe.ts)` with expected action `notify_subscribe`

## Signed URLs

File: `[src/lib/security/signed-url.ts](../src/lib/security/signed-url.ts)`

Behavior:

- signs `pathname + normalized search params` with HMAC-SHA256
- excludes `sig` from the signing payload
- requires numeric `exp`
- rejects expired signatures

Current usage:

- protects selected generated resources such as the activity SVG endpoint

## Static Proxy Restrictions

File: `[src/pages/static/[...path].ts](../src/pages/static/[...path].ts)`

Role:

- allowlisted proxy for Telegram-related static assets
- blocks localhost and private-network misuse
- limits redirect chains
- uses the shared rate limiter

This is security-adjacent infrastructure, even though it is not under `src/lib/security`.

## Response Hardening Boundaries

Hardening is selective rather than centralized.

Current boundaries:

- normal HTML pages do not apply a site-wide CSP in `[src/layouts/Layout.astro](../src/layouts/Layout.astro)`
- embed responses use stricter headers in `[src/lib/embed-response.ts](../src/lib/embed-response.ts)`
- SVG responses use CSP and hardening headers in `[src/lib/svg-response.ts](../src/lib/svg-response.ts)`

## Implementation Summary

- security is endpoint-focused, not centralized in one middleware layer
- rate limiting is the common baseline across public APIs
- Turnstile protects subscription intake
- signed URLs protect selected generated resources
- response hardening exists for specific response types, not for the full site shell

