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
bun dev                  # Dev server (astro dev, native Node SSR). /api/* proxies to prod buxx.me.
bun dev:api              # Dev server + proxy /api/* to local site-api at 127.0.0.1:8787
bun run check            # Astro type/content check
bun run build            # Production build (Cloudflare adapter applies here, not in dev)
bun run test:unit        # Unit tests plus notify service e2e tests
bun run test:e2e:site    # Playwright site e2e tests
bun run test:e2e:worker  # Telegram image proxy worker e2e tests
bun run test:ops         # Scheduled ops health tests
bun preview              # Preview production build locally (wrangler dev on built worker)
```

No separate linter is configured.

**Dev runtime note:** `astro dev` runs on Astro's native Node SSR — the Cloudflare adapter (and its workerd runner) only applies during `build`. In dev, `/api/*`, `/v2/*`, and `/oauth*` are proxied over HTTP via `API_DEV_ORIGIN` (default `https://buxx.me`). Use `bun dev:api` to redirect that proxy to a local `wrangler dev` site-api instead. Set `API_DEV_ORIGIN` in `.env.local` to target a preview deployment or any other origin.

## Related Repository (site-api)

This is the public Worker. The private Worker `site-api` lives in the sibling repo `../site-api` (separate git repo, same `Dropbox/Dev/` parent). It owns D1, KV, R2, queues, crons, admin/OAuth, notify, the Telegram webhook, the image proxy, and concrete public API implementations. Production `buxx.me/api/*` is directly routed to `site-api`; this repo keeps only a thin `/api/*` service-binding fallback for deploy/preview environments. Keep them split — it is the public/private security boundary.

- `@bunizao/contracts` is duplicated in both repos as byte-identical copies; **this repo (`site`) is canonical**. After editing contracts, sync the copy in `../site-api` via `bun run sync:contracts` there.
- To develop against a local site-api: run `bun run dev` in `../site-api` (boots wrangler on `127.0.0.1:8787`), then use `bun dev:api` here. The `API` service binding only resolves at deploy/`wrangler dev` time; `bun dev` is not broken without it — it just proxies to prod.

## Architecture

**Astro v5** + **React** (@astrojs/react) + **TailwindCSS** + **TypeScript**. Runtime target: **Cloudflare Workers** (`site`).

- `@` maps to `./src` (configured in `astro.config.mjs`). Use `@/lib/utils` instead of relative paths.
- See `docs/ARCHITECTURE.md` for full directory structure, API endpoints, data sources, and environment variables.

## Image Uploads

- **MUST** compress images before uploading to save tokens.
- Downscale longest edge to ~1600px, strip metadata, export as JPEG/WebP at 75-85 quality.
- macOS: `sips -Z 1600 input.png --out input-1600.png && sips -s format jpeg -s formatOptions 80 input-1600.png --out input-1600.jpg`

## Mood Navigation (Three-Level Menu)

1. **Level 0 (Home Preview)**: `src/features/mood/ui/HomePreview.astro`
2. **Level 1 (Mood Feed)**: `/mood` with `src/features/mood/ui/TimelineWheel.astro`
3. **Level 2 (Mood Detail)**: `/mood/[id]`

Read path is `src/features/mood/server/api-client.ts`. User-facing reads stay on the live v1 Telegram mirror; the structured D1 archive read (v2) is built in `../site-api`.
