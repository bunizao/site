---
title: Architecture
description: Runtime shape, directory layout, data sources, endpoints, cache policy, and environment variables.
group: Start
order: 1
---

## Runtime Shape

The Cloudflare Worker `site` is the public runtime target for `buxx.me` and `www.buxx.me`. It serves the Astro site.

Private API ownership lives in the separate `site-api` Worker. `site-api` directly owns `buxx.me/api/*` through Cloudflare route patterns and owns machine ingress at `api.buxx.me` for webhooks, notify, image processing, archive reads, and internal automation. Mood pages use the D1 archive as their default base render (`MOOD_READ_SOURCE=archive`), with the live Telegram reader as a bounded fallback and for freshness-sensitive comments and reactions. The public `site` Worker keeps only a thin `/api/*` service-binding fallback for local and preview environments.

## Key Directories

- **`src/pages/`** — File-based routing. Includes `index.astro` (home), `mood.astro` (feed shell + route bootstrap), `mood/[id].astro` (detail shell + route bootstrap), `mood/embed.astro` (embeddable widget), and `dev/blog/[id].astro` (authenticated Ghost draft preview)
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

## Locale and Copy

The blog picks its language per surface in `blog.locale` (`src/data/site.ts`):
`home` is English, `blog` is Chinese, `default` covers everything else. There
are two places the words themselves live, split by where they have to be
rendered:

1. **`blog.copy[locale]` in `src/data/site.ts`** — page chrome: publication
   name and tagline, the AI co-author credit, the whole subscribe panel, and
   the share buttons. Server-rendered only. `site.ts`
   must never be imported into a client bundle, so the few strings a client
   controller writes after the fact (subscribe outcomes, the copied-link
   label) are stamped onto the DOM as `data-*` attributes and read back from
   there.
2. **`src/features/comments/copy.ts`** — everything the comment thread says.
   It lives apart because `client/comments-controller.ts` renders rows in the
   browser and needs the table there. `CommentsSection.astro` stamps
   `data-locale` on the thread root; `copyFor(node)` resolves a locale from
   any descendant, which is what keeps the server renderer and the client
   renderer from drifting apart on language.

Add a string to the interface first — both tables are `satisfies
Record<BlogLocale, …>`, so a missing translation is a type error, not a
silently English page.

## Data Sources

1. **Ghost CMS** (`src/features/posts/server/content.ts`, `src/features/posts/server/ghost-admin.ts`) — Public blog posts use the Content API during builds. Discovery surfaces read `getListedPosts()`, while direct slug route generation reads `getAccessiblePosts()`. A public post carrying the internal Ghost tag `#unlisted` (`hash-unlisted`) remains reachable by slug but is removed from lists, archives, feeds, sitemaps, search, agent indexes, and notification sources. A post carrying a `#<locale>:<canonical>` tag (e.g. `#en:lun-chenmo`) is a translation of the post at `<canonical>`: `getListedPosts()` drops it so every listing stays single-language, and it is served from the canonical URL under `?lang=<locale>` rather than from its own build path. See `src/features/posts/i18n.ts` and `plans/blog-i18n.md`. Local draft previews use the server-only Admin API and never expose its credential to the browser.
2. **Project cards** (`src/features/home/ui/Projects.astro`) — Local project-card UI.
3. **Last.fm + Apple iTunes Search** (`src/features/home/ui/Listening.astro`, `site-api /api/listening`) — Recent listening status from Last.fm, with client-side home hydration and iTunes enrichment for preview URLs and stronger artwork
4. **GitHub Contributions** (`src/features/home/ui/GitHubContributions.astro`, `site-api /api/github/contributions`) — Contribution graph from an API backed by GitHub GraphQL, with the public contributions API as a fallback
5. **Telegram/BroadcastChannel** — Mood pages render base post content from the D1 archive, then hydrate visible comment counts and reactions from the live Telegram mirror. The live reader remains the fallback when archive reads fail.
6. **Better Stack Status Page** (`site-api /api/footer`) — Footer service status from `https://status.tuuhub.com/index.json`
7. **YouTube** (`src/features/posts/server/youtube.ts`, `src/lib/embed/youtube.ts`) — Server rendering converts both blog directives and Ghost YouTube iframe cards into the shared facade, then reads bounded oEmbed metadata. Client-rendered Mood cards hydrate the real channel name through the same first-party metadata boundary. Posters, channel avatars, and channel metadata are fetched by the public `site` Worker through fixed `/static/youtube/<id>/...` routes; the official Player API and `youtube-nocookie.com` iframe load in the browser only after playback is requested.

