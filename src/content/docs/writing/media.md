---
title: Images & code
description: What happens to an image and a code block between the Ghost editor and the page — blur-up placeholders, responsive sources, and syntax highlighting.
group: Writing
order: 10
---

Two things in a post are rebuilt rather than passed through. Neither needs any
syntax; both are worth knowing about because their failure modes are quiet.

## Images

Content images uploaded to Ghost are rewritten to proxy-relative URLs and then
enriched at build time.

**Blur-up.** Each image is fetched once during the build, downscaled to a ~24px
blurred WebP, and inlined as a base64 data URI on a wrapper element. The real
image crossfades over it on load. A reader sees a soft preview sharpen instead of
a blank box that shifts the layout when it fills.

**Responsive sources.** Intrinsic width and height come from the same probe, so
the browser reserves the right box before the image arrives. A `srcset` is built
from the proxy's width parameter.

All of it is paid for at build time on a prerendered blog — no extra round-trips
for the reader.

It is deliberately resilient. Any fetch or decode failure leaves the original tag
untouched: no placeholder, just a plain image. Results are memoised per build, so
a repeated URL is fetched once and a broken one is not retried. This means a
missing blur-up is invisible on the page and only shows in the build log — if an
image lands hard on a slow connection, check there.

The probe resolves proxy-relative URLs against production, because a build-time
fetch has no local server to hit. Images that only exist on a local Ghost
instance will not get placeholders.

## Code blocks

Ghost's code cards are extracted from the HTML and re-rendered, rather than
styled in place. The language comes from the `language-` or `lang-` class Ghost
emits, falling back to a `data-language` attribute and then to `text`.

Set the language in the Ghost editor's code card. An unlabelled block renders as
plain text — legible, but unhighlighted.

Highlighting is dual-theme: both palettes ship as custom properties on each token
and the theme class picks a side, so switching light/dark never re-renders or
flashes. The same contract is used by the code blocks on this page.

Everything inside a code block is masked before the directive passes run, so a
fenced example containing `[!poem]` or `[^ref]` stays an example.

## Notes

- Blur-up: `src/features/posts/server/blur-up.ts`
- Responsive sources: `src/lib/media/responsive-image.ts`
- Code extraction: `src/features/posts/server/code-blocks.ts`
- The crossfade and player wiring: `src/features/posts/client/prose.ts`
