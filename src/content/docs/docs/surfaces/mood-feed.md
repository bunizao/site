---
title: Mood feed
description: How the mood feed and detail pages work, from the API down to comments.
public: true
---

The mood feed is the public surface for posts pulled from the Telegram channel. It lives at three levels: a small home preview, the full feed at `/mood`, and detail pages at `/mood/[id]`.

## Routes

- `/mood` — the feed shell (`src/pages/mood.astro`). Dynamic, not prerendered.
- `/mood/[id]` — detail page (`src/pages/mood/[id].astro`). Dynamic, not prerendered. `?embed=1` redirects to `/mood/embed?id=...`.
- `/mood/embed` — the embeddable iframe (`src/pages/mood/embed.astro`).
- `/mood/rss.xml` — RSS feed.
- `/mood/subscribe` — redirects into `/mood?subscribe=1`.

## Feed API

`GET /api/moods` returns channel metadata plus feed-shaped posts. Pagination uses `?before=<id>` to load older posts, and `?probe=1&fresh=1` to check for new ones without serving them.

Each post is shaped for fast feed rendering: `previewText`, `previewHtml`, `image`, `imageFallback`, `mediaHtml`, `needsDetailPage`, `forwardedFrom`, `quote`, `reactions`, `commentsCount`. `needsDetailPage` flips to `true` when there's no inline preview and the post is long-text or media-heavy. Primary image URLs prefer `PUBLIC_HD_IMAGE_URL` (the Cloudflare image worker); fallbacks point at Telegram CDN through the site's static proxy.

## Rendering strategy

The route is mostly a shell. Client controllers handle DOM:

- `feed-controller.ts` — top-level orchestration.
- `feed-renderer.ts` — groups posts by day and appends.
- `feed-media-hydration.ts` — hydrates the channel hero and lazy media.
- `feed-update-watcher.ts` — polls `?probe=1&fresh=1` every 75 seconds and shows an update notice when newer posts exist. Auto-refreshes when the user is near the top.
- `feed-comments-popover.ts` — lazily fetches comment previews on hover.

Long text-only posts clamp and link to the detail page. Inline media stays expanded. Comment counts come from the API; hovering the badge fetches up to 3 comments via `GET /api/comments?postId=...`.

## Detail page

The detail route fetches a single `MoodContentDocument` from `site-api`, sets a `404` when missing, and renders a controlled fallback rather than crashing. The body is inserted with `set:html={renderedPostContent}` after sanitization. Forwarded metadata, reactions, and tags come from normalized mood data.

Back navigation prefers browser history; otherwise it falls back to `/mood`.

## Comments

`GET /api/comments?postId=...` validates the post id and an optional `before` cursor, then reads normalized comments from `site-api`. The client renders sanitized comments and paginates via `before=<commentId>`. Reply blocks become quote cards; loose text nodes get wrapped in paragraphs; avatar and image URLs are sanitized; duplicate comment ids are filtered client-side.

## Telegram ingest

The private `site-api` Worker ingests Telegram updates:

- channel posts from the Telegram webhook,
- edited posts, comments, and reaction count updates.

It normalizes media URLs to `https://api.buxx.me/v1/images/*` and returns `MoodFeedResponse`, `MoodContentDocument`, and `MoodCommentsPage` through `https://api.buxx.me/v1/`.

`src/features/mood/shared/utils.ts` strips Telegram HTML into preview text, keeps a limited preview HTML subset, extracts first image and fallback, detects media-heavy or long posts, derives quote previews, and groups posts by date.

## Embed, RSS, subscribe

Embed parameters: `id`, `count` (1–10), `theme`, `frame`, `density`, `font`, `origin`, `refresh`, `link`. The widget posts a `mood-embed-resize` message to the parent for dynamic iframe height; with `origin` set, it's locked to that parent.

RSS sorts by numeric post id descending, emits up to 50 items, absolutizes URLs inside content HTML, and emits full `content:encoded`. Subscribe is just a redirect; the actual subscribe / confirm / unsubscribe / dispatch / retry logic lives in the notify routes.

## Limits

- `/api/moods`: 180/min normally, 30/min with `fresh=1`, 90/min with `probe=1`.
- `/api/comments`: 90/min.
- Cursors must be numeric. Invalid cursors return `400`. Limit violations return `429` with rate-limit headers.

Rate limiting is in-memory per instance, not shared across deployments.
