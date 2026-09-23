# Comments full pipeline runbook — unattended run to acceptance

Executor: the scheduled session firing 06:05 Melbourne, 2026-08-30. Nobody
answers prompts. The mission ends with the user waking up to a playable
staging site and two converged, launch-ready branches — production launch
itself happens only AFTER the user's manual acceptance, never in this run.

Read plans/comments-migration-rehearsal-runbook.md first: it is Phase A of
this pipeline and its safety rules apply throughout. This document adds
Phases B–H. plans/comments-staging-test.md holds the original topology
design and the full behavior matrix; treat it as the spec for Phase E.

## Mission, in order

A. Migration rehearsal (existing runbook, unchanged). Gate: verdict must be
   "safe to apply" before anything below runs.
B. Provision staging secrets and config.
C. Deploy site-api-staging (private) and site-staging-<rand> (public).
D. Smoke the full path browser-origin → service binding → D1.
E. Run the behavior matrix (email, registration, CRUD, risk stack).
F. Fix every failure in code, commit, redeploy, re-run until green.
G. Converge: finish the two inert frontend pieces, merge origin/main into
   both branches, full acceptance test pass, prod safety flip.
H. Handoff: acceptance notes + staging URL + cutover checklist + notification.

## Additional hard safety rules (on top of Phase A's)

1. `wrangler deploy` is allowed ONLY with `-c wrangler.staging.jsonc`, and only
   when that config's `name` is `site-api-staging` or `site-staging-*`. Never
   deploy the prod workers `site` or `site-api`; never add routes or custom
   domains to staging configs; site-api-staging keeps `workers_dev: false`.
2. Never `git push` in either repo. Convergence is local; commits stay
   unsigned (`--no-gpg-sign`) for the user to re-sign and push after 验收.
3. Secret VALUES never appear in your output, logs, reports, or commits. Move
   them shell-to-shell only (e.g. `grep '^NAME=' file | cut -d= -f2- | bunx
   wrangler secret put NAME -c wrangler.staging.jsonc`).
4. Staging emails go only to addresses you control in the test flow or to
   bunizaoccc@gmail.com. Never mail a scrubbed or third-party address.
5. Milestone PushNotifications: after Phase A verdict, after first successful
   smoke (Phase D), and at handoff — plus immediately on any abort.
6. Hard stop 12:00 Melbourne. Partial result = honest partial report.

## Phase B — secrets and config

Sources (key names verified 2026-08-30; values never printed):
- `/Users/tutu/Dev/site/.env.local` — `RESEND_API_KEY`,
  `GHOST_CONTENT_API_KEY`, `TURNSTILE_SECRET_KEY` (real),
  `PUBLIC_GHOST_URL`, `TELEGRAM_BOT_TOKEN`. Monolith-era file: validate each
  borrowed key before trusting it (Resend: `GET https://api.resend.com/domains`
  expects 200; Ghost: posts fetch with the key expects 200; Telegram:
  `getMe`). A dead key = degrade that chain, note it, continue.
- `/Users/tutu/Dev/site-api/.env.local` — `TELEGRAM_OPS_BOT_TOKEN`,
  `TELEGRAM_OPS_WEBHOOK_SECRET`, `TELEGRAM_OPS_ALLOWED_USER_IDS`,
  `TELEGRAM_OPS_ADMIN_CHAT_ID`. Grep
  `src/features/comments/server/notify-owner.ts` for which names the owner
  notification actually reads and provision exactly those.
- `AI_API_KEY` — the user was asked to append it to
  `/Users/tutu/Dev/site-api/.env.local` before 06:05. If absent: moderation
  fails closed and EVERY comment lands `held`. Still run the matrix (held-path
  is testable), but mark the publish path BLOCKED, say so in the handoff as
  the top acceptance blocker, and skip Phase G's "finish work" that depends
  on published comments only if truly blocked.
- Generated fresh (`openssl rand -hex 32`): `COMMENTS_SESSION_SECRET`,
  `COMMENTS_EMAIL_SECRET`. Staging-only values; prod gets its own at cutover.
- Turnstile phase-1: Cloudflare's documented TEST keys (verify the exact
  constants in Cloudflare docs before use — search "turnstile testing
  sitekeys"): invisible always-pass sitekey on the site clone, always-pass
  secret on site-api-staging. The real secret/sitekey pair stays out of
  staging: the real sitekey is hostname-locked to buxx.me and will not render
  on workers.dev. Consequence, to state in handoff: the user plays with the
  test widget; real-Turnstile verification happens at prod smoke.
