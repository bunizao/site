# Site

Personal bio/portfolio website.  

Live at:

<a href="https://buxx.me">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://buxx.me/api/site-badge.svg?theme=dark">
    <img alt="buxx.me badge" src="https://buxx.me/api/site-badge.svg?theme=light" />
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
bun run dev
```

Use focused dev scripts when working on one surface:

```bash
bun run dev:home     # homepage, with mood runtime loading paused
bun run dev:mood     # mood feed/detail work
bun run dev:preview  # internal preview pages
```

## API Endpoints

### JSON

`GET /api/moods`

Query params:
- `before` (string, optional): pagination cursor (oldest mood id currently loaded).

<details>
<summary>Response shape</summary>

```json
{
  "posts": [
    {
      "id": "12345",
      "datetime": "2025-01-01T12:34:56+00:00",
      "tag": "life",
      "previewText": "text preview",
      "previewHtml": "<p>text preview</p>",
      "image": "https://...",
      "mediaHtml": "<div>...</div>",
      "needsDetailPage": true,
      "forwardedFrom": { "name": "source", "href": "https://t.me/..." },
      "quote": { "text": "quoted text", "author": "someone", "href": "/mood/123" },
      "reactions": [
        { "emoji": "👍", "emojiId": "123", "emojiImage": "https://...", "count": "2", "isPaid": false }
      ]
    }
  ],
  "channel": {
    "slug": "my_channel",
    "title": "My Channel"
  }
}
```
</details>

### Notifications (Email)

Documentation:
- [`docs/EMAIL-NOTIFY.md`](docs/EMAIL-NOTIFY.md)

### SVG

Documentation:
- [`docs/SVG-API.md`](docs/SVG-API.md)

### oEmbed

Documentation:
- [`docs/OEMBED-API.md`](docs/OEMBED-API.md)

## Image Quality Upgrade (Cloudflare Worker)

Mood photos can be served via a Cloudflare Worker for higher quality and edge caching.
Use `PUBLIC_HD_IMAGE_URL` for public reads and `HD_IMAGE_INGEST_BASE_URL` for webhook ingest if the public image domain is protected by Cloudflare challenges or WAF rules.

Documentation:
- [`docs/IMAGE-QUALITY-UPGRADE.md`](docs/IMAGE-QUALITY-UPGRADE.md)

## Project Structure
```text
.
├── src/                              # Application source code
│   ├── pages/                        # Astro routes and API endpoints
│   │   ├── index.astro               # Homepage
│   │   ├── mood.astro                # Mood feed page
│   │   ├── mood/[id].astro           # Mood detail page
│   │   ├── mood/embed.astro          # Embeddable widget page
│   │   ├── api/                      # JSON/SVG/oEmbed/webhook endpoints
│   │   └── static/                   # Static proxy/helper routes
│   ├── components/                   # Reusable Astro/React components
│   │   └── ui/                       # UI primitives
│   ├── layouts/                      # Shared layout wrappers
│   ├── lib/                          # Utilities and service integrations
│   │   ├── notify/                   # Email notify domain logic
│   │   └── security/                 # Turnstile and security helpers
│   └── styles/                       # Global styles and Tailwind layers
├── public/                           # Public static assets
│   └── fonts/                        # Font files
├── docs/                             # API and feature documentation
├── workers/                          # Cloudflare Worker projects
│   ├── notify-scheduler/             # Scheduled notify dispatcher
│   └── telegram-image-proxy/         # Telegram image proxy worker
├── scripts/                          # Maintenance/migration scripts
├── tests/                            # Automated tests
│   └── e2e/                          # Playwright e2e test cases
├── astro.config.mjs                  # Astro config and integrations
├── tailwind.config.mjs               # Tailwind theme/config
└── .env                              # Environment template with comments
```

## Environment Variables
Variable descriptions are maintained as inline comments in [`.env`](.env).

Use `.env.local` for local secrets and keep [`.env`](.env) as the documented template.

## Acknowledgements
- [miantiao-me/BroadcastChannel](https://github.com/miantiao-me/BroadcastChannel) - Inspiration and code reference for `moods` ideas.
- [ddiu8081/ddiu.io](https://github.com/ddiu8081/ddiu.io) - Inspiration and code reference for `Ghost API` integration.
- [zmh-program/zmh-program.github.io](https://github.com/zmh-program/zmh-program.github.io) - Inspiration for layout and style ideas.
- [antfu/antfu.me](https://antfu.me/) - Inspiration for personal website design and content ideas.
- [hritish.com](https://hritish.com/) - Reference for the listening / recently played section and the `last.fm` driven now playing presentation.
- [John Tornow - Now Playing: A Web Component](https://johntornow.com/etc/now-playing/) - Reference for the now playing component pattern and lightweight playback status presentation.
- The [Astro](https://astro.build/), [React](https://react.dev/), and [Tailwind CSS](https://tailwindcss.com/) communities for great tooling and docs.
- Open-source maintainers whose libraries power this site.

## License
Copyright (c) 2026 bunizao. All rights reserved.

This repository is publicly visible for source inspection. No permission is granted to use, copy, modify, distribute, deploy, or commercialize this code without prior written approval from bunizao.

If you obtained an earlier version of this project under a different license, that version remains governed by the license terms that were included with that version.

Third-party components and assets remain subject to their own licenses.

See the [`LICENSE`](LICENSE) file for the full terms.
