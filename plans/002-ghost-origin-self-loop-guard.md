# Plan 002: Fail production builds fast when PUBLIC_GHOST_URL points at a host this worker owns

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat de572482..HEAD -- scripts/build-cloudflare.mjs docs/ARCHITECTURE.md src/content/docs/docs/infra/worker-site.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `de572482`, 2026-07-04

## Why this matters

This branch adds the route `blog.buxx.me/*` → this worker (`wrangler.jsonc:30`), taking the hostname over from Ghost. But the Ghost Content API base URL used by prerendering defaults to that same hostname (`PUBLIC_GHOST_URL=https://blog.buxx.me` in `wrangler.jsonc:35` and as the fallback in `scripts/build-cloudflare.mjs:55`). Blog pages, the home Writing section, RSS, and the sitemap are all prerendered, so the Ghost fetch happens at build time in Workers CI. Sequence after merge: the first `main` build still reaches Ghost (route not yet deployed), the deploy then claims `blog.buxx.me`, and **every subsequent production build** fetches `blog.buxx.me/ghost/api/content/...` — which now hits this worker, returns an HTML 404, and the Ghost client throws (`buildGhostDataset` rethrows outside dev). Production builds break one deploy *after* merge, which is the worst time to discover it. Preview builds never exercise this path (they force mock content), so CI green today proves nothing.

The durable fix is operational — point the build-environment `PUBLIC_GHOST_URL` at the true Ghost origin (not `blog.buxx.me`) — but the repo should also refuse to start a doomed production build with a clear message instead of a confusing Ghost 404 mid-prerender.

## Current state

- `wrangler.jsonc:27-35` — routes include `{ "pattern": "blog.buxx.me/*", "zone_name": "buxx.me" }`; vars include `"PUBLIC_GHOST_URL": "https://blog.buxx.me"` (runtime var; prerendering reads the *build* env, but the value documents the current assumption).
- `scripts/build-cloudflare.mjs` — CI entry point (`bun scripts/build-cloudflare.mjs` wraps `bun run build`). Relevant excerpt as of `de572482`:

```js
// scripts/build-cloudflare.mjs:39
const buildEnv = { ...process.env };
const missing = getMissingGhostEnv();

if (missing.length > 0) {
  if (!isWorkersPreviewBuild()) {
    printMissingEnvError(missing);
    process.exit(1);
  }

  console.warn(
    [
      'Missing Ghost build env in Workers preview branch.',
      'Using mock blog content for this non-production build.',
    ].join('\n'),
  );
  buildEnv.GHOST_MOCK_CONTENT = '1';
  buildEnv.PUBLIC_GHOST_URL ||= 'https://blog.buxx.me';
}
```

- `isWorkersPreviewBuild()` (same file, lines 20-25) returns true when `WORKERS_CI === '1'` and `WORKERS_CI_BRANCH` is set and not in `PRODUCTION_BRANCHES` (`main`, `production`, `cloudflare-runtime`).
- Mock-content resolution: `src/features/posts/adapter/ghost/config.ts:89-93` — production builds on `main` use the real Ghost fetch; preview builds and dev use mocks.
- The error thrown today when Ghost is unreachable comes from `src/features/posts/adapter/ghost/dataset.ts:591-594` and is generic ("Ghost adapter is not configured...") or a raw fetch error — neither mentions the host-takeover hazard.
- Docs that state build-env requirements: `src/content/docs/docs/infra/worker-site.md:17` and `src/content/docs/docs/surfaces/home.md:31-33`.
- Repo conventions: English-only comments; conventional commits without trailing rationale clauses.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Install   | `bun install`        | exit 0              |
| Typecheck | `bun run check`      | exit 0, no errors   |
| Unit tests| `bun run test:unit`  | all pass            |
| Guard smoke | `WORKERS_CI=1 WORKERS_CI_BRANCH=main PUBLIC_GHOST_URL=https://blog.buxx.me GHOST_CONTENT_API_KEY=x node scripts/build-cloudflare.mjs` | exits 1 with the new error message BEFORE any build output |

Note: this repo lives on a Dropbox mount; sandboxed `bun`/`node` can hit
non-deterministic `EPERM`. If a command fails with `EPERM`, ask the operator to
run it in their own terminal instead of retrying.

## Scope

**In scope** (the only files you should modify):
- `scripts/build-cloudflare.mjs`
- `src/content/docs/docs/infra/worker-site.md` (one short paragraph)

