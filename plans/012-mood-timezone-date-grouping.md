# Plan 012: Unify SSR and client date/time rendering on the visitor's timezone

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in the "STOP conditions" section occurs, stop and report — do not
> improvise. Your reviewer maintains `plans/README.md`; do not edit it.
>
> **Drift check (run first)**:
> `git diff --stat da8c4747..HEAD -- src/features/mood/ui/FeedShell.astro src/features/mood/client/feed-renderer.ts src/features/mood/client/feed-controller.ts src/features/mood/shared tests/unit`
> On drift, compare "Current state" excerpts; mismatch is a STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (lands before plan 017's render unification)
- **Category**: bug
- **Planned at**: `site` commit `da8c4747`, 2026-07-19
- **Owner decision**: display timezone = **visitor's local timezone** (user
  chose this explicitly). SSR therefore cannot know the final timezone; the
  client must own date grouping/labels after hydration.

## Why this matters

SSR runs on Cloudflare Workers where `Date` getters are UTC; the client uses
the visitor's local timezone. The two paths compute different `data-date`
group keys, so client-appended posts near midnight split into duplicate date
groups, and the first (SSR) screen shows UTC clock times while
infinite-scrolled posts show local times — one feed, two timezones.

## Current state

- Server: `src/features/mood/ui/FeedShell.astro:66-76` — `formatTime` /
  `formatDateKey` via `date.getHours()` etc. (UTC on Workers). Group markup
  emits `data-date={dateKey}` (search `data-date` in the file).
- Client: `src/features/mood/client/feed-renderer.ts:46-52` (`formatTime`),
  `feed-controller.ts:96-103` — same getters, local timezone.
- Merge point: `feed-renderer.ts:261-274` — `getGroupEntry` merges by
  `list.querySelector('[data-date="${dateKey}"]')`.
- SSR markup also renders visible date headers (`formatDateHeader`) and
  per-post `<time>` text.
- Chosen approach (decision above): **client-side rehydration of dates**.
  SSR keeps rendering in UTC (unavoidable — it has no visitor timezone), but
  every SSR-rendered element that encodes a date must carry the ISO datetime
  so the client can recompute:
  - each post already has `<time datetime={post.datetime}>`;
  - date group containers must expose enough to recompute their key — the
    posts inside them carry datetimes, so the group key can be derived from
    member posts.
  On init (before first paint of hydrated content is not achievable — accept
  one reflow), the client walks SSR groups, recomputes local-timezone keys
  from member post datetimes, rewrites `data-date`, updates header labels,
  merges adjacent groups that collapse to the same local key, and rewrites
  each post's `<time>` text to local time. All subsequent client rendering
  already uses local time, so after this pass the keys align.
- Convention: pure logic should live in `src/features/mood/shared/` (see
  `shared/feed-anchor.ts` + `tests/unit/mood-feed-anchor.test.ts` as the
  pattern) so it is unit-testable.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Target tests | `bun test tests/unit/mood-date-grouping.test.ts` | all pass |
| Typecheck | `bun run check` | exit 0 |
| Unit suite | `bun run test:unit` | all pass |
| E2E (mood) | `bun run test:e2e:site -- --grep mood` | all pass |

If a command fails with `EPERM` (Dropbox TCC sandbox), report it in NOTES.

## Scope

**In scope**:

- `src/features/mood/shared/date-grouping.ts` (create: `formatMoodTime`,
  `formatMoodDateKey`, `formatMoodDateHeader`, group-rekey helper)
- `src/features/mood/client/feed-renderer.ts`, `feed-controller.ts` (consume
  shared helpers; add the SSR-rekey pass at init)
- `src/features/mood/ui/FeedShell.astro` (delete local date helpers, import
  shared ones for the SSR render; ensure groups/posts expose datetimes)
- `tests/unit/mood-date-grouping.test.ts` (create)

**Out of scope**:

- `HomePreview.astro` and the detail page (they don't merge client groups;
  leave them; note any visible inconsistency in NOTES).
- Timeline wheel date anchors (it rebuilds from DOM and will pick up the
  rewritten keys; do not modify it here).
- Any server/API change.

## Git workflow

- Branch: `fix/mood-hardening` (continue on it if it exists).
- Conventional Commit: `fix(mood): align feed date grouping across render paths`
- Do not push.

## Steps

### Step 1: Extract shared date helpers

Create `shared/date-grouping.ts` with the three formatters taking an optional
`Date`-like now/timezone seam for tests. Replace the three duplicated
definitions (FeedShell, feed-renderer, feed-controller) with imports. Behavior
identical to today on the client.

**Verify**: `bun run check` → exit 0;
`grep -rn "function formatDateKey\|function formatTime" src/features/mood/ui/FeedShell.astro src/features/mood/client/feed-renderer.ts src/features/mood/client/feed-controller.ts`
→ no matches (imports only).

### Step 2: Client rekey pass for SSR groups

Add `rekeyServerRenderedGroups(list)` (shared module, DOM-touching part may
live in feed-renderer): for each `[data-date]` group, recompute the local key
from the first member post's `datetime` attribute, rewrite `data-date` and the
visible header, merge consecutive groups whose local keys become equal
(move children, drop empty group), and rewrite each `.mood-item time` to local
`HH:MM`. Call it once during feed init before any client append can happen.

**Verify**: unit test with happy-dom: build an SSR-shaped list where two
groups (UTC keys) collapse to one local key under a mocked timezone offset →
after rekey, one group remains, header text matches local key, and
`getGroupEntry`-style lookup by local key finds it.

### Step 3: Boundary tests

Cases: post at `23:30Z` viewed at UTC+2 (moves to next local day); posts
spanning a local-midnight boundary produce two groups with correct order;
UTC visitor (offset 0) is a no-op (idempotence: running the pass twice changes
nothing).

**Verify**: `bun test tests/unit/mood-date-grouping.test.ts` → all pass.

## Test plan

- `tests/unit/mood-date-grouping.test.ts`: formatter parity, rekey merge,
  boundary cases, idempotence. Model structure on
  `tests/unit/mood-feed-anchor.test.ts`.
- Full `bun run test:unit` and mood e2e stay green (e2e runs in one timezone;
  it guards regressions, not the boundary behavior).

## Done criteria

- [ ] One shared implementation of time/date-key/header formatting
- [ ] After init, all `data-date` keys in the DOM are local-timezone keys and
      client appends merge into SSR groups
- [ ] All listed commands pass
- [ ] Only in-scope files modified

## STOP conditions

- SSR group markup cannot be rekeyed without re-rendering post internals
  (i.e. header/keys are entangled with other markup beyond text + attribute).
- The rekey pass visibly conflicts with the anchor-scroll stabilization
  (anchor reveal happens during init — if ordering matters and cannot be
  sequenced cleanly, STOP and report).
- Verification fails twice.

## Maintenance notes

- Plan 017 (render unification) must consume the shared date module — flag it
  in that PR review.
- If date formatting ever becomes locale-aware, keep the key computation
  (grouping) separate from the label formatting.
