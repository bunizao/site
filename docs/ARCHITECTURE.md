# Architecture Reference

## Detailed Implementation Docs

- [Home](./HOME.md)
- [Mascot](./MASCOT.md)
- [Mood](./MOOD.md)
- [Mood Decoupling Plan](./MOOD-DECOUPLING.md)
- [Shared Layout](./SHARED-LAYOUT.md)
- [Security](./SECURITY.md)
- [OAuth Hub](./OAUTH-HUB.md)
- [Privacy Policy](./PRIVACY-POLICY.md)
- [Email Notify + Admin Portal](./EMAIL-NOTIFY.md)
- [Worker and Site](./WORKER-SITE.md)

## Runtime Shape

The Cloudflare Worker `site` is the public runtime target for `buxx.me` and `www.buxx.me`. It serves the Astro site and public compatibility routes.

Private API ownership is moving to the separate `site-api` Worker at `https://api.buxx.me/v1/`. The public `site` Worker calls that service through the `API` service binding and keeps `buxx.me/api/*` as a compatibility proxy.

## Key Directories

- **`src/pages/`** — File-based routing. Includes `index.astro` (home), `mood.astro` (feed shell + route bootstrap), `mood/[id].astro` (detail shell + route bootstrap), `mood/embed.astro` (embeddable widget)
- **`src/pages/api/`** — Public server endpoints (moods, comments, SVG generators, oEmbed, health, Ghost/listening/footer) plus a catch-all compatibility proxy to `site-api`.
- **`src/pages/dev/` and `src/pages/oauth*`** — Compatibility proxy routes to the private admin/OAuth app in `site-api`.
- **`src/middleware.ts`** — Astro middleware that gates protected docs by asking `site-api` for the admin session state through the `API` service binding.
- **`src/features/`** — Feature-private code. `src/features/home/ui/` contains home-route sections and their private UI helpers. `src/features/mood/` contains mood-specific client controllers, feed renderer/media/update modules, server services, shared helpers, and private Astro UI shells in `ui/`.
- **`src/features/logos/`** — Pixel mascot definitions, SVG rendering helpers, and animated logo UI used by the navbar and favicon route
- **`src/lib/`** — Shared utilities: `github.ts` (GitHub API), `e2e.ts` (shared E2E fixture flag), `utils.ts` (cn/clsx utility), `fonts.ts` (server-side mirrors of the font tokens), `runtime/env.ts`, `http/*`, `media/responsive-image.ts`, and `security/*`
- **`src/components/ui/`** — shadcn/ui primitives (Button, Card, Table, Dialog, etc.) used by the admin portal
- **`src/layouts/`** — `Layout.astro` base layout for the public site; `PortalLayout.astro` shell for the admin portal (sidebar + topbar, scoped under `.theme-portal`)
- **`src/styles/`** — `globals.css` with Tailwind directives, CSS variable color system (HSL), shared font tokens (`--font-mono`, `--font-code`, `--font-sans`, `--font-display`), and `.theme-portal` token scope

## Component Patterns

- **Astro components** (`.astro`): frontmatter between `---` fences for build-time data fetching, scoped `<style>`, inline `<script>` for client-side behavior
- **React components** (`.tsx`): used selectively for interactive UI. Icons from `lucide-react`
- **Animations**: GSAP for mood feed update notice motion, mobile header button collapse, and home-page reveals; Intersection Observer for lazy hydration and scroll state; custom CSS for typewriter/marquee effects

## Styling

- TailwindCSS with `class` dark mode strategy
- Custom color system via CSS variables (HSL format) in `globals.css`
- `tailwindcss-animate` plugin for animation utilities

## Data Sources

1. **Ghost CMS** (`src/features/home/ui/Posts.astro`) — Blog posts via Ghost Content API
2. **GitHub API** (`src/features/home/ui/Projects.astro`, `src/lib/github.ts`) — Repository data and stars via GraphQL
3. **Last.fm + Apple iTunes Search** (`src/features/home/ui/Listening.astro`, `src/features/home/server/listening.ts`, `src/pages/api/listening.ts`) — Recent listening status from Last.fm, with client-side home hydration and iTunes enrichment for preview URLs and stronger artwork
4. **GitHub Contributions** (`src/features/home/ui/GitHubContributions.astro`, `src/pages/api/github/contributions.ts`) — Contribution graph from an internal API backed by GitHub GraphQL, with the public contributions API as a fallback
5. **Telegram/BroadcastChannel** — Mood posts are ingested and normalized by the private `site-api` Worker, then read by the public site through the `API` service binding.
6. **Better Stack Status Page** (`src/pages/api/footer.ts`) — Footer service status from `https://status.tuuhub.com/index.json`

