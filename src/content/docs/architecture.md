---
title: Architecture
description: Which Worker serves what, where the code lives, where data comes from, how caching works, and env vars.
group: Start
order: 1
---

How buxx.me runs: the two Workers, the directory layout, the data sources, the
endpoint index, the cache policy and the environment variables. Read it before
you change routing, caching or configuration.

## Runtime shape

Two Cloudflare Workers serve the site.

| Worker | Serves |
| --- | --- |
| `site` (public) | The Astro site on `buxx.me` and `www.buxx.me`. |
| `site-api` (private) | `buxx.me/api/*`, through Cloudflare route patterns. Also machine traffic on `api.buxx.me`: webhooks, notify, image processing, archive reads and internal automation. |

The public `site` Worker keeps a thin `/api/*` fallback
(`src/pages/api/[...path].ts`). Whether it runs depends on the environment:

| Environment | How the fallback reaches `site-api` |
| --- | --- |
| Production | Not used. Cloudflare routes `/api/*` straight to `site-api`. |
| Preview deployments, `bun preview` (`wrangler dev`) | Over the `API` service binding. |
| `astro dev` | No bindings exist, so it forwards over plain HTTP to `API_DEV_ORIGIN` (default `https://buxx.me`). See [Local development](/docs/development#how-dev-differs-from-production). |

The `API` binding is still live in production. The `site` Worker uses it for
`/oauth*`, the `/reader/*` pages, the `/dev/portal` pages and their API proxy,
and server-side mood reads.

Mood pages render their base content from the D1 archive by default
(`MOOD_READ_SOURCE=archive`). The live Telegram reader is a bounded fallback, and
it also supplies the freshness-sensitive comments and reactions.

## Key directories

| Directory | What's in it |
| --- | --- |
| `src/pages/` | File-based routing: `index.astro` (home: the desk, or the legacy home without the desk's key), `legacy.astro` (the legacy home), `new.astro` (redirect to `/`), `mood.astro` (feed shell and route bootstrap), `mood/[id].astro` (detail shell and route bootstrap), `mood/embed.astro` (embeddable widget), and `dev/blog/[id].astro` (authenticated Ghost draft preview). |
| `src/pages/api/` | A thin catch-all proxy that falls back to `site-api`. The concrete API implementations live in the private `site-api` repo. |
| `src/pages/dev/` | The owner's dev portal and Ghost draft preview, behind Cloudflare Access, plus a narrow `/dev/portal/api/*` proxy to the `site-api` admin API. The portal is one client app: `dev/portal/[...path].astro` mounts it from `src/features/portal/`. |
| `src/pages/oauth*` | `/oauth` and `/oauth/*` forward to `site-api` over the `API` binding (reader sign-in lives there). `/oauth/login` is answered here. |
| `src/middleware.ts` | Astro middleware. It sets security, cache and `Vary` headers, and gates `/dev` and `/dev/*` with a Cloudflare Access identity (or the dev bypass). Under `astro dev` it also answers canonical redirects, agent Markdown and legacy blog redirects, which `src/worker.ts` handles in production. |
| `src/features/` | Feature-private code. `src/features/home/ui/` holds the home-route sections and their private UI helpers. `src/features/mood/` holds the mood client controllers, the feed renderer, media and update modules, server services, shared helpers, and private Astro UI shells in `ui/`. |
| `src/features/logos/` | Pixel mascot definitions, SVG rendering helpers, and the animated logo UI used by the navbar and the favicon route. |
| `src/lib/` | Shared utilities: `e2e.ts` (shared E2E fixture flag), `utils.ts` (cn/clsx utility), `fonts.ts` (server-side mirrors of the font tokens), `runtime/env.ts`, `http/*`, and `media/responsive-image.ts`. |
| `src/components/coss/` | Primitives built on Base UI, used by the admin portal. |
| `src/layouts/` | `Layout.astro`, the base layout for the public site. The admin portal uses no layout: its page, `src/pages/dev/portal/[...path].astro`, mounts the client app under `.theme-portal`. |
| `src/styles/` | `globals.css`: Tailwind directives, the HSL CSS-variable color system, the shared font tokens (`--font-mono`, `--font-code`, `--font-sans`, `--font-display`), and the `.theme-portal` token scope. Public pages load it through `public.css`, which leaves the portal's and the coss kit's sources out of Tailwind's scan; the portal loads it whole. |

## Component patterns

- **Astro components** (`.astro`): frontmatter between `---` fences for
  build-time data fetching, scoped `<style>`, and inline `<script>` for
  client-side behavior.
- **React components** (`.tsx`): used selectively for interactive UI. Icons come
  from `lucide-react`.
- **Animation**: GSAP drives the mood feed update notice, the mobile header
  button collapse, and the home-page reveals. Intersection Observer handles lazy
  hydration and scroll state. Custom CSS handles the typewriter and marquee
  effects.

## Styling

- TailwindCSS with the `class` dark mode strategy.
- A custom color system of CSS variables (HSL format) in `globals.css`.
- The `tailwindcss-animate` plugin for animation utilities.

## Locale and copy

`blog.locale` in `src/data/site.ts` sets the language for each surface (a
top-level section of the site):

- `home` is English.
- `blog` is Chinese.
- `default` covers everything else.

The strings live in two places, split by where they have to render:

1. **`blog.copy[locale]` in `src/data/site.ts`** holds the page chrome: the
   publication name and tagline, the AI co-author credit, the whole subscribe
   panel, and the share buttons. It is server-rendered only. `site.ts` must never
   be imported into a client bundle. So the few strings a client controller
   writes later (subscribe outcomes, the copied-link label) are stamped onto the
   DOM as `data-*` attributes and read back from there.
2. **`src/features/comments/copy.ts`** holds everything the comment thread says.
   It is separate because `client/comments-controller.ts` renders rows in the
   browser and needs the table there. `CommentsSection.astro` stamps
   `data-locale` on the thread root, and `copyFor(node)` resolves a locale from
   any descendant. This keeps the server and client renderers on the same
   language.

To add a string, add it to the interface first. Both tables are `satisfies
Record<BlogLocale, …>`, so a missing translation fails the type check instead of
rendering an English page.

## Data sources

| Source | Code | What it provides |
| --- | --- | --- |
| Ghost CMS | `src/features/posts/server/content.ts`, `src/features/posts/server/ghost-admin.ts` | Blog posts. See [Ghost](#ghost). |
| Project cards | `src/features/home/ui/Projects.astro` | Local project-card UI. |
| Last.fm and Apple iTunes Search | `src/features/home/ui/Listening.astro`, `site-api /api/listening` | Recent listening status from Last.fm. The home page hydrates it in the client, and iTunes adds preview URLs and stronger artwork. |
| GitHub contributions | `src/features/home/ui/GitHubContributions.astro`, `site-api /api/github/contributions` | The contribution graph, from an API backed by GitHub GraphQL. The public contributions API is the fallback. |
| Telegram/BroadcastChannel | | Mood posts. See [Telegram](#telegram). |
| Better Stack status page | `site-api /api/footer` | Footer service status from `https://status.tuuhub.com/index.json`. |
| YouTube | `src/features/posts/server/youtube.ts`, `src/lib/embed/youtube.ts` | Video facades in posts and mood cards. See [YouTube](#youtube). |

### Ghost

Public blog posts come from the Content API during builds. Discovery surfaces
read `getListedPosts()`. Direct slug route generation reads
`getAccessiblePosts()`.

Two kinds of internal tag change where a post appears:

| Tag | Effect |
| --- | --- |
| `#unlisted` (`hash-unlisted`) | The public post stays reachable by slug but is removed from lists, archives, feeds, sitemaps, search, agent indexes and notification sources. |
| `#<locale>:<canonical>`, e.g. `#en:lun-chenmo` | The post is a translation of the post at `<canonical>`. `getListedPosts()` drops it, so every listing stays single-language. It is built at `/blog/<locale>/<canonical>` instead of at its own slug, and its own slug answers with a `301`. |

See `src/features/posts/i18n.ts` and
[Translations](/docs/writing/publishing#translations).

Local draft previews use the server-only Admin API. Its credential never reaches
the browser.

### Telegram

Mood pages render base post content from the D1 archive. They then hydrate
visible comment counts and reactions from the live Telegram mirror. When archive
reads fail, the live reader is the fallback.

### YouTube

Server rendering turns both blog directives and Ghost YouTube iframe cards into
the shared facade (a static stand-in for the player), then reads bounded oEmbed
metadata. Mood cards render in the client and hydrate the real channel name
through the same first-party metadata boundary.

The public `site` Worker fetches posters, channel avatars and channel metadata
through fixed `/static/youtube/<id>/...` routes. The official Player API and the
`youtube-nocookie.com` iframe load in the browser only after the reader asks for
playback.

## API endpoints

A short index of each endpoint and the Worker that serves it. Parameters,
schemas, error codes, cache TTLs and rate limits are in the API reference:
[Overview](/docs/api/overview), [Mood](/docs/api/mood),
[Notify](/docs/api/notify), and the rest of that group.

Public JSON, served by `site-api` on `buxx.me/api/*`:

| Endpoint | What it is | Reference |
| --- | --- | --- |
| `GET`, `HEAD /api/ping`, `GET /api/health` | Uptime probe and compatibility health response. `health?diagnostic=1` adds the owner report, and `&deep=1` adds external probes. | [Status](/docs/api/status) |
| `GET /api/footer` | Better Stack status proxy behind the footer pill. | [Status](/docs/api/status#footer-status) |
| `GET /api/edge` | Per-request Cloudflare facts for the footer popover. Never cached, because the values are visitor-specific. | [Status](/docs/api/status#edge) |
| `GET /api/v2/mood*` | Archive feed, detail, comments, search and stats. This is the default base render. | [Mood](/docs/api/mood) |
| `GET /api/v1/mood*`, `GET /api/moods` | Live Telegram mirror, for freshness probes and archive fallback. | [Mood](/docs/api/mood) |
| `GET /api/v2/moods/live-counts`, `GET /api/v1/mood/meta` | Batched comment and reaction counts for posts already on the page. | [Mood](/docs/api/mood) |
| `GET /api/comments` | Public live comments read path for one mood post, used by the site's mood pages. | [Content](/docs/api/content#comments-by-post-id) |
| `GET /api/writing`, `GET /api/github/contributions`, `GET /api/musickit/token` | Ghost posts, the contribution grid, and the Apple MusicKit token. | [Content](/docs/api/content) |
| `GET /api/v2/listening`, `POST /api/v2/analytics/listening` | The now-playing track, and the player's own playback events. | [Listening](/docs/api/listening) |
| `GET /api/oembed.json` | oEmbed discovery for mood embeds. | [oEmbed](/docs/api/oembed) |
| `/notify/*` | Mood update email subscriptions, gated by Turnstile. | [Notify](/docs/api/notify) |
| `GET /api/v2/posts*` | Disabled placeholder behind `ENABLE_POSTS_API`. | [Content](/docs/api/content#posts-not-enabled) |

Everything else on the URL surface:

| Surface | Owner | Notes |
| --- | --- | --- |
| `api.buxx.me` | `site-api` | Machine ingress for webhooks, notify, image processing, archive reads and ops. It is not the canonical public API host. |
| Admin, OAuth, webhook, and image routes | `site-api` | Listed without contracts in [Internal Endpoints](/docs/api/internal). |
| `/oauth`, `/oauth/*` | `site` → `site-api` | The `site` Worker forwards these to `site-api` over the `API` binding, where the reader sign-in routes live. A bare `/oauth` has no page and returns `404`. `/oauth/login` is answered by `site`: a same-origin redirect to `?next=`, default `/dev/portal`. The `/dev` boundary itself is `src/middleware.ts` + `src/features/admin/server/access.ts`. See [Auth](/docs/platform/auth). |
| `GET /dev/blog/<24-char post id>` | `site` | A Ghost draft rendered through the production pipeline, behind owner auth. Private and uncached. |
| `GET`, `HEAD /static/*` | `site` | Allowlisted media proxy, including the fixed YouTube poster, avatar and metadata routes. |
| SVG badges, `/logo/{id}.svg` | `site` | All of them take `?theme=light\|dark`. `project.svg` also needs `?project=`. See [SVG](/docs/api/svg). |
| `GET /mood/rss.xml`, `/blog/rss.xml`, `/llms.txt`, `/sitemap.xml` | `site` | See [Feeds](/docs/api/feeds). |

[Telegram pipeline](/docs/platform/telegram) documents Telegram ingest.
`notes/debug/README.md` in the repo holds local-only investigation notes.

## Agent Markdown and edge cache policy

The public Worker serves Markdown to agents and caches responses in two layers.

### Paths the Worker sees first

Cloudflare's Static Assets layer serves a matching file directly and skips the
Worker. None of the logic below runs in that case. So every path with a
Markdown renderer (`/`, `/blog*`, `/docs*`, `/mood*`, `/privacy*`,
`/projects*`) is also listed in `assets.run_worker_first` in `wrangler.jsonc`.
Both `/docs` and `/docs/*` are listed, matching the split already used for
`/dev` and `/dev/*`.

### Markdown negotiation

Content routes with a Markdown renderer expose an explicit `<page>/index.md`
URL. They also negotiate on `Accept` at the canonical URL:

- A request that ranks `text/markdown` at least as high as `text/html` gets
  `text/markdown; charset=utf-8`.
- Browsers and wildcard-only clients get HTML.
- Explicit Markdown URLs need no special header.

Both variants set `Vary: Accept`. Markdown responses also set
`x-markdown-tokens`, estimated as `Math.ceil(chars / 4)`. Documentation pages use
their collection source as the Markdown body.

### Trailing slashes

Public page URLs are canonical without a trailing slash. Astro emits file-style
HTML, and Cloudflare Assets uses `drop-trailing-slash`. For a slash-suffixed
request, the Worker returns a `308` and keeps the query string and HTTP method.
Markdown alternates keep `/index.md`. The shorthand `<page>.md` redirects there.

### Blog and Mood Markdown

`bun run build` generates blog Markdown under
`dist/client/_agent-markdown/blog/*`. The Worker serves it from static assets.

- **Unlisted posts and their translations** are generated under
  `_agent-markdown/blog/unlisted/*`. The Worker tries that path after the listed
  path and serves it with `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`.
  The raw `/_agent-markdown/*` assets get the same directives from
  `public/_headers`. Their HTML uses the same robots directives and
  `data-pagefind-ignore="all"`.
- **Posts missing from the build.** With an assets binding, the build output is
  authoritative for any post it holds. A post missing from both paths falls
  through to a live Ghost read instead of a hard `404`. This covers a post
  published after the last build. A post that is missing from Ghost too still
  ends in a `404`, which the platform may cache for 300 seconds.
- **`astro dev`** has no assets binding, so it always renders blog Markdown from
  Ghost per request.

Mood Markdown is rendered at runtime, because it reads the live feed and archive.

### Cache layers

Workers Caching sits in front of the public Worker. A platform hit avoids a
Worker invocation. The in-worker Cache API only saves the render, after the
Worker is already running.

| Layer | Cache key |
| --- | --- |
| Platform (Workers Caching) | The raw URL and `Vary` headers, including `Host`, `Cookie`, and `Accept-Language` where they affect the representation. Also the Worker version. |
| In-worker Cache API | The negotiated variant (`html` or `markdown`), plus path and normalized query. Home, privacy, blog, docs, and Mood Markdown keys also include the build ID. |

Because the variant is in the key, HTML and Markdown can't share an entry. The
build ID stops cached content from outliving the asset version it references.

Workers Caching keys by Worker version (`cross_version_cache` stays off), so a
deploy starts both layers cold. What's left is rollout skew: for a moment the
edge can serve the old version's HTML while static assets already come from the
new version. `build:cloudflare` closes that gap by carrying the previous build's
`/_astro/*` files into the next deploy. See
[Worker](/docs/platform/worker#ghost-publishing-hook). Purging on deploy wouldn't
help, because the stale HTML isn't a cache leak.

`/dev`, `/oauth*`, `/api*`, and `/v2*` are `no-store` on the public Worker and
never negotiate Markdown.

### Platform freshness

`Cloudflare-CDN-Cache-Control` sets platform freshness separately from the
browser-facing headers in the table below.

- Platform-eligible routes use a `max-age` that matches the route TTL, with
  `stale-while-revalidate=86400` by default.
- Mood feed and detail use a 1800-second platform stale window.
- `stale-if-error` is set to the same window, so the platform's default
  unbounded stale-on-error behavior never applies.
- A `304` gets the same freshness policy as a `200`. Otherwise Static Assets
  defaults would force every later request to revalidate.
- Browsers still get `max-age=0`.

If refreshes keep failing, background refresh can serve an old entry for its
whole stale window. The window doesn't guarantee a successful update after one
request.

Prerendered routes and build-generated Markdown change only on deploy, and a
deploy starts both cache layers cold. So their platform TTL is 86400 seconds.
`Cache-Control: s-maxage` also reaches shared caches outside Cloudflare, which a
deploy can't clear. It stays at 300 seconds (3600 for `/privacy`), so no outside
copy outlives the previous build's carried-over `/_astro/*` files.

| Route family | Cache-Control | In-worker cache |
| --- | --- | --- |
| `/mood` | `public, max-age=0, s-maxage=300, stale-while-revalidate=1800` for HTML | Markdown only. The platform caches HTML. |
| `/mood/[id]` | `public, max-age=0, s-maxage=300, stale-while-revalidate=1800` for HTML. Markdown uses `s-maxage=300` | Markdown only. The platform caches HTML. |
| `/mood/embed` | `public, max-age=0, s-maxage=300` for supported embed parameters | HTML, keyed by query |
| `/blog`, `/blog/tags`, `/blog/tag/[slug]` | `public, max-age=0, s-maxage=300` for HTML and Markdown. Platform `max-age=86400` | HTML and Markdown, keyed by variant |
| `/blog/[slug]`, `/blog/[locale]/[slug]` | `public, max-age=0, s-maxage=300` for HTML and Markdown. Platform `max-age=86400` | HTML and Markdown, keyed by variant |
| `/` | `public, max-age=0, s-maxage=300` for HTML and Markdown. Platform `max-age=86400` | HTML and Markdown, keyed by variant |
| `/privacy` | `public, max-age=0, s-maxage=3600` for HTML and Markdown. Platform `max-age=86400` | Markdown only |
| `/docs`, `/docs/{path}` | HTML: `public, max-age=0, s-maxage=300, stale-while-revalidate=86400`, set by `public/_headers` on the asset layer instead of `getContentRoutePolicy`. Markdown: `public, max-age=0, s-maxage=3600`, platform `max-age=3600` | Markdown only, keyed by variant |
| `/projects`, `/llms.txt`, `/blog/rss.xml`, `/sitemap.xml` | `public, max-age=0, s-maxage=300`. Platform `max-age=86400` | Cache-Control only |
| `/mood/rss.xml` | `public, max-age=0, s-maxage=300` | Cache-Control only |
| `/dev`, `/oauth*`, `/api*`, `/v2*` | `no-store, max-age=0` | None |

### Incomplete Mood renders

Mood pages declare an incomplete render in page frontmatter, before streaming
starts. These cases become `no-store` in both layers:

- an empty initial feed
- an unavailable anchor window
- a detail awaiting its link preview

A detail counts as awaiting its preview only while it is a text post under six
hours old (the backfill's window). Older posts and media captions are cached
without one. The Worker consumes the internal readiness header before the
response leaves.

Cache writes pass the response stream to the native Cache API. They don't
convert the whole HTML body into a string or scan for DOM markers. Mood feed and
detail HTML skip the in-worker cache entirely: no Cache API read, write, response
clone, or background revalidation task. Other cache users keep the streaming
writer. The development memory fallback materializes bytes, because it must
support repeated reads.

### Language and Vary

Mood feed and detail negotiate the reader's language from the query, the
`blog_lang` cookie, and `Accept-Language`. Responses keep `Vary: Cookie,
Accept-Language, Accept, Host`. Workers Cache honors every listed header and
stores a separate variant for each exact header value, including anonymous and
cookie-bearing requests. Different cookies can add cache entries even when they
resolve to the same language. There is no extra gateway or language redirect.

Every representation of a negotiated URL uses the same ordered variance. That
includes Markdown cache hits, redirects, errors, and bodyless 304 responses. A
different Vary list can replace the platform's per-URL variant metadata, and
make HTML and Markdown evict each other before their TTL expires.

Supported Mood embed queries are language-independent and eligible for platform
caching. Unsupported query shapes, detail query overrides, and refresh requests
stay uncacheable. Feed anchors use the raw URL as the platform key; the former
native ten-post buckets are gone. Blog translations use distinct
`/blog/<locale>/<slug>` URLs and need no cookie negotiation. `Vary: Accept` is
still required for Markdown negotiation.

### Host variance

Workers Cache doesn't include the hostname in its base key. So the public Worker
adds `Vary: Host` at its outer response boundary, including redirects, Markdown,
and conditional responses. The API's host-dependent oEmbed response also varies
by Host. This stops a cached apex response from bypassing a www redirect or a
host-dependent URL check. Bodyless `304` responses keep the full original
negotiation dimensions instead of replacing them with Host alone.

### The API Worker

The private API Worker defaults any response without an explicit cache policy to
`no-store, max-age=0`, including handlers outside Astro middleware. Public
exceptions opt in explicitly. Workers Caching is enabled after route sweeps on an
isolated deployment and on production.

These responses declare explicit CDN freshness:

- public Mood JSON
- badge and oEmbed responses
- `GET /api/v2/comments` and `GET /api/v2/reactions`, for requests with no reader
  session or `reader_anon` cookie (30 seconds, `Vary: Cookie`; see
  [Comments](/docs/api/comments#list-comments))

Private routes and worker-generated errors stay uncached. Service-binding calls
consult the callee's cache, with distinct entries when their raw paths or
variance headers differ.

## Environment variables

The site reads these through `import.meta.env.*`:

| Variable | Required | What it does |
| --- | --- | --- |
| `PUBLIC_GHOST_URL` | Yes | Ghost CMS URL. Defaults to `https://blog.buxx.me`. |
| `GHOST_CONTENT_API_KEY` | Yes in CI | Ghost Content API key. The Cloudflare build environment needs it for the prerendered Writing section. |
| `GHOST_ADMIN_API_KEY` | No | Server-only Ghost Admin key for authenticated draft previews. A Worker secret in production, `.env.local` locally. **Never give it a `PUBLIC_` prefix.** |
| `PUBLIC_BLOG_OG_IMAGE_ENDPOINT` | No | OGIS endpoint for generated `/blog` Open Graph images. |
| `GITHUB_TOKEN` | No | GitHub GraphQL token for project card data. |
| `PUBLIC_HD_IMAGE_URL` | No | HD mood image base URL, served by `site-api`. |
| `MOOD_READ_SOURCE` | No | `archive` (default base render) or `live` (immediate rollback). `?source=live\|archive` overrides it for one request without caching the result. |
| `CHANNEL` | No | Telegram public channel slug used for media-group indexing. |
| `TELEGRAM_HOST` | No | Telegram public host for embed lookups. Defaults to `t.me`. |
| `PUBLIC_SITE_URL`, `SITE_URL` | Yes | Canonical base URLs for email links, previews and health checks. |

Cloudflare Worker bindings and non-secret vars are defined in
[`wrangler.jsonc`](https://github.com/bunizao/site/blob/main/wrangler.jsonc).
The Worker has three bindings: `ASSETS` (static assets), `API` (a service
binding to `site-api`) and `SESSION` (a KV namespace for Astro sessions).

## Key dependencies

- **gsap**: animation (the mood feed update notice, mobile header actions, and
  home reveals).
- **cheerio**: HTML parsing for Telegram and mood content.
- **ofetch**: HTTP client for API calls.
- **dayjs**: date formatting.
- **prismjs**: syntax highlighting in mood posts.
- **lru-cache**: in-memory caching for API responses.
