# Agent-Friendly Markdown + Edge Cache — PRD

**Status:** Ready to build · **Owner:** buxx · **Scope:** public site worker (`site`) only — no `../site-api` changes

## Overview

Make `buxx.me` answer AI agents in Markdown while keeping HTML the default for browsers. Agents send `Accept: text/markdown` and get a **hand-written** Markdown rendition of the *same URL* — `Content-Type: text/markdown; charset=utf-8`, plus `x-markdown-tokens` and `Vary: Accept`. Coverage: `/blog` (index, post, tags), `/mood` (feed + detail, migrated off the legacy `/agent/*` routes), plus home and privacy. A `/llms.txt` discovery index is published. The existing `/mood`-only edge cache (`caches.default` in `src/middleware.ts`) is generalized into a reusable helper and extended to `/blog` HTML and every Markdown response, with cache keys that never let HTML and Markdown collide.

This iteration deliberately **does not** use Cloudflare's built-in *Markdown for Agents* platform transform — it is paid-plan-gated, and auto HTML→MD of article bodies is lower quality than serializing from the post's own Markdown source.

## Goals

- Return Markdown for content routes when `Accept` prefers `text/markdown`; HTML otherwise.
- Reuse the existing hand-written mood serializer pattern; no dependency on the Cloudflare platform transform.
- Centralize negotiation in middleware via a route → renderer registry so pages stay thin and renderers are unit-testable.
- Migrate mood agent output from `/agent/*` URLs to same-URL `Accept` negotiation and delete the legacy routes.
- Advertise Markdown: `<link rel="alternate" type="text/markdown">`, `x-markdown-tokens`, `Vary: Accept`.
- Publish `/llms.txt` for agent discovery.
- Generalize the mood-only `caches.default` edge cache into a reusable helper; apply it to `/blog` HTML and all Markdown responses.
- Do a full-site `Cache-Control` audit so every GET content route has a deliberate edge policy and admin/oauth stay uncacheable.

## Non-Goals

- No Cloudflare *Markdown for Agents* platform feature (paid-plan-gated; uncontrolled body quality).
- No Markdown for admin/dev portal, OAuth, or `/api` · `/v2` proxy routes.
- No new content authoring surface — Markdown is a *rendition* of existing content.
- No client-side/JS negotiation — server/edge only.
- No `../site-api` changes.
- No exact BPE tokenizer this iteration — `x-markdown-tokens` is an approximation.
- No `/llms-full.txt` full-text file this iteration (index only).

## Resolved Decisions

These were the open questions; all are now decided — executors do **not** re-litigate them.

| # | Decision |
|---|----------|
| Token header | `x-markdown-tokens` = **approximate** count via `Math.ceil(chars / 4)`. A real tokenizer is a future follow-up, out of scope here. |
| Discovery file | Ship **`/llms.txt`** (index) only. No `/llms-full.txt` this iteration. |
| Home Markdown | Concise **profile summary + link index** (blog, mood, projects). Not a full page dump. |
| Privacy Markdown | **Include it** — policy text is cheap to serialize and useful to agents. |
| Edge TTLs (`s-maxage`) | mood `60s` (unchanged) · blog post `300s` · blog index & tags `120s` · home `300s` · privacy `3600s`. Each Markdown variant inherits its HTML family's TTL. |

## Stack

- **Framework:** Astro v7 + React (`@astrojs/react`).
- **Hosting:** Cloudflare Workers (`site`). The `@astrojs/cloudflare` adapter applies on `build`/`preview` only; `astro dev` is native Node SSR.
- **Data:** content collections for `/blog`; live Telegram mirror + D1 archive (read via `../site-api`) for `/mood`.
- **Auth:** Cloudflare Access gates `/dev` and protected docs; content routes are public.

## Routes

