# Executive Plan: Edge Cache Consolidation

Workstream from the September 2026 Cloudflare infrastructure audit (2026-09-13). Covers `site` (public Worker) and `site-api` (private Worker). Nothing has been changed yet; this document is the agreed shape of the work and the reasons behind each step.

## Objective

Put every expensive HTML render behind Workers Caching (the platform layer: tiered, request-collapsing, hits never invoke the Worker), stop the platform layer and the in-worker Cache API layer from contradicting each other, and keep the in-worker layer only where the platform cannot do the job. Success is measured in `Cf-Cache-Status` counts.

## What was measured

Platform cache for `site`, 2026-09-06 to 2026-09-12, from `workersCacheRequestsAdaptiveGroups`:

| Status | 7-day count | Worker runs? |
|---|---|---|
| HIT | 80,086 | no |
| MISS | 28,503 | yes |
| EXPIRED + REVALIDATED | 12,991 | yes, inline, the client waits |
| UPDATING | 2,039 | yes, in the background |
| BYPASS | 5,250 | yes, never stored |

`site-api` has no `cache` block in `wrangler.jsonc`; the dataset is empty for it.

Per-route probes against production, 2026-09-13:

| Route | Cf-Cache-Status | Cause |
|---|---|---|
| `/mood` | BYPASS on every request | The policy has `normalizeHtmlCacheSearch`, so the response carries `Cloudflare-CDN-Cache-Control: no-store`. That header has the highest precedence and is stripped at the edge, so it is invisible in a browser. |
| `/mood/[id]` | MISS, then HIT | Already platform-cached, including renders the in-worker layer refuses to store (`data-mood-preview-pending`). |
| `/privacy`, `/blog/[slug]` | HIT with Chrome's `Accept`, MISS with `Accept: */*` | `Vary: Accept` stores one variant per verbatim `Accept` string. |
| `/projects` | HIT for any `Accept` | No markdown renderer, so no `Vary`. |
| `/`, `/blog` | REVALIDATED carrying `public, max-age=0, must-revalidate` | The 304 from Static Assets skips the `withContentPolicy` rewrite; the stored entry inherits the assets default and revalidates every request from then on. |
| `/api/v2/mood` | none | `site-api` has no platform cache; the JSON says `public, max-age=0`, which no shared cache stores. |
| `/api/v2/images/...` | none | Same Worker; the replaceable variant is `max-age=0, must-revalidate` plus ETag. |

Two platform facts shape the plan:

- `Cloudflare-CDN-Cache-Control` wins over `Cache-Control`, and `stale-while-revalidate` is disabled whenever the winning header contains `s-maxage`, `must-revalidate` or `proxy-revalidate`. `cloudflareCdnCacheControl` already uses `max-age`, which is the only reason UPDATING shows up today.
- The cache key includes the Worker version. Every deploy (three to five a day) starts cold. `cross_version_cache` would keep assets warm but would also serve HTML that references hashed chunks the new version no longer ships, because assets are routed from a per-version manifest.

## Scope

### Phase 1: longer edge SWR and a consistent 304 path (`site`, S)

1. Raise `CONTENT_STALE_WHILE_REVALIDATE_SECONDS` from 300 to 86400. It only feeds `cloudflareCdnCacheControl`; the browser-facing `publicCacheControl` keeps `max-age=0`. After TTL the platform serves the stored page and re-renders once per key per data center in the background, instead of making the client wait. Staleness is bounded to one request past TTL, and a deploy still invalidates everything through the version key.
2. In `withContentPolicy`, apply `setContentCacheHeaders` to `304` responses as well as `200` on policy routes. The platform's conditional revalidation currently receives a 304 from Static Assets with `public, max-age=0, must-revalidate`, merges it into the stored entry, and revalidates every request afterwards.
3. Delete the `/` and `/blog*` rules from `public/_headers`. They restate the Static Assets default, and the worker owns those paths through `run_worker_first`. Fonts, `/r/*` and `llms.txt` stay.

This phase does not reduce the number of renders. The same renders happen, off the critical path and collapsed per key. The wins are latency (about 13k synchronous waits a week) and resilience: a Worker error during a background revalidation serves the stale page instead of an error.

### Phase 2: `/mood` and `/mood/[id]` behind the platform cache (`site`, M)

