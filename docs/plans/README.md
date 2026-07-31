# Plan execution index

Status: **active** (2026-07-31)

This is the execution source of truth for `docs/plans/`. Individual plan files
retain their detailed requirements, but their original status and sequencing may
be stale. Current code and later product decisions win when they conflict with an
older plan.

## Working constraints

- The public `site` Worker and private `site-api` Worker remain separate
  repositories and security boundaries.
- `site` is canonical for `@bunizao/contracts`; cross-repository contract changes
  land here first and are verified in `site-api` with `bun run sync:contracts
  --check`.
- Frontend work is running concurrently. The protected paths below are not edited,
  formatted, staged, or included in backend commits until the frontend owner hands
  them back.
- Each logical change is committed independently with exact-path staging. Existing
  dirty or untracked files in either checkout are user state.
- Production deploys, D1 migrations, Worker secret changes, WAF rules, and VPS
  systemd changes require a separate rollout action after the implementation is
  green.

## Current plan status

| Plan | State | Owner | Next action or gate |
| --- | --- | --- | --- |
| [`../PLAN-ops-portal.md`](../PLAN-ops-portal.md) | Active, frontend protected | `site` + `site-api` | Keep current webhook architecture. Add system alerts, portal-originated bot confirmation, publishing confirmations, and event reminders natively in later backend slices. |
| [`APPLE-MUSIC-V2-PRD.md`](../archive/APPLE-MUSIC-V2-PRD.md) | Archived — superseded | Product decision | Do not implement without a new owner decision. The current player intentionally uses native 30/90-second previews without MusicKit. |
| [`admin-portal-removal.md`](../archive/admin-portal-removal.md) | Archived — superseded | Product decision | Do not delete the portal. The approved portal roadmap and current code continue to build it in `site`. |
| [`frontend-performance.md`](../archive/frontend-performance.md) | Archived — shipped | `site` | Frozen historical record; no active work. |
| [`006-mood-performance-prd.md`](../archive/006-mood-performance-prd.md) | Archived — shipped | `site` + `site-api` | Frozen historical record; no active work. |
| [`mood-hybrid-read.md`](mood-hybrid-read.md) | Phase 1 shipped | `site` + `site-api` | Treat Phase 2 as a new evidence-gated cleanup; do not delete the live reader yet. |
| [`route-contracts.md`](route-contracts.md) | Shipped with compatibility tail | `site` + `site-api` | `site-api` CI owns the strict cross-repo sync check. Keep the public `site` workflow independent of the private repository; remove `/v2/*` only after traffic evidence and one deprecation window. |
| [`static-proxy-hardening.md`](static-proxy-hardening.md) | Code foundation complete, rollout pending | `site` + Cloudflare | Keep `observe`; migrate producers after frontend handoff, collect evidence, then move through `accept-both`, `enforce`, host expansion, and the WAF rule. |
| [`mood-media-r2.md`](mood-media-r2.md) | Backend complete, rollout pending | `site-api` primary | Apply the additive migration, deploy, dry-run/backfill, install the bounded VPS timer, and prove browser seeking. Frontend cleanup waits for handoff. |
| [`blog-directive-registry.md`](blog-directive-registry.md) | Backend complete, unwired | `site` | Core plus poem, mood, and music handlers are tested. Consumer wiring and removal of the client poem pass wait for frontend handoff. |
| [`blog-footnotes.md`](blog-footnotes.md) | Handler complete, unwired | `site` | Output policy and transformer are tested. Consumer wiring and styling wait for frontend handoff. |
| [`blog-authorship-credits.md`](blog-authorship-credits.md) | Metadata complete, unwired | `site` | Typed roles, meta parsing, and pledge validation are tested. Copy and page rendering wait for frontend handoff. |
| [`blog-editor-preview.md`](blog-editor-preview.md) | Admin boundary complete, routes deferred | `site` | The server-only Ghost Admin client and post-ID contract are tested. Preview routes, playground, bookmarklet, and snippets wait for frontend handoff. |
| [`youtube-embed-card.md`](youtube-embed-card.md) | Waiting | `site` | Depends on enforced signed poster URLs and blog directive wiring; all visible card work waits for frontend handoff. |

