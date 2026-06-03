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

```bash
bun install              # Install dependencies (uses Bun, not npm/yarn/pnpm)
bun dev                  # Dev server at http://localhost:4321
bun run check            # Astro type/content check
bun run build            # Production build
bun run test:unit        # Unit tests plus notify service e2e tests
bun run test:e2e:site    # Playwright site e2e tests
bun run test:e2e:worker  # Telegram image proxy worker e2e tests
bun run test:ops         # Scheduled ops health tests
bun preview              # Preview production build locally
```

No separate linter is configured.

## Architecture

**Astro v5** + **React** (@astrojs/react) + **TailwindCSS** + **TypeScript**. Deployed on **Vercel**.

- `@` maps to `./src` (configured in `astro.config.mjs`). Use `@/lib/utils` instead of relative paths.
- See `docs/ARCHITECTURE.md` for full directory structure, API endpoints, data sources, and environment variables.

## Image Uploads

- **MUST** compress images before uploading to save tokens.
- Downscale longest edge to ~1600px, strip metadata, export as JPEG/WebP at 75-85 quality.
- macOS: `sips -Z 1600 input.png --out input-1600.png && sips -s format jpeg -s formatOptions 80 input-1600.png --out input-1600.jpg`

## Mood Navigation (Three-Level Menu)

1. **Level 0 (Home Preview)**: `Moods.astro`
2. **Level 1 (Mood Feed)**: `/mood` with `MoodTimelineWheel.astro`
3. **Level 2 (Mood Detail)**: `/mood/[id]`
