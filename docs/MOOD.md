# Mood

## Scope

This document covers:

- `L1` mood feed at `/mood`
- `L2` mood detail at `/mood/[id]`
- the feed and comments APIs they depend on
- shared Telegram parsing and mood shaping
- embed, RSS, and subscribe entrypoints

## Mood API Taxonomy

- **v2** (`/api/v2/mood*`) is the D1 archive and the default base reader for public mood pages.
- **v1** (`/api/v1/mood*`) is the live Telegram mirror for comments, reactions, freshness checks, and archive fallback.
- `?api-v2=true` is deprecated migration scaffolding. Do not add it to canonical docs, RSS links, oEmbed targets, or user-facing URLs.
- `api.buxx.me` is machine ingress, not the canonical public API surface. The public contract remains the `buxx.me` pages and compatibility JSON routes.

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
- `/mood` is indexable; `/mood/[id]` emits `noindex, follow` so the feed remains
  discoverable without letting the unbounded detail archive crowd out editorial
  pages in search results.
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

1. The browser requests `GET /api/v2/mood` when the page is archive-backed.
2. The response contains channel metadata plus feed-shaped posts.
3. [`src/features/mood/client/feed-media-hydration.ts`](../src/features/mood/client/feed-media-hydration.ts) hydrates the channel hero and deferred media behavior.
4. [`src/features/mood/client/feed-renderer.ts`](../src/features/mood/client/feed-renderer.ts) groups posts by date and appends them into the feed.
5. Infinite loading continues in either direction against the active source.

Anchor URLs represent a midpoint in the same continuous feed. Older pages use
`before=<oldestPostId>` and newer pages use `after=<newestPostId>`; both APIs
return the adjacent window in descending display order. Transient archive
failures are retried before the client falls back to the live reader.

Freshness behavior:

- the page polls `GET /api/moods?probe=1&fresh=1` every 75 seconds
- if a newer post exists, the page shows an update notice
- refresh can happen automatically when the user is near the top

## Feed API

Implementation owner: `site-api /api/moods`

Upstream dependency:

- the D1 archive through `GET /api/v2/mood`, with the live reader as fallback

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
- archived replies preserve a quote edge whose link resolves to the parent mood pathname.
- the feed can run in E2E fixture mode instead of the live source.

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
- visible archive posts hydrate live comments/reactions through `GET /api/v2/moods/live-counts`
- hovering the comments badge lazily fetches comment previews

Comment preview path:

- fetches `GET /api/comments?postId=...`
- shows up to 3 comments in a popover
- links to `/mood/{id}#comments`

## `L2` Detail

Entry file: [`src/pages/mood/[id].astro`](../src/pages/mood/[id].astro)

Server-side responsibilities:

- fetches one post by id through the archive reader, with a live-reader fallback
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

- `site-api /api/comments`
- [`src/features/mood/client/detail-comments-controller.ts`](../src/features/mood/client/detail-comments-controller.ts)
- [`src/features/mood/shared/comments.ts`](../src/features/mood/shared/comments.ts)

Data flow:

1. [`src/features/mood/ui/CommentsSection.astro`](../src/features/mood/ui/CommentsSection.astro) renders a skeleton comments section.
2. [`src/features/mood/client/detail-comments-controller.ts`](../src/features/mood/client/detail-comments-controller.ts) fetches `GET /api/comments?postId=...`.
3. API validates `postId` and optional `before`.
4. API reads the live Telegram mirror through the canonical v1 mood path.
5. Client renders sanitized comments and paginates with `before=<commentId>`.

Comment normalization:

- reply blocks become quote cards
- loose text nodes are wrapped into paragraphs
- avatar and image URLs are sanitized before insertion
- duplicate comment ids are filtered client-side

## Mood Shaping

### Read source — archive base, live hydration

Public feed and detail pages read D1 archive content by default through `MOOD_READ_SOURCE=archive`.
The site falls back to the bounded live reader if an archive call fails; comments, freshness probes,
and visible reactions/counts stay live. Set `MOOD_READ_SOURCE=live` for rollback, or use
`?source=live|archive` for an uncached request-level override.

Core files:

- [`src/features/mood/server/api-client.ts`](../src/features/mood/server/api-client.ts)
- [`src/features/mood/shared/utils.ts`](../src/features/mood/shared/utils.ts)

Machine-ingress responsibilities:

- expose `/api/v1/mood*` as the live Telegram mirror
- expose `/api/v2/mood*` as the D1 archive / structured read
- ingest Telegram webhook updates into D1 for backup, search, AI, and debugging
- normalize media URLs into `https://buxx.me/api/v2/images/*`
- keep `api.buxx.me` as machine ingress rather than the canonical public API surface

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

## Operations Health

Ordinary archive ingestion preserves a known positive `reply_to` when a lower-fidelity update omits the relationship. The authenticated mood health response exposes `replyIntegrity` with the edge count, unresolved same-channel targets, a capped child-ID sample, the number of live posts never reconciled, and the oldest verification timestamp.

The scheduled ops suite checks configured reply canaries against strict archive detail reads using
`fresh=1&fallback=0`. `MOOD_REPLY_CANARIES` is a capped comma-separated list of positive integer
`child:parent` mappings; each child must expose a quote whose URL pathname is `/mood/<parent>`.
The production workflow currently uses `1609:1600`.

## Edge Cases

- missing detail pages still render a controlled fallback UI
- feed rendering deduplicates post ids
- comment pagination deduplicates comment ids and stops when Telegram stops giving a usable cursor
- E2E fixtures can replace live Telegram calls for feed, detail, and comments
- animated Telegram emoji enhance progressively and fall back safely when loading fails
