# mood OG card

Source for [`public/mood-og.png`](../../../public/mood-og.png) — the static Open
Graph card shared for `/mood` (and the fallback for text-only mood detail pages,
see `src/features/mood/server/detail-metadata.ts`).

## Design

- Channel identity lockup (avatar + `Levitating` wordmark + tagline) upper-left,
  `buxx.me/mood` + the `coding` peek sticker signature lower-right — weight rides
  the diagonal.
- Site language: the dot-grid graph paper, Geist Mono, and the blog's
  `--blog-img-edge` hairline on the avatar (no drop shadow, matching the blog).

## Regenerate

```bash
node scripts/og/mood-og/generate.mjs
```

`avatar.png` is a baked 640px snapshot of the live channel avatar. Refresh it
before regenerating when the channel photo changes:

```bash
curl -sL https://buxx.me/api/v2/images/channel/avatar \
  | sips -s format png -Z 640 /dev/stdin --out scripts/og/mood-og/avatar.png
```

`coding.svg` is a copy of `public/mascot/peek/stickers/coding.svg`; swap it for
another pose (`focus`, `notes`, `debugging`, `cheers`) to change the sticker.

Requires Node >= 22 and `bun install` (for `playwright-core`); fonts load from
`buxx.me` at render time.
