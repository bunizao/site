# Comments abuse hardening: verified-reader tier, mail-reputation guards, edge fixes

Written 2026-08-31, following the 37-probe staging acceptance
(`notes/comments-staging-acceptance.md`). Three workstreams in one pass:
lower the risk posture for verified readers, close the fake-email /
domain-reputation exposure on the verification mail path, and sweep the
remaining abuse surface. All code changes live in site-api's
`wt/blog-comments` branch; docs and plan updates live here.

## 1. Verified readers ride a looser risk posture

A verified (L1/L2) reader has put a real mailbox or an OAuth account behind
their identity. The throwaway-identity defenses are pure friction for them,
so the stack now keys on `knownReader` (live session cookie, or the claimed
email resolving to a verified, unbanned reader row):

| Control | Anonymous | Verified |
| --- | --- | --- |
| Comment rate windows | 3/min, 10/h | 6/min, 30/h |
| Rate dimensions | session, IP, fingerprint | those + per-`reader_id` |
| Disposable-domain hold | yes | skipped (mailbox already proven) |
| First-session-link hold | yes | skipped |
| Link-count hold threshold | > 2 | > 4 |
| Reaction per-minute IP churn cap (30/min) | yes | skipped (identity cannot churn) |
| Reaction hourly IP ceiling (120/h) | yes | yes |
| Turnstile, honeypot, dwell, duplicate-body drop | yes | yes |
| Keyword blocklist, AI moderation, shadow-ban | yes | yes |

Two principles behind the split. First, only the controls whose *purpose*
is pricing out identity churn are waived — a verified account can still be
compromised or turn spammy, so everything that judges content stays.
Second, the network dimensions share counters with anonymous traffic (same
DO key); only the ceiling the verified caller is judged against changes,
plus the reader-keyed budget so a busy shared NAT can't starve them.

Reader resolution moved ahead of the heuristics gate to feed this (one
extra indexed D1 SELECT per create attempt, joining two reads that already
ran there).

## 2. Fake emails, bounces, and domain reputation

The question: lots of people will type fake addresses; the first comment
from any unverified address triggers a verification mail; do the bounces
hurt? **Yes.** Hard bounces count toward the sending domain's bounce rate
at Resend (which suspends domains that stay above the low single digits)
and feed the reputation models at Gmail/Outlook/iCloud — enough of them
and *real* mail (newsletter, verification) lands in spam. Complaints are
worse, weighted far more heavily. Three new layers close this, in cost
order:

1. **Pre-send DNS check** (`email-domain-check.ts`): before handing an
   address to Resend, resolve the domain's MX (falling back to A/AAAA per
   RFC 5321) over DNS-over-HTTPS, cached per domain in KV (7d positive,
   1d negative). A domain that verifiably cannot receive mail is never
   sent to — it can never bounce. Every ambiguous outcome (DoH trouble,
   resolver errors) fails open; the check only blocks on a definitive no.
