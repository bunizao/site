# Comments staging test — first remote behavioral round

Status: design, not yet provisioned.
Scope: verify the comments stack end-to-end on a remote **internal** endpoint before
any production traffic sees it. Four behavior families: email chain, reader
registration + DB writes, comment edit/reply/delete, and the risk stack.

## Why a clone, not prod

Migration `0016_blog_comments.sql` rebuild-and-swaps `notify_subscribers` — the
table holding real newsletter subscribers. First application must happen against
a copy, not the live table. Also: `COMMENTS_ENABLED` is **already `"true"` in
site-api's prod vars**, so the next `wrangler deploy` of this branch to the prod
worker would expose `/v2/comments` publicly with zero test coverage. Flip it to
`"false"` in `wrangler.jsonc` before any prod deploy of this branch (revert at
cutover).

## Topology

Two throwaway workers, zero shared state with prod:

```
browser / probe scripts
        │  (single public origin)
        ▼
site-staging-<rand>.{account}.workers.dev     ← clone of `site`
        │  service binding API → site-api-staging
        ▼
site-api-staging                              ← clone of `site-api`
   workers_dev: false, no routes              ← unreachable from the internet;
   D1: site-notify-staging (fresh)               only the binding can call it
   KV: staging SESSION + CACHE (fresh)
   DO: fresh namespaces (new worker name)
   no crons, no queue consumers/producers     ← MUST strip: a staging consumer
                                                 would steal prod queue messages
   Resend: real key (real emails, our inboxes only)
   Telegram ops bot: real token (messages carry staging URLs, self-labeling)
   AI: real key via comments:ai:config in staging KV
```

Facts that make this work (verified in code):

- The client controller only calls same-origin `/api/v2/*`; the site worker's
  `src/pages/api/[...path].ts` proxies through the `API` service binding. One
  browser-facing origin, private backend.
- All comment cookies are host-only (`Path=/; HttpOnly; Secure; SameSite=Lax`,
  no `Domain=`) — portable to workers.dev.
- The verification link is `${SITE_URL}/reader/confirm?token=…`, so staging
  site-api sets `SITE_URL`/`PUBLIC_SITE_URL`/`NOTIFY_BASE_URL` to the staging
  site origin and email links land on the staging confirm page.

Config mechanics: `wrangler.staging.jsonc` in each repo (committed; resource ids
are not secrets), deployed with `wrangler deploy -c wrangler.staging.jsonc`.
Secrets uploaded per-worker; `COMMENTS_SESSION_SECRET` / `COMMENTS_EMAIL_SECRET`
are **fresh random values, never prod's** — staging cookies and email tokens must
not validate against prod and vice versa.

Perimeter: the worker name carries a random suffix, the window is days, and the
only writable state is the staging DB. Optional hardening if the window grows:
Cloudflare Access on the staging site origin plus a service token for probes.
Not worth it for round one.

Deliberately out of scope this round (known-inert features, tested as-is or
skipped): ReactionBar UI (unwired; reactions tested at API level only),
subscribe nudge → `notifyReplies` (structurally inert), reader OAuth (GitHub and
Google apps register exactly one callback URL, which is prod's — needs throwaway
OAuth apps; deferred), admin moderation queue UI, reply-notification emails.

## Migration rehearsal (gates everything else)

1. `wrangler d1 export site-notify --remote` → snapshot. This doubles as the
   prod backup artifact for the eventual cutover.
2. Import the dump into `site-notify-staging`. The dump carries `d1_migrations`,
   so the staging DB believes 0002–0006 are applied.
3. Scrub real subscriber emails in staging (`UPDATE notify_subscribers SET
   email = 'scrubbed+' || id || '@example.invalid'` — keep the owner's own rows
   intact for realistic joins). Tests create their own rows; real strangers'
   emails don't belong in a throwaway DB.
4. `wrangler d1 migrations apply NOTIFY_DB --remote -c wrangler.staging.jsonc`
   → only 0011 runs. This is the exact command sequence prod cutover will use.
5. Assert: row count unchanged; every pre-existing row keeps its `status`;
   new columns present; partial-unique index on `reader_id` exists;
   `blog_comments` / `blog_reactions` created; v1 tables gone.

## Phase 1 — scripted matrix (Turnstile test secret: always-pass)

