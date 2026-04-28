# Privacy Policy

## Scope

This document covers the technical implementation of the privacy policy page and how it maps to live site features.

## Source Files

Main files:

- [`src/pages/privacy.astro`](../src/pages/privacy.astro)
- [`src/layouts/Page.astro`](../src/layouts/Page.astro)
- [`src/content/pages/privacy.md`](../src/content/pages/privacy.md)
- [`src/content.config.ts`](../src/content.config.ts)

## Rendering Path

Route file: [`src/pages/privacy.astro`](../src/pages/privacy.astro)

The route is intentionally thin:

- imports `Content` and `frontmatter` from `src/content/pages/privacy.md`
- passes `title`, `description`, `updatedAt`, and `url="/privacy"` into `Page.astro`
- renders the markdown body through `<Content />`

This means:

- the markdown file is the source of truth
- page chrome and typography come from `Page.astro`
- route logic stays separate from policy content

## Content Collection

Schema file: [`src/content.config.ts`](../src/content.config.ts)

The privacy page is part of the `pages` content collection.

The frontmatter used by the route is validated through the content collection schema, including:

- `title`
- `description`
- `updatedAt`

## Page Shell

Layout file: [`src/layouts/Page.astro`](../src/layouts/Page.astro)

Page-shell behavior:

- reuses the global `Layout.astro`
- collapses the shared navbar into a single home link
- renders `updatedAt` above the markdown body when present
- applies document-style spacing and typography instead of the home-page section layout

## What the Policy Covers in the Current Implementation

The content in [`src/content/pages/privacy.md`](../src/content/pages/privacy.md) matches active site features.

### Hosting, Analytics, and Performance

Covered implementation:

- site pages are hosted on Vercel
- [`src/layouts/Layout.astro`](../src/layouts/Layout.astro) mounts `@vercel/speed-insights/astro`
- [`src/layouts/Layout.astro`](../src/layouts/Layout.astro) also lazy-loads `@vercel/analytics`

### Homepage Listening

Covered implementation:

- [`src/features/home/ui/Listening.astro`](../src/features/home/ui/Listening.astro) renders the listening card on the homepage
- [`src/pages/api/listening.ts`](../src/pages/api/listening.ts) exposes the data used by the client
- [`src/features/home/server/listening.ts`](../src/features/home/server/listening.ts) fetches the latest Last.fm track and enriches it with Apple music metadata

Provider behavior the policy now needs to reflect:

- Last.fm is the primary source for recent listening activity
- Apple's music metadata search endpoints are used to enrich results with album data, artwork, preview audio, and Apple Music links
- the listening card refreshes through this site's API route rather than embedding static personal listening data into the prerendered home HTML

### Mood Pages and Public Content

Covered implementation:

- `/mood` and `/mood/[id]` fetch public Telegram-derived content
- [`src/pages/api/moods.ts`](../src/pages/api/moods.ts) and [`src/pages/api/comments.ts`](../src/pages/api/comments.ts) expose public data derived from Telegram scraping
- [`src/features/mood/server/telegram-source.ts`](../src/features/mood/server/telegram-source.ts) and [`src/features/mood/shared/utils.ts`](../src/features/mood/shared/utils.ts) shape public mood content and media references

### Mood Subscription Flow

Covered implementation:

- subscribe: [`src/pages/api/notify/subscribe.ts`](../src/pages/api/notify/subscribe.ts)
- confirm: [`src/pages/api/notify/confirm.ts`](../src/pages/api/notify/confirm.ts)
- unsubscribe: [`src/pages/api/notify/unsubscribe.ts`](../src/pages/api/notify/unsubscribe.ts)
- dispatch / schedule / retry:
  - [`src/pages/api/notify/dispatch.ts`](../src/pages/api/notify/dispatch.ts)
  - [`src/pages/api/notify/schedule.ts`](../src/pages/api/notify/schedule.ts)
  - [`src/pages/api/notify/retry.ts`](../src/pages/api/notify/retry.ts)

Supporting infrastructure:

- subscriber state and delivery records live in Cloudflare D1 through [`src/features/notify/server/d1.ts`](../src/features/notify/server/d1.ts)
- email delivery is handled through Resend in [`src/features/notify/server/resend.ts`](../src/features/notify/server/resend.ts)
- token creation and verification live in [`src/features/notify/server/security.ts`](../src/features/notify/server/security.ts)

### Cloudflare Anti-Abuse and Infrastructure

Covered implementation:

- Turnstile verification runs in [`src/lib/security/turnstile.ts`](../src/lib/security/turnstile.ts)
- the mood subscribe endpoint uses that verification when the secret is configured
- Cloudflare D1 is used by the notify service
- Cloudflare workers participate in image ingest and scheduling

### Third-Party Content Sources

Covered implementation:

- Ghost is used for writing links in [`src/features/home/ui/Posts.astro`](../src/features/home/ui/Posts.astro)
- GitHub is used for project data in [`src/features/home/ui/Projects.astro`](../src/features/home/ui/Projects.astro) and [`src/lib/github.ts`](../src/lib/github.ts)
- Telegram-derived content is parsed in [`src/features/mood/server/telegram-source.ts`](../src/features/mood/server/telegram-source.ts)

## Why the Policy Is Markdown-Backed

This implementation keeps the privacy page maintainable:

- policy text changes do not require layout edits
- route logic stays minimal
- metadata stays versioned with the content itself
- policy wording can evolve without changing page plumbing

## Update Rules

When implementation changes affect personal data handling, update [`src/content/pages/privacy.md`](../src/content/pages/privacy.md).

Typical triggers:

- adding or removing analytics vendors
- adding or changing listening-data providers
- changing subscription storage or email delivery providers
- changing anti-abuse controls
- changing public content sources or media proxy behavior