| Path | Purpose |
|------|---------|
| `/blog` | Post list — HTML for browsers, Markdown link-list for agents |
| `/blog/[slug]` | Article — Markdown sourced from the post's own Markdown |
| `/blog/tags` | All tags — Markdown list |
| `/blog/tag/[slug]` | Posts for a tag — Markdown list |
| `/mood` | Feed — Markdown via `Accept` (replaces `/agent/mood`) |
| `/mood/[id]` | Single mood — Markdown via `Accept` (replaces `/agent/mood/[id]`) |
| `/` | Home — concise Markdown profile |
| `/privacy` | Static — Markdown rendition |
| `/llms.txt` | Plain-text index of Markdown entry points |
| ~~`/agent/mood`~~ | **DELETE** — superseded by `/mood` negotiation |
| ~~`/agent/mood/[id]`~~ | **DELETE** — superseded by `/mood/[id]` negotiation |

## Behavior & Rules

- Prefer Markdown **only** when `Accept` ranks `text/markdown` ≥ `text/html` (q-values respected). A bare `*/*` or `text/html` stays HTML.
- If no renderer matches the pathname, fall through to the normal HTML response even when Markdown was requested.
- Absolute links inside Markdown are built from Astro `site` (request-origin fallback), matching the existing mood serializer.
- **Edge-cache keys encode the negotiated variant (`html` vs `markdown`)** so the two never collide; `Vary: Accept` is set on both variants. This is the highest-risk correctness point in the feature.
- `/dev`, `/oauth*`, `/api`, `/v2` never negotiate Markdown and never enter the edge cache.
- Markdown responses carry `x-markdown-tokens` and `Cache-Control` with the route family's `s-maxage`.
- Deleting `/agent/mood*` must not break internal links — grep and clean references (sitemap, tests).

## Data Model

```ts
type MarkdownRenderer = {
  match(pathname: string): boolean | RouteParams;
  render(context): Promise<string>;
  cacheTtlSeconds: number;
};

type NegotiationResult = {
  prefersMarkdown: boolean;
  matchedRenderer?: MarkdownRenderer;
  markdownBody?: string;
  tokenCount?: number;
};
```

## Success Metrics

- `curl -H 'Accept: text/markdown' https://buxx.me/blog/<slug>` → `Content-Type: text/markdown; charset=utf-8`, Markdown body, `x-markdown-tokens` header.
- Same URL with a browser `Accept` still returns HTML, unchanged.
- isitagentready markdown-negotiation checks pass for `/blog` and `/mood`.
- Repeated GETs show an edge-cache `HIT` header; HTML vs Markdown never serve from the same entry.
- `/agent/mood` and `/agent/mood/[id]` return 404; `/mood` `Accept: text/markdown` serves the equivalent feed.

## Quality Gates

Every story must pass:

```bash
bun run check          # Astro type/content check
bun run build          # Production build (Cloudflare adapter — validates worker output)
bun run test:unit      # Unit tests + notify e2e
bun run test:e2e:site  # Playwright site e2e
```

---

## Stories

### US-001 — Markdown negotiation core + renderer registry in middleware
*Depends on: none*

As an agent, I want same-URL `Accept` negotiation so that requesting `text/markdown` returns a Markdown rendition while browsers keep getting HTML.

- Add a negotiation helper parsing `Accept`; `prefersMarkdown` is true only when `text/markdown` ranks ≥ `text/html` (q-values respected).
- Add a route → renderer registry (`{ match, render, cacheTtlSeconds }`); middleware runs registered renderers before the normal HTML pipeline.
- Wire the mood feed as the first renderer, reusing `buildMoodAgentMarkdown` from `src/features/mood/server/serializers.ts`.
- Markdown responses set `Content-Type: text/markdown; charset=utf-8`, `Vary: Accept`, `Cache-Control` with the renderer's `s-maxage`.
- Add a token-estimate util (`Math.ceil(chars / 4)`); set `x-markdown-tokens` on every Markdown response.
- **Example:** `GET /mood` with `Accept: text/markdown` → 200 `text/markdown`, feed body, `x-markdown-tokens > 0`.
- **Negative:** `GET /mood` with `Accept: text/html` → normal HTML page, unchanged, `Vary: Accept` added.
- **Negative:** `GET /dev/anything` with `Accept: text/markdown` → still the HTML/auth response, never Markdown.
- Unit tests cover the Accept parser (`text/markdown`, `*/*`, `text/html`, weighted q-values) and the token estimator.

### US-002 — Blog post Markdown serializer
*Depends on: US-001*

As an agent, I want `/blog/[slug]` in Markdown so that I can read an article as clean Markdown sourced from the post itself.

