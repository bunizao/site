# Mood

## Scope

This document covers:

- `L1` mood feed at `/mood`
- `L2` mood detail at `/mood/[id]`
- the feed and comments APIs they depend on
- shared Telegram parsing and mood shaping
- embed, RSS, and subscribe entrypoints

## Route Map

Main files:

- [`src/pages/mood.astro`](../src/pages/mood.astro)
- [`src/pages/mood/[id].astro`](../src/pages/mood/[id].astro)
- [`src/pages/mood/embed.astro`](../src/pages/mood/embed.astro)
- [`src/pages/mood/rss.xml.ts`](../src/pages/mood/rss.xml.ts)
- [`src/pages/mood/subscribe.astro`](../src/pages/mood/subscribe.astro)

Routing rules:

- `/mood` is dynamic and not prerendered.
- `/mood/[id]` is dynamic and not prerendered.
- `/mood/[id]?embed=1` redirects to `/mood/embed?id=...&theme=...&link=false`.
- `/mood/rss.xml` emits RSS from the feed source.
- `/mood/subscribe` redirects to `/mood?subscribe=1`.

## `L1` Feed

Entry file: [`src/pages/mood.astro`](../src/pages/mood.astro)

Page-level responsibilities:

- hides the normal home section navbar
- injects header actions into the shared layout:
  - RSS
  - Telegram
  - Notify
- composes [`src/features/mood/ui/TimelineWheel.astro`](../src/features/mood/ui/TimelineWheel.astro), [`src/features/mood/ui/FeedShell.astro`](../src/features/mood/ui/FeedShell.astro), and [`src/features/mood/ui/NotifyPanel.astro`](../src/features/mood/ui/NotifyPanel.astro)
- bootstraps [`src/features/mood/client/feed-controller.ts`](../src/features/mood/client/feed-controller.ts), [`src/features/mood/client/notify-panel-controller.ts`](../src/features/mood/client/notify-panel-controller.ts), and [`src/features/mood/client/timeline-wheel.ts`](../src/features/mood/client/timeline-wheel.ts)

Feed data flow:

1. The browser requests `GET /api/moods`.
2. The response contains channel metadata plus feed-shaped posts.
3. [`src/features/mood/client/feed-media-hydration.ts`](../src/features/mood/client/feed-media-hydration.ts) hydrates the channel hero and deferred media behavior.
4. [`src/features/mood/client/feed-renderer.ts`](../src/features/mood/client/feed-renderer.ts) groups posts by date and appends them into the feed.
5. Infinite loading continues with `before=<oldestPostId>`.

Freshness behavior:

- the page polls `GET /api/moods?probe=1&fresh=1` every 75 seconds
- if a newer post exists, the page shows an update notice
- refresh can happen automatically when the user is near the top

## Feed API

Implementation file: [`src/pages/api/moods.ts`](../src/pages/api/moods.ts)

Upstream dependency:

- [`src/features/mood/server/telegram-source.ts`](../src/features/mood/server/telegram-source.ts) via `getChannelInfo({ type: 'list', before, after, skipCache })`

Returned post shape is optimized for feed rendering:

- `previewText`
- `previewHtml`
- `image`
- `imageFallback`
- `mediaHtml`
- `needsDetailPage`
- `forwardedFrom`
- `quote`
- `reactions`
- `commentsCount`

Important shaping rules:

- `needsDetailPage` becomes `true` when there is no inline media preview and the post is either long text or media-heavy.
- primary image URLs prefer `PUBLIC_HD_IMAGE_URL`.
- fallback image URLs point at Telegram media through the site proxy when needed.
- the feed can run in E2E fixture mode instead of live Telegram scraping.

## Feed Rendering Strategy

Most feed items are still created client-side, but the route no longer owns the DOM logic directly.

Current client entrypoints:

- [`src/features/mood/client/feed-controller.ts`](../src/features/mood/client/feed-controller.ts)
- [`src/features/mood/client/feed-renderer.ts`](../src/features/mood/client/feed-renderer.ts)
- [`src/features/mood/client/feed-media-hydration.ts`](../src/features/mood/client/feed-media-hydration.ts)
- [`src/features/mood/client/feed-update-watcher.ts`](../src/features/mood/client/feed-update-watcher.ts)
- [`src/features/mood/client/feed-comments-popover.ts`](../src/features/mood/client/feed-comments-popover.ts)

Rendering behavior:

- posts are grouped by day
- inline media stays expanded in the feed
- long text-only posts clamp and link to detail
- comments badges are rendered from API counts
- hovering the comments badge lazily fetches comment previews

Comment preview path:

- fetches `GET /api/comments?postId=...`
- shows up to 3 comments in a popover
- links to `/mood/{id}#comments`

## `L2` Detail

