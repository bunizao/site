# Architecture Reference

## Detailed Implementation Docs

- [Home](./HOME.md)
- [Mood](./MOOD.md)
- [Mood Decoupling Plan](./MOOD-DECOUPLING.md)
- [Shared Layout](./SHARED-LAYOUT.md)
- [Security](./SECURITY.md)
- [Privacy Policy](./PRIVACY-POLICY.md)
- [Worker and Site](./WORKER-SITE.md)

## Key Directories

- **`src/pages/`** — File-based routing. Includes `index.astro` (home), `mood.astro` (feed), `mood/[id].astro` (detail), `mood/embed.astro` (embeddable widget)
- **`src/pages/api/`** — Server endpoints (moods, comments, SVG generators, oEmbed, notify endpoints, legacy telegram webhook fallback)
- **`src/components/`** — Site-wide shared Astro (`.astro`) and React (`.tsx`) components. `ui/` follows shadcn/ui patterns
- **`src/features/`** — Feature-private code. `src/features/home/ui/` contains home-route sections and their private UI helpers. `src/features/mood/` contains mood-specific client controllers, server services, shared helpers, and private Astro UI shells in `ui/`. `src/features/notify/server/` contains notify delivery, subscription, token, email, and D1 persistence logic.
- **`src/lib/`** — Shared utilities: `github.ts` (GitHub API), `telegram.ts` (Telegram integration), `mood-utils.ts` (mood data processing), `svg-response.ts` (SVG endpoint helpers), `embed-response.ts` (oEmbed helpers), `utils.ts` (cn/clsx utility)
- **`src/layouts/`** — `Layout.astro` base layout with meta tags, theme toggle, analytics
- **`src/styles/`** — `globals.css` with Tailwind directives, CSS variable color system (HSL), JetBrains Mono font

## Component Patterns

- **Astro components** (`.astro`): frontmatter between `---` fences for build-time data fetching, scoped `<style>`, inline `<script>` for client-side behavior
- **React components** (`.tsx`): used selectively for interactive UI. Icons from `lucide-react`, styling with shadcn/ui patterns (class-variance-authority, tailwind-merge)
- **Animations**: GSAP for complex animations (MoodTimelineWheel), Intersection Observer for scroll reveals, custom CSS for typewriter/marquee effects

## Styling

- TailwindCSS with `class` dark mode strategy
- Custom color system via CSS variables (HSL format) in `globals.css`
- `tailwindcss-animate` plugin for animation utilities

## Data Sources

1. **Ghost CMS** (`src/features/home/ui/Posts.astro`) — Blog posts via Ghost Content API
2. **GitHub API** (`src/features/home/ui/Projects.astro`, `src/lib/github.ts`) — Repository data and stars via GraphQL
3. **GitHub Contributions** (`src/features/home/ui/GitHubContributions.astro`) — Contribution graph from external API
4. **Telegram/BroadcastChannel** — Mood posts sourced from Telegram channel, with webhook ingress on Cloudflare Worker and content parsing in the site app

## API Endpoints

**JSON:**
- `GET /api/moods` — Mood feed with pagination (`?before=<id>`)
- `GET /api/comments` — Comments
- `GET /api/oembed.json` — oEmbed endpoint (docs: `docs/OEMBED-API.md`)
- `POST /api/notify/dispatch` — Internal notify dispatch endpoint
- `POST /api/telegram-webhook` — Legacy Telegram webhook fallback endpoint

Telegram references:

- `docs/TELEGRAM-PIPELINE.md`
- `docs/debug/README.md` for local-only investigation notes and temporary debug artifacts

**Cloudflare Worker routes:**
- `POST https://image.buxx.me/webhook` — Primary Telegram webhook receiver
- `GET https://image.buxx.me/mood/:postId/:imageIndex` — Public mood image reads
- `GET https://image.buxx.me/channel/avatar` — Public channel avatar reads
- `POST https://image.buxx.me/ingest/...` — Authenticated manual/backfill ingest routes

**SVG** (all accept `?theme=light|dark`):
- `GET /api/status.svg`, `GET /api/tech-stack.svg`, `GET /api/site-badge.svg`
- `GET /api/project.svg` (requires `?project=<name>`)
- Full docs: `docs/SVG-API.md`

**RSS:** `GET /mood/rss.xml`

## Environment Variables

Accessed via `import.meta.env.*`:
- `GHOST_URL` — Ghost CMS URL (default: https://blog.buxx.me)
- `GHOST_CONTENT_APIKEY` — Ghost CMS content API key
- `GITHUB_TOKEN` — GitHub GraphQL token for project data
- `PUBLIC_HD_IMAGE_URL` — Cloudflare Worker URL for HD mood images
- `HD_IMAGE_INGEST_BASE_URL` — Internal Worker base URL for webhook image ingest when the public image domain has extra edge protections
- `TELEGRAM_WEBHOOK_SECRET` — Secret shared by the Telegram webhook endpoints
- `TELEGRAM_BOT_TOKEN` — Telegram Bot API token
- `TELEGRAM_CHANNEL_ID` — Telegram channel id for avatar lookups and bot-side reads
- `CHANNEL` — Telegram public channel slug used for media-group indexing
- `TELEGRAM_HOST` — Telegram public host for embed lookups (default: `t.me`)
- `NOTIFY_DISPATCH_SECRET` — Bearer secret accepted by `/api/notify/dispatch`
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_NOTIFY_D1_DATABASE_ID` — Cloudflare account access and D1 notify database

Cloudflare Worker bindings and secrets are defined in [`workers/telegram-image-proxy/wrangler.toml`](../workers/telegram-image-proxy/wrangler.toml).

## Key Dependencies

- **gsap** — Animation library (used in MoodTimelineWheel)
- **cheerio** — HTML parsing for Telegram/mood content
- **ofetch** — HTTP client for API calls
- **dayjs** — Date formatting
- **prismjs** — Syntax highlighting in mood posts
- **lru-cache** — In-memory caching for API responses