## API Endpoints

**Public JSON:**
- `GET|HEAD /api/ping` — Tiny uncached uptime endpoint for Better Stack monitors.
- `GET /api/footer` — Cached footer status proxy backed by the Better Stack status page JSON API.
- `GET /api/edge` — Uncached per-request edge diagnostics from Cloudflare `request.cf` (colo, protocol, TLS, TCP RTT, approximate visitor location, network) for the footer hover popover. Never cached, since values are visitor-specific.
- `GET /api/github/contributions` — Cached GitHub contribution calendar for the homepage activity graph; `days` narrows the returned contribution days while preserving the last-year total.
- `GET /api/health` — Lightweight compatibility health response for stale monitors. Use `?diagnostic=1` for the owner diagnostic report; add `&deep=1` for slower external probes.
- `GET /api/moods` — Mood feed with pagination (`?before=<id>`)
- `GET /api/comments` — Comments
- `GET /api/oembed.json` — oEmbed endpoint (docs: `docs/OEMBED-API.md`)

**Private API (`site-api`):**
- Canonical base URL: `https://api.buxx.me/v1/`.
- Public compatibility: `https://buxx.me/api/*` proxies to `site-api` via the `API` service binding.
- Admin/OAuth/notify/webhook/image routes are owned by `site-api`, not by this public Worker.

**Owner auth surface:**
- `GET /oauth` — Short public entry that redirects to the protected OAuth hub.
- `GET /dev/portal/oauth` — Protected OAuth hub that documents the owner-auth boundary for future sandbox handoff tokens, knowledge connectors, and MCP clients.

Telegram references:

- `docs/TELEGRAM-PIPELINE.md`
- `docs/debug/README.md` for local-only investigation notes and temporary debug artifacts

**SVG** (all accept `?theme=light|dark`):
- `GET /api/status.svg`, `GET /api/tech-stack.svg`, `GET /api/site-badge.svg`
- `GET /api/project.svg` (requires `?project=<name>`)
- SVG font stacks come from `src/lib/fonts.ts`, which mirrors the CSS font tokens for server-rendered documents.
- Full docs: `docs/SVG-API.md`

**RSS:** `GET /mood/rss.xml`

## Environment Variables

Accessed via `import.meta.env.*`:
- `GHOST_URL` — Ghost CMS URL (default: https://blog.buxx.me)
- `GHOST_CONTENT_APIKEY` — Ghost CMS content API key; required in the Cloudflare build environment for the prerendered Writing section
- `GITHUB_TOKEN` — GitHub GraphQL token for project data
- `PUBLIC_HD_IMAGE_URL` — HD mood image base URL served by `site-api`
- `CHANNEL` — Telegram public channel slug used for media-group indexing
- `TELEGRAM_HOST` — Telegram public host for embed lookups (default: `t.me`)
- `LASTFM_API_KEY`, `LASTFM_USER` — Last.fm recent tracks integration for the home listening widget
- `PUBLIC_SITE_URL`, `SITE_URL` — canonical base URLs for email links, previews, and health checks
- `ACTIVITY_PANEL_SIGNING_SECRET` — optional signing secret for `/api/activity-panel.svg`

Cloudflare Worker bindings and non-secret vars are defined in [`wrangler.jsonc`](../wrangler.jsonc):

- `API` — Cloudflare Worker service binding to `site-api`

## Key Dependencies

- **gsap** — Animation library (used in mood feed update notice, mobile header actions, and home reveals)
- **cheerio** — HTML parsing for Telegram/mood content
- **ofetch** — HTTP client for API calls
- **dayjs** — Date formatting
- **prismjs** — Syntax highlighting in mood posts
- **lru-cache** — In-memory caching for API responses
