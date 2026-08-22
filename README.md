# buxx.me

My personal website. Runs entirely on the edge ☁️.

<a href="https://buxx.me">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://buxx.me/api/site-badge.svg?theme=dark">
    <img alt="buxx.me" src="https://buxx.me/api/site-badge.svg?theme=light" />
  </picture>
</a>

## Tech Stack
- Astro
- React
- TypeScript
- TailwindCSS

## Dev

```bash
bun install
bun dev
```

Focused servers:

```bash
bun run dev:home
bun run dev:mood
bun run dev:preview
bun run dev:portal
```

## Content

Homepage copy, section toggles, footer, projects, and SEO/OG meta are curated in one file: [`src/data/site.ts`](src/data/site.ts). Details are in the file's comments.

## Docs

The living reference is published at [buxx.me/docs](https://buxx.me/docs) and authored in [`src/content/docs/`](src/content/docs). Start with [Architecture](https://buxx.me/docs/architecture) or [Local development](https://buxx.me/docs/development).

[`docs/README.md`](docs/README.md) indexes it, and keeps what is not reference material: active work in `docs/plans/`, shipped records in `docs/archive/`.

Environment variables are documented in [`.env`](.env).


## Acknowledgements

- [antfu/antfu.me](https://antfu.me/) - Inspiration for personal website design and content ideas.
- [Astro Starlight](https://starlight.astro.build/) - Docs site framework for the internal documentation.
- [Simple Card Stack by Daniel Destefanis](https://www.figma.com/community/file/1543265632442908675) - Figma prototype reference for the projects card stack interaction.
- [ddiu8081/ddiu.io](https://github.com/ddiu8081/ddiu.io) - Inspiration and code reference for `Ghost API` integration.
- [hritish.com](https://hritish.com/) - Reference for the listening / recently played section and the `last.fm` driven now playing presentation.
- [John Tornow - Now Playing: A Web Component](https://johntornow.com/etc/now-playing/) - Reference for the now playing component pattern and lightweight playback status presentation.
- [miantiao-me/BroadcastChannel](https://github.com/miantiao-me/BroadcastChannel) - Inspiration and code reference for `moods` ideas.
- [shadcn/ui](https://ui.shadcn.com/) - UI component primitives used in the admin portal.
- [soulwire.co.uk](https://soulwire.co.uk/) - Reference for the hero bio decode reveal effect.
- [zmh-program/zmh-program.github.io](https://github.com/zmh-program/zmh-program.github.io) - Inspiration for layout and style ideas.
- The [Astro](https://astro.build/), [React](https://react.dev/), and [Tailwind CSS](https://tailwindcss.com/) communities for great tooling and docs.
- Open-source maintainers whose libraries power this project!

## License

Copyright (c) 2026 bunizao. All rights reserved.

This repository is publicly visible for source inspection. No permission is granted to use, copy, modify, distribute, deploy, or commercialize this code without prior written approval from bunizao.

If you obtained an earlier version of this project under a different license, that version remains governed by the license terms that were included with that version.

Third-party components and assets remain subject to their own licenses.

See the [`LICENSE`](LICENSE) file for the full terms.
