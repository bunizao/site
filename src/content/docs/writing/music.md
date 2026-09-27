---
title: Listening card
description: "The [!music] directive: an Apple Music track as a playable vinyl card, and its fallback on other targets."
group: Writing
order: 3
---

`[!music]` adds an Apple Music track to a post as a listening card. The card
shows a record sleeve with the artwork on a spinning disc, a tonearm that swings
in on play, the title, artist, and year, a scrubber, and a live equalizer while
the track streams.

```md demo
[!music id=1440857781]
```

| Attribute | Required | Value |
| --- | --- | --- |
| `id` | yes | Apple Music song ID, a positive integer |

`id` is the only attribute. The build looks up everything else on the card
(title, artist, year, artwork, preview audio) from the ID.

## Find the ID

Open the song on Apple Music and copy the `i=` query parameter from the URL:

```
https://music.apple.com/us/album/rhinestone-eyes/1440857766?i=1440857781
                                                              ^^^^^^^^^^
```

That is the *song* ID. If you pass the album ID instead, the card has nothing on
it.

## Playback

The card plays in one of two ways. The browser picks which one at runtime, so
the build doesn't decide it:

- **With an Apple Music subscription and MusicKit authorized**, the card streams
  the full track and the source pill reads **Full track**.
- **Without a subscription**, it plays the 30-second preview Apple exposes
  publicly.
- **If neither is available**, the play button renders disabled. The card still
  links to the song.

Only one card plays at a time. Starting a second one stops the first. That
includes the now-playing widget on the home page, which shares the same player.

The browser samples an accent colour from the artwork and tints the card with
it, so the panel matches the sleeve instead of sitting grey in the middle of the
post.

## Paste an embed instead

You don't have to use the directive. Paste an Apple Music embed into a Ghost
bookmark or HTML card, and the enrichment pass rewrites the `<iframe>` into the
same listening card. The directive is there for when one line is easier than
fighting the editor.

## Other output targets

The card exists only for `web` and `preview`. On every other target (RSS,
Markdown, Open Graph, excerpts) it falls back to a link. The link uses the track
title when the lookup succeeds:

```html
<p><a href="https://music.apple.com/us/song/1440857781?i=1440857781">Listen to Rhinestone Eyes on Apple Music</a></p>
```

The web page uses the same fallback when Apple's metadata lookup fails at build
time, so a card never renders empty.

## Notes

- The player chrome is marked `data-pagefind-ignore`, so timestamps and button
  labels stay out of search excerpts.
- The album name isn't shown. In an inline prose card it read as noise next to
  the title.
- Implementation: `src/features/posts/server/apple-music.ts` for the card,
  `src/features/posts/client/prose.ts` for playback, `src/styles/blog-prose.css`
  under *Apple Music listening card* for the styles.
