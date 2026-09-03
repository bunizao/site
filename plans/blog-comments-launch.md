# Blog comments — launch plan

Written 2026-09-03 05:00 AEST. Status: **not ready to ship at 06:30 today.**

## Why not 06:30

Five blockers, in the order they have to be cleared. None is hard; together
they are not 90 minutes of work, and none of them is safe to do unattended.

1. **The work is on two diverged branches with no shared PR.**
   `claude/blog-comments-email-copy-7a31dd` (this one) and PR #162's
   `claude/risk-control-security-hardening-7b457e` split on **30 August** and
   have run in parallel since: 63 commits here that #162 lacks, 107 there
   that this branch lacks. Both contain real, non-overlapping work — the
   security fixes, per-post policy and docs are here; the portal moderation
   queue, per-post locale rendering and the sign-out rebuild are there.
   Merging either one as-is ships half the feature.
2. **`site-api` has no PR and is not pushed.** `wt/blog-comments` is 121
   commits ahead of `main`, 11 behind it, and has no `origin` branch at all.
   The entire backend — every route the site calls — exists only on this
   machine.
3. **Production D1 has not had the comment migrations applied.** Migrations
   0011–0021 create and index every table the feature reads. `0021` was
   written today.
4. **The security fixes are hours old.** The identity-binding bug fixed this
   morning let a stranger's typed address inherit a verified reader's badge.
   Code that had an authentication defect today does not deploy unattended
   tomorrow morning.
5. **The privacy policy changed 30 minutes ago and has not been read by its
   owner.** It now names Akismet and the avatar upstreams. It is a legal
   document published under your name.

## What is already done

Worth being clear, because the list of blockers reads worse than the state is.

- **The Telegram moderation bot is built and tested.** `ops-bot/webhook.ts`
  wires all four callbacks — `comment:approve:`, `comment:hide:`,
  `comment:delete:`, `comment:reply:` — over `owner-moderation.ts`, with
  native Telegram reply publishing behind `COMMENTS_TELEGRAM_DIRECT_REPLY`
  and two test files covering it. This needs a live smoke test, not
  engineering.
- The risk stack, rate limits, Akismet, shadow bans, reader sessions,
  reactions, avatars and mail are complete on `wt/blog-comments`.
- Docs, the privacy policy and the error-code links landed today.

## Phase 0 — reconcile the branches (needs you)

Not automatable: it is a judgment call about which line of work is canonical
where the two touched the same files.

```bash
git merge origin/claude/risk-control-security-hardening-7b457e
```

Merge #162's branch **into** this one rather than the reverse — this branch
carries the security fixes, and they must survive any conflict resolution.
Re-run `bun run check` and `bun run test:unit` after, then force the
combined branch into #162 so the PR reflects reality.

## Phase 1 — get both repos reviewable

1. Push `site-api`'s `wt/blog-comments`, rebase it onto `main` (11 commits
   behind), open a PR. It is the larger and more security-sensitive half and
   has had no review at all.
2. Update PR #162 to the reconciled branch.
3. Both must pass `bun run check`, `bun run test:unit`,
   `bun run test:e2e:site`, and `check:docs-coverage` with `SITE_API_REPO`
   set — from a worktree the guard silently checks one repo otherwise.

## Phase 2 — staging

1. Apply migrations 0011–0021 to the **staging** D1 first, confirm each.
2. Deploy `site-api` to staging, then `site`.
3. Flip `COMMENTS_ENABLED=true` on staging only.
4. Smoke, in this order — each one has failed before:
   - post anonymously; post with an address; confirm the mailed link
   - confirm the link a second time: it must sign in nobody
   - edit inside 15 minutes, then past it
   - trip the spam path and approve it **from Telegram**
   - reply from Telegram, hide from Telegram, delete from Telegram
   - react, then exhaust the rate limit and read the `429`
   - post from a second IP to confirm budgets are per-network
5. Leave it running at least one full cron cycle so the sweeps execute.

## Phase 3 — production

Order matters: `site-api` serves `/api/v2/*`, so it goes first and stays
dark until the site that calls it is live.

1. Confirm the four secrets are present — `COMMENTS_SESSION_SECRET`,
   `COMMENTS_EMAIL_SECRET`, `AKISMET_API_KEY`, `RESEND_WEBHOOK_SECRET`.
   Reader OAuth credentials are *not* needed; the routes 404 without them.
2. Apply migrations 0011–0021 to production D1.
3. Deploy `site-api` with `COMMENTS_ENABLED` still `"false"`.
4. Deploy `site`. Comment sections render and answer `GONE` — expected.
5. Verify the deploy is healthy with comments still off.
6. **Then** flip `COMMENTS_ENABLED=true` and redeploy `site-api`.
7. Re-run the Phase 2 smoke list against production, Telegram included.

Both deploys need `1Password` unlocked (git signing hangs otherwise) and
Ghost env exported from `.env.local` first. The `site-api` deploy is
`astro build` then `wrangler deploy --config dist/server/wrangler.json` —
no script chains those two.

## Rollback

`COMMENTS_ENABLED=false` and redeploy `site-api`. Every route returns to
`404`, the section degrades to "comments aren't available right now", and
nothing already written is lost. That is the whole rollback, and it is why
the switch is the last thing turned on rather than the first.

## Honest estimate

Phase 0 and 1 are a focused session with you awake. Phase 2 wants a day of
soak. Phase 3 is 30 minutes. Ship this week, not this morning.
