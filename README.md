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

## API Endpoints

### JSON

`GET /api/moods`

Query params:
- `before` (string, optional): pagination cursor (oldest mood id currently loaded).

Response shape:
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

### SVG

These endpoints return SVG images:

- `GET /api/status.svg` (optional `theme=light|dark`)
- `GET /api/tech-stack.svg` (optional `theme=light|dark`)
- `GET /api/site-badge.svg` (optional `theme=light|dark`)
- `GET /api/project.svg` (required `project`, optional `theme=light|dark`)

Full SVG API documentation:
- [`docs/SVG-API.md`](docs/SVG-API.md)

## Project Structure
- `/src/pages` - Route entry points
- `src/pages/api` - Dynamic SVG endpoints
- `src/components` - Reusable UI components
- `src/layouts` - Layout wrappers
- `src/styles` - Global styles and fonts
- `public` - Static assets

## Customization
- `src/pages/index.astro` - Homepage content
- `src/styles/globals.css` - Global styling overrides
- `public` - Logos, icons, and other static media

## Environment Variables
- `GHOST_URL` - Ghost CMS URL
- `GHOST_CONTENT_APIKEY` - Ghost CMS content API key
- `GITHUB_TOKEN` - GitHub GraphQL token for project data and star counts
- See [`.env`](.env)

## Acknowledgements
- [miantiao-me/BroadcastChannel](https://github.com/miantiao-me/BroadcastChannel) - Inspiration and code reference for `moods` ideas.
- [ddiu8081/ddiu.io](https://github.com/ddiu8081/ddiu.io) - Inspiration and code reference for `Ghost API` integration.
- [zmh-program/zmh-program.github.io](https://github.com/zmh-program/zmh-program.github.io) - Inspiration for layout and style ideas.
- The Astro, React, and Tailwind CSS communities for great tooling and docs.
- Open-source maintainers whose libraries power this site.

## License
This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This repository includes and is derived from third-party open-source software:

- Portions of the codebase are derived from AGPL-licensed projects and therefore the entire project is distributed under the AGPL-3.0 in accordance with its terms.
- This project also incorporates code licensed under the MIT License. MIT-licensed components remain under their original license, and their copyright notices are preserved as required.


> If you modify this program and run it as a network service, you are required to make the complete corresponding source code of your modified version available to users of that service, as mandated by the AGPL-3.0.

See the [`LICENSE`](LICENSE) file for the full license text. 