- Reader OAuth (GitHub/Google): OUT of staging scope — the registered
  callback URLs are prod's. Set nothing; the flows must degrade gracefully
  (that itself is a checkable behavior).

Order of operations: deploy the worker once (Phase C) with vars only, then
`wrangler secret put` each secret (secrets need an existing worker), which
redeploys automatically.

## Phase C — deploy the two clones

site-api-staging (`wrangler.staging.jsonc` in the site-api worktree — extend
the Phase-A file into a deployable config):
- Mirror prod `wrangler.jsonc` EXCEPT: `name: "site-api-staging"`,
  `workers_dev: false` (reachable only via service binding), no `routes`, no
  `triggers` (crons), no `queues` at all (a staging consumer would steal prod
  queue messages; producer bindings are unused by comment paths).
- Bindings: NOTIFY_DB → site-notify-staging (Phase A id); SESSION + CACHE →
  new KV namespaces (`wrangler kv namespace create`); MOOD_DB → new empty D1
  `site-mood-staging` (never bind prod mood); R2 → new buckets
  (`site-api-staging-mood-images`, `site-api-staging-blog`); keep the DO
  bindings and their `migrations` block (fresh namespaces come with the new
  worker name); keep `images`.
- Vars: copy prod's, then override `SITE_URL`, `PUBLIC_SITE_URL`,
  `NOTIFY_BASE_URL`, `API_BASE_URL` to the staging site origin,
  `COMMENTS_ENABLED: "true"`.
- site-api deploys from source (`main: src/worker.ts` — run its build first
  if the prod deploy path does; check how `bun run dev`/docs do it).

site-staging (`wrangler.staging.jsonc` in the SITE worktree):
- `name: "site-staging-<6 random hex>"` — generate once, record everywhere.
  Origin is predictable: `<name>.<account-subdomain>.workers.dev` (subdomain
  via `bunx wrangler whoami` / first deploy output).
- `workers_dev: true`; no routes; `API` service binding →
  `site-api-staging`; SESSION KV → new namespace; assets `./dist` with the
  prod `run_worker_first` list; vars: prod's, overriding `SITE_URL` /
  `PUBLIC_SITE_URL` to the staging origin and `PUBLIC_TURNSTILE_SITE_KEY` to
  the test sitekey.
- Build before deploy: `/blog/[slug]` is PRERENDERED, so build-time env
  matters. Create `.env.local` in the site WORKTREE with
  `GHOST_CONTENT_API_KEY`, `PUBLIC_GHOST_URL`, `PUBLIC_SITE_URL` (staging
  origin), `PUBLIC_TURNSTILE_SITE_KEY` (test key) — note
  `src/pages/blog/[slug].astro:118` reads the sitekey through locals with a
  fallback; confirm what the prerendered HTML actually baked and that the
  compose widget gets the test key on staging. `bun install` first if the
  worktree lacks node_modules. Then `bun run build`, then deploy.

## Phase D — smoke

From the public origin only:
1. `GET <staging>/blog/<real-slug>` → 200, page HTML contains the comments
   section mount.
2. `GET <staging>/api/v2/comments?post=<post-id>` → 200 JSON empty list
   (proves origin → worker → binding → staging D1).
3. `GET <staging>/api/v2/reader/me` → anon shape + `reader_anon` Set-Cookie.
Fix-and-redeploy loop until smoke passes. Then push-notify "staging up".

## Phase E — behavior matrix

