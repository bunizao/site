---
title: Images & code
description: What the build does to images and code blocks from Ghost, from blur-up placeholders to syntax highlighting.
group: Writing
order: 10
---

The build rebuilds two things in a post instead of passing them through: images
and code blocks. Neither needs any syntax. Know how they work, because when they
fail, nothing on the page tells you.

## Images

Content images uploaded to Ghost are rewritten to proxy-relative URLs, then
enriched at build time.

- **Blur-up.** The build fetches each image once, downscales it to a ~24px
  blurred WebP, and inlines it as a base64 data URI on a wrapper element. The
  real image crossfades over it on load. The reader sees a soft preview sharpen
  instead of a blank box that shifts the layout when it fills.
- **Responsive sources.** The same probe gives the intrinsic width and height,
  so the browser reserves the right box before the image arrives. A `srcset` is
  built from the proxy's width parameter.

All of this happens at build time on a prerendered blog, so the reader pays no
extra round-trips.

### When enrichment fails

Any fetch or decode failure leaves the original tag untouched. You get no
placeholder, only a plain image. Results are memoised per build, so a repeated
URL is fetched once and a broken one isn't retried.

A missing blur-up is invisible on the page and shows only in the build log. If
an image pops in without a placeholder on a slow connection, check the log.

The probe resolves proxy-relative URLs against production, because a build-time
fetch has no local server to call. Images that exist only on a local Ghost
instance don't get placeholders.

## Code blocks

The build extracts Ghost's code cards from the HTML and re-renders them instead
of styling them in place. The language comes from the `language-` or `lang-`
class Ghost emits. If there is none, the build falls back to a `data-language`
attribute, then to `text`.

Set the language in the Ghost editor's code card. An unlabelled block renders as
plain text: readable, but not highlighted.

Highlighting is dual-theme. Each token carries both palettes as custom
properties, and the theme class picks one. Switching between light and dark
never re-renders or flashes. The code blocks on this page use the same setup.

Everything inside a code block is masked before the directive passes run, so a
fenced example containing `[!poem]` or `[^ref]` stays an example.

## Source files

- Blur-up: `src/features/posts/server/blur-up.ts`
- Responsive sources: `src/lib/media/responsive-image.ts`
- Code extraction: `src/features/posts/server/code-blocks.ts`
- The crossfade and player wiring: `src/features/posts/client/prose.ts`
