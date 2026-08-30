# Comments: Akismet replaces LLM moderation; email becomes optional

Written 2026-08-31, the day after `notes/comments-abuse-hardening.md`. Two
owner decisions in one pass, both "channeling beats blocking" moves.

## 1. Akismet is the moderation layer now

The LLM path (task-guard alias on the ai.tuuhub.com gateway,
`comments:ai:config` KV pair, primary/fallback, policy-floor guard) is
deleted, not flagged off. The owner called it what it was — a workaround —
and the replacement is better on every axis that matters here:

- **Latency.** task-guard answered in 1.7-3.4s against a 1.5s deadline, so
  most creates rode the held-then-upgrade continuation. Akismet answers in
  ~100-400ms; the deadline is now the unusual path and submits usually
  publish synchronously.
- **Signal.** Akismet sees IP, UA, referrer, and permalink alongside the
  body — the request-level signals a text-only model never had — plus two
  decades of cross-site comment-spam reputation.
- **Surface.** No more prompt to inject against, no gateway quirks
  (backends rejecting `temperature`), no probe-body naturalization for the
  e2e matrix — `is_test=1` (env `AKISMET_TEST_MODE`) marks staging checks
  so they never train the classifier.

What Akismet does not do: judge toxicity that is not spam-shaped. Accepted
on purpose — the owner reads every comment via Telegram and can delete or
shadow-ban, which was always the real enforcement layer. Verdict mapping:
ham → publish, spam → hold, `X-akismet-pro-tip: discard` → reject (so a
spam wave never floods the queue). Fails closed to hold, same contract as
before; the `ModerationOutcome` shape, the deadline race, the late-verdict
upgrade, and the Telegram card all survived untouched.

Key was live-verified against `rest.akismet.com` (verify-key `valid`;
`viagra-test-123` → `true`, ham probe with `user_role=administrator` →
`false`, both under `is_test=1`).

## 2. Email is optional; the second Post click is the confirmation

The owner's framing: fake addresses are manufactured by the required field.
Making the email optional removes the incentive to fake at the source —
verification mail now goes only to self-selected addresses, and the mail
guards from the hardening note (DoH MX check, suppression ledger, 8/30d
ceiling) demote from primary defense to backstop.

Contract: `CommentCreateInput.email?` optional (a non-empty value must
still be valid); `unverifiedEmail` always false for a no-email create.
Storage: migration `0018_optional_comment_email.sql` rebuilds
`blog_comments` with `email_hash` nullable. A NULL-hash row is owned by its
anon session only — no reply notifications, never claimable (which also
shrinks the claim-on-verify impersonation window from the hardening note's
follow-up #5), `avatarUrl: ""` on the wire with a client-side identicon.

UX (the owner's "堵不如疏" trio, merged into one motion): a Post press with
the email empty arms a one-shot green recommendation box — benefit-framed,
not an error — and the next press submits as anonymous. Email-filled and
signed-in writers keep single-click Post. The second click is not generic
friction: it means "post without email", exactly once, on exactly the path
where the choice exists.

What optional email does **not** fix: sybil-farming of verified identities
(those attackers *want* the email path); the plus-addressing watch item
from the hardening note stands.

## Cutover deltas (on top of both earlier checklists)

1. Apply migration `0018_optional_comment_email.sql` (D1 table rebuild;
   backup first, same as 0016/0017).
2. `wrangler secret put AKISMET_API_KEY` on prod site-api; also set it on
   staging together with var `AKISMET_TEST_MODE=1`. The readiness script
   now requires the secret.
3. The `comments:ai:config` KV key and `AI_API_KEY`'s moderation role are
   dead; AI_API_KEY stays for mood sentiment.
4. Staging matrix expectation changes: moderated creates mostly answer
   `published` synchronously (no held-then-upgrade wait), the C-series
   fake-email cases can now post with no email at all, and the LLM
   fail-closed probe becomes the AKISMET_API_KEY-unset probe.
