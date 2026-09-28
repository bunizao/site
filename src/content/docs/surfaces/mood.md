---
title: Mood
description: "How the mood feed and mood detail pages are built, which API they read, and how comments load."
group: Surfaces
order: 2
---

Mood is the stream of short posts mirrored from Telegram. It has three levels:
`L0` is the preview on the home page, `L1` is the feed at `/mood`, and `L2` is
one post at `/mood/[id]`. This page covers `L1`, `L2`, and the embed, RSS and
subscribe routes. For `L0`, see [Home](/docs/surfaces/home). For the HTTP
contracts, see [Mood API](/docs/api/mood).

| Part | Section |
| --- | --- |
| Routes and files | [Routes](#routes-at-a-glance) |
| Archive and live readers | [Which API a page reads](#which-api-a-page-reads) |
| `/mood` feed | [`L1` feed](#l1-feed) |
| `/mood/[id]` post | [`L2` detail](#l2-detail) |
| Comment thread and feed preview | [Comments](#comments) |
| Webhook ingest and media URLs | [Machine ingress](#machine-ingress) |

## Routes at a glance

All of these routes render on request. None of them prerender.

| Route | File | Indexed | What it is |
| --- | --- | --- | --- |
| `/mood` | [`src/pages/mood.astro`](https://github.com/bunizao/site/blob/main/src/pages/mood.astro) | Yes | `L1`, the feed |
| `/mood/[id]` | [`src/pages/mood/[id].astro`](https://github.com/bunizao/site/blob/main/src/pages/mood/[id].astro) | `noindex, follow` | `L2`, one post |
| `/mood/[id]?embed=1` | — | — | Redirects to `/mood/embed?id=…&theme=…&link=false` |
| `/mood/embed` | [`src/pages/mood/embed.astro`](https://github.com/bunizao/site/blob/main/src/pages/mood/embed.astro) | — | The iframe widget, documented in [oEmbed](/docs/api/oembed) |
| `/mood/rss.xml` | [`src/pages/mood/rss.xml.ts`](https://github.com/bunizao/site/blob/main/src/pages/mood/rss.xml.ts) | — | RSS from the feed source |
| `/mood/subscribe` | [`src/pages/mood/subscribe.astro`](https://github.com/bunizao/site/blob/main/src/pages/mood/subscribe.astro) | — | Redirects to `/mood?subscribe=1` |

Detail pages are `noindex` so an unbounded archive of short posts can't crowd
editorial pages out of search results. The feed stays indexed.

## Which API a page reads

| Prefix | What it is | Use it for |
| --- | --- | --- |
| `/api/v2/mood*` | The D1 archive, and the default base reader for public pages | Feed and detail content |
| `/api/v1/mood*` | The live Telegram mirror | Comments, freshness probes, visible reactions and counts, and archive fallback |
| `?api-v2=true` | Deprecated migration scaffolding | Nothing. Keep it out of canonical docs, RSS links, oEmbed targets, and user-facing URLs |
| `api.buxx.me` | Machine ingress | Nothing public. The canonical public surface is `buxx.me` pages plus the compatibility JSON routes |

These settings pick the reader:

- `MOOD_READ_SOURCE=archive` is the default.
- `MOOD_READ_SOURCE=live` is the rollback switch.
- `?source=live|archive` overrides the source for one uncached request.

When an archive call fails, the server falls back to the bounded live reader.
In the browser, `/api/v2/mood` pagination switches to `/api/moods` once its
retries run out. Tag filters only work on the archive, because the live reader
can't filter by tag. Responses are shaped in
[`server/api-client.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/server/api-client.ts) and [`shared/utils.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/shared/utils.ts).

**Dev serves `live` and production serves `archive`.** If you profile on
`bun dev`, pass `?source=archive`, or you measure the fallback path.

## `L1` feed

The feed page is [`src/pages/mood.astro`](https://github.com/bunizao/site/blob/main/src/pages/mood.astro). It hides the home section navbar
and adds RSS, Telegram and Notify to the shared header actions. The page is
built from [`TimelineWheel`](https://github.com/bunizao/site/blob/main/src/features/mood/ui/TimelineWheel.astro), [`FeedShell`](https://github.com/bunizao/site/blob/main/src/features/mood/ui/FeedShell.astro), and [`NotifyPanel`](https://github.com/bunizao/site/blob/main/src/features/mood/ui/NotifyPanel.astro).

| Client module | Job |
| --- | --- |
| [`feed-controller.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/client/feed-controller.ts) | Runs the fetch loop and infinite scroll |
| [`feed-renderer.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/client/feed-renderer.ts) | Groups posts by day and appends them |
| [`feed-media-hydration.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/client/feed-media-hydration.ts) | Channel hero and deferred media |
| [`feed-update-watcher.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/client/feed-update-watcher.ts) | Freshness probe and the update notice |
| [`feed-comments-popover.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/client/feed-comments-popover.ts) | Lazy comment previews on badge hover |
| [`timeline-wheel.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/client/timeline-wheel.ts), [`notify-panel-controller.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/client/notify-panel-controller.ts) | The date wheel and the notify panel |

### Paging

The feed is one continuous list that loads in both directions. An anchor URL
opens it in the middle. From there:

- Older pages use `before=<oldestPostId>`.
- Newer pages use `after=<newestPostId>`.
- Both APIs return the adjacent window in descending display order.

If the archive fails with a transient error, the client retries before it drops
to the live reader.

### Rendering rules

These rules aren't obvious from the markup:

- Inline media stays expanded in the feed. Long text-only posts are clamped and
  link to the detail page.
- Visible archive posts load live comment and reaction counts from
  `GET /api/v2/moods/live-counts`. If a batch fails, the client waits 30
  seconds before it requests that batch again.
- Hovering a comments badge fetches `GET /api/comments?postId=…` and shows up to
  three comments, with a link to `/mood/{id}#comments`. The preview card uses
  the detail bubble's token names, one step down the same scale. See
  [Comments](#comments).
- The feed can run against E2E fixtures instead of the live source.

### Freshness

The page checks for new posts every 75 seconds:

| Source | Probe |
| --- | --- |
| Archive | `GET /api/v2/mood?probe=1` (CDN-cached for up to 15s) |
| Live | `GET /api/moods?probe=1&fresh=1` |

When a newer post exists, the page shows an update notice. If the reader is
near the top, the page can refresh on its own.

The refresh navigates to `/mood?refresh=<latestId>` instead of reloading. The
page cache never stores that variant, and the page treats it as a fresh read.
So the new post is there, and you don't get a minutes-old cached copy that shows
the notice again. Once the page renders, the watcher strips `refresh` from the
address bar. It also restores the scroll position from before the navigation,
because the replaced URL has no history entry or scroll offset of its own.

### The feed post shape

`site-api /api/moods` returns posts already shaped for the feed, instead of raw
Telegram documents. See [`server/feed-service.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/server/feed-service.ts).

| Field | Contains |
| --- | --- |
| `previewText`, `previewHtml` | Clamped text, plain and rendered |
| `mediaHtml` | An inline media preview, when one exists |
| `image`, `imageFallback`, `gallery` | The lead still image and its gallery. **`null` whenever `mediaHtml` is set** |
| `needsDetailPage` | `true` when there is no inline preview and the post is long, media-heavy, or has an over-size video |
| `forwardedFrom`, `quote` | Forward attribution, and a quote card whose link resolves to the parent mood pathname |
| `reactions`, `commentsCount` | Counts, refreshed live for archive posts |

Primary image URLs prefer `PUBLIC_HD_IMAGE_URL`. Fallback URLs point at
Telegram media through the site proxy.

## `L2` detail

The detail page is [`src/pages/mood/[id].astro`](https://github.com/bunizao/site/blob/main/src/pages/mood/[id].astro). It fetches one post from
the archive reader, with the live reader as fallback. If the post is missing,
the page sets `404` and renders a not-found or unavailable state instead of
crashing. The page renders [`DetailArticle.astro`](https://github.com/bunizao/site/blob/main/src/features/mood/ui/DetailArticle.astro), which mounts
[`CommentsSection.astro`](https://github.com/bunizao/site/blob/main/src/features/mood/ui/CommentsSection.astro).

- `DetailArticle` inserts gallery-aware HTML with `set:html={renderedPostContent}`.
- Forward metadata, reactions and tags render from parsed Telegram data.
- A Telegram *Leave a comment* link appears when channel config exists.
- Back navigation uses browser history when it can, and falls back to `/mood`.

## Comments

`L2` mounts the comment thread. The feed shows a small preview of it on hover.

### Load the thread

1. [`CommentsSection.astro`](https://github.com/bunizao/site/blob/main/src/features/mood/ui/CommentsSection.astro) renders one skeleton row per known comment (at
   most three). When the post's count is `0`, it renders the collapsed empty
   thread instead. An inline script starts `GET /api/comments?postId=…` while
   the page is still parsing (`src/lib/api-prefetch.ts`). A post linked to the
   discussion group also starts the first page of
   `GET /api/v2/comments?surface=mood&post=…`, which carries the owner's marks.
2. [`detail-comments-controller.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/client/detail-comments-controller.ts) uses those in-flight responses for
   the first page. Later pages and live refreshes fetch normally.
3. `site-api` validates `postId` and optional `before`, then reads the live
   Telegram mirror through the canonical v1 path.
4. The client renders sanitized comments and pages with `before=<commentId>`.

The live refresh re-reads the newest page:

| When | What happens |
| --- | --- |
| Tab is visible and the thread is within 400px of the viewport | Refreshes every 45 seconds |
| No scroll, click or keystroke for 10 minutes | Slows to every 3 minutes (it doesn't stop) |
| The reader comes back and the last read is older than one interval | Refreshes at once |

"Comes back" means scrolling the thread into view, returning to the tab, or any
input after an idle stretch.

[`shared/comments.ts`](https://github.com/bunizao/site/blob/main/src/features/mood/shared/comments.ts) normalizes each comment:

- Reply blocks become quote cards.
- Loose text nodes are wrapped in paragraphs.
- Avatar and image URLs are sanitized before insertion.
- Duplicate comment ids are filtered out on the client.

### Owner marks

The owner's marks work as they do on the blog. They go through the same
[`thread-marks.ts`](https://github.com/bunizao/site/blob/main/src/features/comments/thread-marks.ts)
and use the same copy:

| Mark | What the reader sees |
| --- | --- |
| Pinned comment | The pinned web comment leads the first page under a **Pinned** badge (`pinFirst` in `shared/comments.ts`) |
| Locked thread | The root says **Replies closed** where Reply was, and nothing under it offers Reply |
| `readonly` post | A closed line of the same height replaces the compose capsule |
| `off` post | The section hides as soon as the v2 page lands, without waiting for the scrape. Nothing sits below the section on an `L2` page, so hiding it shifts nothing |

Messages written in the Telegram group never get a mark. See
[Mood surface: the Telegram bridge](/docs/api/comments#mood-surface-the-telegram-bridge).

### Origin marker

The thread mixes two origins: messages from the Telegram discussion group and
comments typed on the detail page. Otherwise they render the same, so each row
header shows one glyph for where the comment was written:

| Origin | Glyph | Accessible name |
| --- | --- | --- |
| Telegram discussion group | Paper plane | *Written on Telegram* |
| The detail page | Globe | *Written on Web* |

The row root has the same value in `data-origin`. The glyph has no text label
next to it. It names itself to assistive tech with `role="img"` and an
`aria-label` and `title` set to the accessible name. The glyph is monochrome:
the mood surface has no accent colour, so the shape shows the difference instead
of a brand blue.

### Type and spacing

The bubble uses two type sizes and no others:

| Token | Size | Used for |
| --- | --- | --- |
| `--comment-body` | 15px | Author name and message |
| `--comment-meta` | 13px | Timestamp, Reply, and a quoted parent |

Weight and colour set the hierarchy. GitHub, Telegram Web and Discourse do the
same, and so does `.blog-comments` on this site. Quote styles live in
[`feed-rich-text.css`](https://github.com/bunizao/site/blob/main/src/features/mood/styles/feed-rich-text.css) instead of `globals.css`. That file is unlayered, and an
`@layer` rule loses to it whatever its specificity.

Spacing inside the bubble uses one ratio, `--comment-lead: 1.618`. The spacing
scale is 6 → 10 → 16px, and each step is 1.618× the last:

| Step | Used for |
| --- | --- |
| 6px | Between parts of one thought (name to message, message to its footer) |
| 10px | Bubble padding, vertical |
| 16px | Bubble padding, horizontal |

So parts of one comment always sit closer to each other than to the bubble's
edge. The values are the same at every width. The compose form is one more row
in the thread and uses the same steps.

### Feed hover preview

The `L1` hover preview declares the same token names one step down the scale,
so the two stay in sync:

- 13/11 type
- `6px 10px` padding
- A 4px inner gap

The preview also caps media at 96px. A comment can be only a sticker, and at its
natural 256px a sticker filled the card and pushed every other comment out of
view.

## Machine ingress

Machine ingress (`api.buxx.me`) handles:

- `/api/v1/mood*` as the live Telegram mirror, and `/api/v2/mood*` as the D1
  archive.
- Ingesting Telegram webhook updates into D1 for backup, search, AI, and
  debugging.
- Normalizing media URLs into `https://buxx.me/api/v2/images/*`.
