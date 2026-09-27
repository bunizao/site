---
title: YouTube
description: "The [!youtube] directive: a click-to-load facade that keeps YouTube scripts off the page until someone plays."
group: Writing
order: 5
---

`[!youtube]` embeds a video as a facade: a static card with the poster frame, the
title, the channel, and a play button. YouTube's iframe and scripts load only
when someone clicks.

```md demo
[!youtube id=dQw4w9WgXcQ]
[!youtube id=dQw4w9WgXcQ start=42]
```

| Attribute | Required | Default | Value |
| --- | --- | --- | --- |
| `id` | yes | — | 11-character YouTube video ID |
| `start` | no | `0` | Start offset in whole seconds, from `0` to `604800` (7 days) |

The ID is the `v=` parameter of a watch URL, or the last path segment of a
`youtu.be` link. It must be exactly 11 characters: letters, digits, `_` or `-`.

`start` takes digits only, so `1m30s`, `-5` and `1.5` are rejected. A value
above `604800` is rejected too. The directive never clamps it to the maximum.

A bad `id`, a bad `start`, or any attribute other than those two fails the
whole marker. The build logs `invalid-directive-attributes` and drops the
marker, so no video renders.

## Why a facade

A YouTube iframe is roughly a megabyte of script plus several third-party
connections, and it all loads whether or not the reader watches. The facade
costs one image. It also keeps an embedded video from setting cookies on a page
where nobody asked to be tracked.

The build resolves the title and channel name and bakes them into the markup,
so the facade looks like a real video card. If the lookup fails, the card still
renders with a generic label.

## Other output targets

Outside `web` and `preview`, the facade becomes a plain link:

```html
<p><a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s">Watch this video on YouTube</a></p>
```

The link keeps the `start` offset, so a feed reader lands at the same timestamp.

## Notes

- Pasted YouTube iframes and Ghost embed cards are rewritten into the same
  facade. The directive is a convenience, and you can paste the video instead.
- A pasted video reads its offset from the URL's `start` or `t` parameter. It
  accepts seconds or the `1h2m3s` form and clamps anything above 7 days to
  `604800`. A value it can't parse starts the video at `0`.
- Implementation: `src/features/posts/server/directives/youtube.ts`,
  `src/lib/embed/youtube.ts`, `src/features/posts/server/youtube.ts`.
