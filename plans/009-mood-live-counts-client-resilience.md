# Plan 009: Harden mood live-count hydration and live comment parsing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in the "STOP conditions" section occurs, stop and report — do not
> improvise. Your reviewer maintains `plans/README.md`; do not edit it.
>
> **Drift check (run first)**:
> `git diff --stat da8c4747..HEAD -- src/features/mood/client/meta-patcher.ts src/features/mood/server/telegram-source.ts src/features/mood/shared/comments.ts tests/unit`
> If any in-scope file changed since `da8c4747`, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: `site` commit `da8c4747`, 2026-07-19

## Why this matters

Production mood pages render from the D1 archive and hydrate live comment
counts/reactions client-side. Three defects make that hydration lie to users:
(1) a single failed `/api/v2/moods/live-counts` fetch permanently blocks
re-hydration of those posts for the session, (2) the live scraper parses
abbreviated counts like "1.2K" as `1`, and (3) the live comments fetch has no
timeout so one slow t.me response stalls the comments UI indefinitely. A stale
code comment also claims comment HTML is sanitized upstream when the live path
does not sanitize (tracked separately in `../site-api` plan 016; here we only
correct the comment).

## Current state

- `src/features/mood/client/meta-patcher.ts:227-238` — `patchVisible` adds ids
  to `attemptedIds` **before** awaiting `fetchLiveCounts`, and the promise ends
  in `.catch(() => undefined)`. `collectVisibleMoodIds` (`:37-51`) excludes
  `attemptedIds`, so failed ids are never retried.

  ```ts
  const ids = collectVisibleMoodIds(root, attemptedIds);
  if (!ids.length) return;
  ids.forEach((id) => attemptedIds.add(id));

  pending = fetchLiveCounts(ids)
    .then((counts) => { ... })
    .catch(() => undefined)
  ```

- `src/features/mood/server/telegram-source.ts:1485-1488` — comment count
  parse uses `text.match(/(\d+)/)`, so `"1.2K comments"` yields `1`.
- `src/features/mood/server/telegram-source.ts:1764-1769` — `getPostComments`
  fetch options are `{ retry: 2, retryDelay: 100 }` with **no `timeout`**.
  Every other render-path call in this file is capped (`retry: 0, timeout:
  1500` at `:345`, `:372`, `:1509`).
- `src/features/mood/shared/comments.ts:146` — comment reads
  `// \`/api/comments\` returns HTML sanitized by the private mood API.` This
  is currently false for the production live path.
- Repo conventions: vanilla TS modules, no classes; unit tests in
  `tests/unit/*.test.ts` using `bun:test` (`describe/it/expect`). Model new
  tests on `tests/unit/mood-feed-anchor.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run check` | exit 0 |
| Target tests | `bun test tests/unit/mood-meta-patcher.test.ts` | all pass |
| Unit suite | `bun run test:unit` | all pass |

If a command fails with `EPERM` (Dropbox TCC sandbox), report it in NOTES and
continue with the remaining verifications; do not silently skip.

## Scope

**In scope**:

- `src/features/mood/client/meta-patcher.ts`
- `src/features/mood/server/telegram-source.ts` (only `getCommentsCount` count
  parsing and `getPostComments` fetch options)
- `src/features/mood/shared/comments.ts` (comment text at `:146` only)
- `tests/unit/mood-meta-patcher.test.ts` (create)

**Out of scope**:

- Any change to `../site-api` (the server-side null-vs-zero fix is plan 016
  there).
- `fetchLiveCounts` retry logic, request batching, or the IntersectionObserver
  wiring.
- The feed renderer, FeedShell markup, or the comments popover.

## Git workflow

- Branch: `fix/mood-hardening` (create from `main` if it does not exist; if it
  exists, continue on it).
- Conventional Commit, no rationale suffixes: `fix(mood): retry failed live-count hydration`
- Do not push.

## Steps

### Step 1: Mark ids attempted only on success

In `meta-patcher.ts`, move the `attemptedIds.add` bookkeeping so ids are added
only after `fetchLiveCounts` resolves. On rejection, ids must remain eligible
for the next `patchVisible` pass. Keep the `pending` single-flight guard.

**Verify**: new unit test — a `fetchLiveCounts` stub that rejects once then
resolves must result in the counts being applied on the second `patchVisible`
call. `bun test tests/unit/mood-meta-patcher.test.ts` → pass. (Export a small
seam if needed: the module already accepts `root` and `readSource`; inject the
fetch via an optional option rather than a global mock if that is simpler.)

### Step 2: Parse abbreviated counts

In `telegram-source.ts` `getCommentsCount`, replace the `(\d+)` match with a
parser that handles `1.2K` / `3M` style suffixes (multiply by 1e3/1e6, round).
Keep returning a plain number.

**Verify**: add cases to the new test file (the parser should be exported or
extracted so it is unit-testable without cheerio): `"1.2K comments"` → `1200`,
`"12 comments"` → `12`, `"3M"` → `3000000`.

### Step 3: Cap the live comments fetch

In `getPostComments`, change the fetch options to `retry: 1, retryDelay: 100,
timeout: 2500`. The existing catch path already returns an empty page.

**Verify**: `grep -n "retry: 2" src/features/mood/server/telegram-source.ts`
→ no matches.

### Step 4: Correct the stale sanitization comment

Rewrite `shared/comments.ts:146` to state the actual contract, e.g. that the
API returns Telegram-scraped HTML and sanitization is enforced upstream in
`site-api` (see its plan 016). One or two lines, English.

**Verify**: `grep -n "sanitized by the private mood API" src/features/mood/shared/comments.ts` → no matches.

## Test plan

- `tests/unit/mood-meta-patcher.test.ts` (new): retry-after-failure behavior;
  ids attempted-on-success-only; abbreviated-count parser cases.
- Existing suites stay green: `bun run test:unit`.

## Done criteria

- [ ] `bun run check` exits 0
- [ ] `bun test tests/unit/mood-meta-patcher.test.ts` passes with ≥4 tests
- [ ] `bun run test:unit` passes
- [ ] A rejected live-counts fetch no longer permanently excludes ids
- [ ] No files outside the in-scope list modified (`git status`)

## STOP conditions

- `meta-patcher.ts` no longer contains the `attemptedIds` pattern shown above.
- Adding a test seam requires changing the public API consumed by
  `feed-controller.ts` beyond an optional parameter.
- Verification fails twice after a reasonable fix attempt.

## Maintenance notes

- `../site-api` plan 016 changes the live-counts endpoint to return `null` for
  unknown counts; the client `!== null` guards in `meta-patcher.ts` already
  handle that — do not add client-side compensation for it here.
- If hydration batching changes later, preserve the attempted-on-success-only
  invariant.
