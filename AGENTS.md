# CLAUDE.md

## Code Standards

- All code comments, documentation, commit messages, variable names, and identifiers MUST be in English. No exceptions.

## Commit Message Guidelines

- Use clear, imperative, and concise phrasing.
- Do not use "for" or "to" to append reasons or outcomes (no "for clarity", "to enhance", "to improve", etc.).
- If you need to add scope, keep it as a direct noun phrase (what changed), not a rationale.
- Examples:
  - `feat: add search filter input`
  - `fix: handle empty response`

## Development Commands

Requires Node.js >= 22.12 (`.node-version` is set to 22). A node 18 shell silently breaks every `wrangler` command — switch with nvm/Volta.

```bash
bun install              # Install dependencies (uses Bun, not npm/yarn/pnpm)
bun dev -- --background       # Default dev server form; runs at http://localhost:4321 without occupying the terminal
bunx astro dev status         # Check the background dev server
bunx astro dev logs --follow  # Follow background dev server logs
bunx astro dev stop           # Stop the background dev server
bun dev                  # Foreground fallback only when interactive server logs are required
bun dev:api              # Background dev server + proxy /api/* to local site-api at 127.0.0.1:8787
bun run check            # Astro type/content check
bun run build            # Production build (Cloudflare adapter applies here, not in dev)
bun run test:unit        # Unit tests plus notify service e2e tests
bun run test:e2e:site    # Playwright site e2e tests
bun run test:e2e:worker  # Telegram image proxy worker e2e tests
bun run test:ops         # Scheduled ops health tests
bun preview              # Preview production build locally (wrangler dev on built worker)
```

No separate linter is configured.

## Dev Server & Worktree Hygiene

RAM is the scarce resource on this machine; leaked dev servers and stale
worktrees are the main offenders. Rules for agent sessions:

- Do not start a dev server unless the task needs browser verification.
  `bun run check` and unit tests are the default verification path.
- One dev server per checkout, max 3 machine-wide. A PreToolUse hook
  (`scripts/hooks/dev-server-guard.ts`) denies starts beyond that. When
  denied, reuse the running server (`bunx astro dev status`) instead of
  retrying; restart via `bunx astro dev stop` only when genuinely needed.
- The background server of a checkout is stopped automatically when the
  session ends (SessionEnd hook, `scripts/hooks/stop-dev-server.sh`).
- `bash scripts/worktree-gc.sh` lists merged or stale worktrees; `--apply`
  removes them and prunes registrations. Run it when worktrees pile up.
- Dev scripts cap the Node heap at 1GB (`NODE_OPTIONS` in package.json), so a
  long-lived server GCs instead of ballooning.

**Dev runtime note:** `astro dev` runs on Astro's native Node SSR — the Cloudflare adapter (and its workerd runner) only applies during `build`. In dev, `/api/*`, `/v2/*`, and `/oauth*` are proxied over HTTP via `API_DEV_ORIGIN` (default `https://buxx.me`). Use `bun dev:api` to redirect that proxy to a local `wrangler dev` site-api instead. Set `API_DEV_ORIGIN` in `.env.local` to target a preview deployment or any other origin.

## Related Repository (site-api)

This is the public Worker. The private Worker `site-api` lives in the sibling repo `../site-api` (separate git repo, same `Dropbox/Dev/` parent). It owns D1, KV, R2, queues, crons, admin/OAuth, notify, the Telegram webhook, the image proxy, and concrete public API implementations. Production `buxx.me/api/*` is directly routed to `site-api`; this repo keeps only a thin `/api/*` service-binding fallback for deploy/preview environments. Keep them split — it is the public/private security boundary.

- `@bunizao/contracts` is published from `packages/contracts` here; **this repo (`site`) is canonical**. `../site-api` pins an exact published version. After editing contracts, bump the package version, publish, then raise the pin in `../site-api` (`package.json`, `scripts/check-contract-package.ts`, `tests/unit/ci-workflow.test.ts`).
- To develop against a local site-api: run `bun run dev` in `../site-api` (boots wrangler on `127.0.0.1:8787`), then use `bun dev:api` here. The `API` service binding only resolves at deploy/`wrangler dev` time; `bun dev` is not broken without it — it just proxies to prod.

## Architecture

**Astro v7** + **React** (@astrojs/react) + **TailwindCSS** + **TypeScript**. Runtime target: **Cloudflare Workers** (`site`).

- `@` maps to `./src` (configured in `astro.config.mjs`). Use `@/lib/utils` instead of relative paths.
- The living reference is published at `/docs` and authored in `src/content/docs/`. `src/content/docs/architecture.md` has the full directory structure, API endpoints, data sources, and environment variables.
- Work that is not reference material lives outside it: active plans in `plans/`, written-once records in `notes/` (see `notes/README.md`). When a code change makes a published doc wrong, fix the doc in the same PR; never update anything in `notes/archive/`.

## Keeping the API reference current

`/docs/api/*` documents every HTTP route both Workers answer, and
`bun run check:docs-coverage` fails when one is missing. Run it after adding,
renaming, or deleting anything under `src/pages/` in **either** repo.

- The guard walks `src/pages/**/*.{ts,js}` in `site` and `../site-api`, derives
  each public path, and checks that some page under `src/content/docs/` names
  it. Pass a different sibling path as `bun scripts/check-docs-coverage.ts <path>`
  or via `SITE_API_REPO`; without the sibling repo it checks the `site` half and
  says so. An explicitly supplied path is strict: if it does not contain
  `site-api` routes, the command fails instead of silently checking one repo.
- Fix a failure by documenting the route, not by loosening the matcher. A route
  that genuinely should not be documented goes in `EXEMPT` in the script with a
  reason.
- Coverage is the floor, not the goal — the guard only proves a path is
  *mentioned*. Updating a route's contract means updating its prose too.
- site-api strips a leading `/api` at ingress, so `src/pages/footer.ts` there
  serves `buxx.me/api/footer`. Write the `/api`-prefixed form in docs; the guard
  accepts either.
- Which page: public JSON by topic (`mood`, `listening`, `status`, `content`,
  `notify`, `analytics`), `site-routes` for routes the public Worker answers
  itself, and `internal` for admin, webhook, and cron routes — those get path,
  purpose, and auth tier only, never request or response contracts, because
  `/docs` is public and `site-api` is the private half of the boundary.

## Image Uploads

- **MUST** compress images before uploading to save tokens.
- Downscale longest edge to ~1600px, strip metadata, export as JPEG/WebP at 75-85 quality.
- macOS: `sips -Z 1600 input.png --out input-1600.png && sips -s format jpeg -s formatOptions 80 input-1600.png --out input-1600.jpg`

## Mood Navigation (Three-Level Menu)

1. **Level 0 (Home Preview)**: `src/features/mood/ui/HomePreview.astro`
2. **Level 1 (Mood Feed)**: `/mood` with `src/features/mood/ui/TimelineWheel.astro`
3. **Level 2 (Mood Detail)**: `/mood/[id]`

Read path is `src/features/mood/server/api-client.ts`. User-facing base content reads use the structured D1 archive (v2) by default, with the live v1 Telegram mirror as a bounded fallback and the source for freshness-sensitive counts and reactions.