**Out of scope** (do NOT touch, even though they look related):
- `wrangler.jsonc` — the route takeover is intentional; the runtime var is not what prerendering reads.
- `src/features/posts/adapter/ghost/**` — the adapter behavior (throw in prod, mock in preview/dev) is correct; the guard belongs at the CI entry point.
- Cloudflare dashboard / Workers Builds environment variables — repo code can't change them; see the operator action below.

## Git workflow

- Work on the current branch (`plan-new-blog-era`) unless the operator says otherwise.
- One commit, message style: `fix(ci): reject self-routed Ghost origin in production builds`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the guard to build-cloudflare.mjs

In `scripts/build-cloudflare.mjs`, after the existing `missing.length` block and
before `spawn(...)`, add a production-only check:

```js
// blog.buxx.me is routed to this worker (see wrangler.jsonc routes). A
// production build that fetches Ghost content through it would hit the worker
// itself and 404 on /ghost/api/*. The build env must point at the real Ghost
// origin.
const SELF_ROUTED_HOSTS = new Set(['blog.buxx.me', 'buxx.me', 'www.buxx.me']);

function ghostUrlHost(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

const ghostHost = ghostUrlHost(buildEnv.PUBLIC_GHOST_URL ?? '');
const usesMockContent = buildEnv.GHOST_MOCK_CONTENT === '1';

if (!isWorkersPreviewBuild() && !usesMockContent && ghostHost && SELF_ROUTED_HOSTS.has(ghostHost)) {
  console.error(
    [
      `PUBLIC_GHOST_URL points at ${ghostHost}, which is routed to this worker.`,
      'Production prerendering would fetch Ghost content from the worker itself and fail.',
      'Set PUBLIC_GHOST_URL in the Workers Builds environment to the real Ghost origin.',
    ].join('\n'),
  );
  process.exit(1);
}
```

Keep the file plain ESM JavaScript matching the existing style (no TypeScript syntax).

**Verify**: run the "Guard smoke" command from the table → exits 1, prints the
three-line error, and does NOT start the Astro build. Then run
`WORKERS_CI=1 WORKERS_CI_BRANCH=some-preview PUBLIC_GHOST_URL=https://blog.buxx.me GHOST_CONTENT_API_KEY=x node scripts/build-cloudflare.mjs`
→ the guard does NOT fire (preview builds are exempt; the build itself may
proceed or fail later for unrelated reasons — only the guard behavior matters;
you may Ctrl-C once the build starts).

### Step 2: Document the operator action

In `src/content/docs/docs/infra/worker-site.md`, next to the existing line 17
note about build-env Ghost vars, add 2–3 sentences: `blog.buxx.me` is routed to
this worker as of the blog migration, so the build-environment
`PUBLIC_GHOST_URL` must be the Ghost origin itself (e.g. the Ghost(Pro)/upstream
hostname), never `blog.buxx.me`; the CI wrapper refuses to build otherwise.

**Verify**: `bun run check` → exit 0 (content collections validate the docs).

## Test plan

- The guard-smoke commands in Step 1 are the tests (the script is a plain
  process wrapper; the repo has no test harness for it, and adding one is out
  of scope). Run both the firing and non-firing cases.
- `bun run test:unit` → all pass (no regressions; nothing else changed).

## Done criteria

- [ ] Guard smoke command exits 1 with the new message before any build output
- [ ] Preview-branch variant does not trigger the guard
- [ ] `bun run check` exits 0
- [ ] `bun run test:unit` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `scripts/build-cloudflare.mjs` no longer matches the excerpt (e.g. the env
  handling was restructured).
- You find evidence the production build env already sets `PUBLIC_GHOST_URL`
  to a non-buxx.me Ghost origin (e.g. a comment or doc naming the real origin)
  — the guard is still worth adding, but flag it so the operator can confirm.
- The operator cannot confirm where Ghost actually lives now. **This plan does
  not resolve that question — it only makes the failure loud.**

## Maintenance notes

- **Operator action required before/at merge (not executable from this repo):**
  confirm the Workers Builds *production* environment sets `PUBLIC_GHOST_URL`
  to the real Ghost origin, and that Ghost remains reachable there after
  `blog.buxx.me` is claimed by the worker. Also confirm the site-api image
  proxy (`/api/v2/images/blog/*`) fetches images from that same real origin,
  not `blog.buxx.me`.
- If the blog ever drops Ghost entirely (content checked into the repo), delete
  this guard along with the adapter.
- Reviewer should scrutinize: the guard must not fire for preview builds or
  mock-content builds, or it will break every PR.