- Add `buildPostAgentMarkdown(post, siteUrl)` in `src/features/posts/server`: title (H1), byline/date, canonical URL, then the post's own Markdown body.
- Register `/blog/[slug]`; slug resolves from the content collection.
- Absolute links/images in the body resolve against site origin.
- **Example:** `GET /blog/<existing-slug>` with `Accept: text/markdown` → 200 `text/markdown`, body starts with `# <post title>`.
- **Negative:** `GET /blog/<nonexistent-slug>` with `Accept: text/markdown` → 404 (not an empty 200).
- **Negative:** `GET /blog/<existing-slug>` with browser `Accept` → HTML article.
- Unit test asserts serializer output for a fixture post (heading, canonical URL, body present).

### US-003 — Blog index + tags Markdown serializers
*Depends on: US-001*

As an agent, I want `/blog`, `/blog/tags`, `/blog/tag/[slug]` in Markdown so that I can crawl the post list and tag structure.

- Add serializers rendering the post list (title + date + absolute URL per item) and the tag list / per-tag post list.
- Register `/blog`, `/blog/tags`, `/blog/tag/[slug]`.
- **Example:** `GET /blog` with `Accept: text/markdown` → Markdown bullet list of posts, each linking to `/blog/<slug>`.
- **Example:** `GET /blog/tag/<existing-tag>` → only posts carrying that tag.
- **Negative:** `GET /blog/tag/<unknown-tag>` with `Accept: text/markdown` → 404.
- Unit tests cover index ordering (newest first) and tag filtering.

### US-004 — Migrate mood detail to Accept negotiation; delete `/agent/*`
*Depends on: US-001*

As a maintainer, I want mood detail served via `/mood/[id]` negotiation so that there is one agent surface and the legacy routes are gone.

- Register `/mood/[id]`, reusing the Markdown-building logic currently in `src/pages/agent/mood/[id].ts`.
- Delete `src/pages/agent/mood.ts` and `src/pages/agent/mood/[id].ts` (and the now-empty `src/pages/agent` dir).
- Grep for `/agent/mood` references; update or remove them (sitemap, links, tests).
- **Example:** `GET /mood/<existing-id>` with `Accept: text/markdown` → the single-mood Markdown `/agent/mood/[id]` used to return.
- **Negative:** `GET /agent/mood` and `/agent/mood/<id>` → 404.
- **Negative:** `GET /mood/<existing-id>` with browser `Accept` → HTML detail page.
- Existing mood serializer unit tests updated for the new entry points and still pass.

### US-005 — Home and privacy Markdown serializers
*Depends on: US-001*

As an agent, I want `/` and `/privacy` in Markdown so that landing and policy content are machine-readable.

- Add a concise home renderer (identity summary + primary links: blog, mood, projects) and a privacy renderer (policy text as Markdown).
- Register `/` and `/privacy`.
- **Example:** `GET /` with `Accept: text/markdown` → short Markdown profile linking `/blog` and `/mood`.
- **Negative:** `GET /` with browser `Accept` → full HTML homepage, unchanged.
- Unit test asserts the home Markdown contains the blog and mood links.

### US-006 — Advertise Markdown in HTML head (`rel=alternate`)
*Depends on: US-002, US-003, US-004, US-005*

As an agent, I want HTML pages to declare their Markdown alternate so that I can discover the rendition without guessing.

- In the shared head/layout, emit `<link rel="alternate" type="text/markdown" href="<canonical same-path URL>">` **only** on routes with a registered renderer.
- The `href` is the same path (negotiation is by `Accept`), using the absolute canonical URL.
- **Example:** the HTML of `/blog/<slug>` contains exactly one `rel=alternate` `text/markdown` link pointing at the same URL.
- **Negative:** a non-negotiable page (e.g. `/dev/...`) contains no such link.
- e2e asserts the alternate link is present on a blog post and absent on an admin page.

### US-007 — Publish `/llms.txt` discovery index
*Depends on: US-002, US-003, US-004, US-005*

As an agent, I want `/llms.txt` so that I can discover the site's Markdown entry points from one file.

