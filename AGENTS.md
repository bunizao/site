# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Code Standards

**IMPORTANT: Language Requirements**
- All code comments, documentation, commit messages, variable names, and identifiers MUST be in English. No exceptions.

## Commit Message Guidelines

- Use clear, imperative, and concise phrasing.
- Do not use "for" or "to" to append reasons or outcomes (no "for clarity", "to enhance", "to improve", etc.).
- If you need to add scope, keep it as a direct noun phrase (what changed), not a rationale.
- Examples:
  - ✅ `feat: add search filter input`
  - ✅ `fix: handle empty response`
  - ❌ `docs: add setup instructions for better onboarding`

## Development Commands

```bash
bun install          # Install dependencies (uses Bun, not npm/yarn/pnpm)
bun dev              # Dev server at http://localhost:4321
bun run build        # Production build → dist/
bun preview          # Preview production build locally
```

No test suite or linter is configured.

## Architecture

**Astro v5** static site generator + **React** (interactive components via @astrojs/react) + **TailwindCSS** + **TypeScript**. Deployed on **Vercel**.

### Path Alias

`@` maps to `./src` (configured in `astro.config.mjs`). Use `@/lib/utils` instead of relative paths.

### Key Directories

- **`src/pages/`** — File-based routing. Includes `index.astro` (home), `mood.astro` (feed), `mood/[id].astro` (detail), `mood/embed.astro` (embeddable widget)
- **`src/pages/api/`** — Server endpoints (moods, comments, SVG generators, oEmbed, telegram webhook)
- **`src/components/`** — Astro (`.astro`) and React (`.tsx`) components. `ui/` subdirectory follows shadcn/ui patterns
- **`src/lib/`** — Shared utilities: `github.ts` (GitHub API), `telegram.ts` (Telegram integration), `mood-utils.ts` (mood data processing), `svg-response.ts` (SVG endpoint helpers), `embed-response.ts` (oEmbed helpers), `utils.ts` (cn/clsx utility)
- **`src/layouts/`** — `Layout.astro` base layout with meta tags, theme toggle, analytics
- **`src/styles/`** — `globals.css` with Tailwind directives, CSS variable color system (HSL), JetBrains Mono font

### Component Patterns

- **Astro components** (`.astro`): frontmatter between `---` fences for build-time data fetching, scoped `<style>`, inline `<script>` for client-side behavior
- **React components** (`.tsx`): used selectively for interactive UI. Icons from `lucide-react`, styling with shadcn/ui patterns (class-variance-authority, tailwind-merge)
- **Animations**: GSAP for complex animations (MoodTimelineWheel), Intersection Observer for scroll reveals, custom CSS for typewriter/marquee effects

### Styling

- TailwindCSS with `class` dark mode strategy
- Custom color system via CSS variables (HSL format) in `globals.css`
- `tailwindcss-animate` plugin for animation utilities

### Data Sources

1. **Ghost CMS** (`Posts.astro`) — Blog posts via Ghost Content API
2. **GitHub API** (`Projects.astro`, `src/lib/github.ts`) — Repository data and stars via GraphQL
3. **GitHub Contributions** (`GitHubContributions.astro`) — Contribution graph from external API
4. **Telegram/BroadcastChannel** — Mood posts sourced from Telegram channel, processed with cheerio

### API Endpoints

**JSON:**
- `GET /api/moods` — Mood feed with pagination (`?before=<id>`)
- `GET /api/comments` — Comments
- `GET /api/oembed.json` — oEmbed endpoint (docs: `docs/OEMBED-API.md`)
- `POST /api/telegram-webhook` — Telegram webhook receiver

**SVG** (all accept `?theme=light|dark`):
- `GET /api/status.svg`, `GET /api/tech-stack.svg`, `GET /api/site-badge.svg`
- `GET /api/project.svg` (requires `?project=<name>`)
- Full docs: `docs/SVG-API.md`

**RSS:** `GET /mood/rss.xml`

### Environment Variables

Accessed via `import.meta.env.*`:
- `GHOST_URL` — Ghost CMS URL (default: https://blog.buxx.me)
- `GHOST_CONTENT_APIKEY` — Ghost CMS content API key
- `GITHUB_TOKEN` — GitHub GraphQL token for project data
- `PUBLIC_HD_IMAGE_URL` — Cloudflare Worker URL for HD mood images
- `TELEGRAM_WEBHOOK_SECRET` — Secret for `/api/telegram-webhook`
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_KV_NAMESPACE_ID` — Cloudflare KV for mood image mapping

### Key Dependencies

- **gsap** — Animation library (used in MoodTimelineWheel)
- **cheerio** — HTML parsing for Telegram/mood content
- **ofetch** — HTTP client for API calls
- **dayjs** — Date formatting
- **prismjs** — Syntax highlighting in mood posts
- **lru-cache** — In-memory caching for API responses

## Image Uploads

- **MUST** compress images before uploading to save tokens.
- Downscale longest edge to ~1600px, strip metadata, export as JPEG/WebP at 75-85 quality.
- macOS: `sips -Z 1600 input.png --out input-1600.png && sips -s format jpeg -s formatOptions 80 input-1600.png --out input-1600.jpg`
- ImageMagick: `magick input.png -strip -resize 1600x1600\\> -quality 82 output.jpg`

## Mood Navigation (Three-Level Menu)

1. **Level 0 (Home Preview)**: Mood preview on the home page (`Moods.astro`)
2. **Level 1 (Mood Feed)**: Main feed at `/mood` with `MoodTimelineWheel.astro`
3. **Level 2 (Mood Detail)**: Single item at `/mood/[id]`