2. **Suppression ledger** (`email_suppressions`, migration 0017, fed by
   `/webhooks/resend`): Resend posts delivery events, Svix-signed
   (`RESEND_WEBHOOK_SECRET`, now in the readiness script's required set).
   A permanent bounce or a spam complaint records the email hash once;
   the verification send path checks the ledger and silently refuses.
   Transient bounces (mailbox full, greylisting) do not suppress. Rows
   are removed only manually (`wrangler d1 execute`).
3. **A 30-day ceiling** on verification mail per address (8, on top of the
   existing 1/10min and 5/day): an address that keeps triggering mails
   without ever confirming stops getting them. A confirmed reader is a
   known reader — no later comment of theirs sends verification mail at
   all — so the ceiling only ever binds fakes and victims of address
   abuse, which also turns the mail-bombing exposure from "5/day forever"
   into "8, ever, per 30 days".

All three gates are silent no-ops, preserving the resend endpoint's
you-cannot-probe-an-address contract.

The suppression ledger is deliberately notify-scoped (`notify/server/`),
not comments-scoped: the newsletter send paths should adopt the same check.
Not wired there yet — the list is double-opt-in so its bounce exposure is
low, but see follow-ups.

## 3. Edge rules were partly dead — fixed

`configure-cloudflare-rate-limits.ts` shipped two rules pointing at a v1
path draft (`/api/v2/blog/reactions`, `/api/v2/blog/avatar/`) that no
route ever answered — both were dead letters, and the comment-surface
POSTs had no edge protection at all. Fixed the paths
(`/api/v2/reactions`, `/api/v2/reader/avatar/`) and added a
`comment surface writes` rule: 60 POSTs/min per IP across
`/api/v2/comments`, `/api/v2/reactions/toggle`, `/api/v2/reader/resend`,
`/api/v2/reader/verify` — far above any legitimate writer (the durable
budgets inside the Worker are much tighter), so it only ever sheds floods
before they reach the Worker. **Needs a re-run with `--execute` against
the zone to take effect.**

## 4. Abuse-vector sweep

Vectors audited and where each stands:

- **Bot form fills** — Turnstile (action-checked), honeypot, dwell token,
  all answered with fabricated success envelopes. Covered.
- **Comment/reaction floods** — durable multi-dimension budgets in the
  Worker + the (now working) edge rules. Covered.
- **Reaction identity churn** — hashed-IP budgets from the earlier rework;
  rejections carry no fresh cookie. Covered.
- **Duplicate/link/keyword spam** — body-hash drop, link ceilings,
  blocklist, AI safety filter, shadow-ban. Covered; blocklist and
  disposable list are small curated seeds (see follow-ups).
- **Mail bombing a victim's address** — 1/10min, 5/day, now 8/30d, and a
  complaint from the victim suppresses permanently. Residual: the first
  few mails still arrive; acceptable for a personal blog.
- **Address probing/enumeration** — resend and verify answer fixed shapes;
  avatar endpoint falls back to identicons for unknown hashes. Covered.
- **Moderation prompt injection** — a comment can try to talk `task-guard`
  into `publish`. The policy floor only ever *widens* publish, so
  injection can win publication of spam, not unpublish others; the owner
  reads every comment via Telegram and can delete/shadow-ban. Accepted
  risk, unchanged.
- **Dwell-token replay** — reusable by design for 2h (not a security
  boundary); the rate budgets bound what a replay is worth. Accepted.
- **Forged suppression (DoS a reader's mail)** — requires the Svix secret;
  webhook is signature-checked, rate-limited, body-bounded. Covered.
- **Held/rejected visibility** — list endpoints filter; wire never
  distinguishes held from rejected; probed in the staging matrix. Covered.

## 5. Residual risks and follow-ups, in priority order

1. **Wire `isEmailSuppressed` into the newsletter/broadcast send paths.**
   The ledger exists; dispatch/digest just don't consult it yet. Cheap
   insurance against list rot poisoning the domain from the other side.
2. **Plus-addressing sybils.** `user+1@gmail.com`, `+2`, ... are distinct
   addresses sharing one mailbox — verified identities are farmable at
   about a minute each, and each gets the looser verified budgets.
   Decide whether to canonicalize (strip `+tag`, maybe Gmail dots) *for
   risk-keying only* (a second hash alongside the display identity —
   never for login or claiming). Trade-off: Gmail-specific rules are
   heuristics, and stripping tags erodes readers' legitimate
   tag-per-site privacy habit. The verified budgets are modest enough
   that this is a watch-item, not urgent.
3. **Vendored disposable-domain dataset.** The curated 12-domain seed is
   trivially bypassed; now that verified readers skip the check entirely,
   growing the anonymous-side list costs nothing. The plan already names
   the public disposable-email-domains dataset.
4. **KV-editable blocklist/disposable config** — deferred in the launch
   cut, still worth having before the first real spam wave.
5. **Claim-on-verify impersonation.** Anyone can comment under anyone's
   email; if the owner of that address later verifies, they inherit those
   comments. Twikoo-parity accepted risk in the PRD; a later cut could
   scope claiming to comments from the same anon session that triggered
   the mail.

## 6. Cutover additions (on top of the staging note's checklist)

1. Apply migration `0017_email_suppressions.sql` to production D1 (with
   the 0016 backup step).
2. `wrangler secret put RESEND_WEBHOOK_SECRET` on prod site-api — value is
   the endpoint secret from the Resend dashboard webhook.
3. In the Resend dashboard, add a webhook endpoint at
   `https://buxx.me/api/webhooks/resend` subscribed to `email.bounced` and
   `email.complained`.
4. Re-run `configure-cloudflare-rate-limits.ts --execute` so the fixed
   reaction/avatar rules and the new comment-writes rule reach the zone.
5. Re-run the staging behavioral matrix: the C-series expectations change
   for verified writers (verified reply with a link no longer holds;
   verified 4th-in-a-minute no longer 429s until the 7th).

## Verification

site-api `wt/blog-comments`: `bun run check` 0 errors, unit suite 961/961
(was 908 before the new suites: svix + webhook route, domain check,
verify-mail gates, verified heuristics/reaction cases). site (this repo):
docs coverage 108/108 against the worktree
(`bun scripts/check-docs-coverage.ts <blog-comments worktree>`).
