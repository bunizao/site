# Executive Plan: Mood Hybrid Read

Workstream of the July 2026 architecture audit — report `docs/reviews/architecture-audit-2026-07.md` ([#64](https://github.com/bunizao/site/pull/64)). Depends on the `claude/audit-mood-live-meta` workstream in `site-api` (bunizao/site-api#8).

**Status: Phase 1 shipped.** Production uses the D1 archive as the base reader,
patches visible counts through `/api/v2/moods/live-counts`, and probes the
archive for new posts while archive mode is active. Archive page reads are
strict unless a caller explicitly requests fallback. Dedicated server/VPS
reconciliation supersedes the proposed client-triggered reconcile hook.

## Objective

Cut the documented ~3 s `t.me` round-trip (≈65% of mood LCP per the comment in `src/features/mood/server/telegram-source.ts`) out of the SSR path by rendering structure from the D1 archive, while keeping reactions and comment counts live — the owner-confirmed real-time requirement.

## Design

- **SSR** (`/mood`, `/mood/[id]`): read the archive through the `API` service binding (`loadMoodFeed`/`loadMoodDocument` with `source: 'archive'`, which already exists in `src/features/mood/server/api-client.ts`). Same `MoodFeedItem`/`MoodContentDocument` contracts — markup and components unchanged.
- **Liveness patch**: after hydration, fetch `GET /api/v2/moods/live-counts?ids=<id1>,<id2>,…` for the on-screen posts and patch only the reaction/comment-count text nodes in place — keyed, no item re-render, no layout shift.
- **Comments**: unchanged — comment threads stay client-fetched from live endpoints.
- **New-post detection**: the existing 75 s update watcher probes the D1-backed v2 endpoint while archive mode is active. Missed-webhook repair belongs to the dedicated reconciliation process, not a browser-triggered hook.
- **Switch**: `MOOD_READ_SOURCE=live|archive` env var feeds the default `source`; instant rollback by flipping the var.

## Phases

1. **Phase 1 (shipped)**: production source switch, strict archive base reads, visible live-count patching, and source-aware update probing behind the env var.
2. **Phase 2 (follow-up, after stability window)**: consider deleting `src/features/mood/server/telegram-source.ts` only after parity and fallback evidence. This does not by itself remove Cheerio, which has other consumers. Live comments must retain a supported API path first.

## Non-goals

- No change to comment behavior or archiving (owner decision: comments are not archived).
- No visual or component changes.
- Phase 2 deletion is explicitly out of this branch.

## Task breakdown

1. Wire `MOOD_READ_SOURCE` into `api-client.ts` default source resolution. (S)
2. Add `MoodMetaItem` contract type in `packages/contracts` (canonical here; sync to `site-api`). (XS)
3. Client meta patching in the feed controller/update watcher: collect on-screen ids, fetch meta, patch counters. (M)
4. Reconcile ownership: keep repair in the dedicated server/VPS process; the browser watcher only probes the active read source. (S)
5. Parity gate: script comparing live vs archive `MoodFeedItem` serializations for the latest N posts (expected diffs: reactions, comment counts, media hosts); run before flipping the default. (M)
6. E2E: existing mood fixtures keep passing; add a fixture asserting counters patch without re-render (DOM node identity stable). (M)

## Files touched

`src/features/mood/server/api-client.ts`, `src/features/mood/client/feed-update-watcher.ts` (or a small new `meta-patcher.ts`), `packages/contracts/src/mood.ts`, `src/pages/mood.astro` / `mood/[id].astro` (source plumb-through only), `scripts/` (parity diff), `tests/e2e/*`.

## Risks

- Archive gaps (missed webhooks) would render stale feeds; mitigated by dedicated reconciliation, source-aware probing, and parity audits.
- Reaction counts in SSR HTML may be minutes stale for no-JS readers; accepted trade-off (patched within ~1 s for JS readers).
- Media URLs differ between sources (archive uses R2-backed URLs); parity gate verifies rendering equivalence.

## Rollout & verification

- Preview deploy with `MOOD_READ_SOURCE=archive`; compare `/mood` TTFB and LCP against live (CI Lighthouse job before/after).
- Parity diff on the latest 50 posts must show only expected fields.
- Flip production var; watch for 500s and visual regressions; rollback = flip back.

## Dependencies

- The original `site-api` dependency is resolved.
- Contract additions still land here first (canonical) and sync to `site-api`.
