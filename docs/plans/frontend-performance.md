# Executive Plan: Frontend Performance

Workstream of the July 2026 architecture audit (`docs/reviews/architecture-audit-2026-07.md`).

## Objective

Remove the site-wide payload and loading inefficiencies identified in the audit's frontend round, without visual changes.

## Scope

1. **`/mood` double payload** (`src/features/mood/ui/FeedShell.astro`)
   - The full initial-feed JSON (`data-mood-initial-feed`, including `mediaHtml` strings) is inlined while the critical posts are also SSR-rendered — the same content twice per response.
   - Trim the inline JSON to what the client renderer actually consumes (or embed only the non-SSR remainder); verify the hydration path against `feed-renderer.ts` expectations.
2. **Layout script weight** (`src/layouts/Layout.astro`)
   - Move the ~60-line inline `visualViewport` overscroll handler into a bundled script so it is HTTP-cached instead of repeated in every HTML response.
   - Review the five bundled blocks (spotlight overlay, theme dropdown, GSAP nav collapse, nav underline) for conditional loading where a page cannot use them; keep theme init inline (correct as-is).
3. **Fonts**
   - JetBrains Mono (113 KB, largest single asset) overlaps Geist Mono (`--font-code` vs `--font-mono`). Subset JetBrains Mono to the character ranges code blocks use, or consolidate on one mono family. Keep Geist Mono's `preload` + `font-display: optional` treatment.
4. **GSAP import consistency** (`src/features/home/ui/Hero.astro`)
   - Replace the static `import gsap from 'gsap'` (the only eager one; everything else lazy-imports) with the dynamic pattern used in `Layout.astro`/`timeline-wheel.ts`, so the home page stops eagerly fetching the GSAP chunk.
5. **Navigation prefetch** (`astro.config.mjs`)
   - Enable Astro `prefetch` for internal navigation.
6. **Dead code** (`src/worker.ts`, `src/lib/cloudflare/api-queue-bridge.ts`)
   - Delete the queue handler exported by the worker; `site` has no queue binding (cutover leftover).

## Non-goals

- No changes to the mood read source (see `docs/plans/mood-hybrid-read.md`).
- No caching changes to the intentionally-uncached realtime APIs (owner decision; header alignment happens in `site-api`).
- No visual/design changes; no framework or island architecture changes (current island usage is already good).

## Task breakdown

1. Audit `feed-renderer.ts`/`feed-controller.ts` field usage; trim the inline JSON accordingly; assert `/mood` HTML size reduction in a fixture. (M)
2. Move the overscroll handler; verify behavior on iOS Safari (the `ua-webkit` path). (S)
3. Font subsetting via `pyftsubset`/`glyphhanger` or family consolidation; update `@font-face` and license notes. (M)
4. One-line GSAP dynamic import in `Hero.astro`; verify hero animations still fire on first view. (XS)
5. `prefetch: true` (or selective `data-astro-prefetch`) in `astro.config.mjs`; confirm no prefetch on `/dev`/portal routes. (XS)
6. Delete `api-queue-bridge.ts` + the `queue` export in `worker.ts`; `bun run build` + preview smoke. (XS)

## Files touched

`src/features/mood/ui/FeedShell.astro`, `src/features/mood/client/feed-renderer.ts` (read-side audit), `src/layouts/Layout.astro`, `src/styles/globals.css`, `public/fonts/*`, `src/features/home/ui/Hero.astro`, `astro.config.mjs`, `src/worker.ts`, `src/lib/cloudflare/api-queue-bridge.ts` (deleted), `tests/e2e/*`.

## Risks

- Trimming the inline JSON risks breaking a client-renderer field dependency; mitigated by the field-usage audit plus the existing mood e2e suite.
- Font subsetting can drop glyphs used by rare code samples; mitigated by a broad code-range subset and visual spot checks on existing posts.

## Rollout & verification

- `bun run build`: compare dist HTML/chunk sizes before/after (record in the PR).
- Playwright e2e (`test:e2e:site`) green; Lighthouse CI job before/after for home and `/mood`.
- Network waterfall check: GSAP chunk no longer on the home critical path; fonts total reduced.

## Dependencies

None. Independent of the other workstreams.
