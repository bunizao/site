# Comments migration rehearsal — 2026-08-30

Unattended run per `plans/comments-migration-rehearsal-runbook.md`. Executed
06:05–06:20 Melbourne. All wrangler work ran in the site-api worktree
`.claude/worktrees/blog-comments` (branch `wt/blog-comments`) as `bunx wrangler`;
full command log at `.wrangler/rehearsal/rehearsal-2026-08-30.log` there.

## Verdict

**Verdict: DO NOT apply — the branch is missing prod migrations 0007–0015, its
filename collides with the already-applied `0011_notify_email_outbox.sql`, and
the rebuild-and-swap silently drops the live `request_version` column.**

The migration's own mechanics are sound: every runbook assertion passed, all 7
subscriber rows survived verbatim, and every constraint behaved as designed.
What fails is the premise. `wt/blog-comments` was cut before migrations
0007–0015 landed on main, so `0011_blog_comments.sql`:

1. **Reuses a taken number.** Prod's `d1_migrations` already records
   `0011_notify_email_outbox.sql` (applied), so the series would hold two
   different migrations numbered 0011. Wrangler tracks by filename and would
   apply the new file, but any fresh-DB replay sorts `0011_blog_comments.sql`
   *before* `0011_notify_email_outbox.sql`, and humans reading the series get
   two 0011s.
2. **Drops a live column.** `0011_notify_email_outbox.sql` (main) did
   `ALTER TABLE notify_subscribers ADD COLUMN request_version TEXT`. The
   rebuild-and-swap's fixed column list predates that, so the swapped table has
   no `request_version` — confirmed post-apply on staging:
   `SELECT COUNT(request_version)` → `no such column: request_version`.
   All 7 prod rows currently hold NULL there, so no row data is lost *today*,
   but the deployed notify worker reads and writes that column
   (`src/features/notify/server/subscription.ts`, `shared.ts`,
   `email-outbox.ts`) — subscription-change and outbox paths would start
   throwing `no such column` immediately after cutover.

Required before a re-run: rebase `wt/blog-comments` onto main's migration
series, renumber the file to `0016_blog_comments.sql`, regenerate the
`notify_subscribers_new` column list from the *current* prod schema
(including `request_version`), then rehearse again. Staging and the dump are
in place for that re-run.

## What ran

| Step | Outcome |
|---|---|
| 0 Preflight | OK — branch `wt/blog-comments`, migrations dir 0002–0006 + 0011, `whoami` OK (bunizaoccc@gmail.com, d1 write scope) |
| 1 Staging DB | `site-notify-staging` did not exist; created, id `146b28ee-8b7f-47f1-ac0f-dad4ece2e524` (region OC) |
| 2 Config | `wrangler.staging.jsonc` written as specified; wrangler accepted it unchanged (no `main` field needed) |
| 3 Export | `.wrangler/rehearsal/site-notify-prod-2026-08-30.sql`, 1,059,763 bytes, sha256 `efb989b46235051024c346965c94fba356495cd30e14a7c2979f0c4fe9959d80`, confirmed gitignored. Kept as the prod-cutover backup artifact |
| 4 Reset | Staging was freshly created and empty — no-op |
| 5 Import | Single `--file` execute, 12,103 rows written, no chunking needed. **Bookkeeping diverged from the runbook's expectation**: `d1_migrations` holds 0002–0015 (14 rows), not 0002–0006 — see finding above. Not an import defect; the dump faithfully mirrors prod |
| 6 Scrub | 7 subscriber emails rewritten to `scrubbed+<hash12>@example.invalid` (owner emails not present as plain rows); `DELETE FROM blog_analytics_events` removed 455 rows |
| 7 Fingerprint | Captured (below), plus a supplementary `request_version` fingerprint beyond the runbook |
| 8 Pending | Exactly `0011_blog_comments.sql` pending — as the runbook required |
| 9 Apply | `d1 migrations apply NOTIFY_DB -c wrangler.staging.jsonc --remote`: 18 commands, ✅, no mid-flight errors |
| 10 Assertions | All pass (below) |

## Fingerprints

Pre- and post-migration results were **byte-identical**:

```
n=7  with_status=7  confirmed=7  distinct_hashes=7
email_len=259  channels_len=98
min_created=2026-02-10T11:33:20.040Z  max_updated=2026-08-29T16:38:30.980Z
status breakdown: active=7
```

Supplementary (not in runbook): pre-apply `COUNT(request_version)=0`,
`SUM(LENGTH(request_version))=0`; post-apply the same query errors
`no such column: request_version` — the column-drop proof.