Entry file: [`src/pages/mood/[id].astro`](../src/pages/mood/[id].astro)

Server-side responsibilities:

- fetches one post by id through `getChannelInfo({ id })`
- sets `404` when the post is missing
- renders a controlled not-found or unavailable state instead of crashing
- composes [`src/features/mood/ui/DetailArticle.astro`](../src/features/mood/ui/DetailArticle.astro), which in turn mounts [`src/features/mood/ui/CommentsSection.astro`](../src/features/mood/ui/CommentsSection.astro)

Rendering behavior:

- [`src/features/mood/ui/DetailArticle.astro`](../src/features/mood/ui/DetailArticle.astro) inserts gallery-aware HTML with `set:html={renderedPostContent}`
- forwarded metadata, reactions, and tags are rendered from parsed Telegram data
- the page can show a Telegram `Leave a comment` CTA when channel config exists

Back navigation:

- prefers browser history when available
- otherwise falls back to `/mood`

## Comments

Implementation files:

- [`src/pages/api/comments.ts`](../src/pages/api/comments.ts)
- [`src/features/mood/client/detail-comments-controller.ts`](../src/features/mood/client/detail-comments-controller.ts)
- [`src/features/mood/server/telegram-source.ts`](../src/features/mood/server/telegram-source.ts)
- [`src/features/mood/shared/comments.ts`](../src/features/mood/shared/comments.ts)

Data flow:

1. [`src/features/mood/ui/CommentsSection.astro`](../src/features/mood/ui/CommentsSection.astro) renders a skeleton comments section.
2. [`src/features/mood/client/detail-comments-controller.ts`](../src/features/mood/client/detail-comments-controller.ts) fetches `GET /api/comments?postId=...`.
3. API validates `postId` and optional `before`.
4. API calls `getPostComments`.
5. `getPostComments` scrapes Telegram discussion embeds.
6. Client renders sanitized comments and paginates with `before=<commentId>`.

Comment normalization:

- reply blocks become quote cards
- loose text nodes are wrapped into paragraphs
- avatar and image URLs are sanitized before insertion
- duplicate comment ids are filtered client-side

## Telegram Parsing and Mood Shaping

Core files:

- [`src/features/mood/server/telegram-source.ts`](../src/features/mood/server/telegram-source.ts)
- [`src/features/mood/shared/utils.ts`](../src/features/mood/shared/utils.ts)

`src/features/mood/server/telegram-source.ts` responsibilities:

- scrape list pages from `https://{host}/s/{channel}`
- scrape detail pages from `https://{host}/{channel}/{id}?embed=1&mode=tme`
- normalize media URLs through `/static/`
- upgrade preferred mood images to worker-hosted HD URLs
- parse:
  - forwarded metadata
  - reactions
  - quotes and replies
  - link previews
  - video/audio/sticker blocks
  - custom emoji images
  - comments count

`src/features/mood/shared/utils.ts` responsibilities:

- strip Telegram HTML into preview text
- keep a limited preview HTML subset
- extract first image and fallback image
- detect media-heavy or long posts
- derive quote preview data
- group posts by date

## Embed, RSS, and Subscribe

Embed file: [`src/pages/mood/embed.astro`](../src/pages/mood/embed.astro)

Supported embed query parameters:

- `id`
- `count`
- `theme`
- `frame`
- `density`
- `font`
- `origin`
- `refresh`
- `link`

RSS file: [`src/pages/mood/rss.xml.ts`](../src/pages/mood/rss.xml.ts)

RSS behavior:

- fetches the mood list
- sorts by numeric post id descending
- emits up to 50 items
- absolutizes URLs inside content HTML
- emits full `content:encoded`

Subscribe entry:

- `/mood/subscribe` only redirects into the feed UI
- actual subscribe, confirm, unsubscribe, schedule, retry, and dispatch logic lives in the notify routes

## Security and Limits

Relevant file: [`src/lib/security/rate-limit.ts`](../src/lib/security/rate-limit.ts)

Current limits:

- `/api/moods`: 180/min normally
- `/api/moods?fresh=1`: 30/min
- `/api/moods?probe=1`: 90/min
- `/api/comments`: 90/min

Validation rules:

- `before`, `after`, `postId`, and comment cursors must be numeric
- invalid cursors return `400`
- limit violations return `429` with rate-limit headers

Important constraint:

- rate limiting is in-memory per instance, not shared across deployments

## Edge Cases

- missing detail pages still render a controlled fallback UI
- feed rendering deduplicates post ids
- comment pagination deduplicates comment ids and stops when Telegram stops giving a usable cursor
- E2E fixtures can replace live Telegram calls for feed, detail, and comments
- animated Telegram emoji enhance progressively and fall back safely when loading fails