The stale `site-api` branch `feat/telegram-ops-bot` is reference material only.
It uses long polling, predates the current webhook and notify architecture, and
collides with current contracts and migration numbers. Do not merge or
cherry-pick it; implement the remaining Ops items against current `main`.

## Dependency-ordered execution

### Wave 0 — framework baseline

Completed in `956dd6e5`:

- Astro 7.1.6 and compatible Astro/Cloudflare integrations.
- Wrangler and Workers types aligned with the build toolchain.
- Bun 1.3.14 aligned across `packageManager` and CI.
- Typecheck, 401 unit tests, production build, component-registry build, and
  Cloudflare build guard passed. The full Playwright run had one transient
  external-fetch timeout; its isolated rerun passed.

### Wave 1 — isolated non-frontend foundations

Completed as independent, tested slices:

1. **Static proxy response policy (`site`)**
   - Test through `/static/*` responses.
   - Reject HTML, SVG, JavaScript, and other executable or unknown upstream
     content with `no-store`.
   - Preserve only explicitly required image, media, font, and animated-emoji
     metadata responses. Generic JSON proxying is not allowed.
   - Preserve upstream-cookie stripping and cache only successful allowed
     responses.
2. **Mood media R2 read path (`site-api`)**
   - Make `MOOD_IMAGES` optional and try it before Telegram.
   - Serve an R2 hit without requiring Telegram credentials.
   - Cover full `GET`, `HEAD`, bounded/open/suffix ranges, `206`, and `416` at
     the HTTP seam.
   - Preserve Telegram fallback on a miss and bypass edge cache for ranges.
3. **Directive document-transform core (`site`)**
   - Accept HTML plus `slug`, `locale`, and output target context.
   - Return transformed HTML, hoisted metadata, and structured warnings.
   - Ignore directive-looking text inside code, preformatted, script, and style
     content.
   - Keep the core unwired: no page, stylesheet, or client changes in this wave.

Implementation commits: `afe2bc51` (static response policy), `fb90900`
(`site-api` R2-first reads), and `b5f82e17` (directive transform core).

### Wave 2 — backend completion and safe migration

The code foundations in this wave are complete. Producer wiring and every
production mutation remain behind the later gates.

1. **Mood sync state and VPS worker (`site-api`)**
   - Add a private D1 state table with explicit `pending`, `ready`, and `failed`
     states, attempts, current object key, content metadata, and timestamps.
   - Use versioned R2 object keys derived from Telegram file identity while
     keeping `/api/v2/media/mood/{postId}/{kind}` stable. This prevents immutable
     caches from serving an edited file under an old key.
   - Add bounded signed work/report endpoints. Report replay must be idempotent;
     post deletion or media replacement must retire the old object.
   - Keep `mood-reconcile` unchanged. The new `mood-media-sync` timer owns its
     own session/state file and caps each run at 5 files or 200 MB.
   - Stream MTProto download into the R2 S3 API and never buffer a complete file.
2. **Static proxy signing migration (`site`)**
   - Sign a canonical upstream URL and expiry with a key ID. Exclude signature
     fields themselves from the canonical payload.
   - Support current and previous keys during rotation.
   - Use the same key set during prerender and Worker runtime without exposing it
     to client bundles.
   - Start in observe/accept-both mode, record unsigned route families, migrate
     every producer, then enforce. Do not add `i.ytimg.com` before signing works.
3. **Directive integration contract (`site`)**
   - Define output behavior for page HTML, excerpt/plain text, RSS, and agent
     Markdown before wiring the transformer.
   - Current blog RSS contains descriptions rather than post bodies, so a
     requirement such as "poem markup appears in RSS" needs either
     `content:encoded` or a corrected acceptance criterion.
4. **Dependent blog foundations (`site`)**
   - Footnote numbering, warnings, and output-target policy are implemented but
     unwired.
   - Authorship role metadata and pledge validation are implemented but unwired.
   - The server-only Ghost Admin client boundary and 24-character post-ID
     contract are implemented; no preview route exists yet.

