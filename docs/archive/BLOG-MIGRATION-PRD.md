# Blog Migration PRD — buxx.me/blog (Astro + Ghost Content API)

> **Audience:** implementing agents.
> **Status:** implemented. Phase 7 backend lives in the sibling `site-api` repo.
> **Machine-readable companion:** `.agents/tasks/prd-blog-ghost-theme.json` (Ralph stories, gitignored).

## TL;DR

Replace the Ghost-hosted **attegi** theme at `blog.buxx.me` with a new minimal Astro
blog living inside this `site` repo, served at **`buxx.me/blog`**. Ghost stays as the
headless CMS; we read content through the **Ghost Content API** at **build time (SSG)**.
The theme is a **faithful clone of [chl.ee](https://chl.ee/)** — single column, light,
sans-serif, posts grouped by year. We **port** the proven `@attegi/ghost-adapter`
ContentProvider from the sibling `Attegi-Astro` repo instead of rebuilding it.

## Locked decisions

| Question | Decision |
| --- | --- |
| Placement | `buxx.me/blog` sub-path. `blog.buxx.me` 301s here. |
| Scope | Minimal + tag archive + client search. No members/comments/author/about pages. |
| Adapter | **Port** `@attegi/ghost-adapter` + `@attegi/content-types` source into `site`. |
| Rendering | **Build-time SSG** (`prerender = true`). No runtime Ghost calls. |
| Publish freshness | Ghost webhook → CI rebuild/deploy. New posts go live within minutes. |
| Design | Faithful clone of chl.ee. Blog is its own visual zone, *not* harmonized with the main site. |
| Bio header | Reuse `profile` from `src/data/site.ts` (avatar/name/bio/social), **not** Ghost authors. |
| Cutover | **Code owns routing** — `blog.buxx.me` routed to the `site` worker; redirect lives in worker/middleware. |
| `/posts` stub | **Deleted** — remove the page and the `ENABLE_POSTS_PAGE` gate entirely. |
| Images | Hotlink `blog.buxx.me/content/images/**` for the first cut; optimize later. |
| Permalinks | 301 old URLs, emit RSS/Atom, include posts in sitemap. |
| Quality gates | `bun run check`, `bun run build`, `bun run test:unit` per story. |

## Non-goals

- No Ghost Members / Portal / paid tiers / subscribe flow.
- No native comments.
- No author archive pages.
- No standalone About page — the home bio header is enough.
- No on-request SSR / runtime Ghost fetching.
- No design harmonization with the main buxx.me hero/font system.
- No rewrite of adapter logic — port as-is.

## Source material

| What | Where |
| --- | --- |
| Ghost adapter (ContentProvider) | `../../Attegi-Astro/packages/ghost-adapter/src` |
| Shared content types | `../../Attegi-Astro/packages/content-types/src` |
| Adapter dependency | `@tryghost/content-api` ^1.12.6, Ghost API `v6.0` |
| Env keys | `PUBLIC_GHOST_URL`, `GHOST_CONTENT_API_KEY` |
| Bio/identity source | `src/data/site.ts` → `profile`, `meta` |
| Existing stub being replaced | `src/pages/posts/index.astro` (gated by `ENABLE_POSTS_PAGE`) |

## Routes

| Path | Purpose | Render |
| --- | --- | --- |
| `/blog` | Bio header + posts grouped by year with year-jump anchors | static |
| `/blog/[slug]` | Post detail rendering Ghost HTML + prev/next | static per post |
| `/blog/tag/[slug]` | Tag archive, paginated | static per public tag |
| `/pagefind/*` | Static Pagefind full-text index and UI assets, generated from built `/blog` HTML | static |
| `/blog/rss.xml` | RSS/Atom feed replacing Ghost `/rss` | static |

## Rules of engagement

- Every `/blog` route sets `export const prerender = true`. **Zero** Ghost calls at request time.
- Render Ghost-provided HTML directly; preserve the `.kg-*` class contract. Do **not** re-transform markdown.
- Port adapter source verbatim except import-path rewrites (`@attegi/content-types` → internal relative path).
- The adapter **must degrade to mock content** (`mock.ts`) when Ghost is unconfigured, so `bun run build` passes without secrets.
- Only public posts/tags render (`tag.visibility === 'public'`).
- Bio header data comes from `src/data/site.ts`, never Ghost.
- Content images hotlink `blog.buxx.me/content/images/**` directly (no build-time download yet).
- The `blog.buxx.me → buxx.me/blog` redirect is owned by the `site` worker/middleware, not external Cloudflare config.
- English-only identifiers/comments. Conventional Commits. Small logical batches.

---

## Phased plan

Six phases. Each phase is independently reviewable and leaves the tree green
(`bun run check` + `bun run build` + `bun run test:unit`). Story IDs map to the
JSON companion.

### Phase 1 — Foundation (data plumbing)
**Stories:** US-001 → US-004
**Goal:** Ghost data is readable inside `site` at build time, with a mock fallback.

- US-001 — Install `@tryghost/content-api`; wire `PUBLIC_GHOST_URL` + `GHOST_CONTENT_API_KEY` env.
- US-002 — Port `@attegi/content-types` into `src/features/posts/types/`; kill all `@attegi/*` specifiers.
- US-003 — Port `ghost-adapter` into `src/features/posts/adapter/`; rewrite imports; keep public exports.
- US-004 — `src/features/posts/server/content.ts`: singleton provider + typed helpers + unit test on year-grouping.

**Exit:** `getAllPosts()` returns sorted mock posts in a unit test; build does not require secrets.

### Phase 2 — Reading experience (the chl.ee core)
**Stories:** US-005 → US-008
**Goal:** A reader can browse the year-grouped list and open any post, looking like chl.ee.

- US-005 — `BlogLayout.astro` + bio header from `src/data/site.ts`.
- US-006 — `/blog` home: year-grouped reverse-chron list + year-jump anchors.
- US-007 — `/blog/[slug]`: render Ghost HTML + prev/next adjacency.
- US-008 — Clone chl.ee typography/spacing; scoped so it doesn't leak into main-site styles.

**Exit:** `/blog` and `/blog/<slug>` build to static HTML; visual parity with chl.ee at desktop (screenshot in PR).

### Phase 3 — Discovery
**Stories:** US-009 → US-010
**Goal:** Readers can find posts by tag and by search.

- US-009 — `/blog/tag/[slug]`: tag archive, paginated.
- US-010 — Pagefind search generated by `bun run build` (`pagefind --site dist/client`) + client-side command-palette search input on `/blog`.

**Exit:** Tag pages paginate correctly; search filters the statically generated blog HTML with a clean empty state. Pagefind supersedes the original `/blog/search.json` idea because it indexes rendered Ghost HTML, avoids maintaining a second bespoke JSON payload, and stays static.

### Phase 4 — Syndication & SEO
**Stories:** US-011 → US-012
**Goal:** Feeds and sitemap reflect the new blog.

- US-011 — `/blog/rss.xml` from `getAllPosts`, absolute `buxx.me/blog` URLs.
- US-012 — Extend `src/pages/sitemap.xml.ts` with `/blog`, posts, public tags.

**Exit:** Feed is well-formed; published posts appear once in `sitemap.xml`; drafts do not.

### Phase 5 — Cutover
**Stories:** US-013
**Goal:** Old links resolve to the new home; the `/posts` stub is gone.

- US-013 — Route `blog.buxx.me` to the `site` worker; 301 `blog.buxx.me/<slug>` →
  `buxx.me/blog/<slug>` in worker/middleware; update the `profile` Blog link to
  `https://buxx.me/blog`; **delete** `src/pages/posts/` and the `ENABLE_POSTS_PAGE` gate.

**Exit:** Old slug 301s to the matching post; `/posts` and its env gate no longer exist.

### Phase 6 — Publish freshness
**Stories:** US-015
**Goal:** Publishing in Ghost goes live without a manual build.

- US-015 — Ghost webhook (post published/updated) triggers a CI rebuild + deploy of
  `site`. The webhook receiver/trigger may live in `site-api` or CI config; document the
  endpoint and the Ghost-side webhook setup.

**Exit:** Publishing a post in Ghost results in a deployed `/blog/<slug>` within minutes,
no human in the loop.

### Phase 7 — Subscribe (RSS + Newsletter)
**Goal:** Readers can follow the blog two ways — RSS for reader apps, email for
everyone else — and the email side is managed alongside mood from one place.

**Done (frontend):**
- `src/features/notify/SubscribePanel.astro` + `subscribe-panel.ts` — **one
  normalised panel and controller shared by the blog and the mood feed.** A quiet
  trigger opens a dropdown carrying: a welcome line (the publication name set
  apart by colour + weight, not a display font), an email field (`请留邮箱`), a
  multi-select **Posts / Moods** channel choice (both opt-in by default), a
  Turnstile check, a privacy-policy note, an RSS link (bottom-left), and the
  submit (bottom-right). All copy is Chinese. Colours ride the global
  foreground/background tokens so it reads the same in either zone; only the
  accent differs (blog gets its Verdigris/Glacier).
- Placements:
  - Blog `variant="blog"` — its own in-flow trigger under the index masthead
    (`BlogMasthead.astro`) and at each article's foot (`blog/[slug].astro`).
  - Mood `variant="mood"` — opens from the injected header action button on
    `/mood`; replaces the old `NotifyPanel.astro` + `notify-panel-controller.ts`.
- The form POSTs `{ email, channels, deliveryMode: 'instant', timezone,
  turnstileToken }` to `/api/notify/subscribe` (the shared pool) and renders
  loading / confirm-sent / already-subscribed / error states. `channels` is the
  `NotifyChannel[]` contract field (`'blog' | 'mood'`).
- RSS points at Ghost's native feed via `blog.feed` in `src/data/site.ts`; the
  mood panel reuses its own `/mood/rss.xml`.

**Done (backend, `../site-api`):**
- **B-1 — Channel persistence.** `/v2/notify/subscribe` accepts
  `channels: NotifyChannel[]`, persists them on `notify_subscribers.channels`,
  and tags audit `source` with the channel selection. Existing rows fall back to
  `['mood']`.
- **B-2 — Blog-post dispatch.** `/v2/ghost/webhook` and the compatibility
  `/api/ghost/webhook` validate the Ghost webhook secret, load the published
  Ghost post, and email active immediate subscribers whose `channels` include
  `blog`. Sends are idempotent via `blog:<postId>` records and retry through the
  same blog source.
- **B-3 — Turnstile.** The subscribe route verifies Turnstile with expected
  action `notify_subscribe` and fails closed when the secret is missing or the
  action mismatches.
- **B-4 — Self-hosted feed.** `blog.feed` points at `/blog/rss.xml`; the shared
  panel no longer sends RSS users through the Ghost subdomain.
- **B-5 — Normalised management surface.** Admin subscriber and broadcast APIs
  accept channel/source filters and audience channels, so the portal can manage
  mood and blog subscribers/broadcasts from the same surfaces.

**Exit:** A blog subscriber receives a confirm email, then gets new posts by
email; an admin manages mood + blog subscribers from a single normalised page.

---

## Resolved decisions

These were the open questions; all now settled (reflected above):

1. **Publish freshness** → Ghost webhook → CI rebuild (Phase 6 / US-015).
2. **Subdomain cutover** → code owns it; `blog.buxx.me` routed to the `site` worker, redirect in worker/middleware.
3. **`/posts` stub** → deleted outright (page + `ENABLE_POSTS_PAGE`).
4. **About page** → dropped; home bio header is enough.
5. **Ghost images** → hotlink for the first cut; revisit optimization later.

## Definition of done

- All six phases merged; every `/blog` route is statically generated.
- `blog.buxx.me/<slug>` 301s to `buxx.me/blog/<slug>` via the `site` worker.
- `/blog/rss.xml` validates; blog posts in `sitemap.xml`.
- Publishing in Ghost auto-deploys the new post (webhook → CI).
- `src/pages/posts/` and `ENABLE_POSTS_PAGE` are removed.
- No `@attegi/*` import specifiers remain under `src/features/posts`.
- Main-site routes (`/`, `/projects`, etc.) are visually unchanged.
