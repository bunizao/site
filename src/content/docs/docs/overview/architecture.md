---
title: Architecture
description: High-level map of the Astro app, the worker, and how the pieces fit together.
public: true
---

## The shape

buxx.me is two pieces: an Astro app on Vercel that renders the public site and admin portal, and a Cloudflare Worker that owns Telegram ingestion, image storage, and the notify scheduler. They talk over HTTP — neither side imports the other.

Telegram is the source of truth for mood content. The Worker hears Telegram's webhook, pulls images into R2, and enqueues notify jobs. The Vercel app scrapes Telegram for the canonical post text, renders the mood feed and detail pages, sends emails through Resend, and stores subscriber state in Cloudflare D1 over the HTTP API.

## Key directories

- `src/pages/` — file-based routing. `index.astro` (home), `mood.astro` (feed shell), `mood/[id].astro` (detail), `mood/embed.astro` (embeddable widget).
- `src/pages/api/` — server endpoints (moods, comments, SVG generators, oEmbed, notify, admin).
- `src/pages/dev/portal/` — GitHub-OAuth-gated admin portal: overview, OAuth hub, subscribers, broadcasts, mascot inspector, newsletter preview.
- `src/middleware.ts` — Astro middleware that gates `/dev/portal/**`, protected `/docs/**` pages, and `/api/admin/**` against the `admin_session` cookie.
- `src/features/` — feature-private code (`home/`, `mood/`, `notify/`, `admin/`, `logos/`).
- `src/lib/` — shared utilities (GitHub API, security, HTTP, media helpers).
- `src/components/ui/` — shadcn/ui primitives used in the admin portal.
- `src/layouts/` — `Layout.astro` for the public site, `PortalLayout.astro` for the admin portal.
- `src/styles/` — Tailwind directives, CSS variable color system, font wiring.

## Data sources

The site reads from six external sources:

- **Ghost CMS** — blog posts shown on the home page.
- **GitHub GraphQL** — repository metadata and stars for project cards.
- **Last.fm + Apple Music search** — recent listening status, with iTunes enrichment for artwork and previews.
- **Telegram** — mood post bodies (scraped) and image bytes (via the Worker).
- **GitHub contribution graph** — rendered into the home page.
- **Better Stack status** — footer service indicator.

## API surface

Public JSON: `/api/moods`, `/api/comments`, `/api/oembed.json`, `/api/footer`, `/api/health`. SVG generators (all accept `?theme=light|dark`): `/api/status.svg`, `/api/tech-stack.svg`, `/api/site-badge.svg`, `/api/project.svg`, `/api/activity-panel.svg`. RSS at `/mood/rss.xml`.

Admin endpoints under `/api/admin/` are gated by the `admin_session` cookie. The Worker exposes `https://image.buxx.me/webhook` (Telegram), `https://image.buxx.me/mood/:postId/:imageIndex` (public reads), and authenticated `https://image.buxx.me/ingest/...` write paths.

## Styling

TailwindCSS with class-based dark mode. Color tokens are CSS variables in HSL. Type runs on four tokens defined once in `src/styles/globals.css` (mirrored in `src/lib/fonts.ts` for SVG/email): `--font-mono` (Geist Mono) is the public-site identity, `--font-code` (JetBrains Mono) is code and data readouts, `--font-sans` (Inter) is long-form reading prose via the `.reading` context, and `--font-display` (Geist Sans) powers the portal and these docs. The portal scopes its theme under `.theme-portal`.

## Component patterns

- `.astro` files: build-time data-fetching in the frontmatter, scoped `<style>`, inline `<script>` for client behavior.
- `.tsx` files: selective React, mostly inside the admin portal. Icons from `lucide-react`.
- Animations: GSAP for mood update notices, mobile header collapse, and home reveals; IntersectionObserver for lazy hydration; CSS for typewriter and marquee effects.
