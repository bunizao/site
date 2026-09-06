---
title: Mood
description: "The three-level mood surface: home preview, feed wheel, and detail page."
group: Surfaces
order: 2
---

The mood surface is three levels deep — a preview on the home page, the feed at
`/mood`, and one post at `/mood/[id]` — plus the embed, RSS, and subscribe
entrypoints hanging off it. This page covers `L1` and `L2`; `L0` lives in
[Home](/docs/surfaces/home). For the HTTP contracts themselves, see
[Mood API](/docs/api/mood).

## Routes at a glance

Every route here is dynamic — none of them prerender.

| Route | File | Indexed | What it is |
| --- | --- | --- | --- |
| `/mood` | [`src/pages/mood.astro`](https://github.com/bunizao/site/blob/main/src/pages/mood.astro) | Yes | `L1`, the feed |
| `/mood/[id]` | [`src/pages/mood/[id].astro`](https://github.com/bunizao/site/blob/main/src/pages/mood/[id].astro) | `noindex, follow` | `L2`, one post |
| `/mood/[id]?embed=1` | — | — | Redirects to `/mood/embed?id=…&theme=…&link=false` |
| `/mood/embed` | [`src/pages/mood/embed.astro`](https://github.com/bunizao/site/blob/main/src/pages/mood/embed.astro) | — | The iframe widget, documented in [oEmbed](/docs/api/oembed) |
| `/mood/rss.xml` | [`src/pages/mood/rss.xml.ts`](https://github.com/bunizao/site/blob/main/src/pages/mood/rss.xml.ts) | — | RSS from the feed source |
| `/mood/subscribe` | [`src/pages/mood/subscribe.astro`](https://github.com/bunizao/site/blob/main/src/pages/mood/subscribe.astro) | — | Redirects to `/mood?subscribe=1` |

The detail pages are `noindex` on purpose: the feed stays discoverable without
letting an unbounded archive of short posts crowd editorial pages out of search
results.

## Which API a page reads

| Prefix | What it is | Read it for |
| --- | --- | --- |
| `/api/v2/mood*` | The D1 archive, and the default base reader for public pages | Feed and detail content |
| `/api/v1/mood*` | The live Telegram mirror | Comments, freshness probes, visible reactions and counts, and archive fallback |
| `?api-v2=true` | Deprecated migration scaffolding | Nothing. Keep it out of canonical docs, RSS links, oEmbed targets, and user-facing URLs |
| `api.buxx.me` | Machine ingress | Not the canonical public surface — that stays `buxx.me` pages plus the compatibility JSON routes |

`MOOD_READ_SOURCE=archive` is the default. A failed archive call falls back to
the bounded live reader on the server, and the browser degrades `/api/v2/mood`
pagination to `/api/moods` once its retries are exhausted. Tag filters stay
archive-only because the live reader cannot filter by tag.
`MOOD_READ_SOURCE=live` is the rollback switch, and `?source=live|archive`
overrides one uncached request. Shaping lives in
[`server/api-client.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/server/api-client.ts) and [`shared/utils.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/shared/utils.ts).

**Dev serves `live` and production serves `archive`**, so a profiling run on
`bun dev` measures the fallback path unless you pass `?source=archive`.

## `L1` feed

[`src/pages/mood.astro`](https://github.com/bunizao/site/blob/main/src/pages/mood.astro) hides the home section navbar, injects RSS, Telegram, and Notify into the
shared header actions, and composes [`TimelineWheel`](https://github.com/bunizao/site/blob/main/src/features/mood/ui/TimelineWheel.astro), [`FeedShell`](https://github.com/bunizao/site/blob/main/src/features/mood/ui/FeedShell.astro), and [`NotifyPanel`](https://github.com/bunizao/site/blob/main/src/features/mood/ui/NotifyPanel.astro).

| Client module | Job |
| --- | --- |
| [`feed-controller.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/client/feed-controller.ts) | Owns the fetch loop and infinite scroll |
| [`feed-renderer.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/client/feed-renderer.ts) | Groups posts by day and appends them |
| [`feed-media-hydration.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/client/feed-media-hydration.ts) | Channel hero and deferred media |
| [`feed-update-watcher.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/client/feed-update-watcher.ts) | Freshness probe and the update notice |
| [`feed-comments-popover.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/client/feed-comments-popover.ts) | Lazy comment previews on badge hover |
| [`timeline-wheel.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/client/timeline-wheel.ts), [`notify-panel-controller.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/client/notify-panel-controller.ts) | The date wheel and the notify panel |

Paging is one continuous feed read from both ends: an anchor URL is a midpoint,
older pages use `before=<oldestPostId>`, newer pages use `after=<newestPostId>`,
and both APIs return the adjacent window in descending display order. A
transient archive failure is retried before the client drops to the live reader.

Rendering rules that are not obvious from the markup:

- Inline media stays expanded in the feed; long text-only posts clamp and link
  to detail.
- Visible archive posts hydrate live comment and reaction counts through
  `GET /api/v2/moods/live-counts`.
- Hovering a comments badge fetches `GET /api/comments?postId=…` and shows up to
  three comments, linking through to `/mood/{id}#comments`.
- The feed can run against E2E fixtures instead of the live source.

Freshness: the page polls `GET /api/moods?probe=1&fresh=1` every 75 seconds,
shows an update notice when a newer post exists, and can refresh on its own when
the reader is near the top.

### The feed post shape

`site-api /api/moods` returns posts already shaped for feed rendering rather
than raw Telegram documents ([`server/feed-service.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/server/feed-service.ts)):

| Field | Carries |
| --- | --- |
| `previewText`, `previewHtml` | Clamped text, plain and rendered |
| `mediaHtml` | An inline media preview, when one exists |
| `image`, `imageFallback`, `gallery` | The lead still image and its gallery — **`null` whenever `mediaHtml` is set** |
| `needsDetailPage` | `true` when there is no inline preview and the post is long, media-heavy, or carries an over-size video |
| `forwardedFrom`, `quote` | Forward attribution, and a quote card whose link resolves to the parent mood pathname |
| `reactions`, `commentsCount` | Counts, refreshed live for archive posts |

Primary image URLs prefer `PUBLIC_HD_IMAGE_URL`; fallbacks point at Telegram
media through the site proxy.

## `L2` detail

[`src/pages/mood/[id].astro`](https://github.com/bunizao/site/blob/main/src/pages/mood/[id].astro) fetches one post through the archive reader with a live-reader fallback,
sets `404` when it is missing, and renders a controlled not-found or unavailable
state rather than crashing. It composes [`DetailArticle.astro`](https://github.com/bunizao/site/blob/main/src/features/mood/ui/DetailArticle.astro), which mounts
[`CommentsSection.astro`](https://github.com/bunizao/site/blob/main/src/features/mood/ui/CommentsSection.astro).

- `DetailArticle` inserts gallery-aware HTML with `set:html={renderedPostContent}`.
- Forwarded metadata, reactions, and tags render from parsed Telegram data.
- A Telegram *Leave a comment* CTA appears when channel config exists.
- Back navigation prefers browser history, falling back to `/mood`.

### Comments

1. [`CommentsSection.astro`](https://github.com/bunizao/site/blob/main/src/features/mood/ui/CommentsSection.astro) renders a skeleton.
2. [`detail-comments-controller.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/client/detail-comments-controller.ts) fetches `GET /api/comments?postId=…`.
3. `site-api` validates `postId` and optional `before`, then reads the live
   Telegram mirror through the canonical v1 path.
4. The client renders sanitized comments and pages with `before=<commentId>`.

Normalization in [`shared/comments.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/shared/comments.ts): reply blocks become quote cards, loose text
nodes are wrapped into paragraphs, avatar and image URLs are sanitized before
insertion, and duplicate comment ids are filtered client-side.

Every row carries where it was written. The thread mixes two origins — messages
from the Telegram discussion group and comments typed on this page — and they
render identically otherwise, so each header holds a chip reading *Telegram* or
*Web*, and the row root carries the same value as `data-origin`. The chip is
monochrome by design: the mood surface has no accent colour, so the glyph
carries the distinction.

## What machine ingress owns

- `/api/v1/mood*` as the live Telegram mirror, `/api/v2/mood*` as the D1 archive.
- Ingesting Telegram webhook updates into D1 for backup, search, AI, and debugging.
- Normalizing media URLs into `https://buxx.me/api/v2/images/*`.