Cloudflare's Turnstile test keys make the widget/secret deterministic, so probes
can drive every gate *behind* Turnstile. Site clone uses the always-pass test
site key; site-api-staging uses the always-pass test secret.

Runner: `scripts/comments-staging-e2e.ts` (site repo), `--origin <staging url>`,
prints a pass/fail table. DB-side assertions via
`wrangler d1 execute site-notify-staging --remote` from the site-api worktree.

Registration + email chain:
- POST comment with name+email → 201, row in `blog_comments`, reader row in
  `notify_subscribers` with `status IS NULL`.
- Verification email arrives (owner inbox, plus-addressing for multiple
  identities). GET the link → confirm page `valid` state; POST verify →
  `confirmed_at` set, `reader_session` cookie issued, prior anon comments
  claimed (`reader_id` backfilled).
- Replay the link → `already` state, idempotent. Tampered/expired token →
  `expired` state. Resend inside the throttle window → throttled.

Comment lifecycle:
- Post → edit within window → reply (nesting) → delete own → tombstone renders.
- Foreign identity edits/deletes someone else's → rejected.
- Edit-window expiry without waiting 15 min: age the row via
  `UPDATE blog_comments SET created_at = datetime('now','-16 minutes')`, then
  expect the edit to be rejected.
- Held comment: visible to its author, absent for others. Edited marker set.

Risk stack, one probe per gate (assert both the HTTP response and the stored
`status`/moderation fields):
- Missing/garbage Turnstile token → rejected (also proves the always-pass secret
  still requires *a* token).
- Honeypot filled → silently held/rejected per design.
- Dwell token younger than 3s → rejected; missing dwell token → rejected.
- Link count over threshold → held. KV keyword blocklist hit → held.
- Disposable email domain → per design. Length caps → 400.
- Duplicate `body_hash` → held. Burst posting → DO rate limit 429
  (fresh DO namespace = clean counters).
- LLM moderation fail-closed: with `comments:ai:config` unset → held. Set the
  config → benign text publishes, hostile text held with moderation fields.
- Shadow-ban KV entry → author still sees own comment, others don't.
- Telegram ops notification arrives for publish and for held.

## Phase 2 — human pass (real Turnstile keys)

Swap staging to the real site key + secret (the Turnstile widget must first
allowlist the staging hostname, or use a second widget). Then, in a real
browser on the staging blog page: full compose → verify → edit → reply →
delete arc, both themes, mobile width; confirm a scripted fake token is now
rejected (proves prod-shaped Turnstile actually blocks).

Check before relying on flips: whether `PUBLIC_TURNSTILE_SITE_KEY` is read at
runtime or inlined at build — if inlined, each key flip needs a rebuild of the
site clone.

## Phase 3 — record, tear down, decide

- Results + surprises go to `notes/` (written-once record).
- Delete `site-notify-staging` (it held scrubbed-but-real-shaped data), staging
  KV namespaces, both staging workers.
- Only then: prod cutover plan — fresh export backup, apply 0011 to prod D1,
  deploy site-api, deploy site, set `COMMENTS_ENABLED` back to `"true"`.

## Provisioning checklist (phase 0)

- [ ] `wrangler d1 create site-notify-staging`; KV namespaces ×3 (site SESSION,
      api SESSION, api CACHE)
- [ ] `wrangler.staging.jsonc` in site-api: new name, `workers_dev false`, no
      routes/crons/queues, staging D1+KV ids, staging `SITE_URL` vars,
      `COMMENTS_ENABLED "true"`; mood D1/R2 bindings point at empty staging
      placeholders (mood surfaces render empty — fine)
- [ ] `wrangler.staging.jsonc` in site: random-suffix name, `workers_dev true`,
      no routes, `API` binding → site-api-staging, staging SESSION KV, staging
      `SITE_URL`, Turnstile test site key
- [ ] Secrets on site-api-staging: fresh `COMMENTS_SESSION_SECRET` +
      `COMMENTS_EMAIL_SECRET`, Turnstile test secret, real Resend key, ops bot
      token, AI key
- [ ] Prod safety: set `COMMENTS_ENABLED` to `"false"` in prod `wrangler.jsonc`
      on this branch
- [ ] Migration rehearsal (section above)
- [ ] Deploy both, smoke: `GET /api/v2/comments?post=<slug>` returns an empty
      list through the full origin → binding → D1 path
