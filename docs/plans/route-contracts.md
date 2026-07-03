# Executive Plan: Route Contracts and Proxy Cleanup

Workstream of the July 2026 architecture audit — report `docs/reviews/architecture-audit-2026-07.md` ([#64](https://github.com/bunizao/site/pull/64)). Pairs with the `claude/audit-route-consolidation` workstream in `site-api` (bunizao/site-api#7).

## Objective

Make API paths part of the shared contract so aliases cannot grow back, enforce contract sync in CI, and remove this repo's contribution to the duplicated URL surface.

## Scope

1. **Path constants in contracts** (`packages/contracts/src/routes.ts`, new)
   - Export canonical path constants (e.g. `MOOD_LIVE_FEED = '/v1/mood'`, `MOOD_ARCHIVE_FEED = '/v2/mood'`, `MOOD_LIVE_META = '/v1/mood/meta'`, notify/admin/webhook paths per the consolidation plan).
   - This repo is the canonical contracts copy; `site-api` consumes via `bun run sync:contracts`.
   - Consumers here: `src/features/mood/server/api-client.ts` and the proxy routes.
2. **Contract sync in CI**
   - Add a `sync-contracts --check` job to this repo's PR workflow and to `site-api`'s `ci.yml` (the check script already exists in `site-api/scripts/sync-contracts.ts`; today no CI invokes it, so drift surfaces only at runtime).
   - Note: the check needs both repos checked out side by side; implement as a checkout of the sibling repo pinned to its default branch (read-only) or a hash-manifest comparison committed alongside the contracts.
3. **Kill the fourth URL shape** (`src/pages/v2/[...path].ts`)
   - `buxx.me/v2/*` currently proxies through this worker to `site-api` — the only URL shape with an extra hop. Convert to a 308 redirect to `/api/v2/...`; delete after one release cycle.
4. **E2E fixtures out of the hot path** (`src/pages/api/[...path].ts`)
   - `createE2EApiFixtureResponse` runs first on every proxied API request. Gate the whole fixture module behind a single env check resolved once, so production requests skip fixture logic entirely.

## Non-goals

- No changes to `site-api` routes (handled by its own workstream).
- No removal of the `/api/[...path]` preview/dev fallback (its role is intentional).
- `/oauth` and `/dev/portal` catch-alls are handled by the admin-portal-removal workstream.

## Task breakdown

1. Add `routes.ts` to contracts; migrate `api-client.ts` path literals. (S)
2. CI check in both repos (this repo's `pr-tests.yml`, `site-api`'s `ci.yml`). (S)
3. `/v2/[...path]` → 308; adjust `run_worker_first` if needed; schedule deletion. (S)
4. Fixture gating refactor + verify e2e suites still intercept correctly under the fixture env. (S)

## Files touched

`packages/contracts/src/routes.ts` (new), `packages/contracts/src/index.ts`, `src/features/mood/server/api-client.ts`, `src/pages/v2/[...path].ts`, `src/lib/http/e2e-api-fixtures.ts`, `.github/workflows/pr-tests.yml`, `wrangler.jsonc` (`run_worker_first`), plus a synced contracts commit in `site-api`.

## Risks

- Cross-repo CI check can produce false failures when contract changes land in one repo before the other; mitigate by making the check advisory (warn) on `site-api` until the sync lands, strict here.
- Any external consumer of `buxx.me/v2/*` sees a 308; acceptable (redirect preserves method and body semantics), and the shape was never documented as canonical.

## Rollout & verification

- `bun run check` + unit tests; e2e suite under fixture env proves interception still works.
- Curl matrix: `buxx.me/v2/mood` returns 308 to `/api/v2/mood`; `/api/*` fallback unchanged in preview.
- CI dry-run: introduce a deliberate one-character contract drift in a scratch branch and confirm the check fails.

## Dependencies

- Pairs with `site-api` route consolidation (bunizao/site-api#7); path constants should land first so the consolidation consumes them.
- The `MOOD_LIVE_META` constant is consumed by the hybrid-read workstream (#65).
