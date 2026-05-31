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

## Key Directories

- **`src/pages/`** — File-based routing. Includes `index.astro` (home), `mood.astro` (feed shell + route bootstrap), `mood/[id].astro` (detail shell + route bootstrap), `mood/embed.astro` (embeddable widget)
- **`src/pages/api/`** — Server endpoints (moods, comments, SVG generators, oEmbed, notify endpoints, admin endpoints, legacy telegram webhook fallback)
- **`src/pages/dev/portal/`** — GitHub-OAuth-gated admin portal (overview, OAuth hub, subscribers, broadcasts, mascot inspector, newsletter preview). `/dev/preview` and `/dev/newsletter-preview` 301-redirect into the portal.
- **`src/middleware.ts`** — Astro middleware that gates `/dev/portal/**` and `/api/admin/**` against the `admin_session` cookie.
- **`src/features/`** — Feature-private code. `src/features/home/ui/` contains home-route sections and their private UI helpers. `src/features/mood/` contains mood-specific client controllers, feed renderer/media/update modules, server services, shared helpers, and private Astro UI shells in `ui/`. `src/features/notify/server/` contains notify delivery, subscription, token, email, and D1 persistence logic, while `src/features/notify/ui/` holds notify-private preview UI. `src/features/admin/server/` holds OAuth/session, admin-side subscriber service, and broadcast service. `src/features/admin/ui/` holds the React consoles (subscribers, broadcasts).
- **`src/features/logos/`** — Pixel mascot definitions, SVG rendering helpers, and animated logo UI used by the navbar and favicon route
- **`src/lib/`** — Shared utilities: `github.ts` (GitHub API), `e2e.ts` (shared E2E fixture flag), `utils.ts` (cn/clsx utility), `runtime/env.ts`, `http/*`, `media/responsive-image.ts`, and `security/*`
- **`src/components/ui/`** — shadcn/ui primitives (Button, Card, Table, Dialog, etc.) used by the admin portal
- **`src/layouts/`** — `Layout.astro` base layout for the public site; `PortalLayout.astro` shell for the admin portal (sidebar + topbar, scoped under `.theme-portal`)
- **`src/styles/`** — `globals.css` with Tailwind directives, CSS variable color system (HSL), JetBrains Mono font, Geist Sans for the portal, `.theme-portal` token scope

## Component Patterns

- **Astro components** (`.astro`): frontmatter between `---` fences for build-time data fetching, scoped `<style>`, inline `<script>` for client-side behavior
- **React components** (`.tsx`): used selectively for interactive UI. Icons from `lucide-react`
- **Animations**: GSAP for mood feed update notice motion, mobile header button collapse, and home-page reveals; Intersection Observer for lazy hydration and scroll state; custom CSS for typewriter/marquee effects

## Styling

- TailwindCSS with `class` dark mode strategy
- Custom color system via CSS variables (HSL format) in `globals.css`
- `tailwindcss-animate` plugin for animation utilities

## Data Sources

1. **Private Ghost origin** (`src/features/home/ui/Posts.astro`) — Writing metadata via the Ghost Content API, without exposing the CMS URL in browser-facing links
2. **GitHub API** (`src/features/home/ui/Projects.astro`, `src/lib/github.ts`) — Repository data and stars via GraphQL
3. **Last.fm + Apple iTunes Search** (`src/features/home/ui/Listening.astro`, `src/features/home/server/listening.ts`, `src/pages/api/listening.ts`) — Recent listening status from Last.fm, with client-side home hydration and iTunes enrichment for preview URLs and stronger artwork
4. **GitHub Contributions** (`src/features/home/ui/GitHubContributions.astro`) — Contribution graph from external API
5. **Telegram/BroadcastChannel** — Mood posts sourced from Telegram channel, with webhook ingress on Cloudflare Worker and content parsing in the site app
6. **Better Stack Status Page** (`src/pages/api/footer.ts`) — Footer service status from `https://status.tuuhub.com/index.json`

## API Endpoints

**JSON:**
- `GET|HEAD /api/ping` — Tiny uncached uptime endpoint for Better Stack monitors.
- `GET /api/footer` — Cached footer status proxy backed by the Better Stack status page JSON API.
- `GET /api/health` — Lightweight compatibility health response for stale monitors. Use `?diagnostic=1` for the owner diagnostic report; add `&deep=1` for slower external probes.
- `GET /api/moods` — Mood feed with pagination (`?before=<id>`)
- `GET /api/comments` — Comments
- `GET /api/oembed.json` — oEmbed endpoint (docs: `docs/OEMBED-API.md`)
- `POST /api/notify/dispatch` — Internal notify dispatch endpoint
- `POST /api/telegram-webhook` — Legacy Telegram webhook fallback endpoint

**Admin (gated by `admin_session` cookie):**
- `GET /api/admin/auth/start`, `GET /api/admin/auth/callback`, `POST /api/admin/auth/logout` — GitHub OAuth handshake
- `GET|POST /api/admin/subscribers`, `GET|PATCH|DELETE /api/admin/subscribers/[hash]` — subscriber CRUD
- `GET|POST /api/admin/broadcasts`, `POST /api/admin/broadcasts/preview`, `GET /api/admin/broadcasts/[id]` — broadcast compose, preview, send, history

**Owner auth surface:**
- `GET /oauth` — Short public entry that redirects to the protected OAuth hub.
- `GET /dev/portal/oauth` — Protected OAuth hub that documents the owner-auth boundary for future sandbox handoff tokens, knowledge connectors, and MCP clients.

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
- `GHOST_URL` — private Ghost CMS origin used server-side
- `GHOST_CONTENT_APIKEY` — Ghost CMS content API key
- `WRITING_PUBLIC_URL` — optional public writing frontend; when unset, home writing rows stay unlinked
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
- `LASTFM_API_KEY`, `LASTFM_USER` — Last.fm recent tracks integration for the home listening widget
- `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` — GitHub OAuth app for the admin portal
- `ADMIN_GITHUB_LOGIN` — single GitHub login allowed into `/dev/portal`
- `ADMIN_SESSION_SECRET` — 32-byte random base64 used to HMAC-sign the admin session cookie
- `ADMIN_DEV_BYPASS` — loopback-only local login used by `bun run dev:portal`; ignored outside `astro dev`
- `ADMIN_DEV_LOGIN`, `ADMIN_DEV_AVATAR_URL` — optional local-only login and avatar shown by the dev bypass session
- `PUBLIC_SITE_URL`, `SITE_URL` — canonical base URLs for email links, previews, and health checks
- `ACTIVITY_PANEL_SIGNING_SECRET` — optional signing secret for `/api/activity-panel.svg`

Cloudflare Worker bindings and secrets are defined in [`workers/telegram-image-proxy/wrangler.toml`](../workers/telegram-image-proxy/wrangler.toml).

## Key Dependencies

- **gsap** — Animation library (used in mood feed update notice, mobile header actions, and home reveals)
- **cheerio** — HTML parsing for Telegram/mood content
- **ofetch** — HTTP client for API calls
- **dayjs** — Date formatting
- **prismjs** — Syntax highlighting in mood posts
- **lru-cache** — In-memory caching for API responses
