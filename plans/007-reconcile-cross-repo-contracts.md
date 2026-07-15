# Plan 007: Reconcile canonical contracts across `site` and `site-api`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update this plan's status row in
> `plans/README.md` unless a reviewer says they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4b575c2a..HEAD -- packages/contracts package.json scripts/check-route-contracts.ts .github/workflows/pr-tests.yml tests/unit/contracts.test.ts && git -C ../site-api diff --stat 1be3ad9..HEAD -- packages/contracts scripts/sync-contracts.ts .github/workflows/ci.yml tests/unit/ci-workflow.test.ts`
> If an in-scope file changed, compare the current-state evidence below with
> the live code. Any semantic mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: dx
- **Planned at**: `site` commit `4b575c2a`; `site-api` commit `1be3ad9`, 2026-07-13
- **Issue repository**: `bunizao/site`
- **Issue**: https://github.com/bunizao/site/issues/74

## Why this matters

`site` is the declared source of truth for `@bunizao/contracts`, but the two
copies currently contain valid additions in opposite directions. The backend
has CV contracts absent from `site`; `site` has Mood live-count contracts absent
from the backend. `bun run sync:contracts --check` fails, and blindly syncing
would delete working CV types. Reconcile intent first, then restore byte-for-byte
equality and a CI gate that catches future drift.

## Current state

- `site/packages/contracts/` is canonical by repository policy.
- `site-api/scripts/sync-contracts.ts:39-84` compares all TypeScript files and
  `package.json`, deleting target-only files during a non-check sync.
- `site-api/packages/contracts/src/cv.ts` and the `./cv` package export exist only
  in `site-api`.
- `site/packages/contracts/src/mood.ts` defines `MoodLiveCount` and
  `MoodLiveCountsResponse`; the backend mirror does not.
- `site/packages/contracts/src/routes.ts` defines `MOOD_LIVE_COUNTS_PATH`; the
  backend mirror instead contains the CV route constants.
- `site/scripts/check-route-contracts.ts` only compares `routes.ts` and assumes a
  sibling checkout. `site-api` CI already checks the full mirror after checking
  out canonical `site`.
- Current proof of failure:

  ```text
  Contracts drift from ../site: cv.ts, index.ts, mood.ts, routes.ts,
  package.json. Run `bun run sync:contracts`.
  ```

Keep the repository boundary: shared packages contain DTOs and route constants,
never private backend logic.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Inspect drift | `bun run sync:contracts --check` in `../site-api` | initially exits 1 with the five known files |
| Sync mirror | `bun run sync:contracts` in `../site-api` | reports the reconciled files, exit 0 |
| Verify mirror | `bun run sync:contracts --check` in `../site-api` | exit 0, "Contracts in sync" |
| Site checks | `bun run check && bun run test:unit` | exit 0, all tests pass |
| API checks | `bun run check && bun run test:unit` in `../site-api` | exit 0, all tests pass |
| Builds | `GHOST_MOCK_CONTENT=1 bun run build && (cd ../site-api && bun run build)` | both exit 0 |

## Scope

**In scope**:

- `packages/contracts/src/cv.ts` (create in `site` from the backend contract)
- `packages/contracts/src/index.ts`
- `packages/contracts/src/mood.ts`
- `packages/contracts/src/routes.ts`
- `packages/contracts/package.json`
- `tests/unit/contracts.test.ts`
- `scripts/check-route-contracts.ts` or a clearly named full-package successor
- `package.json`
- `.github/workflows/pr-tests.yml`
- `../site-api/packages/contracts/**` only through the sync script
- `../site-api/tests/unit/ci-workflow.test.ts` if workflow assertions need updating

**Out of scope**:

- Private CV service implementation, D1 schema, auth, or UI.
- Changing route values or response semantics merely to make copies match.
- Moving either Worker into the other repository.
- Adding credentials that let public `site` CI read the private repository.

## Git workflow

- Branches: `advisor/007-contract-baseline` in each touched repository.
- Commit each repository separately with Conventional Commits.
- Suggested commits: `fix(contracts): reconcile canonical package` and
  `chore(contracts): sync canonical package`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Reconstruct the canonical union in `site`

Copy the CV DTO definitions from `../site-api/packages/contracts/src/cv.ts` into
canonical `site`, add its root and subpath exports, and retain all current Mood
live-count types and routes. Compare every drifted file manually before syncing;
the desired result is the union of valid CV and Mood work, not either branch
winning wholesale.

Add contract tests that import the CV request/response types, CV route constants,
Mood live-count types, and `MOOD_LIVE_COUNTS_PATH` through the public package
entrypoints.

**Verify**: `bun test tests/unit/contracts.test.ts` -> all contract tests pass.

### Step 2: Sync the private mirror from canonical `site`

Run the existing backend sync only after Step 1. Inspect the resulting diff and
confirm that it adds the Mood live-count pieces without deleting CV exports.

**Verify**: `(cd ../site-api && bun run sync:contracts --check)` -> exit 0 and no
drifted filenames.

### Step 3: Make the authoring-side gate honest

Replace the route-only naming with a full-contract check where local sibling
comparison is available. In public CI, test canonical package self-consistency
(exports resolve and contract unit tests run); do not attempt to checkout the
private mirror with a new secret. Keep `site-api` CI as the byte-equality gate
because it can safely checkout the public canonical repository.

Update workflow source tests so the intended split is explicit: canonical CI
validates exports and types; mirror CI validates byte equality.

**Verify**: `bun run check && bun run test:unit` in both repositories -> exit 0.

### Step 4: Validate production builds

Build both Workers after dependency resolution. Do not deploy.

**Verify**:

- `GHOST_MOCK_CONTENT=1 bun run build` in `site` -> exit 0.
- `bun run build` in `../site-api` -> exit 0.
- `git diff --exit-code -- packages/contracts ../site-api/packages/contracts`
  is not a valid cross-directory comparison; instead rerun
  `(cd ../site-api && bun run sync:contracts --check)` -> exit 0.

## Test plan

- Extend `site/tests/unit/contracts.test.ts` with imports for every reconciled CV
  and Mood symbol.
- Keep/update `site-api/tests/unit/ci-workflow.test.ts` so full sync remains a CI
  requirement.
- Add a source-level workflow assertion on the canonical side if the repository
  follows that existing testing pattern.
- Negative test: a temporary altered mirror passed to the check script must exit
  non-zero and name the drifted file; use a temp directory, never edit the real
  sibling during the test.

## Done criteria

- [ ] `site` contains CV and Mood live-count contracts together.
- [ ] `bun run sync:contracts --check` in `site-api` exits 0.
- [ ] Contract imports work through root and documented subpath exports.
- [ ] Both repositories pass `bun run check`, `bun run test:unit`, and build.
- [ ] No private implementation code entered `packages/contracts`.
- [ ] Only in-scope files changed in each repository.

## STOP conditions

- A CV or Mood constant has incompatible consumers with different desired values.
- Sync would delete a contract still imported by either repository.
- Public `site` CI would require a new credential to clone `site-api`.
- Fixing contracts requires changing endpoint behavior rather than shared types.
- Any verification fails twice after a reasonable correction.

## Maintenance notes

Future contract changes start in `site`, then sync into `site-api`. Reviewers
should reject backend-only DTO additions even if backend CI is temporarily green.
The public workflow cannot prove private mirror equality; that remains the
private repository's CI responsibility.
