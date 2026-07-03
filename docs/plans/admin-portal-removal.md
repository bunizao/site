# Executive Plan: Admin Portal Removal

Workstream of the July 2026 architecture audit (`docs/reviews/architecture-audit-2026-07.md`). Depends on the `claude/audit-admin-portal-migration` workstream in `site-api` (bunizao/site-api#10) being deployed and verified.

## Objective

Once the admin portal serves from `admin.buxx.me` (private worker, Cloudflare Access), remove the portal UI, its proxy chain, and the duplicated auth configuration from this public, open-source worker.

## Scope

1. **Portal UI**: delete `src/pages/dev/portal/**` (pages), `src/features/admin/ui/**` (React components), `src/layouts/PortalLayout.astro`, and the `.theme-portal` style scope. Prune the shadcn/ui primitives under `src/components/ui/` that only the portal used.
2. **Proxy chain**: delete `src/pages/dev/portal/api/[...path].ts` and the `/oauth/[...path]` catch-all; `src/pages/dev.ts` and `src/pages/oauth.ts` become 301 redirects to `admin.buxx.me`.
3. **Auth config dedup**: remove `CLOUDFLARE_ACCESS_TEAM_DOMAIN` / `CLOUDFLARE_ACCESS_AUDS` / `CLOUDFLARE_ACCESS_ALLOWED_EMAILS` from this repo's `wrangler.jsonc` and the `features/admin/server/*` code paths that only served the portal (`portal-client.ts`, dev bypass plumbing), keeping whatever the docs-visibility middleware still needs.
4. **Middleware**: simplify `src/middleware.ts` — the `/dev` gating collapses to the redirect; docs visibility checks stay.
5. **Routing config**: shrink `run_worker_first` in `wrangler.jsonc` (`/dev`, `/dev/*`, `/oauth*` entries) to the minimum the redirects need.

## Non-goals

- No changes to public site auth-free surfaces.
- Docs (`/docs*`) protection stays as-is (session check against `site-api`).
- Nothing here lands before the migration is verified in production (hard gate).

## Task breakdown

1. Inventory portal-only imports (components, styles, icons) to avoid deleting shared code; `bun run check` as the guard. (S)
2. Delete UI + proxies; add the 301s. (M)
3. Strip Access vars + portal-only server code; verify docs middleware still functions. (S)
4. Update `docs/ARCHITECTURE.md`, `AGENTS.md`, `CLAUDE.md` references to `/dev/portal` and the OAuth hub. (S)
5. Bundle-size note in the PR (React island count drops; portal chunks disappear). (XS)

## Files touched

`src/pages/dev/**` (deleted, redirect stubs remain), `src/pages/oauth*` (redirect stubs), `src/features/admin/**` (mostly deleted), `src/layouts/PortalLayout.astro` (deleted), `src/components/ui/*` (pruned), `src/middleware.ts`, `wrangler.jsonc`, `docs/*`.

## Risks

- Deleting shared UI primitives by mistake; mitigated by the import inventory and `bun run check`/build.
- Bookmarked portal URLs breaking; covered by the 301s.
- Removal before the new portal is proven — prevented by the hard dependency gate.

## Rollout & verification

- Preview deploy: `/dev`, `/dev/portal/*`, `/oauth` 301 to `admin.buxx.me`; public pages unaffected; docs auth still works.
- `bun run build` + full e2e suite; confirm portal chunks are gone from `dist`.
- Rollback: revert commit (the migration keeps the portal functional on `admin.buxx.me` regardless).

## Dependencies

- Hard-blocked by `site-api` `claude/audit-admin-portal-migration` (bunizao/site-api#10) reaching production and passing its verification checklist.
