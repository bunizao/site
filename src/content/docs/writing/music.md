---
title: Listening card
description: The [!music] directive — an Apple Music track rendered as a playable vinyl card, and what it falls back to everywhere else.
group: Writing
order: 3
---

`[!music]` drops an Apple Music track into a post as a listening card: a record
sleeve with the artwork on a spinning disc, a tonearm that swings in on play, the
title, artist, year, a scrubber, and a live equalizer while it is streaming.

```md demo
[!music id=1440857781]
```

| Attribute | Required | Value |
| --- | --- | --- |
| `id` | yes | Apple Music song ID — a positive integer |

That is the whole surface. Everything else on the card — title, artist, year,
artwork, preview audio — is looked up at build time from the ID.

## Finding the ID

Open the song on Apple Music and take the `i=` query parameter from the URL:

```
https://music.apple.com/us/album/rhinestone-eyes/1440857766?i=1440857781
                                                              ^^^^^^^^^^
```

That is the *song* ID, not the album ID. Passing an album ID gives you a card
with nothing on it.

## Playback

The card plays two ways, decided in the browser rather than at build time.

With an Apple Music subscription and MusicKit authorized, it streams the full
track and the source pill reads **Full track**. Without one, it plays the 30-second
preview Apple exposes publicly. If neither is available the play button renders
disabled — the card is still a link to the song.

Only one card plays at a time. Starting a second one stops the first, including
the now-playing widget on the home page, which shares the same player.

An accent colour is sampled off the artwork in the browser and tints the card, so
the panel picks up the sleeve rather than sitting grey in the middle of the post.

## Embeds pasted from Ghost

You do not have to use the directive. Paste an Apple Music embed into a Ghost
bookmark or HTML card and the enrichment pass rewrites the `<iframe>` into the
same listening card. The directive exists for when you would rather write one
line than fight the editor.

## Other output targets

The card is a `web` and `preview` construct. Everywhere else — RSS, Markdown,
Open Graph, excerpts — it degrades to a link, with the track title resolved when
the lookup succeeds:

```html
<p><a href="https://music.apple.com/us/song/1440857781?i=1440857781">Listen to Rhinestone Eyes on Apple Music</a></p>
```

The same fallback is used on the web when Apple's metadata lookup fails at build
time, so a card never renders empty.

## Notes

- The player chrome is marked `data-pagefind-ignore` — timestamps and button
  labels do not belong in search excerpts.
- The album name is deliberately not shown. In an inline prose card it read as
  noise next to the title.
- Implementation: `src/features/posts/server/apple-music.ts` for the card,
  `src/features/posts/client/prose.ts` for playback, `src/styles/blog-prose.css`
  under *Apple Music listening card* for the styles.
