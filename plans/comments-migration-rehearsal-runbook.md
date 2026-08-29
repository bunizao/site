# Migration rehearsal runbook — unattended run

Executor: a fresh scheduled Claude session at 06:05 Melbourne, 2026-08-30. No
human is present; no permission prompt will be answered. This document is the
complete spec: follow it, watch every step, and self-repair machinery failures.
Results — including bad ones — are findings to report, never to massage.

## Mission

Rehearse migration `0011_blog_comments.sql` against a staging copy of the
production `site-notify` D1 database, proving the `notify_subscribers`
rebuild-and-swap preserves every subscriber row before the same command
sequence ever runs on prod. Scope is the migration only: no worker deploys, no
secrets, no phase-1 behavior tests.

## Hard safety rules (non-negotiable, override everything below)

1. Production D1 `site-notify` (id `bf8cd2f1-29c7-44c1-b9bb-555265dd40b3`) is
   READ-ONLY. The only command ever allowed against it is `d1 export`. Never
   `d1 execute`, never `d1 migrations apply`, never `d1 delete` on it.
2. Never touch `site-mood` D1, any KV namespace, R2, queues, or secrets.
3. Never run `wrangler deploy`, `versions upload`, or `wrangler login`.
4. All writes go to `site-notify-staging` only.
5. Never `git push`. Commits are local and use `--no-gpg-sign` (the signing
   helper is unreachable in sandboxed shells).
6. The export dump contains real subscriber emails. It lives only under
   `.wrangler/rehearsal/` (gitignored). Never copy it elsewhere, never commit
   it, never paste its contents into a report.
7. An assertion failure is a rehearsal FINDING. Do not edit data or the
   migration to make an assertion pass. Record it, finish read-only checks,
   report honestly.

## Environment

- site-api worktree (all wrangler work happens here):
  `/Users/tutu/Dev/site-api/.claude/worktrees/blog-comments` (branch `wt/blog-comments`)
- site worktree (report + this runbook):
  `/Users/tutu/Dev/site/.claude/worktrees/comments-ui-design-709bd1` (branch `claude/comments-ui-design-709bd1`)
- Always invoke wrangler as `bunx wrangler` from the site-api worktree (a node
  18 shell silently breaks wrangler; bunx sidesteps it).
- Auth: `bunx wrangler login` was completed by the user on 2026-08-29. If
  `bunx wrangler whoami` fails, ABORT immediately: write a report saying auth
  expired, push-notify, stop. Re-auth needs a human browser click.
- Timebox: hard stop at 07:30 Melbourne. If incomplete, write a partial report
  with exactly where it stopped and why, then push-notify.

## Self-repair policy

Machinery failures (a command hangs, a flag is missing, an import times out)
are yours to diagnose and fix — read `--help`, adjust flags, split work, retry.
The whole run is idempotent: step 4 resets staging, so a full restart from
step 3 is always safe. Bound yourself: max 3 attempts per approach, then try a
different approach; never widen scope past the safety rules to get unstuck.
`bunx wrangler d1 execute` against `--remote` may prompt for confirmation in a
TTY; in your non-interactive shell it should auto-proceed or accept `-y` /
`--yes` — check `--help` output if a command seems to hang.

## Steps

Log every command and its outcome as you go into
`.wrangler/rehearsal/rehearsal-2026-08-30.log` (site-api worktree).

### 0. Preflight

```
cd /Users/tutu/Dev/site-api/.claude/worktrees/blog-comments
bunx wrangler whoami            # must succeed; else ABORT per Environment
git rev-parse --abbrev-ref HEAD # expect wt/blog-comments
mkdir -p .wrangler/rehearsal
```
Confirm `scripts/sql/migrations/` contains exactly 0002–0006 and 0011.

### 1. Staging database

`bunx wrangler d1 list --json`. If `site-notify-staging` exists, capture its
`uuid`; otherwise `bunx wrangler d1 create site-notify-staging` and capture the
new id from the output.

### 2. Staging wrangler config

Write `wrangler.staging.jsonc` in the site-api worktree (fill `<STAGING_ID>`):

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  // Rehearsal-scoped config: d1 migrations only. Deploy fields land with the
  // staging worker phase (plans/comments-staging-test.md).
  "name": "site-api-staging",
  "compatibility_date": "2026-04-15",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "NOTIFY_DB",
      "database_name": "site-notify-staging",
      "database_id": "<STAGING_ID>",
      "migrations_dir": "scripts/sql/migrations"
    }
  ]
}
```

If wrangler later rejects this config for a missing field (e.g. `main`), add
the minimum it asks for and note it in the report.

### 3. Export prod (the one allowed prod command)

```
bunx wrangler d1 export site-notify --remote \
  --output .wrangler/rehearsal/site-notify-prod-2026-08-30.sql
```
Record file size and `shasum -a 256`. This dump doubles as the backup artifact
for the eventual prod cutover — keep it.

### 4. Reset staging (idempotency)

List staging tables:
`bunx wrangler d1 execute site-notify-staging --remote --json --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%'"`.
Drop each (`DROP TABLE IF EXISTS "<name>"`). Empty result = fresh DB, proceed.

### 5. Import the dump

