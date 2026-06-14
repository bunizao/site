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
bun dev                  # Dev server at http://localhost:4321 (op run + astro dev)
bun run check            # Astro type/content check
bun run build            # Production build
bun run test:unit        # Unit tests plus notify service e2e tests
bun run test:e2e:site    # Playwright site e2e tests
bun run test:e2e:worker  # Telegram image proxy worker e2e tests
bun run test:ops         # Scheduled ops health tests
bun preview              # Preview production build locally
```

No separate linter is configured.

## Related Repository (site-api)

This is the public Worker. The private Worker `site-api` lives in the sibling repo `../site-api` (separate git repo, same `Dropbox/Dev/` parent). It owns D1, KV, R2, queues, crons, admin/OAuth, notify, the Telegram webhook, and the image proxy at `api.buxx.me`. This site reaches it through the `API` service binding and proxies `buxx.me/api/*`. Keep them split — it is the public/private security boundary.

- `@bunizao/contracts` is duplicated in both repos as byte-identical copies; **this repo (`site`) is canonical**. After editing contracts, sync the copy in `../site-api` via `bun run sync:contracts` there.
- The `API` binding only resolves under `wrangler dev`/deploy, not plain `astro dev`, so `bun dev` alone cannot exercise the mood `?api-v2=true` path. Run `site-api` under `wrangler dev` and wire it via multi-worker dev to test v2 locally.

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

Read path is `src/features/mood/server/api-client.ts`. The `?api-v2=true` flag is plumbed but not yet wired — both modes currently run the legacy live `t.me` scrape. The structured D1 read (v2) is built in `../site-api`.
