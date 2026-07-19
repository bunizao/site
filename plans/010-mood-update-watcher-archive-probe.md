# Plan 010: Point the mood update watcher at the archive probe and survive bfcache

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in the "STOP conditions" section occurs, stop and report — do not
> improvise. Your reviewer maintains `plans/README.md`; do not edit it.
>
> **Drift check (run first)**:
> `git diff --stat da8c4747..HEAD -- src/features/mood/client/feed-update-watcher.ts src/features/mood/client/feed-controller.ts tests/unit`
> On any in-scope drift, compare "Current state" excerpts before proceeding;
> mismatch is a STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: `site` commit `da8c4747`, 2026-07-19

## Why this matters

Production mood reads come from the D1 archive, but the freshness poller still
hits the live Telegram scrape: every open `/mood` tab forces one uncached
t.me round-trip every 75 seconds. That is a standing upstream cost and a
rate-limit exposure that scales with concurrent readers. Separately, the
poller's teardown uses `beforeunload` + `{ once: true }`, so a bfcache
(back/forward) restore returns a page whose poller is permanently dead.

## Current state

- `src/features/mood/client/feed-update-watcher.ts:313-323`:

  ```ts
  const fetchLatestMoodId = async (): Promise<string> => {
    const query = new URLSearchParams({
      probe: '1',
      fresh: '1',
    });
    const response = await fetch(`/api/moods?${query}`, {
      cache: 'no-store',
      ...
  ```

  `/api/moods` is the v1 live route; `fresh=1` sets `skipCache` server-side,
  so every poll is a full live scrape. The archive route `/api/v2/mood`
  supports the same probe (`probe=1` returns `{ latestId }`) backed by D1 with
  a 30 s edge cache; `?fresh=1` there also bypasses cache, so the archive call
  must NOT send `fresh=1`.
- The feed root carries the active read source:
  `feed-controller.ts:141` reads `feedEl.dataset.moodReadSource`; the client
  fetch path (`:236-238`) switches endpoints on `=== 'archive'`. Mirror that
  switch in the watcher.
- `feed-update-watcher.ts:435` (`start`) … `:469`:
  `window.addEventListener('beforeunload', clearUpdatePollTimer, { once: true })`.
- `feed-controller.ts:1213-1223` — the `pageshow` handler re-arms anchor
  observers on `event.persisted` but never restarts the watcher. The watcher
  factory returns `{ init, start, syncLatestSeenId, ... }`.
- The watcher is constructed in `feed-controller.ts` (search
  `initMoodFeedUpdateWatcher` / `updateWatcher`); it must learn the read
  source either via an option or by reading the same dataset attribute.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run check` | exit 0 |
| Unit suite | `bun run test:unit` | all pass |
| Probe grep | `grep -rn "fresh: '1'" src/features/mood/client/feed-update-watcher.ts` | no matches |

If a command fails with `EPERM` (Dropbox TCC sandbox), report it in NOTES.

## Scope

**In scope**:

- `src/features/mood/client/feed-update-watcher.ts`
- `src/features/mood/client/feed-controller.ts` (watcher wiring + pageshow
  restart only)
- `tests/unit/mood-update-watcher.test.ts` (create, if a pure seam exists;
  otherwise extend an existing string-free behavioral test — do NOT add
  source-text grep tests)

**Out of scope**:

- The 75 s interval, the auto-refresh countdown behavior, and notice UI.
- Server routes in either repo.
- Anchor/pagination logic in `feed-controller.ts`.

## Git workflow

- Branch: `fix/mood-hardening` (continue on it if it exists).
- Conventional Commit: `fix(mood): probe archive source and restart watcher after bfcache`
- Do not push.

## Steps

### Step 1: Source-aware probe endpoint

In `fetchLatestMoodId`, when the read source is `archive`, request
`/api/v2/mood?probe=1` (no `fresh`); keep `/api/moods?probe=1&fresh=1` for the
live source. Thread the read source in the same way `feed-controller.ts`
does (dataset attribute or an option passed at construction — match the
existing constructor style).

**Verify**: `grep -n "api/v2/mood?probe" src/features/mood/client/feed-update-watcher.ts`
→ 1 match; `grep -rn "fresh: '1'" src/features/mood/client/feed-update-watcher.ts`
→ only inside the live branch (or a live-only query builder).

### Step 2: Restart after bfcache restore

Move teardown from `beforeunload` to `pagehide`, and in the existing
`pageshow` handler in `feed-controller.ts` (the one gated on
`event.persisted`), reschedule the watcher (expose a `resume()` or reuse
`start()` with an idempotence guard — the module already tracks a `started`
flag; verify and reuse it rather than adding a second flag).

**Verify**: `bun run check` → exit 0. Manual trace in code review: after
`pagehide` then `pageshow(persisted)`, a poll is scheduled exactly once.

## Test plan

- If the watcher factory accepts an injectable `fetch`/document seam without
  API churn, add `tests/unit/mood-update-watcher.test.ts` covering: archive
  source → `/api/v2/mood?probe=1` URL; live source → legacy URL. If the module
  is too DOM-coupled for a cheap unit test, state that in NOTES and rely on
  `bun run test:unit` + typecheck (do not force a brittle test).

## Done criteria

- [ ] Archive-mode polls hit `/api/v2/mood?probe=1` and never send `fresh=1`
- [ ] Watcher teardown uses `pagehide`; bfcache restore reschedules polling
- [ ] `bun run check` exits 0; `bun run test:unit` passes
- [ ] No files outside the in-scope list modified

## STOP conditions

- The archive probe response shape differs from `{ latestId }` (check
  `loadMoodProbe` in `src/features/mood/server/api-client.ts` and the v2
  route) — report instead of adapting the shape client-side.
- The watcher restart requires restructuring `feed-controller.ts` init order.
- Verification fails twice.

## Maintenance notes

- If a tag-filtered feed mode lands (plan 015), the watcher should be disabled
  in that mode — the probe reports channel-latest, not tag-latest.
- Keep probe cadence changes in sync with the v2 route's 30 s cache TTL.
