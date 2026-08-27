---
title: Component register
description: How /components is assembled, and how a piece is published to the shadcn registry at /r.
group: Surfaces
order: 6
---

`/components` is a register of the interactive pieces this site is built from. Each
one is a live specimen — not a screenshot — and most of them can be installed into
another project with one command.

## The two halves

The surface is split, and the split matters because the two halves have different
jobs:

- **`/components`** — a bento grid of live tiles. It exists to be looked at. Tiles
  link to their detail page; some are iframed because they take over scroll or use
  fixed positioning and would otherwise fight the page around them.
- **`/components/<slug>`** — one specimen, its usage snippet, its install command,
  and a link to the source.

## An entry

One Markdown file per component in `src/content/components/`. The filename is the
slug, so `decode-text.md` becomes `/components/decode-text` and registry name
`decode-text`. The schema lives in [`src/content.config.ts`](https://github.com/bunizao/site/blob/main/src/content.config.ts):

| Field | Meaning |
| --- | --- |
| `title` | Display name. |
| `tagline` | One line, shown under the title and in the grid caption. |
| `tier` | `primitive`, `showpiece`, or `composition`. Ordering and framing. |
| `order` | Sort key within a tier. |
| `install` | `{ type: 'registry' }` or `{ type: 'npm', pkg: '...' }`. |
| `source` | Absolute URL to the source on GitHub. |
| `credits` | Optional attribution line. |
| `draft` | Hides the entry everywhere, including the registry. |

The **body's first fenced code block is the usage snippet**. Nothing else in the
body is special — write what a reader needs after the snippet.

## Tiers

`primitive` is a base UI piece (button, badge, card) that other things are built
out of. `showpiece` is a self-contained specimen with its own behavior — the
decode-text engine, the mood wheel. `composition` is several pieces wired
together into a working block. The tier decides how the detail page frames the
specimen and where it falls in the ordering, not what the component can do.

## The registry

Entries with `install.type === 'registry'` are also published as shadcn registry
items at build time, by [`src/pages/r/[name].ts`](https://github.com/bunizao/site/blob/main/src/pages/r/%5Bname%5D.ts):

```bash
bunx shadcn@latest add https://buxx.me/r/decode-text
```

The item is assembled by
[`src/features/components/server/registry.ts`](https://github.com/bunizao/site/blob/main/src/features/components/server/registry.ts),
which reads the real source files off disk — so a registry item can never drift
from the component running on this page. It emits a
`registry-item.json`-conforming object with `files`, `dependencies`,
`registryDependencies`, and any `cssVars` the piece needs in both modes. A
`utils` item is published alongside so `cn()` resolves.

Routes are prerendered, so the registry is static JSON on the CDN — there is no
runtime component to keep alive.

## Adding one

1. Put the component under `src/components/ui/` (primitives) or its feature
   directory.
2. If it needs a stripped-down demo, add a preview to
   `src/features/components/previews/`.
3. Write the Markdown entry. First fence is the snippet.
4. For a registry publish, register the file list in `registry.ts` — nothing is
   inferred, and that is deliberate: a component's public file set is a decision,
   not a directory listing.
5. Run `bun run test:registry`. It builds the site, serves `dist/client/r`, and
   runs the real `shadcn` CLI against every published slug into a temp directory.
   If the install breaks for a stranger, it breaks here first.