0. Measure first. Record per-invocation CPU for `/mood*` renders with `wrangler tail --format json` for an hour; the observability query API rejects the local token. If the median render is above 10 ms, this phase reduces exposure but does not remove the Free-plan kills: the limit is a rolling average per isolate, and once cheap requests stop reaching the isolate the average becomes the render cost. The choice is then Workers Paid or cheaper renders. Write the number into this plan either way.
1. Add a render-time readiness header. Pages set `X-Buxx-Cache-Ready: 0` in frontmatter when the render is not final: empty initial feed, live fallback for an anchor, `previewPending` on a detail page. `previewPending` moves from `DetailArticle.astro` into `[id].astro` frontmatter and is passed down as a prop, because headers must be set before the first byte streams.
2. `withContentPolicy` and `createHtmlCacheOptions` read that header. `0` means `Cache-Control: no-store` for both layers, and the header is deleted before the response leaves. Then delete the body scans: `MOOD_PAGE_CACHE_READY_MARKERS`, `isHtmlReady`, and `isResponseReady` in `edge-cache.ts`.
3. Stop emitting `Cloudflare-CDN-Cache-Control: no-store` for policies with `normalizeHtmlCacheSearch`. Unknown query shapes already yield `no-store` through `shouldApplyRouteCacheHeaders` (`/mood?source=archive` is `no-store` today). The canonical shapes, `?tag=<slug>` and `?post=` or `?id=<anchor>`, are bounded and correct per raw query; the platform stores more entries than the bucketed in-worker key, each of them right. `/mood/embed` follows the same path and keeps `no-store` on `?refresh` through its own headers. Grouped blog translations keep `no-store` for the CDN because `Vary: Cookie` cannot be cached sanely.
4. Remove `Vary: Accept-Language` from mood responses. No code in either repo sets it, the upstream JSON does not carry it, and the page renders `<html lang="zh">` for `zh-CN` and `en-US` alike. Today every distinct `Accept-Language` string is a separate platform variant of every mood page. Locate the injector during implementation.
5. Decision D2, after hit rates are confirmed: set `edgeCacheHtml: false` for `/mood` and `/mood/[id]`. The in-worker key for mood carries no build id (`contentEdgeCacheVersion` stamps only `/`, `/blog*`, `/docs*`), the Cache API is shared across Worker versions within a colo, and `/mood` references 21 hashed chunks. A warm colo therefore serves post-deploy HTML that points at chunks which may no longer exist, for up to five minutes plus one stale hit. Removing the layer removes the exposure and one cache to debug. The alternative is adding the build id to the mood key and keeping both layers.

### Phase 3: `site-api` Workers Caching, guarded (`site-api`, M)

The platform bypasses only on a response `Set-Cookie` or a request `Authorization`. A request `Cookie` does not bypass, and a 200 without `Cache-Control` receives heuristic freshness. Forty route files under `src/pages` never set `Cache-Control`, including admin, notify, oauth, webhooks and analytics. Enabling the cache today would store cookie-authenticated admin GETs for everyone. The order below is the safety mechanism.

1. Middleware default: after `next()`, if the response has no `Cache-Control`, set `no-store, max-age=0`. Cover it with a middleware unit test. Ship this regardless of the flag.
2. Explicit TTLs for the public routes the default would otherwise stop the zone from caching by extension: `status.svg`, `site-badge.svg`, `project.svg`, `tech-stack.svg`, `oembed.json`. Values are decision D3.
3. Mood JSON: keep `Cache-Control: public, max-age=0` for browsers and add `Cloudflare-CDN-Cache-Control: public, max-age=60, stale-while-revalidate=600` on the feed and detail success path. `fresh` and probe requests stay `no-store`. Service-binding calls from `site` consult this same cache, so `site`'s HTML misses stop paying a D1 read each.
4. Image proxy: the immutable variant is already right. The replaceable variant stays `must-revalidate` plus ETag for now; the platform revalidates and the Worker answers 304 without an R2 body. Decision D4 is whether it deserves a short edge TTL.
5. Enable `"cache": { "enabled": true }` in `site-api/wrangler.jsonc` last, after a header sweep over every documented route shows a `Cache-Control` on each response and `BYPASS` or `DYNAMIC` on everything under admin, notify, oauth, webhooks and analytics. Wrangler `^4.125` satisfies the `>= 4.69` requirement.
6. Billing note: with the flag on, service-binding calls and asset requests count as billable requests. The account total is about 25k requests a day against the Free plan's 100k.

## Decisions required

