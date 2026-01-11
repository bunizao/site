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

## Development
```bash
pnpm install
pnpm dev
```

## Build
```bash
pnpm build
pnpm preview
```

## SVG API Endpoints

This site exposes custom SVG endpoints for flexible use:

- `docs/SVG-API.md` - Complete API documentation

## Project Structure
- `src/pages` - Route entry points
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
- See `.env`

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

See the `LICENSE` file for the full license text. 