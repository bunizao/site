---
title: Mood embeds
description: The [!mood] directive and the [mood:id] shorthand — quoting a post from the short-form feed inside an essay.
group: Writing
order: 4
---

`[!mood]` embeds a post from the [mood feed](/mood) inside a blog post. It
renders the same card the feed uses, in an iframe that resizes itself to its
content.

```md demo
[!mood id=482]
[!mood id=482 theme=dark density=compact]
```

| Attribute | Required | Default | Value |
| --- | --- | --- | --- |
| `id` | yes | — | Mood post ID, a positive integer |
| `theme` | no | `auto` | `auto`, `light`, `dark` |
| `density` | no | `regular` | `regular`, `compact` |

`auto` follows the reader's theme rather than the theme of the page it was
written on. `compact` trims the padding and media height — useful when the embed
is a supporting aside rather than the point of the paragraph.

The ID is the number in the mood permalink: `/mood/482`.

## Shorthand

The same thing, written inline:

```md demo
[mood:482]
[mood:482 theme=dark density=compact]
```

A shortcode is rewritten wherever it sits, mid-sentence included, and produces
the same block-level embed the directive does. The shortcode is the shorter
spelling, not a second layout.

Ghost bookmark cards and bare `<iframe>` elements pointing at `/mood/embed` are
rewritten into the same component, so pasting an embed URL also works.

## Other output targets

Outside `web` and `preview` the embed becomes a link to the post:

```html
<p><a href="https://buxx.me/mood/482">View mood post 482</a></p>
```

Absolute, because an RSS reader has no page to resolve a relative path against.

## Notes

- Invalid attribute values are warnings, not failures: `theme=blue` logs
  `invalid-directive-attributes` and the marker is dropped.
- The embed endpoint and its `postMessage` resize contract are documented under
  [oEmbed & Embeds](/docs/api/oembed) — the same machinery serves external sites.
- Implementation: `src/features/posts/server/directives/mood.ts` and
  `src/features/posts/server/mood-embed.ts`.
