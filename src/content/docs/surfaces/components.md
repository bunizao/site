---
title: Component register
description: How /components is built, and how to publish a component to the shadcn registry at /r.
group: Surfaces
order: 6
---

`/components` is a register of the interactive pieces this site is built from.
Each one is a specimen: the real component, running live on the page. Most of
them can be installed into another project with one command. Read this page
when you add a component or publish one to the registry.

| Part | What it is |
| --- | --- |
| [Pages](#pages) | The `/components` grid and one detail page per component |
| [Entries](#entries) | One Markdown file per component in `src/content/components/` |
| [Tiers](#tiers) | `primitive`, `showpiece`, or `composition` |
| [Registry](#registry) | shadcn registry items served from `/r` |

## Pages

The register has two kinds of page, and each has its own job:

- **`/components`** is a bento grid of live tiles, meant for browsing. Each tile
  links to its detail page. Tiles that take over scroll or use fixed positioning
  render in an iframe so they don't fight the page around them.
- **`/components/<slug>`** shows one specimen, its usage snippet, its install
  command, and a link to the source.

## Entries

Each component has one Markdown file in `src/content/components/`. The filename
is the slug, so `decode-text.md` becomes `/components/decode-text` and registry
name `decode-text`. The schema is in [`src/content.config.ts`](https://github.com/bunizao/site/blob/main/src/content.config.ts):

| Field | Meaning |
| --- | --- |
| `title` | Display name. |
| `tagline` | One line, shown under the title and in the grid caption. |
| `tier` | `primitive`, `showpiece`, or `composition`. Sets ordering and framing. |
| `order` | Sort key within a tier. |
| `install` | `{ type: 'registry' }` or `{ type: 'npm', pkg: '...' }`. |
| `source` | Absolute URL to the source on GitHub. |
| `credits` | Optional attribution line. |
| `draft` | Hides the entry everywhere, including the registry. |

The **first fenced code block in the body is the usage snippet**. The rest of
the body has no special meaning, so write whatever a reader needs after the
snippet.

## Tiers

| Tier | Meaning | Examples |
| --- | --- | --- |
| `primitive` | A base UI piece that other things are built from | Button, badge, card |
| `showpiece` | A self-contained specimen with its own behavior | The decode-text engine, the mood wheel |
| `composition` | Several pieces wired together into a working block | |

The tier sets how the detail page frames the specimen and where it sorts. It
doesn't limit what the component can do.

## Registry

At build time, [`src/pages/r/[name].ts`](https://github.com/bunizao/site/blob/main/src/pages/r/%5Bname%5D.ts)
publishes every entry with `install.type === 'registry'` as a shadcn registry
item. You install one like this:

```bash
bunx shadcn@latest add https://buxx.me/r/decode-text
```

[`src/features/components/server/registry.ts`](https://github.com/bunizao/site/blob/main/src/features/components/server/registry.ts)
builds each item from the real source files on disk, so a registry item always
matches the component running on the page. It emits an object that conforms to
`registry-item.json`, with `files`, `dependencies`, `registryDependencies`, and
any `cssVars` the piece needs in both modes. A `utils` item is published
alongside it so `cn()` resolves.

The routes are prerendered, so the registry is static JSON on the CDN. There is
no runtime component to keep alive.

## Add a component

1. Put the component under `src/components/ui/` (primitives) or in its feature
   directory.
2. If it needs a stripped-down demo, add a preview to
   `src/features/components/previews/`.
3. Write the Markdown entry. The first fence is the snippet.
4. To publish it to the registry, list its files in `registry.ts`. Nothing is
   inferred from the directory: you decide which files make up the component's
   public set.
5. Run `bun run test:registry`. It builds the site, serves `dist/client/r`, and
   runs the real `shadcn` CLI against every published slug into a temp
   directory. An install that would break for someone else breaks here first.
