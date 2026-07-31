# Architecture Reference

## Detailed Implementation Docs

See [docs/README.md](./README.md) for the full index. Frequently needed:

- [Home](./HOME.md)
- [Mascot](./MASCOT.md)
- [Mood](./MOOD.md)
- [Shared Layout](./SHARED-LAYOUT.md)
- [Security](./SECURITY.md)
- [OAuth Hub](./OAUTH-HUB.md)
- [Privacy Policy](./PRIVACY-POLICY.md)
- [Email Notify + Admin Portal](./EMAIL-NOTIFY.md)
- [Worker and Site](./WORKER-SITE.md)

## Runtime Shape

The Cloudflare Worker `site` is the public runtime target for `buxx.me` and `www.buxx.me`. It serves the Astro site.

Private API ownership lives in the separate `site-api` Worker. `site-api` directly owns `buxx.me/api/*` through Cloudflare route patterns and owns machine ingress at `api.buxx.me` for webhooks, notify, image processing, archive reads, and internal automation. Mood pages use the D1 archive as their default base render (`MOOD_READ_SOURCE=archive`), with the live Telegram reader as a bounded fallback and for freshness-sensitive comments and reactions. The public `site` Worker keeps only a thin `/api/*` service-binding fallback for local and preview environments.

## Key Directories

- **`src/pages/`** — File-based routing. Includes `index.astro` (home), `mood.astro` (feed shell + route bootstrap), `mood/[id].astro` (detail shell + route bootstrap), `mood/embed.astro` (embeddable widget)
- **`src/pages/api/`** — Thin catch-all fallback proxy to `site-api`; concrete API implementations live in the private `site-api` repo.
- **`src/pages/dev/` and `src/pages/oauth*`** — Compatibility proxy routes to the private admin/OAuth app in `site-api`.
- **`src/middleware.ts`** — Astro middleware that negotiates agent Markdown, applies variant-aware edge caching, and gates protected docs by asking `site-api` for the admin session state through the `API` service binding.
- **`src/features/`** — Feature-private code. `src/features/home/ui/` contains home-route sections and their private UI helpers. `src/features/mood/` contains mood-specific client controllers, feed renderer/media/update modules, server services, shared helpers, and private Astro UI shells in `ui/`.
- **`src/features/logos/`** — Pixel mascot definitions, SVG rendering helpers, and animated logo UI used by the navbar and favicon route
- **`src/lib/`** — Shared utilities: `e2e.ts` (shared E2E fixture flag), `utils.ts` (cn/clsx utility), `fonts.ts` (server-side mirrors of the font tokens), `runtime/env.ts`, `http/*`, and `media/responsive-image.ts`
- **`src/components/coss/`** — Base UI–backed primitives used by the admin portal; shared portal-specific Astro components live in `src/components/portal/`
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
2. **Project cards** (`src/features/home/ui/Projects.astro`) — Local project-card UI.
3. **Last.fm + Apple iTunes Search** (`src/features/home/ui/Listening.astro`, `site-api /api/listening`) — Recent listening status from Last.fm, with client-side home hydration and iTunes enrichment for preview URLs and stronger artwork
4. **GitHub Contributions** (`src/features/home/ui/GitHubContributions.astro`, `site-api /api/github/contributions`) — Contribution graph from an API backed by GitHub GraphQL, with the public contributions API as a fallback
5. **Telegram/BroadcastChannel** — Mood pages render base post content from the D1 archive, then hydrate visible comment counts and reactions from the live Telegram mirror. The live reader remains the fallback when archive reads fail.
6. **Better Stack Status Page** (`site-api /api/footer`) — Footer service status from `https://status.tuuhub.com/index.json`
7. **YouTube** (`src/features/posts/server/youtube.ts`, `src/lib/embed/youtube.ts`) — Server rendering reads bounded oEmbed metadata. Posters are fetched by the public `site` Worker through the fixed `/static/youtube/<id>/<quality>.jpg` route; the official Player API and `youtube-nocookie.com` iframe load in the browser only after playback is requested.

## API Endpoints

**Public JSON, served by `site-api` on `buxx.me/api/*`:**
- `GET|HEAD /api/ping` — Tiny uncached uptime endpoint for Better Stack monitors.
- `GET /api/footer` — Cached footer status proxy backed by the Better Stack status page JSON API.
- `GET /api/edge` — Uncached per-request edge diagnostics from Cloudflare `request.cf` (colo, protocol, TLS, TCP RTT, approximate visitor location, network) for the footer hover popover. Never cached, since values are visitor-specific.
- `GET /api/github/contributions` — Cached GitHub contribution calendar for the homepage activity graph; `days` narrows the returned contribution days while preserving the last-year total.
- `GET /api/health` — Lightweight compatibility health response for stale monitors. Use `?diagnostic=1` for the owner diagnostic report; add `&deep=1` for slower external probes.
- `GET /api/moods` — Live mood feed with pagination (`?before=<id>`), used for freshness probes and live fallback
- `GET /api/v2/mood` — Archive mood feed used for the default base render
- `GET /api/v2/moods/live-counts?ids=<id,...>` — Batched live comments/reactions for visible archive-rendered posts
- `GET /api/comments` — Comments
- `GET /api/oembed.json` — oEmbed endpoint (docs: `docs/OEMBED-API.md`)

