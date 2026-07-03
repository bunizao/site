# Executive Plan: Mood Hybrid Read

Workstream of the July 2026 architecture audit — report `docs/reviews/architecture-audit-2026-07.md` ([#64](https://github.com/bunizao/site/pull/64)). Depends on the `claude/audit-mood-live-meta` workstream in `site-api` (bunizao/site-api#8).

## Objective

Cut the documented ~3 s `t.me` round-trip (≈65% of mood LCP per the comment in `src/features/mood/server/telegram-source.ts`) out of the SSR path by rendering structure from the D1 archive, while keeping reactions and comment counts live — the owner-confirmed real-time requirement.

## Design

- **SSR** (`/mood`, `/mood/[id]`): read the archive through the `API` service binding (`loadMoodFeed`/`loadMoodDocument` with `source: 'archive'`, which already exists in `src/features/mood/server/api-client.ts`). Same `MoodFeedItem`/`MoodContentDocument` contracts — markup and components unchanged.
- **Liveness patch**: after hydration, fetch `GET /v1/mood/meta?ids=<id1>,<id2>,…` for the on-screen posts (new `site-api` endpoint) and patch only the reaction/comment-count text nodes in place — keyed, no item re-render, no layout shift (same pattern as the existing update-notice flow).
- **Comments**: unchanged — comment threads stay client-fetched from live endpoints.
- **New-post detection**: the existing 75 s update watcher keeps probing live; when live is ahead of the rendered archive feed, it can additionally trigger a server-side reconcile hook so a missed webhook self-heals.
- **Switch**: `MOOD_READ_SOURCE=live|archive` env var feeds the default `source`; instant rollback by flipping the var.

## Phases

1. **Phase 1 (this branch)**: default source switch + meta patching + reconcile hook, behind the env var. Live scraping code stays as fallback.
2. **Phase 2 (follow-up, after stability window)**: delete `src/features/mood/server/telegram-source.ts` (~1.9k lines), which also removes the Prism and cheerio dependencies it pulls into this worker bundle; live comment reads route through `site-api` v1 endpoints. Sentiment/highlighting concerns move server-side at ingest (tracked in `site-api`).

## Non-goals

- No change to comment behavior or archiving (owner decision: comments are not archived).
- No visual or component changes.
- Phase 2 deletion is explicitly out of this branch.

## Task breakdown

1. Wire `MOOD_READ_SOURCE` into `api-client.ts` default source resolution. (S)
2. Add `MoodMetaItem` contract type in `packages/contracts` (canonical here; sync to `site-api`). (XS)
3. Client meta patching in the feed controller/update watcher: collect on-screen ids, fetch meta, patch counters. (M)
4. Reconcile hook: when the live probe sees an id newer than the archive feed head, call the reconcile endpoint (or `fresh` fetch) once with backoff. (S)
5. Parity gate: script comparing live vs archive `MoodFeedItem` serializations for the latest N posts (expected diffs: reactions, comment counts, media hosts); run before flipping the default. (M)
6. E2E: existing mood fixtures keep passing; add a fixture asserting counters patch without re-render (DOM node identity stable). (M)

## Files touched

`src/features/mood/server/api-client.ts`, `src/features/mood/client/feed-update-watcher.ts` (or a small new `meta-patcher.ts`), `packages/contracts/src/mood.ts`, `src/pages/mood.astro` / `mood/[id].astro` (source plumb-through only), `scripts/` (parity diff), `tests/e2e/*`.

## Risks

- Archive gaps (missed webhooks) would render stale feeds; mitigated by the reconcile hook + the live probe already in place, and by the parity gate before cutover.
- Reaction counts in SSR HTML may be minutes stale for no-JS readers; accepted trade-off (patched within ~1 s for JS readers).
- Media URLs differ between sources (archive uses R2-backed URLs); parity gate verifies rendering equivalence.

## Rollout & verification

- Preview deploy with `MOOD_READ_SOURCE=archive`; compare `/mood` TTFB and LCP against live (CI Lighthouse job before/after).
- Parity diff on the latest 50 posts must show only expected fields.
- Flip production var; watch for 500s and visual regressions; rollback = flip back.

## Dependencies

- Blocked by `site-api` `claude/audit-mood-live-meta` (bunizao/site-api#8).
- Contract addition lands here first (canonical), synced to `site-api`.
