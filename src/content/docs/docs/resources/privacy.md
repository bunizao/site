---
title: Privacy policy
description: How buxx.me handles your data — what's collected, where it's stored, and which third parties touch it.
public: true
---

This page mirrors the technical implementation of the privacy policy. The full policy text lives at [/privacy](/privacy) and is rendered from `src/content/pages/privacy.md`. This page documents what that policy covers and where each behavior lives in the code.

## Where the policy lives

- Route: `src/pages/privacy.astro` — thin shell that imports content and frontmatter from `src/content/pages/privacy.md`.
- Layout: `src/layouts/Page.astro` — document-style typography, single home link in the navbar, optional `updatedAt` line above the body.
- Content: `src/content/pages/privacy.md`.
- Schema: `src/content.config.ts` validates `title`, `description`, `updatedAt`.

Markdown-backed means policy edits don't require layout changes, route logic stays minimal, and metadata is versioned with the content itself.

## What the policy covers

### Hosting, observability, performance

- Site pages and API routes run on the Cloudflare Worker target `site`.
- `wrangler.jsonc` binds the public Worker to `buxx.me` and `www.buxx.me`.
- Cloudflare Worker observability and request logs cover operational monitoring.
- `src/layouts/Layout.astro` does not mount a third-party analytics script.

### Homepage listening

- Card: `src/features/home/ui/Listening.astro`.
- API: `src/pages/api/listening.ts`.
- Provider chain: `src/features/home/server/listening.ts` fetches the latest Last.fm track and enriches it with Apple Music search data (album, artwork, preview audio, Apple Music links).
- The card refreshes through this site's API rather than baking listening data into the prerendered HTML.

### Mood pages and public content

- `/mood` and `/mood/[id]` fetch Telegram-derived content from the private `site-api` Worker.
- Public APIs: `/api/moods`, `/api/comments`.
- Parsing and shaping: private `site-api` mood ingest, `src/features/mood/server/api-client.ts`, `src/features/mood/shared/utils.ts`.

### Mood subscription flow

- Subscribe: `site-api /v1/notify/subscribe`.
- Confirm: `site-api /v1/notify/confirm`.
- Unsubscribe: `site-api /v1/notify/unsubscribe`.
- Dispatch / schedule / retry: `site-api /v1/notify/*`.
- Subscriber state in Cloudflare D1: private `NOTIFY_DB`.
- Email delivery via Resend: private `site-api`.
- Tokens: private `site-api`.

### Cloudflare anti-abuse

- Turnstile verification: `src/lib/security/turnstile.ts`. Used by mood subscribe when `TURNSTILE_SECRET` is configured.
- Cloudflare D1 backs subscriber state.
- Cloudflare Worker bindings provide D1, R2, queue, and scheduled-event infrastructure in `site-api`.

### Third-party content sources

- Ghost CMS for writing links: `src/features/home/ui/Posts.astro`.
- GitHub for project data: `src/features/home/ui/Projects.astro`, `src/lib/github.ts`.
- Telegram-derived content: private `site-api` mood ingest.

## When to update the policy

When implementation changes affect personal data handling, edit `src/content/pages/privacy.md` directly. Typical triggers:

- Adding or removing analytics vendors.
- Adding or changing listening-data providers.
- Changing subscription storage or email delivery providers.
- Changing anti-abuse controls.
- Changing public content sources or media proxy behavior.
