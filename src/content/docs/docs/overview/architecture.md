---
title: Architecture
description: High-level map of the Astro app, the worker, and how the pieces fit together.
public: true
---

## The shape

buxx.me is split across two Cloudflare Workers. The public `site` Worker serves `buxx.me` and `www.buxx.me`. The private `site-api` Worker owns machine ingress at `api.buxx.me`: webhooks, notify, image processing, archive reads, and internal automation. `api.buxx.me` is not the canonical public API surface.

The private Worker directly owns `buxx.me/api/*` through Cloudflare route patterns. The public Worker keeps only a thin `/api/*` service-binding fallback for local and preview environments.

## Key directories

- `src/pages/` — file-based routing. `index.astro` (home), `mood.astro` (feed shell), `mood/[id].astro` (detail), `mood/embed.astro` (embeddable widget).
- `src/pages/api/` — thin catch-all fallback proxy to `site-api`; concrete API implementations live in the private `site-api` repo.
- `src/pages/dev/` and `src/pages/oauth/login.astro` — public admin UI routes. They call private admin APIs through `/v2/admin/*`.
- `src/middleware.ts` — Astro middleware that gates protected docs by checking the private admin session through the `API` service binding.
- `src/features/` — feature-private code (`home/`, `mood/`, `logos/`).
- `src/lib/` — shared utilities (HTTP, runtime env, media helpers).
- `src/layouts/` — `Layout.astro` for the public site, `PortalLayout.astro` for the admin portal.
- `src/styles/` — Tailwind directives, CSS variable color system, font wiring.

## Data sources

The site reads from six external sources:

- **Ghost CMS** — blog posts shown on the home page.
- **Project cards** — local card data and UI.
- **Last.fm + Apple Music search** — recent listening status, with iTunes enrichment for artwork and previews.
- **Telegram** — mood pages read through the live v1 Telegram mirror for realtime comments, reactions, and media. The private API also ingests Telegram updates into D1 as a structured archive.
- **GitHub contribution graph** — rendered into the home page.
- **Better Stack status** — footer service indicator.

## API surface

Public JSON: `/api/moods`, `/api/comments`, `/api/oembed.json`, `/api/footer`, `/api/health`. SVG generators (all accept `?theme=light|dark`): `/api/status.svg`, `/api/tech-stack.svg`, `/api/site-badge.svg`, `/api/project.svg`, `/api/activity-panel.svg`. RSS at `/mood/rss.xml`.

Machine mood API taxonomy: `/api/v1/mood*` is the live Telegram mirror and canonical upstream for user-facing mood reads; `/api/v2/mood*` is the D1 archive / structured read for search, AI, debugging, and ops. Admin data APIs, OAuth callbacks, notify, Telegram webhook, image ingest, scheduled notify work, and concrete public API implementations are private API responsibilities. The private API Worker does not render `/dev/*` UI.

## Styling

TailwindCSS with class-based dark mode. Color tokens are CSS variables in HSL. Type runs on four tokens defined once in `src/styles/globals.css` (mirrored in `src/lib/fonts.ts` for SVG/email): `--font-mono` (Geist Mono) is the public-site identity, `--font-code` (JetBrains Mono) is code and data readouts, `--font-sans` (Inter) is long-form reading prose via the `.reading` context, and `--font-display` (Geist Sans) powers the portal and these docs. The portal scopes its theme under `.theme-portal`.

## Component patterns

- `.astro` files: build-time data-fetching in the frontmatter, scoped `<style>`, inline `<script>` for client behavior.
- `.tsx` files: selective React, mostly inside the admin portal. Icons from `lucide-react`.
- Animations: GSAP for mood update notices, mobile header collapse, and home reveals; IntersectionObserver for lazy hydration; CSS for typewriter and marquee effects.
