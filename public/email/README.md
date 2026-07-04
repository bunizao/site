# Blog email masthead assets

Raster masthead pieces for the 無人之境 blog emails (newsletter + welcome).
Email clients (Gmail, Outlook, Android) strip `@font-face` and inline SVG, so the
WenKai brush wordmark and the thinking-woman mark ship as static PNGs instead of
live text or SVG.

Files (transparent, 2x):

- `wordmark-light.png` — 無人之境 in LXGW WenKai, near-black `#0a0a0a` (white card)
- `wordmark-dark.png` — same glyphs in `#fafafa` (dark card)
- `mark-light.png` — thinking-woman mark, black art (white card)
- `mark-dark.png` — same mark inverted white (dark card)

## Regenerate

```bash
node scripts/generate-email-wordmark.mjs   # needs Node 22
```

The script inlines `public/fonts/wenkai-wordmark.woff2` and `public/blog-mark.webp`
as base64 into a self-contained page, renders it in headless Chromium, and
screenshots each tile. Re-run it whenever the wordmark face or the mark changes.

> Note: must run in a normal terminal with filesystem access to `public/fonts/`.
> The woff2 is not readable from restricted/sandboxed shells.