## Assertion outcomes

- Data preservation: both step-7 queries identical pre/post — **PASS**
- `reader_id IS NOT NULL OR notify_replies != 0 OR banned != 0` → 0 — **PASS**
- Tables: `notify_subscribers`, `blog_comments`, `blog_reactions` present;
  `notify_subscribers_new`, `blog_readers`, `blog_reader_tokens` absent — **PASS**
- Indexes: all 11 expected `idx_*` present; `idx_notify_subscribers_reader_id`
  carries `WHERE reader_id IS NOT NULL` — **PASS**
- `d1 migrations list` post-apply → "No migrations to apply!" — **PASS**
- Probe 1: reader-only row (`status` NULL + `reader_id`) inserted — **PASS**
- Probe 2: second row, same `reader_id` → UNIQUE violation — **PASS**
- Probe 3: subscriber `status='bogus'` → CHECK violation — **PASS**
- Probe 4: comment `status='bogus'` → CHECK violation — **PASS**
- Probe 5: comment `status='held'` inserted — **PASS**
- Probe cleanup: 1 subscriber + 1 comment probe row deleted; final counts
  subscribers=7, comments=0, reactions=0 — **PASS**

## Self-repairs

- A zsh word-splitting quirk silently no-opped the first probe batch (unquoted
  command variable); reran each probe as an explicit command. No retries needed
  anywhere else; no command hung; wrangler's non-interactive fallbacks
  auto-confirmed both the export and the apply.

## State left behind (deliberate, per runbook)

- `site-notify-staging` (id `146b28ee-8b7f-47f1-ac0f-dad4ece2e524`) with the
  post-migration schema and 7 scrubbed subscriber rows — phase 1 builds on it,
  but note its `notify_subscribers` lacks `request_version`, so a re-rehearsal
  of the renumbered migration must reset it (runbook step 4) first.
- The prod dump at `.wrangler/rehearsal/site-notify-prod-2026-08-30.sql`
  (site-api worktree, gitignored) — the cutover backup artifact.
- `wrangler.staging.jsonc` committed on `wt/blog-comments`.

---

# Re-run after fix — same day, 06:30–06:45 Melbourne

## Verdict

**Verdict: 0016 is safe to apply to prod — all 7 subscriber rows, including
`request_version`, survive the rebuild verbatim.**

## The fix (site-api `wt/blog-comments`)

- `f1e2c84` `chore(migrations): backfill 0007-0015 from main` — the nine
  migration files prod has applied but the branch predated, byte-identical
  from `main`.
- `adceb53` `fix(migrations): renumber blog comments migration and carry
  request_version` — `0011_blog_comments.sql` → `0016_blog_comments.sql`;
  `request_version TEXT` added to `notify_subscribers_new` and both copy
  lists; code comment references updated (`readers.ts`,
  `comments-oauth-routes.test.ts`).
- Plans updated in this worktree: `blog-comments.md` and
  `comments-staging-test.md` renamed references; the rehearsal runbook now
  expects the 0002–0016 series, 14 `d1_migrations` rows, `0016` pending, and
  carries `request_version` in its fingerprint query.

The branch remains 88 commits behind main overall — only the migrations dir
was backfilled (append-only files, identical content, trivially mergeable).
The eventual rebase is unaffected.

## Re-rehearsal

Staging reset per runbook step 4 (26 tables dropped), re-imported from the
same dump (sha256 unchanged), re-scrubbed (7 emails, 455 analytics rows).
Bookkeeping now matched the corrected expectation exactly: 14 rows,
0002–0015. Pending check: exactly `0016_blog_comments.sql`. Apply: 18
commands, ✅.

Fingerprints pre/post byte-identical, now including the column the first run
could not measure:

```
n=7  with_status=7  confirmed=7  distinct_hashes=7
email_len=259  channels_len=98  rv_nonnull=0  rv_len=0
min_created=2026-02-10T11:33:20.040Z  max_updated=2026-08-29T16:38:30.980Z
status breakdown: active=7
```

All step-10 assertions passed again: table set, all 11 indexes (partial
unique `reader_id` intact), no pending migrations, probes 1–5 (NULL-status
reader insert OK, duplicate `reader_id` UNIQUE-fails, bogus statuses
CHECK-fail on both tables, `held` comment inserts), probe cleanup verified
(subscribers=7, comments=0, reactions=0).

Staging now holds the post-0016 schema — phase 1 can build on it directly.
Prod cutover: run the same `d1 migrations apply` shape against prod config
from `wt/blog-comments` at `adceb53` or later, with the dump as the backup
artifact.