Implementation commits: `52dab4d9` (static signing), `fb90900` through
`3838d4d` plus `49927be` in `site-api` (Mood media lifecycle and sync), `48ddaf06` plus
`eb702ce5` (directive handlers), `7134201e` (footnotes), `d15b0736`
(authorship), and `8061e8df` (Ghost Admin boundary).

### Wave 3 — rollout gates

- Deploy the additive D1 migration and R2-first Worker path before starting the
  VPS timer.
- Backfill in bounded batches. Prove that R2 hits issue zero Telegram requests,
  Safari and Chromium seeking works, failed work retries are bounded, and object
  deletion is correct.
- Keep the static proxy in observe/accept-both mode until unsigned traffic is
  understood and every known producer emits signed URLs. Apply the Cloudflare
  rate-limit rule idempotently, read it back, and verify its expression before
  enforcement.
- Rollback remains additive: stop the timer or disable R2 reads; keep Telegram
  fallback and the previous signing key through the observation window.

### Wave 4 — frontend handoff

After the frontend owner confirms the protected paths are available:

1. Wire the directive registry before `splitBlogProse`, port the poem promoter to
   the server, and remove only the superseded client pass.
2. Wire and style the completed footnote transformer across page, RSS, excerpt,
   and agent-Markdown consumers.
3. Wire the completed authorship metadata and validation into localized credits
   and `#not-by-ai` pledge selection. Reuse the existing Ghost `authors[]` adapter.
4. Build the draft preview and prose playground on the completed Ghost Admin
   client and post-ID boundary.
5. Complete the Mood oversized-media rendering cleanup after the R2 backfill is
   proven.
6. Build the YouTube facade last, after signed posters and shared directive
   rendering are available.

### Wave 5 — evidence-gated cleanup

- Delete the live Mood reader only after a documented stability window shows
  archive parity, no unexplained reconcile gaps, and bounded fallback use.
- Remove `/v2/*` compatibility only after production traffic is zero or migrated.
- Keep archived records frozen. Capture any newly discovered residual work in a
  new active plan instead of reopening historical files.

## Frontend protection boundary

Until handoff, do not modify:

- `src/pages/blog/**/*.astro`
- `src/features/posts/ui/**`
- `src/styles/blog*.css`
- `src/features/mood/ui/**`
- `src/features/mood/client/**`
- `src/features/mood/shared/feed-media.ts`
- `src/features/home/ui/**`
- `src/layouts/**`
- `src/pages/dev/portal/**`
- `src/features/admin/**`
- `src/components/coss/**`
- `src/components/portal/**`
- `src/styles/portal.css`
- `public/dev/embed-lab/**`

## Verification matrix

| Change | Required before commit | Required before rollout |
| --- | --- | --- |
| `site` server/security | Focused unit tests, `bun run check`, `bun run test:unit`, `bun run build` | Relevant Playwright routes, `bun --env-file=.env.local run build:cloudflare`, deploy guard, preview curl matrix |
| `site-api` Worker | Focused unit tests, `bun run check`, `bun run test:unit`, `bun run build` | Local Wrangler HTTP matrix, D1 migration dry run, preview smoke, production readback plan |
| Shared contracts | Contract unit tests and exact copy diff | `bun run sync:contracts --check` locally and in `site-api` CI; do not make the public `site` workflow depend on a private-repository checkout |
| VPS media sync | Script unit tests, dry-run fixtures, package lock verification | Staging credentials, bounded first batch, systemd status/log readback, R2 object audit |
| Cloudflare configuration | Script tests and dry-run output | API readback of the exact rule/secret/binding after apply |

## Stop conditions

Stop the affected workstream instead of guessing when any of these occurs:

- A protected frontend file becomes necessary before handoff.
- A plan conflicts with current production code or a later approved plan.
- A cross-repository DTO would expose private business logic through public
  contracts.
- Static signing cannot use the same rotating key set at build and runtime.
- Mood media cannot prove correct range semantics, idempotent report replay, or
  deletion/replacement behavior.
- A rollout would require production credentials, a deployment, a migration, or
  a WAF/VPS mutation that has not been explicitly started.