| # | Question | Recommendation |
|---|---|---|
| D1 | Keep `Accept` negotiation on HTML routes and accept one platform variant per browser `Accept` string? | Keep, defer. `Vary: Accept` is required for correctness while HTML and Markdown share a URL. A variant miss costs an invocation that ends in an in-worker HIT, not a render; it consumes request count, not CPU, and the account sits at 6% of that budget. The only clean fix is a two-entrypoint design that normalizes `Accept` before a cached loopback call, which is not worth it at this traffic. |
| D2 | After Phase 2, drop the in-worker Cache API layer for mood routes, or add the build id to its key? | Drop. One cache per page type, and the dead-chunk exposure goes with it. |
| D3 | Edge TTLs for mood JSON, badges and oembed. | Mood JSON 60 s with 600 s SWR; badges and oembed 300 s with 3600 s SWR. |
| D4 | Short edge TTL for replaceable images? | Not now. Measure REVALIDATED volume on `site-api` first. |

## Non-goals

- `cross_version_cache` stays off. Assets are served from a per-version manifest, so stale HTML would reference missing chunks after every deploy. Asset cold starts cost no CPU because assets never reach the Worker.
- No Workers Paid upgrade inside this plan. It remains the structural fix for renders that cost more than 10 ms; Phase 2 step 0 produces the number that decides it.
- `run_worker_first`, Smart Placement, the zone WAF rate-limit ruleset and zone cache rules stay as they are.
- No change to the blog locale variant mechanism.

## Task breakdown

1. Phase 1 steps 1 to 3, with tests in `tests/unit/edge-cache.test.ts` and `tests/unit/agent-markdown-registry.test.ts`; update the cache table in `src/content/docs/architecture.md`. (S)
2. Phase 2 step 0 measurement, written back into this plan. (S)
3. Phase 2 steps 1 to 4 in one PR; step 5 in a follow-up once `/mood` shows HIT and UPDATING for a few days. Update `architecture.md` and `src/content/docs/api/mood.md`. (M)
4. Phase 3 steps 1 to 4 in one `site-api` PR, step 5 in a second PR after the sweep. Update the cache tiers in `api/mood.md`. (M)

## Files touched

`site`: `src/features/agent-markdown/server/responses.ts`, `src/features/agent-markdown/server/registry.ts`, `src/lib/http/edge-cache.ts`, `src/pages/mood.astro`, `src/pages/mood/[id].astro`, `src/features/mood/ui/DetailArticle.astro`, `public/_headers`, `tests/unit/edge-cache.test.ts`, `tests/unit/agent-markdown-registry.test.ts`, `src/content/docs/architecture.md`, `src/content/docs/api/mood.md`.

`site-api`: `src/middleware.ts`, `src/features/mood/server/mood-api-routes.ts`, the four `*.svg.ts` routes and `oembed.json.ts`, `wrangler.jsonc`, middleware tests.

## Risks

- Long SWR serves one stale response per key per data center after TTL. Acceptable for home, blog and docs; `no-store` routes are unaffected; a removed blog post is replaced by its 404 on the request after TTL, and by the next deploy at the latest.
- A readiness header set after the first byte is silently lost. Keep the computation in page frontmatter and test with a forced pending render.
- Phase 2 can raise the kill rate per render while cutting the render count (step 0 explains why). Stale-on-error covers warm keys; cold keys right after a deploy have no such cover.
- Phase 3 step 1 changes the implicit zone caching of `*.svg` badges; step 2 exists so this is explicit rather than accidental.
- Enabling the `site-api` flag before the sweep is the one dangerous move in this plan: a cached admin page is public until purged. The sweep is a gate, not a suggestion.

## Rollout & verification

- Sequence: Phase 1 PR, three days of data, Phase 2 PR, three days, Phase 2 step 5, `site-api` PR 1, sweep, `site-api` PR 2.
- Per-status counts: GraphQL `workersCacheRequestsAdaptiveGroups` grouped by `date`, `scriptName`, `cacheStatus`; invocations from `workersInvocationsAdaptive` split by `status` to watch `exceededResources`; R2 GETs from `r2OperationsAdaptiveGroups` for the image bucket.
- Curl matrix, two requests each: `/`, `/blog`, `/blog/<slug>`, `/mood`, `/mood/<id>`, `/mood?tag=<slug>`, `/mood?source=archive`, `/api/v2/mood?limit=1`, one image URL. Record `Cf-Cache-Status`, `Age`, `Cache-Control`, `Vary` and `X-Buxx-*`.
- Success criteria once every phase has shipped: `site` BYPASS reduced to non-GET traffic; EXPIRED plus REVALIDATED under 5% of non-HIT statuses; `exceededResources` near zero on ordinary days or, failing that, a measured render cost that settles the Paid-plan question; `site-api` image and mood JSON HIT ratio above 80%.

## Dependencies

- Phase 3 step 3 changes headers that `site` receives over the service binding; `site` does not parse them, so there is no contract change.
- The docs coverage guard (`bun run check:docs-coverage`) is unaffected; no routes are added or removed.
