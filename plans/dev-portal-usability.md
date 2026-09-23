# Dev portal usability upgrade

Branch: `claude/dev-portal-usability-8c8eec`. Supervisor plans and reviews; Opus agents implement.

## Findings

- Portal pages live in `src/pages/dev/portal/*`, gated by Cloudflare Access (prod) / dev bypass (dev) in `src/middleware.ts`. Server loads go through the `API` service binding (`src/features/admin/server/portal-client.ts`) forwarding `cf-access-jwt-assertion`; browser calls go through `/dev/portal/api/admin/*` (`src/pages/dev/portal/api/[...path].ts`), which only forwards `admin/*` paths.
- **Newsletter 401**: `TemplatePreview.tsx` is the only portal component fetching `/api/notify/preview` directly from the browser. That path bypasses Cloudflare Access, so site-api's guard rejects it. Every other component uses `adminApiEndpoint()`.
- **UA/IP**: `BlogAnalyticsEventRecord` in `@bunizao/contracts` already carries `ip`, `ua`, `browser`, `os`, `city`, `region`, `asn`, `asOrg`, `colo`. The events endpoint returns them; `analytics.astro`'s raw event log just doesn't render them. Frontend-only change.
- **Listening analytics**: `BlogAnalyticsSummaryResult.listening` is typed in contracts but rendered nowhere in the portal. Missing stat, data likely already flowing.
- **dev/blog**: `/dev/blog/[id]` is a polished Ghost draft live preview (1.5s ETag HEAD polling, scroll restore) but there is NO index — you must already know the draft id. `ghost-admin.ts` only supports `readPostById`; needs a `listPosts`.
- site-api sits on branch `docs/import-architecture-audit` (ahead 1). Avoid changes there unless unavoidable.

## Workstreams

### A. Newsletter preview 401 (small)
Route the preview fetch through the admin proxy like every other component. Confirm site-api exposes an admin-tier preview route; if only `/api/notify/preview` exists, decide: widen portal proxy allowlist for this one path (site-only) vs. admin alias in site-api (avoid — branch divergence).

### B. Analytics page upgrade (medium)
1. Raw event log: table with expandable rows — time, slug, browser+OS, platform, country/city, **IP (mono)**, dwell, scroll, completed; expanded row shows **full UA**, ASN/org, colo, referrer, visitorId.
2. Client-side filtering (slug/country/platform) + auto-refresh toggle polling `/dev/portal/api/admin/analytics/events` (realtime debugging).
3. New "Listening" section rendering `summary.listening` (totals, top tracks, surfaces, daily) when present.

### C. dev/blog portal UI (medium)
1. `listPosts` in `ghost-admin.ts` (fields id,slug,title,status,updated_at; order updated_at desc).
2. `/dev/portal/blog` page: post list (drafts first) + iframe split view embedding `/dev/blog/[id]` (which already live-reloads). Nav item added to `portal-nav.ts`.
3. JSON route `/dev/portal/api/ghost-posts` for client-side list refresh polling.
4. `/dev/blog` (bare) redirects to `/dev/portal/blog`.
5. Docs: document new routes; run `SITE_API_REPO=/Users/tutu/Dev/site-api bun run check:docs-coverage`.

## Verification
`bun run check`, `bun run test:unit`, docs coverage, then boot dev server and verify in browser (dev serves demo analytics data when binding is absent). Commit per workstream, Conventional Commits, no rationale suffixes.
