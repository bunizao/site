# Shared Layout and Security

## Scope

This document covers shared cross-page behavior:

- layout shell
- navbar and header actions
- page-template adaptation
- footer links
- shared security modules

## Base Layout

Main file: [`src/layouts/Layout.astro`](../src/layouts/Layout.astro)

Responsibilities:

- owns the HTML shell for most routes
- sets canonical, OG, and Twitter metadata
- exposes optional RSS and oEmbed discovery links
- mounts the shared section navbar by default
- mounts the shared theme dropdown
- mounts Vercel Speed Insights
- lazy-loads Vercel Analytics

Theme behavior:

- runs before paint with an inline script
- reads `localStorage.theme`
- falls back to `prefers-color-scheme`
- applies `html.dark`
- stores the current selection in `html[data-theme-setting]`

## Navbar Model

Implementation lives in [`src/layouts/Layout.astro`](../src/layouts/Layout.astro).

Important design choice:

- the navbar is section-anchor based, not route-aware

Behavior:

- default links target:
  - `#projects-section`
  - `#writing-section`
  - `#moods-section`
- nav labels are rewritten into per-character spans
- scrolling updates the active section
- smooth scrolling is handled in client code
- `IntersectionObserver` switches the nav between horizontal and vertical modes based on hero visibility
- the active indicator is animated only in vertical mode

Header actions:

- `Layout.astro` owns the theme dropdown
- individual pages can inject extra buttons into `[data-header-actions]`
- `Layout.astro` exposes a small registration surface for GSAP header-button animation

## Page Template Adaptation

Main file: [`src/layouts/Page.astro`](../src/layouts/Page.astro)

Purpose:

- reuse the same base layout for document-style pages such as `/privacy`

How it adapts the shared nav:

- adds `body.page-template-active`
- keeps only the first nav item
- renames that item to `buxx.me`
- rewires it to `/`
- removes the active indicator
- removes extra links and separators

This keeps the global chrome but changes the navigation contract from section scrolling to home navigation.

## Shared Footer

File: [`src/components/Footer.astro`](../src/components/Footer.astro)

Behavior:

- static footer
- exposes `/privacy`
- exposes the GitHub source repository

The privacy page is therefore linked from:

- the global footer
- the mood notify panel

## Rate Limiting

File: [`src/lib/security/rate-limit.ts`](../src/lib/security/rate-limit.ts)

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

File: [`src/lib/security/turnstile.ts`](../src/lib/security/turnstile.ts)

Behavior:

- reads secret from build env or runtime env
- posts verification requests to Cloudflare Turnstile
- forwards `remoteip` when available
- validates challenge hostname against the current request host
- optionally validates `action`
- returns structured result codes instead of throwing

Current primary usage:

- [`src/pages/api/notify/subscribe.ts`](../src/pages/api/notify/subscribe.ts) with expected action `notify_subscribe`

## Signed URLs

File: [`src/lib/security/signed-url.ts`](../src/lib/security/signed-url.ts)

Behavior:

- signs `pathname + normalized search params` with HMAC-SHA256
- excludes `sig` from the signing payload
- requires numeric `exp`
- rejects expired signatures

Current usage:

- protects selected generated resources such as the activity SVG endpoint

## Security-Adjacent Shared Endpoints

Static proxy:

- [`src/pages/static/[...path].ts`](../src/pages/static/[...path].ts)

Role:

- allowlisted proxy for Telegram-related static assets
- blocks localhost and private-network misuse
- limits redirect chains
- uses the shared rate limiter

Response hardening is selective:

- normal HTML pages do not apply a site-wide CSP in `Layout.astro`
- embed responses use stricter headers in [`src/lib/embed-response.ts`](../src/lib/embed-response.ts)
- SVG responses use CSP and hardening headers in [`src/lib/svg-response.ts`](../src/lib/svg-response.ts)

## Implementation Summary

- shared UI concerns are centralized in `Layout.astro`
- content pages reuse the same shell and mutate the nav through `Page.astro`
- security is endpoint-focused, not centralized in one middleware layer
- rate limiting is the common baseline across public APIs
