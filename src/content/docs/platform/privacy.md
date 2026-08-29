---
title: Privacy policy
description: How the published privacy page maps onto what the site actually collects.
group: Platform
order: 7
---

## Scope

This document covers the technical implementation of the privacy policy page and how it maps to live site features.

## Source Files

Main files:

- [`src/pages/privacy.astro`](https://github.com/bunizao/site/blob/main/src/pages/privacy.astro)
- [`src/layouts/Page.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Page.astro)
- [`src/content/pages/privacy.md`](https://github.com/bunizao/site/blob/main/src/content/pages/privacy.md)
- [`src/content.config.ts`](https://github.com/bunizao/site/blob/main/src/content.config.ts)

## Rendering Path

Route file: [`src/pages/privacy.astro`](https://github.com/bunizao/site/blob/main/src/pages/privacy.astro)

The route is intentionally thin:

- imports `Content` and `frontmatter` from `src/content/pages/privacy.md`
- passes `title`, `description`, `updatedAt`, and `url="/privacy"` into `Page.astro`
- renders the markdown body through `<Content />`

This means:

- the markdown file is the source of truth
- page chrome and typography come from `Page.astro`
- route logic stays separate from policy content

## Content Collection

Schema file: [`src/content.config.ts`](https://github.com/bunizao/site/blob/main/src/content.config.ts)

The privacy page is part of the `pages` content collection.

The frontmatter used by the route is validated through the content collection schema, including:

- `title`
- `description`
- `updatedAt`

## Page Shell

Layout file: [`src/layouts/Page.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Page.astro)

Page-shell behavior:

- reuses the global `Layout.astro`
- collapses the shared navbar into a single home link
- renders `updatedAt` above the markdown body when present
- applies document-style spacing and typography instead of the home-page section layout

## What the Policy Covers in the Current Implementation

The content in [`src/content/pages/privacy.md`](https://github.com/bunizao/site/blob/main/src/content/pages/privacy.md) matches active site features, except where a subsection below says otherwise.

### Hosting, Observability, and Performance

Covered implementation:

- site pages and API routes run on the Cloudflare Worker target `site`
- [`wrangler.jsonc`](https://github.com/bunizao/site/blob/main/wrangler.jsonc) binds the Worker to `buxx.me`, `www.buxx.me`, and `image.buxx.me`
- Cloudflare Worker observability and request logs cover operational monitoring
- [`src/layouts/Layout.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Layout.astro) does not mount a third-party analytics script

Edge connection diagnostics:

- [`src/features/home/ui/Footer.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Footer.astro) renders the edge indicator and its hover popover
- `site-api /api/edge` reads Cloudflare `request.cf` (colo, protocol, TLS, TCP RTT, approximate location, network) and returns it with `Cache-Control: no-store`
- values are per-request and reflected only to the requesting visitor; nothing is stored

### Homepage Listening

Covered implementation:

- [`src/features/home/ui/Listening.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Listening.astro) renders the listening card on the homepage
- `site-api /api/listening` exposes the data used by the client
- [`src/features/home/server/listening.ts`](https://github.com/bunizao/site/blob/main/src/features/home/server/listening.ts) fetches the latest Last.fm track and enriches it with Apple music metadata

Provider behavior the policy now needs to reflect:

- Last.fm is the primary source for recent listening activity
- Apple's music metadata search endpoints are used to enrich results with album data, artwork, preview audio, and Apple Music links
- the listening card refreshes through this site's API route rather than embedding static personal listening data into the prerendered home HTML

### Listening Playback Analytics

Covered implementation:

- [`src/lib/listening/analytics.ts`](https://github.com/bunizao/site/blob/main/src/lib/listening/analytics.ts) creates one cumulative first-party record per playback and sends checkpoints to `site-api /api/v2/analytics/listening`
- [`src/lib/listening/controller.ts`](https://github.com/bunizao/site/blob/main/src/lib/listening/controller.ts) instruments shared listening cards on the homepage, mood, and component surfaces
- [`src/features/posts/client/prose.ts`](https://github.com/bunizao/site/blob/main/src/features/posts/client/prose.ts) instruments Apple Music cards embedded in blog prose
- the tracker distinguishes play requests from successful starts and records progress, pause, seek, and completion events
- cumulative heard time is measured from active playback intervals, while media position and duration are retained separately
- playback events reuse the visitor and session identifiers already created by first-party blog reading analytics
- `site-api` enriches the event with request-derived IP, Cloudflare location, referrer, language, browser, operating system, device, and user-agent metadata and stores one upserted row per playback in `listening_analytics_events`

### YouTube Embeds

Covered implementation:

- [`src/lib/embed/youtube.ts`](https://github.com/bunizao/site/blob/main/src/lib/embed/youtube.ts) renders a first-party facade whose poster and channel avatar use bounded `/static/youtube/<id>/...` routes
- [`src/lib/embed/youtube-controller.ts`](https://github.com/bunizao/site/blob/main/src/lib/embed/youtube-controller.ts) creates the `youtube-nocookie.com` iframe only after the reader presses play
- the controller stores only a session-scoped `yes` or `no` reachability verdict; country data is not used
- the static proxy fetches YouTube poster and channel-avatar bytes server-side, so the reader's browser does not contact YouTube before playback

### Mood Pages and Public Content

Covered implementation:

- `/mood` and `/mood/[id]` fetch public Telegram-derived content through the live v1 mood mirror
- `site-api /api/moods` and `site-api /api/comments` expose public data used by the mood pages
- [`src/features/mood/server/api-client.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/server/api-client.ts) and [`src/features/mood/shared/utils.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/shared/utils.ts) shape public mood content and media references

### Mood Subscription Flow

Covered implementation:

- subscribe: `site-api /v2/notify/subscribe`
- confirm: `site-api /v2/notify/confirm`
- unsubscribe: `site-api /v2/notify/unsubscribe`
- preferences: `site-api /v2/notify/manage`
- address change: `site-api /v2/notify/manage/email` requests it, `site-api /v2/notify/change-email` applies it after the new address confirms
- dispatch / schedule / retry: `site-api /v2/notify/*`

Supporting infrastructure:

- subscriber state and delivery records live in the private API `NOTIFY_DB`
- email delivery is handled through Resend in `site-api`
- token creation and verification live in `site-api`

### Blog Comments and Reactions

Covered implementation:

- reader-facing surfaces live in this repo: the thread and compose box under
  [`src/features/comments/`](https://github.com/bunizao/site/tree/main/src/features/comments)
  and the confirm page at
  [`src/pages/reader/confirm.astro`](https://github.com/bunizao/site/blob/main/src/pages/reader/confirm.astro)
- the endpoints behind them are `site-api`'s and are specified in
  [the comments API reference](/docs/api/comments): `/v2/comments`,
  `/v2/comments/:id`, `/v2/comments/dwell-token`, `/v2/reactions`,
  `/v2/reactions/toggle`, `/v2/reader/me`, `/v2/reader/verify`,
  `/v2/reader/resend`, `/v2/reader/avatar/:key`, and `/oauth/reader/:provider`
- a post can carry the `#no-comments` internal tag, which renders the thread
  closed and sends no request at all

Supporting infrastructure:

- comment rows, reactions, and reader records live in the private API's D1
- avatars are cached in R2 and served from `sha256(normalized email)`, so the
  plaintext address never reaches a response body or the public page
- confirmation email for a first unverified comment goes through Resend in
  `site-api`
- Turnstile guards both the compose box and the reaction control
- rate limits are keyed on the anonymous session, the IP, and a server-side
  fingerprint
- submitted text is screened by an external language-model provider before it
  appears

`site-api` does not serve these routes yet. This section documents the
contract the published policy is written against; confirm it against the
shipped implementation when the endpoints land.

### Cloudflare Anti-Abuse and Infrastructure

Covered implementation:

- Turnstile verification runs in [`src/lib/security/turnstile.ts`](https://github.com/bunizao/site/blob/main/src/lib/security/turnstile.ts)
- the private mood subscribe endpoint uses that verification when the secret is configured
- Cloudflare D1, R2, queue, and scheduled-event infrastructure for notify live in `site-api`

### Third-Party Content Sources

Covered implementation:

- Ghost is used for writing links in [`src/features/home/ui/Posts.astro`](https://github.com/bunizao/site/blob/main/src/features/home/ui/Posts.astro)
- GitHub is used for the contribution graph through `site-api /api/github/contributions`
- Telegram-derived content is read live for user-facing mood pages; the private API also ingests Telegram updates into D1 as a structured archive
- YouTube provides optional video playback only after a reader activates an embed; poster and channel-avatar requests stay behind the bounded static proxy

## Why the Policy Is Markdown-Backed

This implementation keeps the privacy page maintainable:

- policy text changes do not require layout edits
- route logic stays minimal
- metadata stays versioned with the content itself
- policy wording can evolve without changing page plumbing

## Update Rules

When implementation changes affect personal data handling, update [`src/content/pages/privacy.md`](https://github.com/bunizao/site/blob/main/src/content/pages/privacy.md).

Typical triggers:

- adding or removing analytics vendors
- adding or changing listening-data providers
- changing subscription storage or email delivery providers
- changing anti-abuse controls
- changing what a comment, reaction, or reader record stores
- changing the moderation provider or what it receives
- changing public content sources or media proxy behavior
- changing what edge connection diagnostics `/api/edge` exposes