```
bunx wrangler d1 execute site-notify-staging --remote \
  --file .wrangler/rehearsal/site-notify-prod-2026-08-30.sql
```
Then verify migration bookkeeping came through:
`SELECT id, name FROM d1_migrations ORDER BY id` — expect rows for 0002–0006
and NOT 0011. If `d1_migrations` is missing or empty, the dump import is the
problem — fix the import rather than hand-inserting rows; hand-insert only as
a last resort and flag it in the report.

If the import fails on size or timeout: fall back to excluding bulk analytics
rows — import the full dump locally is NOT an option (stay remote); instead
split the dump file into chunks along complete SQL statements and execute the
chunks in order. Text columns can contain newlines, so split on statement
boundaries (lines ending `;` that begin a new `INSERT`/`CREATE`), not blindly.

### 6. Scrub real subscriber emails

Privacy step, before anything else runs. Keep the owner's own rows.

```sql
UPDATE notify_subscribers
SET email = 'scrubbed+' || substr(email_hash, 1, 12) || '@example.invalid'
WHERE email NOT IN ('bunizaoccc@gmail.com', 'xbuu0002@student.monash.edu');
DELETE FROM blog_analytics_events;  -- bulk rows, irrelevant to the rehearsal
```
(Verify the analytics table's actual name in
`scripts/sql/migrations/0003_blog_analytics_events.sql` first; skip the DELETE
if the table is not in the dump.) Record how many rows each statement changed.

### 7. Pre-migration fingerprint

Run and save both results verbatim (they must match step 10 exactly):

```sql
SELECT COUNT(*) AS n, COUNT(status) AS with_status,
       COUNT(confirmed_at) AS confirmed,
       COUNT(DISTINCT email_hash) AS distinct_hashes,
       COALESCE(SUM(LENGTH(email)), 0) AS email_len,
       COALESCE(SUM(LENGTH(channels)), 0) AS channels_len,
       MIN(created_at) AS min_created, MAX(updated_at) AS max_updated
FROM notify_subscribers;

SELECT COALESCE(status, 'NULL') AS s, COUNT(*) AS c
FROM notify_subscribers GROUP BY 1 ORDER BY 1;
```

### 8. Pending check

`bunx wrangler d1 migrations list NOTIFY_DB -c wrangler.staging.jsonc --remote`
must list exactly `0011_blog_comments.sql` as pending. Anything else pending
means the bookkeeping is wrong — go back to step 5, do not apply.

### 9. Apply — the moment the rehearsal exists for

`bunx wrangler d1 migrations apply NOTIFY_DB -c wrangler.staging.jsonc --remote`

This is the exact command shape prod cutover will use. Capture full output.
If it errors midway, capture state (`sqlite_master` table list — is
`notify_subscribers_new` present? did the swap half-complete?) BEFORE any
retry, then reset (step 4) and rerun from step 5. A migration that cannot
complete cleanly on a retry from scratch is a FINDING, not a retry-harder case.

### 10. Assertions

Data preservation:
- Rerun both step-7 queries: every value identical.
- `SELECT COUNT(*) FROM notify_subscribers WHERE reader_id IS NOT NULL OR notify_replies != 0 OR banned != 0` → 0.

Schema:
- `SELECT name FROM sqlite_master WHERE type='table'` → contains
  `notify_subscribers`, `blog_comments`, `blog_reactions`; contains neither
  `notify_subscribers_new` nor `blog_readers` nor `blog_reader_tokens`.
- `SELECT name, sql FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'`
  → includes `idx_notify_subscribers_status`;
  `idx_notify_subscribers_reader_id` with `WHERE reader_id IS NOT NULL` in its
  SQL; the six `idx_blog_comments_*` indexes (public_feed, reader,
  email_hash, status, body_hash, fp_hash); the three
  `idx_blog_reactions_*` indexes (unique, target, reader).
- `d1 migrations list` again → no pending migrations.

Constraint probes (staging writes, cleaned up after):
- INSERT a reader-only row with `status = NULL` and a `reader_id` → succeeds.
- INSERT a second row with the same `reader_id` → must FAIL (partial unique).
- INSERT a row with `status = 'bogus'` → must FAIL (CHECK).
- INSERT into `blog_comments` with `status = 'bogus'` → must FAIL; with
  `status = 'held'` → succeeds.
- `DELETE FROM notify_subscribers WHERE email_hash LIKE 'rehearsal_probe%'`
  and the same for the probe comment row.

### 11. Report and close out

1. Write `notes/comments-migration-rehearsal.md` in the SITE worktree: what
   ran, timings, dump size + sha256 (path only, no contents), fingerprints
   pre/post, every assertion's outcome, any self-repairs performed, and an
   explicit verdict line: `Verdict: 0011 is safe to apply to prod` or
   `Verdict: DO NOT apply — <reason>`.
2. Commit (both are local-only, `--no-gpg-sign`):
   - site-api worktree: `wrangler.staging.jsonc` →
     `chore(comments): add staging wrangler config`
   - site worktree: the notes file →
     `docs(notes): record comments migration rehearsal`
3. PushNotification, one line, either
   `Rehearsal passed: 0011 preserves all N subscriber rows, staging ready` or
   `Rehearsal FAILED at step X: <one-line reason>`.
4. Leave `site-notify-staging` and the dump in place — phase 1 (staging
   workers + behavior tests) builds on both. Do not tear down.
