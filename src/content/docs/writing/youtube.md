---
title: YouTube
description: The [!youtube] directive — a click-to-load facade that keeps YouTube's scripts off the page until a reader asks for the video.
group: Writing
order: 5
---

`[!youtube]` embeds a video as a facade: the poster frame, the title, the channel,
and a play button. YouTube's iframe and its scripts are not loaded until someone
clicks.

```md demo
[!youtube id=dQw4w9WgXcQ]
[!youtube id=dQw4w9WgXcQ start=42]
```

| Attribute | Required | Default | Value |
| --- | --- | --- | --- |
| `id` | yes | — | 11-character YouTube video ID |
| `start` | no | `0` | Start offset in whole seconds |

The ID is the `v=` parameter of a watch URL, or the last path segment of a
`youtu.be` link. It must be exactly 11 characters — anything else is a warning
and the marker is dropped.

`start` is capped. A value above the maximum is rejected rather than clamped,
because a five-digit offset is nearly always a typo for a timestamp.

## Why a facade

A YouTube iframe is roughly a megabyte of script and several third-party
connections, all of it loaded whether or not the reader watches. The facade costs
one image. It also means an embedded video does not set cookies on a page nobody
asked to be tracked on.

The title and channel name are resolved at build time and baked into the markup,
so the facade reads as a real video card rather than a grey rectangle. If the
lookup fails the card still renders, labelled generically.

## Other output targets

```html
<p><a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s">Watch this video on YouTube</a></p>
```

The `start` offset is carried into the link, so a feed reader lands at the same
timestamp.

## Notes

- Pasted YouTube iframes and Ghost embed cards are rewritten into the same
  facade, so the directive is a convenience rather than the only route.
- Implementation: `src/features/posts/server/directives/youtube.ts`,
  `src/lib/embed/youtube.ts`, `src/features/posts/server/youtube.ts`.