- Add a `/llms.txt` route returning `text/plain`: site name, one-line description, and links to key Markdown surfaces (`/blog`, recent posts, `/mood`, `/`).
- Links are absolute and point at the negotiable URLs (agents fetch with `Accept: text/markdown`).
- **Example:** `GET /llms.txt` → 200 `text/plain` containing absolute `/blog` and `/mood` links.
- **Negative:** `POST /llms.txt` → 405 or falls through (not 200).
- Route is in build output and reachable in preview.

### US-008 — Generalize the mood edge-cache into a reusable helper
*Depends on: US-001*

As a maintainer, I want the `caches.default` logic extracted from the mood-specific code so that any GET route can opt into edge caching with a variant-aware key.

- Extract the mood-specific `caches.default` read/put logic in `src/middleware.ts` into a generic helper (e.g. `src/lib/http/edge-cache.ts`) taking a key builder, TTL, and a readiness predicate.
- The cache key includes the negotiated variant (`html|markdown`) so the two never share an entry.
- Reimplement `/mood` HTML caching on the helper with identical behavior and the same `X-Buxx-*` HIT/MISS/BYPASS semantics.
- **Example:** two sequential `GET /mood` (browser `Accept`) → MISS then HIT.
- **Negative:** `GET /mood` with `Accept: text/markdown` does not return the HTML cache entry (different variant key).
- **Negative:** a request with `Cache-Control: no-cache` bypasses the cache as before.
- Unit tests cover key building (variant separation) and the readiness predicate.

### US-009 — Apply edge cache to `/blog` HTML and all Markdown responses
*Depends on: US-008, US-002, US-003*

As a visitor or agent, I want blog pages and Markdown responses served from the edge so that repeat requests are fast.

- Use the generic helper to cache `/blog` and `/blog/[slug]` HTML and every Markdown response, keyed by path + variant.
- Route-family `s-maxage` per the Resolved Decisions table, with `Vary: Accept`.
- Cached responses expose a HIT/MISS header for verification.
- **Example:** two sequential `GET /blog/<slug>` with `Accept: text/markdown` → MISS then HIT, both `text/markdown`.
- **Negative:** `GET /blog/<slug>` browser HTML and `Accept: text/markdown` → two independent cache entries (one HIT does not serve the other variant).
- **Negative:** an authenticated/admin route is never written to the edge cache.

### US-010 — Full-site `Cache-Control` audit
*Depends on: US-009*

As a maintainer, I want every GET content route to carry a deliberate `Cache-Control` so that edge/CDN behavior is intentional and admin content is never cached.

- Audit all GET routes: static/content GET routes get `public` `s-maxage` matching their family; `/dev`, `/oauth*`, `/api`, `/v2` get `no-store`.
- Negotiable routes carry `Vary: Accept` on both HTML and Markdown responses.
- Document the resulting policy table in `docs/ARCHITECTURE.md` (route family → `Cache-Control` / edge behavior).
- **Example:** `GET /privacy` → `public` with `s-maxage`; `GET /dev` → `no-store`.
- **Negative:** no content route left with a missing or contradictory `Cache-Control` (spot-checked in e2e).

### US-011 — End-to-end tests for negotiation, discovery, caching
*Depends on: US-006, US-007, US-009*

As a maintainer, I want e2e coverage so that agent negotiation, discovery, and caching don't silently regress.

- `/blog/<slug>` and `/mood` return `text/markdown` with `x-markdown-tokens` and `Vary: Accept` when `Accept: text/markdown`; HTML otherwise.
- HTML content pages expose the `rel=alternate` `text/markdown` link; `/llms.txt` lists `/blog` and `/mood`.
- Repeated GETs → MISS then HIT; HTML vs Markdown variants never cross-serve.
- `/agent/mood` and `/agent/mood/[id]` → 404.
- **Negative in suite:** a browser-`Accept` request to a content route never receives `text/markdown`.
- `bun run test:e2e:site` passes locally.

---

## Dependency Graph

```
US-001 ──┬─ US-002 ─┐
         ├─ US-003 ─┼─ US-006 ─┐
         ├─ US-004 ─┤          ├─ US-011
         ├─ US-005 ─┘          │
         │          └─ US-007 ─┤
         └─ US-008 ─── US-009 ─┴─ US-010 ─ US-011
```