## API Endpoints

This is a short index of what exists and who owns it. Parameter tables,
schemas, error codes, cache TTLs, and rate limits live in the API reference —
[Overview](/docs/api/overview), [Mood](/docs/api/mood),
[Notify](/docs/api/notify), and the rest of that group.

Public JSON, served by `site-api` on `buxx.me/api/*`:

| Endpoint | What it is | Reference |
| --- | --- | --- |
| `GET`, `HEAD /api/ping`, `GET /api/health` | Uptime probe and compatibility health response. `health?diagnostic=1` adds the owner report, `&deep=1` adds external probes. | [Status](/docs/api/status) |
| `GET /api/footer` | Better Stack status proxy behind the footer pill. | [Status](/docs/api/status#footer-status) |
| `GET /api/edge` | Per-request Cloudflare facts for the footer popover. Never cached — the values are visitor-specific. | [Status](/docs/api/status#edge) |
| `GET /api/v2/mood*` | Archive feed, detail, comments, search, stats — the default base render. | [Mood](/docs/api/mood) |
| `GET /api/v1/mood*`, `GET /api/moods` | Live Telegram mirror: freshness probes and archive fallback. | [Mood](/docs/api/mood) |
| `GET /api/v2/moods/live-counts`, `GET /api/v1/mood/meta` | Batched comment and reaction counts for already-rendered posts. | [Mood](/docs/api/mood) |
| `GET /api/comments` | Legacy alias of the live comments read path. | [Content](/docs/api/content#comments-by-post-id) |
| `GET /api/writing`, `GET /api/github/contributions`, `GET /api/musickit/token` | Ghost posts, the contribution grid, and the Apple MusicKit token. | [Content](/docs/api/content) |
| `GET /api/v2/listening`, `POST /api/v2/analytics/listening` | Now-playing track and the player's own playback events. | [Listening](/docs/api/listening) |
| `GET /api/oembed.json` | oEmbed discovery for mood embeds. | [oEmbed](/docs/api/oembed) |
| `/notify/*` | Mood update email subscriptions, Turnstile-gated. | [Notify](/docs/api/notify) |
| `GET /api/v2/posts*` | Disabled placeholder behind `ENABLE_POSTS_API`. | [Content](/docs/api/content#posts-not-enabled) |

Everything else on the URL surface:

| Surface | Owner | Notes |
| --- | --- | --- |
| `api.buxx.me` | `site-api` | Machine ingress for webhooks, notify, image processing, archive reads, and ops — not the canonical public API host. |
| Admin, OAuth, webhook, and image routes | `site-api` | Listed, not specified — see [Internal Endpoints](/docs/api/internal). |
| `GET /oauth` | `site` | Short public entry that redirects to the protected OAuth hub. The boundary itself is `src/middleware.ts` + `src/features/admin/server/access.ts`; see [Auth](/docs/platform/auth). |
| `GET /dev/blog/<24-char post id>` | `site` | Ghost draft rendered through the production pipeline, behind owner auth. Private and uncached. |
| `GET`, `HEAD /static/*` | `site` | Allowlisted media proxy, including the fixed YouTube poster, avatar, and metadata routes. |
| SVG badges, `/logo/{id}.svg` | `site` | `?theme=light\|dark` on all of them; `project.svg` also needs `?project=`. See [SVG](/docs/api/svg). |
| `GET /mood/rss.xml`, `/blog/rss.xml`, `/llms.txt`, `/sitemap.xml` | `site` | See [Feeds](/docs/api/feeds). |

Telegram ingest is documented in [Telegram pipeline](/docs/platform/telegram);
`notes/debug/README.md` in the repo holds local-only investigation notes.

## Agent Markdown and Edge Cache Policy

Content routes with Markdown renderers expose an explicit `<page>/index.md` URL and also negotiate on `Accept` at the canonical URL. A request that explicitly ranks `text/markdown` at least as high as `text/html` receives `text/markdown; charset=utf-8`; browsers and wildcard-only clients receive HTML. Explicit Markdown URLs require no special header. Both variants set `Vary: Accept`, and Markdown responses also set `x-markdown-tokens` using the approximate `Math.ceil(chars / 4)` estimator. Documentation pages use their collection source as the Markdown body.

Public page URLs are canonical without a trailing slash. Astro emits file-style HTML, Cloudflare Assets uses `drop-trailing-slash`, and the Worker returns a `308` for slash-suffixed requests while preserving the query string and HTTP method. Markdown alternates keep `/index.md`; the shorthand `<page>.md` redirects there.

Blog Markdown is generated during `bun run build` under `dist/client/_agent-markdown/blog/*` and served through the Worker from static assets. Unlisted posts do not receive a generated Markdown asset; direct `Accept: text/markdown` access falls back to runtime rendering with `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`. Their HTML uses the same robots directives and `data-pagefind-ignore="all"`. Mood Markdown stays runtime-rendered because it reads the live feed/archive.

The edge cache key includes the negotiated variant (`html` or `markdown`) plus path and query string, so HTML and Markdown can never share a cache entry. `/dev`, `/oauth*`, `/api*`, and `/v2*` are `no-store` and never negotiate Markdown.

| Route family | Cache-Control | Edge cache |
| --- | --- | --- |
| `/mood` | `public, max-age=0, s-maxage=300, stale-while-revalidate=1800`; numeric anchor URLs share ten-post cache buckets | HTML and Markdown, variant-keyed |
| `/mood/[id]` | `public, max-age=0, s-maxage=300, stale-while-revalidate=1800` for HTML; Markdown uses `s-maxage=300` | HTML and Markdown, variant-keyed |
| `/blog`, `/blog/tags`, `/blog/tag/[slug]` | `public, max-age=0, s-maxage=120` for HTML and Markdown | HTML and Markdown, variant-keyed |
| `/blog/[slug]` | `public, max-age=0, s-maxage=300` for HTML and Markdown | HTML and Markdown, variant-keyed |
| `/` | `public, max-age=0, s-maxage=300` for HTML and Markdown | HTML and Markdown, variant-keyed |
| `/privacy` | `public, max-age=0, s-maxage=3600` for HTML and Markdown | Markdown only |
| `/projects` | `public, max-age=0, s-maxage=300` | Cache-Control only |
| `/llms.txt` | `public, max-age=0, s-maxage=300` | Cache-Control only |
| `/blog/rss.xml`, `/mood/rss.xml`, `/sitemap.xml` | `public, max-age=0, s-maxage=300` | Cache-Control only |
| `/dev`, `/oauth*`, `/api*`, `/v2*` | `no-store, max-age=0` | None |

## Environment Variables

Accessed via `import.meta.env.*`:

| Variable | Required | What it does |
| --- | --- | --- |
| `PUBLIC_GHOST_URL` | Yes | Ghost CMS URL. Defaults to `https://blog.buxx.me`. |
| `GHOST_CONTENT_API_KEY` | Yes in CI | Ghost Content API key. The Cloudflare build environment needs it for the prerendered Writing section. |
| `GHOST_ADMIN_API_KEY` | No | Server-only Ghost Admin key for authenticated draft previews. Worker secret in production, `.env.local` locally. **Never give it a `PUBLIC_` prefix.** |
| `PUBLIC_BLOG_OG_IMAGE_ENDPOINT` | No | OGIS endpoint for generated `/blog` Open Graph images. |
| `GITHUB_TOKEN` | No | GitHub GraphQL token for project card data. |
| `PUBLIC_HD_IMAGE_URL` | No | HD mood image base URL served by `site-api`. |
| `MOOD_READ_SOURCE` | No | `archive` (default base render) or `live` (immediate rollback). `?source=live\|archive` overrides one request without caching it. |
| `CHANNEL` | No | Telegram public channel slug used for media-group indexing. |
| `TELEGRAM_HOST` | No | Telegram public host for embed lookups. Defaults to `t.me`. |
| `LASTFM_API_KEY`, `LASTFM_USER` | No | Last.fm recent tracks for the home listening widget. |
| `PUBLIC_SITE_URL`, `SITE_URL` | Yes | Canonical base URLs for email links, previews, and health checks. |

Cloudflare Worker bindings and non-secret vars are defined in
[`wrangler.jsonc`](https://github.com/bunizao/site/blob/main/wrangler.jsonc).
There is exactly one binding: `API`, a service binding to `site-api`.

## Key Dependencies

- **gsap** — Animation library (used in mood feed update notice, mobile header actions, and home reveals)
- **cheerio** — HTML parsing for Telegram/mood content
- **ofetch** — HTTP client for API calls
- **dayjs** — Date formatting
- **prismjs** — Syntax highlighting in mood posts
- **lru-cache** — In-memory caching for API responses
