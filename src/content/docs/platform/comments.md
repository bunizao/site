---
title: Comments platform
description: What the comments feature needs configured, what runs on a schedule, and the two independent ways to stop somebody.
group: Platform
order: 2.5
---

The reader's view of the comment box is [Comments](/docs/surfaces/comments) and
the wire contract is [Blog Comments API](/docs/api/comments). This page is the
operator's half: the switches, the bindings, the cron work, and the moderation
levers.

Almost all of it lives in `site-api`. The public `site` Worker renders the
section and owns `/reader/confirm`; it stores nothing and holds none of these
secrets.

## The kill switch

`COMMENTS_ENABLED` gates every comment, reader, reaction, and OAuth route in
`site-api`. Anything but the exact string `"true"` is off, and off means a flat
`404` from all of them — not a friendly "comments are disabled" envelope, on
purpose: an off feature should look absent, not broken-with-details.

It is currently `"false"` in production.

The switch is one-sided. `site` decides whether to render the section from
[`blog.comments`](https://github.com/bunizao/site/blob/main/src/data/site.ts)
and the post's own tags, and knows nothing about the API's flag, so turning the
API off leaves a rendered box that answers `404` — which the client reads as
`GONE` and shows as "comments aren't available right now". Adequate as a
degraded state, and not something to leave standing: turn the section off in
`site` too if the switch is going to stay off.

## Configuration

Every one of these is read from `site-api`'s env.

| Variable | Purpose |
| --- | --- |
| `COMMENTS_ENABLED` | The kill switch above. `"true"` or nothing |
| `COMMENTS_MODE` | Site-wide default policy mode; a post's tags fold on top |
| `COMMENTS_REACTIONS` | `"false"` turns hearts off everywhere |
| `COMMENTS_REQUIRE_VERIFIED_EMAIL` | `"true"` makes verification the site-wide floor |
| `COMMENTS_OWNER_EMAIL_HASH` | `sha256(normalizeEmail(ownerEmail))`. Drives the author badge by equality against a row's `email_hash`. Unset means no badge, never a false one |
| `COMMENTS_OWNER_DISPLAY_NAME` | The name the owner's replies post under |
| `COMMENTS_TELEGRAM_DIRECT_REPLY` | `"true"` lets the ops bot post a reply straight from Telegram |
| `COMMENTS_SESSION_SECRET` | HMAC key behind reader sessions, the anonymous session id, `ip_hash` and `fp_hash`. Missing logs one warning and disables sessions rather than throwing |
| `COMMENTS_EMAIL_SECRET` | Signs verification, mute, and delete tokens |
| `COMMENTS_GHOST_FETCH_TIMEOUT_MS` | Ceiling on the post-registry lookup |
| `AKISMET_API_KEY` | Moderation. Absent means every comment falls through to the fail-closed path |
| `AKISMET_TEST_MODE` | `"1"` marks every check as a test, so staging and the e2e matrix never train the real classifier |

Reader OAuth needs four more — `GITHUB_READER_OAUTH_CLIENT_ID`/`_SECRET` and
`GOOGLE_READER_OAUTH_CLIENT_ID`/`_SECRET` — and none of them is required,
because nothing on the site links to `/oauth/reader/:provider`. Unset, the
route answers a clean `404` and every reader stays L1. They live in
`DORMANT_SECRETS` in `site-api`'s readiness script rather than
`REQUIRED_SECRETS`, so shipping comments does not mean registering two OAuth
apps nobody can reach; move them back the day a sign-in button ships. The
reader pair must never share credentials with the admin `GITHUB_OAUTH_*`
pair — that app is allow-listed to one human, this one would be open to
anyone.

The three policy defaults have a twin in `site`'s `src/data/site.ts` —
`mode`, `reactions`, `requireVerifiedEmail`. The per-post half cannot drift
(both halves read the Ghost tags through one function in
`@bunizao/contracts`), but those three lines and these three variables have to
be changed together.

`COMMENTS_MODE=off` and `COMMENTS_ENABLED=false` are not the same lever: the
first is a policy answering "this post takes no new comments" with a `403` and
a readable thread; the second makes the whole feature disappear.

### Bindings

| Binding | Used for |
| --- | --- |
| `NOTIFY_DB` (D1) | `blog_comments`, `blog_reactions`, `notify_subscribers`, mutes |
| `RATE_LIMITER` (Durable Object) | Every comment and reaction budget. Durable, not observability mode — this is the only route family on the site that is |
| `CACHE` / `SESSION` (KV) | The 24h session/account quarantine (`comments:quarantine:`) and one-hour anonymous lockdown (`comments:lockdown`). Absent fails open for these controls; bans are stored separately in D1 |
| `BLOG_IMAGES` (R2) | Cached reader avatars, keyed by email hash |

## Scheduled work

All of it runs from `/notify/schedule`, which fires on the site's
15-minute cron (every scheduled trigger except the hourly mood-stats one).
Each job is a bounded, idempotent sweep, so running it ninety-six times a day
costs nothing beyond the four statements it issues.

| Job | What it removes |
| --- | --- |
| Unverified address sweep | An address that never confirmed, 7 days on |
| Comment risk signals | Every actor column and both JSON blobs, nulled in place 90 days after the row was written, on `blog_comments`, `blog_reactions` and `owner_messages`. The comment itself stays |
| Expired email-change requests | Tokens nobody used |
| Expired delete requests | Same |

The 90-day sweep is the retention promise behind
[the privacy map](/docs/platform/privacy#what-the-policy-has-to-match). The
risk signals exist to catch a wave of abuse as it happens; three months later
they are not evidence of anything, they are just a per-comment record of where
somebody was sitting.

What the sweep clears: the raw address and its hash, the /24 hash, the
server-side and client-side fingerprint hashes, the stable device hash, the
storage-id hash, the user agent, city, country, the ASN and its name, the
referrer, and the two JSON blobs (the request's network and header set, and
what the browser said about itself). What survives it: the body and its
hash, the link domains, the session id, the browser and OS family names, and
the behavioural integers — dwell, Turnstile age, link count, whether the
session was new. Those describe a request, not a requester.

## Stopping somebody

Two automatic mechanisms and two manual ones. The automatic pair exists so a
flood at 3am is handled by the time the owner wakes up; the manual pair is
the owner's own lever afterwards. None of them rejects anything: the safe
state everywhere is `held`, so a false positive is still in the queue.

**Identity quarantine** — 24 hours, in KV under `comments:quarantine:`,
scoped to the current account or anonymous session. Honeypot and moderation
signals may quarantine that subject; shared IP, subnet and fingerprint values
never spread the hold to other readers. Ordinary owner hide/delete actions
do not add a quarantine. Approving a flagged comment lifts its scoped hold.
Independent network rate limits and the site-wide lockdown remain in place.

**Lockdown** — one hour, site-wide, in KV under `comments:lockdown`. Engages
on its own when anonymous traffic as a whole looks like a flood: more than
8 anonymous comments in 10 minutes, or 3 of the last 5 anonymous comments
judged spam. For its duration every anonymous comment is held with reason
`ok` (so it never counts toward the ratio that engaged it), external checks
are skipped, no per-comment cards are sent, and the owner gets exactly one
card saying when it lifts. `/comments` in the ops bot shows the status.
Verified readers are never affected. A flood that outlasts the hour
re-engages it on the next comment.

**Ban list** — the `blog_bans` table, one row per key, with an optional note
and expiry. A key is one of: the address hash, the session, the IP hash, its
/24 hash, the server-side fingerprint, the client fingerprint (matching
either the exact or the stable device hash), the ASN, a link domain, or a
mail domain. Both write paths check every key a request carries in one
query.

The effect is shadow-only, and the same for the two paths in different
shapes. A listed writer's comment is created and held with the note
`Shadow-banned writer.`; their own browser shows the normal "sent for
review" state and nobody else ever sees the row. A listed source's heart
gets the ordinary envelope carrying the `reacted` state it asked for and a
count that did not move: no row, no reader pass, no error. Neither says a
ban happened, which is the point — a ban that announced itself is one
somebody can test around.

Bans are applied from the comment queue's actor strip, from the source
profile, or from the Ban button on a held comment's Telegram card, and lifted
from the ban list page. Applying one can also **purge**: the source's
comments from the last 90 days are soft-deleted with the note
`Purged with ban.` and its reaction rows removed, each affected row written
to the activity log first. Purge is off by default and is the only part of
this that touches rows that already exist.

A comment-row dialog selects only its session and, for a comment verified
at write time, its verified email. A later ownership claim does not qualify
as authentication at submission. Portal and Telegram defaults expire after seven
days. IPs, subnets, server and device fingerprints, typed email addresses,
ASNs and link or mail domains require explicit selection with a warning:
sharing one of these signals does not establish that two writers are the
same person. Link domains follow the Public Suffix List, including private
hosting suffixes, so independent GitHub Pages and Cloudflare Pages tenants
remain separate. A mail domain with more than ten published comments in the
last 90 days cannot be banned; the API enforces the same rule as the dialog.

A source-profile action selects the source key being viewed, not the first
commenter's other keys. Fingerprints remain comparison signals. The linked
source graph follows storage identifiers and verified email observations;
a stable device hash alone never links separate sessions.

**Reader ban** — `notify_subscribers.banned` on the reader row. This one is not
quiet. A banned reader's session is refused on sight, so it takes effect on the
next request rather than at the next cookie expiry; their hearts drop out of
reaction counts and reactor lists; and reply mail stops. It is the lever for an
identity that should lose its account, where a shadow ban is the lever for a
source that should stop being productive without learning why.

The Bans page lists revoked accounts separately from source keys and provides
an account-specific **Lift** button. It clears only that reader's `banned`
flag; source-key bans, preferences, and other accounts are unchanged. Account
bans have no automatic expiry and remain active until manually lifted.

Neither retroactively deletes anything. Both leave existing published rows
standing — removing those is a moderation action of its own.

## Moderation surfaces

Identity labels distinguish **verified when written**, **anonymous when
written**, **claimed later**, and **verification unknown**. A claim records
ownership after submission; it does not rewrite the original authentication
evidence. Verification describes the session at writing, not trustworthiness
or the account's current access. Passed browser challenges and reader IDs
alone do not establish historical verification.

The portal queue can filter these identities within the loaded page and
shows page-local counts. Actor strips on comments, reactions, and source
profiles show the linked reader, claim time and method, and active ban-key
matches. Ban-key matches describe the record's keys, not a complete account
status check. Every owner notification, including published comments, shows
identity evidence and a portal details link. Bot cards are snapshots at
notification time; open the portal for refreshed records. Network, storage,
and fingerprint matches name their basis and may include different readers.

- **Telegram ops bot** at `/webhooks/telegram-ops` — the notification for a new
  or held comment, with the decision keyboard attached, plus direct reply when
  `COMMENTS_TELEGRAM_DIRECT_REPLY` is on. Separate path, separate secret, and
  an operator-id allowlist; see [Internal routes](/docs/api/internal#webhooks).
- **Admin portal** — the comment routes under `/admin`, listed in the same
  place. Four surfaces: the queue, where every row carries an actor strip
  (where the write came from, what it did, which keys it shares with other
  rows, and the two blobs behind a disclosure); the insights tables, grouped
  by network, subnet, device, hint, link domain and mail domain, each with
  the share the automatic pass held; one key's source profile, with its
  spread across other keys and a two-hop link graph over strong keys only;
  and the ban list.
- **Akismet** — every submission is checked; ham publishes, spam holds, and
  the "blatant" signal rejects. Any error, timeout, or unparseable answer
  holds. The check carries everything Akismet documents (site language and
  charset, honeypot field, the owner's `administrator` role, timestamp, and
  `recheck_reason=edit` on edits), and the owner's verdicts are fed back:
  hiding or deleting an anonymous comment submits it as spam, approving a
  flagged one submits it as ham. Rows keep the raw IP and referrer for 90
  days so that feedback repeats exactly what the check saw.
- **AI gateway** — a second opinion on anonymous submissions only, from
  the `task-guard` alias behind `AI_BASE_URL` / `AI_API_KEY`, the same gateway
  mood sentiment runs on. It reads the text the way the owner would (VPN
  pitches, referral links, "contact me on Telegram") and can turn Akismet's
  ham into a hold, never the reverse. Unset key, timeout, or refusal means
  the Akismet verdict stands alone. The create request
  waits 2500ms for both and finishes the check in the background if it runs
  over, so a `held` outcome can quietly become `published` a second later.

## Mood surface

`surface: 'mood'` shares every switch, table, and moderation lever above with
the blog — same `COMMENTS_ENABLED`, same `blog_comments` table, same risk
stack, same Telegram ops bot. What it adds is the bridge into the post's
Telegram discussion group, gated by its own kill switch, and detailed end to
end in [Comments API § Mood surface](/docs/api/comments#mood-surface-the-telegram-bridge)
and [Telegram pipeline § The comment bridge](/docs/platform/telegram#the-comment-bridge).

`MOOD_COMMENTS_ENABLED` is the mood-specific kill switch, independent of
`COMMENTS_ENABLED` above: `"false"` (the default) forces every mood
document's `discussionLinked` to `false` — the compose box never renders,
`/mood/[id]` keeps the "Leave a comment on Telegram" link — and a
`surface: 'mood'` create answers `404`, same as an unlinked post. It also
stops every Telegram call the bridge makes — sends, edits, deletes, both
hourly sweeps, and the reply notification for group replies — so flipping
it off mid-incident silences the bot at once. Reads are unaffected either
way: the plain Telegram scrape keeps working, rows already bridged still
overlay, and the discussion-thread mapping keeps filling in from automatic
forwards, so turning it back on needs no backfill.

| Variable | Purpose |
| --- | --- |
| `MOOD_COMMENTS_ENABLED` | The mood kill switch above |
| `TELEGRAM_DISCUSSION_CHAT_ID` | The discussion group's chat id — from `getChat(@tutumood).linked_chat_id`, printed by `scripts/print-discussion-chat.ts` in `site-api` |
| `COMMENTS_OWNER_TELEGRAM_USERNAME` | Marks the owner's own group replies `byAuthor` on the web, the mood equivalent of `COMMENTS_OWNER_EMAIL_HASH` |

The ops bot must be a **member of the discussion group as an admin**, with
only **Delete messages** granted — nothing else. Admin is required for
Telegram to deliver it group messages at all (bot privacy mode otherwise
hides them); *Delete messages* is the one permission the bridge actually
uses, to retract a comment the owner hides or deletes on the site side.

### Phase 0 checklist

One-time setup before flipping the switch, in order:

1. Add the ops bot to the discussion group as admin, **Delete messages**
   only — see above.
2. Set `TELEGRAM_DISCUSSION_CHAT_ID` from `getChat(@tutumood).linked_chat_id`.
3. Set `COMMENTS_OWNER_TELEGRAM_USERNAME` to the owner's Telegram `@handle`.
4. Allow the `mood_comment_create` Turnstile action on the widget
   (Cloudflare dashboard) — separate from `blog_comment_create`, so the two
   surfaces can be tuned apart.
5. Ship with `MOOD_COMMENTS_ENABLED=false` first, verify the bot receives
   group messages and the mapping backfills for existing posts, then flip
   it to `true`.

`check-production-readiness.ts` (site-api) adds `TELEGRAM_DISCUSSION_CHAT_ID`
to the required-secrets set once `MOOD_COMMENTS_ENABLED=true` — the readiness
check fails loudly rather than the bridge silently never sending.


## Claims and evidence

A comment's ownership and its original authentication evidence are separate.
Historical rows without evidence remain `unknown`; new writes record
`anonymous` or `verified`. Same-browser claiming requires both the original
session cookie and the verified mailbox. Cross-browser history is reviewed
at `/reader/comments`, and only selected rows are claimed. Neither path
rewrites the authentication evidence. Source profiles identify shared storage
and fingerprint values across distinct verified accounts without merging
those accounts or inventing a confidence percentage.

## Preview and recovery

Before applying a ban, the portal previews distinct affected accounts,
sessions, comments by status, and reactions over the last 90 days. Multiple
selected keys are combined as a union, so overlapping rows are counted once.
Broad bans remain possible after explicit selection, but a purge is refused
when more than 500 comments and reactions would need backups. The preview
still reports the full count when removal is over that limit.

Purge snapshots and the mutations are captured atomically. The ban history
can restore eligible content for 30 days without lifting the ban. Later
content, moderation, ownership or reaction changes make the affected item
ineligible; restoring never overwrites those changes. Privacy-only sweeps
do not disable recovery, and restoring never resurrects risk signals older
than their original 90-day retention window. Expired snapshots are removed
by scheduled maintenance.

## Quality measurements

Insights show the first owner decision on automatically held comments, with
the number reviewed beside the share later approved. This is a moderation
outcome, not a ground-truth false-positive rate. Temporary AI-pending holds
that automatically publish are excluded. Legacy approval/hide counts remain
labeled as owner actions.

Server-observed request failures have separate total and authenticated-request
denominators. Browser-reported failures and repeated challenges are displayed
separately as incomplete and unverified. Missing measurements are unavailable;
zero denominators produce no percentage. The underlying hourly counters
contain no addresses, identifiers, fingerprints or text and expire after
90 days. None of these counters grants identity or triggers a ban.


## Reader lifecycle edge cases

A failed submission restores its text only into an empty compose field.
When the reader has already written a new draft, that draft stays intact and
the failed comment is offered separately with copy and dismiss controls.
The form remains writable and the existing challenge/resubmit interaction
continues to use the draft currently shown.

Dwell tokens refresh after 20 hours, with a wake-up check for long-lived
mobile tabs. An anonymous writer's expired token receives a real moderation
hold and does not count as spam; a verified reader's publishes as usual. A
valid token younger than three seconds keeps the existing bot tripwire; an
invalid signature is refused; a missing session secret is a server
configuration error. The `/message` form keeps one token for the life of the
page, and its service files an expired token rather than dropping it.