**Machine ingress (`site-api`):**
- `api.buxx.me` is machine ingress, not the canonical public API surface.
- `/api/v1/mood*` — live Telegram mirror for comments, reactions, freshness probes, and archive fallback.
- `/api/v2/mood*` — D1 archive / structured base render for public mood pages, search, AI, debugging, and ops.
- Admin/OAuth/notify/webhook/image routes are owned by `site-api`, not by this public Worker.

**Owner auth surface:**
- `GET /oauth` — Short public entry that redirects to the protected OAuth hub.
- The owner-auth boundary is enforced in `src/middleware.ts` + `src/features/admin/server/access.ts`; see [OAUTH-HUB.md](./OAUTH-HUB.md) for the credential roadmap. (The former `/dev/portal/oauth` UI page was removed.)

**Public asset proxy, served by the `site` Worker:**
- `GET|HEAD /static/youtube/<11-character-id>/<maxresdefault|hqdefault>.jpg` — Fixed YouTube poster proxy. The route rejects query strings and arbitrary `i.ytimg.com` targets; no signing secret is exposed to client-rendered Mood cards.

Telegram references:

- `docs/TELEGRAM-PIPELINE.md`
- `docs/debug/README.md` for local-only investigation notes and temporary debug artifacts

**SVG** (all accept `?theme=light|dark`):
- `GET /api/status.svg`, `GET /api/tech-stack.svg`, `GET /api/site-badge.svg`
- `GET /api/project.svg` (requires `?project=<name>`)
- SVG font stacks come from `src/lib/fonts.ts`, which mirrors the CSS font tokens for server-rendered documents.
- Full docs: `docs/SVG-API.md`

**RSS:** `GET /mood/rss.xml`

## Agent Markdown and Edge Cache Policy

Content routes with Markdown renderers negotiate on `Accept`. A request that explicitly ranks `text/markdown` at least as high as `text/html` receives `text/markdown; charset=utf-8`; browsers and wildcard-only clients receive HTML. Both variants set `Vary: Accept`, and Markdown responses also set `x-markdown-tokens` using the approximate `Math.ceil(chars / 4)` estimator.

Blog Markdown is generated during `bun run build` under `dist/client/_agent-markdown/blog/*` and served through the Worker from static assets. Mood Markdown stays runtime-rendered because it reads the live feed/archive.

The edge cache key includes the negotiated variant (`html` or `markdown`) plus path and query string, so HTML and Markdown can never share a cache entry. `/dev`, `/oauth*`, `/api*`, and `/v2*` are `no-store` and never negotiate Markdown.

| Route family | Cache-Control | Edge cache |
| --- | --- | --- |
| `/mood` | `public, max-age=0, s-maxage=300, stale-while-revalidate=1800`; numeric anchor URLs share ten-post cache buckets | HTML and Markdown, variant-keyed |
| `/mood/[id]` | `public, max-age=0, s-maxage=300, stale-while-revalidate=1800` for HTML; Markdown uses `s-maxage=300` | HTML and Markdown, variant-keyed |
| `/blog`, `/blog/tags`, `/blog/tag/[slug]` | `public, max-age=0, s-maxage=120` for HTML and Markdown | HTML and Markdown, variant-keyed |
| `/blog/[slug]` | `public, max-age=0, s-maxage=300` for HTML and Markdown | HTML and Markdown, variant-keyed |
| `/` | `public, max-age=0, s-maxage=300` for HTML and Markdown | Markdown only |
| `/privacy` | `public, max-age=0, s-maxage=3600` for HTML and Markdown | Markdown only |
| `/projects` | `public, max-age=0, s-maxage=300` | Cache-Control only |
| `/llms.txt` | `public, max-age=0, s-maxage=300` | Cache-Control only |
| `/blog/rss.xml`, `/mood/rss.xml`, `/sitemap.xml` | `public, max-age=0, s-maxage=300` | Cache-Control only |
| `/dev`, `/oauth*`, `/api*`, `/v2*` | `no-store, max-age=0` | None |

## Environment Variables

Accessed via `import.meta.env.*`:
- `PUBLIC_GHOST_URL` — Ghost CMS URL (default: https://blog.buxx.me)
- `GHOST_CONTENT_API_KEY` — Ghost CMS content API key; required in the Cloudflare build environment for the prerendered Writing section
- `PUBLIC_BLOG_OG_IMAGE_ENDPOINT` — OGIS endpoint for generated `/blog` Open Graph images
- `GITHUB_TOKEN` — GitHub GraphQL token for project data
- `PUBLIC_HD_IMAGE_URL` — HD mood image base URL served by `site-api`
- `MOOD_READ_SOURCE` — `archive` (default base render) or `live` (immediate rollback); `?source=live|archive` overrides one request without caching it
- `CHANNEL` — Telegram public channel slug used for media-group indexing
- `TELEGRAM_HOST` — Telegram public host for embed lookups (default: `t.me`)
- `LASTFM_API_KEY`, `LASTFM_USER` — Last.fm recent tracks integration for the home listening widget
- `PUBLIC_SITE_URL`, `SITE_URL` — canonical base URLs for email links, previews, and health checks

Cloudflare Worker bindings and non-secret vars are defined in [`wrangler.jsonc`](../wrangler.jsonc):

- `API` — Cloudflare Worker service binding to `site-api`

## Key Dependencies

- **gsap** — Animation library (used in mood feed update notice, mobile header actions, and home reveals)
- **cheerio** — HTML parsing for Telegram/mood content
- **ofetch** — HTTP client for API calls
- **dayjs** — Date formatting
- **prismjs** — Syntax highlighting in mood posts
- **lru-cache** — In-memory caching for API responses
