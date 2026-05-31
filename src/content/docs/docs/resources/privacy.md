---
title: Privacy policy
description: How buxx.me handles your data — what's collected, where it's stored, and which third parties touch it.
---

This page mirrors the technical implementation of the privacy policy. The full policy text lives at [/privacy](/privacy) and is rendered from `src/content/pages/privacy.md`. This page documents what that policy covers and where each behavior lives in the code.

## Where the policy lives

- Route: `src/pages/privacy.astro` — thin shell that imports content and frontmatter from `src/content/pages/privacy.md`.
- Layout: `src/layouts/Page.astro` — document-style typography, single home link in the navbar, optional `updatedAt` line above the body.
- Content: `src/content/pages/privacy.md`.
- Schema: `src/content.config.ts` validates `title`, `description`, `updatedAt`.

Markdown-backed means policy edits don't require layout changes, route logic stays minimal, and metadata is versioned with the content itself.

## What the policy covers

### Hosting, analytics, performance

- Site pages are hosted on Vercel.
- `src/layouts/Layout.astro` mounts `@vercel/speed-insights/astro` and lazy-loads `@vercel/analytics`.

### Homepage listening

- Card: `src/features/home/ui/Listening.astro`.
- API: `src/pages/api/listening.ts`.
- Provider chain: `src/features/home/server/listening.ts` fetches the latest Last.fm track and enriches it with Apple Music search data (album, artwork, preview audio, Apple Music links).
- The card refreshes through this site's API rather than baking listening data into the prerendered HTML.

### Mood pages and public content

- `/mood` and `/mood/[id]` fetch Telegram-derived content.
- Public APIs: `/api/moods`, `/api/comments`.
- Parsing and shaping: `src/features/mood/server/telegram-source.ts`, `src/features/mood/shared/utils.ts`.

### Mood subscription flow

- Subscribe: `src/pages/api/notify/subscribe.ts`.
- Confirm: `src/pages/api/notify/confirm.ts`.
- Unsubscribe: `src/pages/api/notify/unsubscribe.ts`.
- Dispatch / schedule / retry: `src/pages/api/notify/dispatch.ts`, `schedule.ts`, `retry.ts`.
- Subscriber state in Cloudflare D1: `src/features/notify/server/d1.ts`.
- Email delivery via Resend: `src/features/notify/server/resend.ts`.
- Tokens: `src/features/notify/server/security.ts`.

### Cloudflare anti-abuse

- Turnstile verification: `src/lib/security/turnstile.ts`. Used by mood subscribe when `TURNSTILE_SECRET` is configured.
- Cloudflare D1 backs subscriber state.
- Cloudflare workers handle image ingest and the notify scheduler.

### Third-party content sources

- Private Ghost origin for writing metadata: `src/features/home/ui/Posts.astro`. The browser only gets writing links when `WRITING_PUBLIC_URL` is deliberately configured.
- GitHub for project data: `src/features/home/ui/Projects.astro`, `src/lib/github.ts`.
- Telegram-derived content: `src/features/mood/server/telegram-source.ts`.

## When to update the policy

When implementation changes affect personal data handling, edit `src/content/pages/privacy.md` directly. Typical triggers:

- Adding or removing analytics vendors.
- Adding or changing listening-data providers.
- Changing subscription storage or email delivery providers.
- Changing anti-abuse controls.
- Changing public content sources or media proxy behavior.