Run the full Phase-1 matrix from plans/comments-staging-test.md ("Phase 1 —
scripted matrix"): registration + email chain, comment lifecycle, every risk
gate one probe each. Implementation notes for unattended execution:

- Drive HTTP with a bun script or curl with a cookie jar (the anon session
  cookie must persist across a probe's requests). DB-side assertions via
  `bunx wrangler d1 execute site-notify-staging --remote --json` from the
  site-api worktree.
- Email chain without an inbox: you own the Resend account. After triggering
  a verification email, fetch the sent message via Resend's API
  (`GET /emails`, then the message by id) and extract the confirm link from
  its HTML. This verifies real rendering + a real link end-to-end. Also send
  ONE verification to bunizaoccc@gmail.com and leave it unclicked — the user
  checks true inbox delivery at acceptance.
- Second lever for the email chain: you hold `COMMENTS_EMAIL_SECRET`, so you
  can mint tokens directly to probe expired/tampered/replayed cases against
  `/api/v2/reader/verify` (src/lib/email-challenge.ts is the shared signer).
- Edit-window expiry: age the row via
  `UPDATE blog_comments SET created_at = datetime('now','-16 minutes')`.
- Rate limit: burst until 429; fresh DO namespace means clean counters.
- Moderation: assert held-with-fields vs published on benign/hostile bodies
  (needs AI_API_KEY; otherwise assert the fail-closed hold and mark blocked).
- Telegram: confirm the ops-bot message arrives for published AND held.
- Record every probe: request, expected, observed, verdict.

## Phase F — fix loop

Failures here are the point of the exercise. For each: diagnose in source
(site or site-api), fix with minimal senior-engineer changes, conventional
unsigned commit in the owning repo, redeploy the affected clone, rerun the
failed probe plus neighbors it could regress, and rerun the owning repo's
`bun run check` + `bun run test:unit`. Known pre-existing failures you must
NOT chase: site-api `astro check` has 4 errors in notify's dispatch.ts /
shared.ts / subscription.ts predating this feature. Keep a running fix log
for the report. If a fix needs a contract change, site's copy is canonical —
edit there, run `bun run sync:contracts` in site-api.

## Phase G — convergence

Only after the matrix is green (or green-except-documented-blockers):

1. Finish the two knowingly-inert frontend pieces so the user's play session
   isn't a Potemkin village:
   - Wire the post-level ReactionBar on `/blog/[slug]` to `/api/v2/reactions`
     + `/api/v2/reactions/toggle` (patterns already exist in
     `src/features/comments/client/comments-controller.ts` for comment
     likes). If full toggle wiring spirals, ship real read-only counts and
     log the cut — a fake `count={0}` `signedIn={true}` island may not
     survive to acceptance.
   - Wire the subscribe nudge → `notifyReplies`/subscribe plumbing end-to-end
     (frontend checkbox state → API; `/v2/reader/resend` currently hardcodes
     `subscribe: false` — fix the seam properly, not cosmetically).
   Each piece: implement, unit-test where the repo has patterns, redeploy
   staging, probe the new behavior over HTTP.
2. Merge `origin/main` into BOTH branches (fetch first; `merge --no-edit`;
   resolve conflicts with care, favoring main for files this feature never
   touched). No rebase — do not rewrite the user's history unattended.
3. Full acceptance pass, personally re-verified:
   - site: `bun run check` (0 errors), `bun run test:unit`,
     `SITE_API_REPO=/Users/tutu/Dev/site-api/.claude/worktrees/blog-comments
     bun run check:docs-coverage` (must include any routes you added),
     `bun run build`.
   - site-api: `bun run test:unit`; `bun run check` (only the 4 known notify
     errors allowed).
4. Prod safety flip: in site-api's PROD `wrangler.jsonc` on this branch, set
   `COMMENTS_ENABLED` to `"false"` with a comment pointing at the cutover
   checklist. This guarantees a merge+deploy before migration cannot expose
   half-alive routes.
5. If tests forced doc updates (API reference pages), make them in the same
   commits per repo convention.

## Phase H — handoff

1. `notes/comments-staging-acceptance.md` in the site worktree:
   - The staging URL and a "how to play" list (post anonymous → see it
     appear; fill email → get the real email at bunizaoccc@gmail.com → click
     through confirm; edit within 15 min; reply; delete; watch held flow if
     AI key present; the Turnstile widget is the test one, real one at prod).
   - Matrix results table; fixes made (commit list per repo); degradations
     and blockers; what was NOT covered (OAuth, real-Turnstile, admin queue,
     reply emails).
   - Cutover checklist: fresh prod export backup → `d1 migrations apply` on
     prod (same rehearsed commands, prod config) → upload fresh
     COMMENTS_SESSION_SECRET / COMMENTS_EMAIL_SECRET + verify
     `bun run verify:production` secret list → deploy site-api → deploy site
     → flip `COMMENTS_ENABLED` to `"true"` → smoke on buxx.me with real
     Turnstile.
   - Reminder: all commits in both repos are unsigned and unpushed; the user
     re-signs (e.g. rebase --exec amend -S) and pushes after 验收.
2. Commit notes + any plan updates (unsigned).
3. Final PushNotification: one line — staging URL + "ready for acceptance" or
   the top blocker.
