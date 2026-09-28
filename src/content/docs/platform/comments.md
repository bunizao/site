---
title: Comments platform
description: The comments backend in site-api, covering config, scheduled sweeps, moderation, bans, and recovery.
group: Platform
order: 2.5
---

This page is the operator's side of comments: the switches, env vars,
bindings, scheduled jobs, and moderation tools. For the reader's view of the
comment box, see [Comments](/docs/surfaces/comments). For the wire contract,
see [Blog Comments API](/docs/api/comments).

Almost all of it lives in `site-api`. The public `site` Worker renders the
comment section and serves `/reader/confirm`. It stores nothing and holds none
of these secrets.

| Part | What it covers |
| --- | --- |
| [Kill switch](#kill-switch) | `COMMENTS_ENABLED`, which turns the whole feature off |
| [Configuration](#configuration) | Env vars and bindings |
| [Scheduled work](#scheduled-work) | Cron sweeps and the 90-day retention promise |
| [Stopping somebody](#stopping-somebody) | Quarantine, lockdown, the site-wide email rule, ban list, and reader ban |
| [Moderation surfaces](#moderation-surfaces) | Identity labels, the Telegram ops bot, the admin portal, Akismet, and the AI gateway |
| [Mood surface](#mood-surface) | The bridge into Telegram discussion groups |
| [Claims and evidence](#claims-and-evidence) | How ownership is kept apart from authentication |
| [Preview and recovery](#preview-and-recovery) | Ban previews, purge snapshots, and restores |
| [Quality measurements](#quality-measurements) | What the insights counters measure |

## Kill switch

`COMMENTS_ENABLED` gates every comment, reader, reaction, and OAuth route in
`site-api`. Any value other than the exact string `"true"` means off. When it
is off, all of those routes return a plain `404` with no "comments are
disabled" envelope, so a disabled feature looks absent instead of broken.

Production currently has it set to `"false"`.

The switch only covers the API. `site` decides whether to show the comment
section from [`blog.comments`](https://github.com/bunizao/site/blob/main/src/data/site.ts),
the post's own tags, the portal's per-post override and its site-wide
switches. The last two reach the page through the thread's first read. `site`
doesn't read the API's flag. If you turn the API off, the rendered box gets a
`404`. The client reads that as `GONE` and shows "comments aren't available
right now". That works as a degraded state, but don't leave it that way. If
the switch is going to stay off, turn the section off in `site` too.

## Configuration

`site-api` reads all of these from its env:

| Variable | Purpose |
| --- | --- |
| `COMMENTS_ENABLED` | The [kill switch](#kill-switch). `"true"` or nothing |
| `COMMENTS_MODE` | Site-wide default policy mode. A post's tags apply on top |
| `COMMENTS_REACTIONS` | `"false"` turns hearts off everywhere |
| `COMMENTS_REQUIRE_VERIFIED_EMAIL` | `"true"` makes verification the site-wide minimum |
| `COMMENTS_OWNER_EMAIL_HASH` | `sha256(normalizeEmail(ownerEmail))`. A row whose `email_hash` equals it gets the author badge. Unset means no badge, never a false one |
| `COMMENTS_OWNER_DISPLAY_NAME` | The name the owner's replies post under |
| `COMMENTS_TELEGRAM_DIRECT_REPLY` | `"true"` lets the ops bot post a reply straight from Telegram |
| `COMMENTS_SESSION_SECRET` | HMAC key behind reader sessions, the anonymous session id, `ip_hash` and `fp_hash`. If it is missing, `site-api` logs one warning and disables sessions instead of throwing |
| `COMMENTS_EMAIL_SECRET` | Signs verification, mute, and delete tokens |
| `COMMENTS_GHOST_FETCH_TIMEOUT_MS` | Upper limit on the post-registry lookup |
| `AKISMET_API_KEY` | Moderation. If it is absent, every comment falls through to the fail-closed path |
| `AKISMET_TEST_MODE` | `"1"` marks every check as a test, so staging and the e2e matrix never train the real classifier |

### Reader OAuth

Reader OAuth uses four more variables: `GITHUB_READER_OAUTH_CLIENT_ID`/`_SECRET`
and `GOOGLE_READER_OAUTH_CLIENT_ID`/`_SECRET`. None of them is required,
because nothing on the site links to `/oauth/reader/:provider`. When they are
unset, that route returns a clean `404` and every reader stays L1 (verified by
email; L2 would be an OAuth sign-in).

`site-api`'s readiness script lists them in `DORMANT_SECRETS` instead of
`REQUIRED_SECRETS`, so you can ship comments without registering two OAuth apps
nobody can reach. Move them back to `REQUIRED_SECRETS` when a sign-in button
ships.

Never reuse the admin `GITHUB_OAUTH_*` credentials for the reader pair. The
admin app is allow-listed to one person, and the reader app would be open to
anyone.

### Policy defaults in both Workers

The three policy defaults (`COMMENTS_MODE`, `COMMENTS_REACTIONS`,
`COMMENTS_REQUIRE_VERIFIED_EMAIL`) have twins in `site`'s `src/data/site.ts`:
`mode`, `reactions`, and `requireVerifiedEmail`. Change those three lines and
these three variables together. The per-post half can't drift, because both
Workers read the Ghost tags through one function in `@bunizao/contracts`.

`COMMENTS_MODE=off` and `COMMENTS_ENABLED=false` do different things:

| Setting | Effect |
| --- | --- |
| `COMMENTS_MODE=off` | A policy: the post takes no new comments. A create returns `403`, and the thread stays readable |
| `COMMENTS_ENABLED=false` | The whole feature disappears |

### Bindings

| Binding | Used for |
| --- | --- |
| `NOTIFY_DB` (D1) | `blog_comments`, `blog_reactions`, `notify_subscribers`, mutes |
| `RATE_LIMITER` (Durable Object) | Every comment and reaction budget. It runs in durable mode, not observability mode. This is the only route family on the site that does |
| `CACHE` / `SESSION` (KV) | The 24h session/account quarantine (`comments:quarantine:`) and the one-hour anonymous lockdown (`comments:lockdown`). If absent, these controls fail open. Bans are stored separately, in D1 |
| `BLOG_IMAGES` (R2) | Cached reader avatars, keyed by email hash |

## Scheduled work

Every job is a bounded, idempotent sweep. They run on two schedules:

- The short-window jobs run on the 15-minute cron, as part of the notify
  schedule.
- The 90-day retention sweeps run once a day, on the hourly trigger at 19:00
  UTC. The 15-minute path never runs them, so the two can't overlap.

Calling `/notify/schedule` by hand also runs all of them, for example to clear
a backlog.

| Job | Cadence | What it removes |
| --- | --- | --- |
| Unverified address sweep | 15 min | An address that never confirmed, 7 days on. The same sweep drops the address typed on a private message that no reader session sent |
| Expired email-change requests | 15 min | Tokens nobody used |
| Expired delete requests | 15 min | Same |
| Comment risk signals | Daily | Every actor column and both JSON blobs on `blog_comments`, `blog_reactions` and `owner_messages`, nulled in place 90 days after the row was written. The comment itself stays |
| Activity-log identities | Daily | `identity_key` and `reader_id` on `blog_activity_log`, 90 days on. The event itself stays |
| Ban-operation snapshots | Daily | Risk columns inside snapshot rows, and snapshots past their 30-day restore window |
| Comment quality metrics | Daily | Hourly `blog_comment_metrics` counters older than 90 days |

### 90-day retention

The 90-day sweep backs the retention promise in
[the privacy map](/docs/platform/privacy#what-the-policy-has-to-match). Risk
signals exist to catch a wave of abuse while it happens. Three months later
they prove nothing and are only a per-comment record of where somebody was.

The sweep clears:

- the raw address and its hash
- the /24 hash
- the server-side and client-side fingerprint hashes
- the stable device hash
- the storage-id hash
- the user agent, city, and country
- the ASN and its name
- the referrer
- the two JSON blobs: the request's network and header set, and what the
  browser said about itself

It keeps:

- the body and its hash
- the link domains
- the session id
- the browser and OS family names
- the behavioural integers: dwell, Turnstile age, link count, and whether the
  session was new

The kept fields describe the request itself rather than who sent it.

## Stopping somebody

There are two automatic ways to stop a writer and three manual ones. The
automatic pair handles a 3am flood before the owner wakes up. The manual ones
are for the owner to use afterwards.

| Mechanism | Kind | Scope | Stored in |
| --- | --- | --- | --- |
| [Identity quarantine](#identity-quarantine) | Automatic, 24 hours | The current account or anonymous session | KV, `comments:quarantine:` |
| [Lockdown](#lockdown) | Automatic, one hour | Every anonymous writer, site-wide | KV, `comments:lockdown` |
| [Site-wide email rule](#site-wide-email-rule) | Manual, until the owner turns it off | Every anonymous writer, site-wide | D1, `comment_site_policy` |
| [Ban list](#ban-list) | Manual, shadow | One key per row | D1, `blog_bans` |
| [Reader ban](#reader-ban) | Manual, visible | One reader | `notify_subscribers.banned` |

Neither automatic mechanism holds or rejects a comment. Both ask the anonymous
writer to confirm an email address. This is the same step-up (an extra check
before the comment goes through) that a suspicious score triggers; see
[the risk stack](/docs/api/comments#post-a-comment). The site-wide email rule
asks the same.

- A person gets through with one click. An agent without a mailbox never does.
- Every waiting comment that included an address is in the queue with a note
  that starts `Awaiting email`. The owner can approve it without waiting for
  the writer.
- A step-up without an address stores nothing. The writer is still told what
  to do, which is what makes it different from a silent block.
- The one automatic reject is a declared agent. It stores its row too, sends a
  card with Approve on the first strike, and can be approved from the portal.

### Identity quarantine

A quarantine lasts 24 hours and is stored in KV under `comments:quarantine:`.
It applies to the current account or anonymous session only.

- A filled honeypot, a declared agent, or a spam verdict quarantines that
  subject.
- Shared IP, subnet, and fingerprint values never spread it to other readers.
- Ordinary owner hide or delete actions don't add a quarantine.
- Approving a flagged comment lifts it.

Network rate limits and the site-wide lockdown are independent of it and stay
in place.

### Lockdown

A lockdown lasts one hour, applies site-wide, and is stored in KV under
`comments:lockdown`. It engages on its own when anonymous traffic as a whole
looks like a flood:

- more than 8 anonymous comments in 10 minutes, or
- 3 of the last 5 anonymous comments judged spam.

Writers that the score asks for an email never engage it. They are already
stopped, and one agent retrying is not a wave.

While the lockdown lasts:

- Every anonymous writer is asked to confirm an email.
- Waiting rows get reason `ok`, so they never count toward the spam ratio that
  engaged it.
- Akismet and the AI gateway still judge each comment. A spam verdict replaces
  the wait.
- No per-comment cards are sent. The owner gets exactly one card that says when
  the lockdown lifts.
- Verified readers are never affected.

`/comments` in the ops bot shows the status. A flood that outlasts the hour
engages it again.

### Site-wide email rule

The owner turns this rule on and off with the portal's *Require a confirmed
email* switch, on Home or on Post modes. It is stored in D1 and works like a
lockdown that never ends:

- Every anonymous comment and reply waits for a confirmed email.
- A waiting row gets reason `ok`, and its card comes only when the writer
  confirms. A comment held for any other reason gets its card at once.
- Verified readers are not affected.

While the rule is on, the lockdown has nothing to add, so Home shows a line
instead of the lockdown control. The flood count of 8 in 10 minutes stops
counting.

Next to it, a *Comments everywhere* switch makes every post read-only or off,
whichever is stricter than the post's own mode. See
[Site-wide switches](/docs/api/comments#site-wide-switches).

### Ban list

The `blog_bans` table holds one row per key, with an optional note and expiry.
A key is one of:

- the address hash
- the session
- the IP hash, or its /24 hash
- the server-side fingerprint
- the client fingerprint (matching either the exact or the stable device hash)
- the ASN
- a link domain
- a mail domain

Every write path (comments, hearts, and private messages) checks every key a
request carries in one query.

A ban is shadow-only on every path. It works differently on each:

- **Comments.** A listed writer's comment is created and held with the note
  `Shadow-banned writer.`. It skips the Akismet call, the model call, and the
  Telegram card. The writer's own browser shows the normal "sent for review"
  state, and nobody else ever sees the row.
- **Hearts.** A listed source's heart gets the ordinary envelope, with the
  `reacted` state it asked for and a count that didn't move. No row is written,
  there is no reader pass, and no error is returned.
- **Private messages.** A listed sender's message is stored and filed as spam
  with the note `Shadow-banned sender.`, and answered like any other. See
  [Owner Messages API](/docs/api/messages#senders-and-bans).

No response reveals the ban, because a ban that announces itself is one
somebody can test around.

You can apply a ban from the comment queue's actor strip, from the source
profile, or from the Ban button on a held comment's Telegram card. Lift it from
the ban list page.

A ban raised from a comment deletes that comment by default, and the Telegram
card's ban always does. The deletion is part of the same restorable operation.

A ban can also **purge**. Purge soft-deletes the source's comments from the
last 90 days with the note `Purged with ban.` and removes its reaction rows.
Each affected row is written to the activity log first. From a comment, the
portal's *Same fingerprint* choice purges that comment's device fingerprint
too, without banning it. Purge is off by default.

A purge never takes:

- a published comment that a reader other than the banned comment's writer
  wrote while signed in
- a reaction another reader left
- the owner's own replies and comments

A writer counts as that reader only if they were signed in when writing. A
later claim doesn't count.

#### Choose ban keys

- A ban dialog opened from a comment row selects only that comment's session.
  If the comment was verified at write time, it also selects the verified
  email. A later ownership claim doesn't count as authentication at submission.
- Bans from the portal and Telegram expire after seven days by default.
- IPs, subnets, server and device fingerprints, typed email addresses, ASNs,
  and link or mail domains need explicit selection, with a warning. Sharing one
  of these signals doesn't prove that two writers are the same person.
- Link domains follow the Public Suffix List, including private hosting
  suffixes. Separate GitHub Pages and Cloudflare Pages tenants stay separate.
- You can't ban a mail domain with more than ten published comments in the
  last 90 days. The API enforces the same rule as the dialog.
- An action from a source profile selects the source key you are viewing. It
  never selects the first commenter's other keys.

Fingerprints are comparison signals only. The linked source graph follows
storage identifiers and verified email observations. A stable device hash
alone never links separate sessions.

### Reader ban

A reader ban sets `notify_subscribers.banned` on the reader row. Unlike a
ban-list entry, the reader notices it:

- A banned reader's session is refused on sight. The ban takes effect on the
  next request instead of at the next cookie expiry.
- Their hearts drop out of reaction counts and reactor lists.
- Reply mail stops.

Use a reader ban when an identity should lose its account. Use a shadow ban
from the ban list when a source should stop being productive without learning
why.

The portal lists every revoked reader and can restore one. Restoring clears
the reader's ban flag and nothing else:

- Key bans applied in the same act stay.
- Purged rows come back only through the ban operation's own restore.
- The reader's session cookie was never deleted, so they are signed in again
  on their next request.

Neither kind of ban deletes anything retroactively on its own. Both leave
existing published rows in place. Removing those is a separate moderation
action, even when the portal bundles it with the ban (the banned comment, or a
purge).

## Moderation surfaces

The owner moderates from the Telegram ops bot and the admin portal. Akismet and
the AI gateway judge submissions automatically.

| Surface | Role |
| --- | --- |
| [Identity labels](#identity-labels) | How each comment's authentication is shown |
| [Telegram ops bot](#telegram-ops-bot) | A card for each new or held comment, with decision buttons |
| [Admin portal](#admin-portal) | The queue, insights, source profiles, the ban list, thread controls, and the site-wide switches |
| [Akismet](#akismet) | Checks every submission |
| [AI gateway](#ai-gateway) | A second opinion on anonymous submissions |

### Identity labels

Identity labels distinguish four cases:

| Label | Meaning |
| --- | --- |
| **Verified when written** | The session was verified when the comment was written |
| **Anonymous when written** | The session was anonymous when the comment was written |
| **Claimed later** | Ownership was recorded after submission |
| **Verification unknown** | No authentication evidence was recorded |

A claim records ownership after submission. It never rewrites the original
authentication evidence. Verification describes the session at the time of
writing. It says nothing about trustworthiness or the account's current
access. A passed browser challenge or a reader ID alone doesn't establish
historical verification.

The portal shows the label in each comment's detail pane. The queue doesn't
filter by it. Actor strips on comments, reactions, and source
profiles show the linked reader, the claim time and method, and active ban-key
matches. A ban-key match describes the record's keys. It is not a full check
of the account's status.

Every owner notification, including ones for published comments, shows identity
evidence and a link to the details in the portal. Bot cards are snapshots from
notification time, so open the portal for current records. Network, storage,
and fingerprint matches name what they matched on and may include different
readers.

### Telegram ops bot

The ops bot at `/webhooks/telegram-ops` sends a notification for each new or
held comment, with the decision keyboard attached. When
`COMMENTS_TELEGRAM_DIRECT_REPLY` is on, the owner can also reply directly from
Telegram. The bot has its own path, its own secret, and an operator-id
allowlist; see [Internal routes](/docs/api/internal#webhooks).

### Admin portal

The comment routes live under `/admin` and are listed on the same Internal
routes page. The portal has four views:

- **Queue.** A one-line log. Its detail pane carries the actor record: where
  the write came from, what it did, and which keys it shares with other rows.
  Search and filters run on site-api, over the last 30 days unless a range
  says otherwise. A range wider than 90 days keeps its latest 90. The queue's
  acts are approve, hide, reject with a reason, delete, restore within 30
  days, the owner's reply, and one act over up to 20 selected rows. It also
  shows and lifts the lockdown.
- **Insights.** Tables grouped by network, subnet, device, hint, link domain,
  and mail domain. Each shows the share the automatic pass held.
- **Source profile.** One key, with its spread across other keys and a two-hop
  link graph over strong keys only.
- **Ban list.**

Next to these views sit the thread controls: pin one root per post, lock a
thread against new replies, and override one post's comment mode (see
[Blog Comments API](/docs/api/comments#pinned-and-locked-threads)). The log's
detail pane carries all three: P pins, L locks the thread, and the post line
switches the mode. The log marks a pinned or locked root in front of its text,
and Post modes lists every override.

Two site-wide switches sit on Home, next to the lockdown, and again at the top
of Post modes:

- *Comments everywhere*: open, read-only or off
- *Require a confirmed email*

A row in Post modes whose mode the site-wide one overrides says "everywhere",
and the post line says the site-wide mode wins. The Comments header shows one
line for each switch that is on, with a button that turns it back off. The ⌘K
palette offers only the changes that apply.

Cookie-less readers see each of these changes within about 90 seconds, the
life of the edge's shared copy of the thread. Nothing purges it.

### Akismet

Akismet checks every submission:

| Akismet answer | Result |
| --- | --- |
| Ham | Publishes |
| Spam | Holds |
| The "blatant" signal | Rejects |
| An error, timeout, or unparseable answer | Holds |

The check sends everything Akismet documents: site language and charset, the
honeypot field, the owner's `administrator` role, a timestamp, and
`recheck_reason=edit` on edits.

The owner's decisions go back to Akismet as feedback. Hiding or deleting an
anonymous comment submits it as spam. Approving a flagged one submits it as
ham. Restoring a deleted one takes the spam report back with ham, unless the
comment returns to a hold that still says spam. Rows keep the raw IP and referrer for 90 days, so the feedback repeats
exactly what the check saw.

### AI gateway

The AI gateway gives a second opinion on anonymous submissions only. It uses
the `task-guard` alias behind `AI_BASE_URL` / `AI_API_KEY`, the same gateway
mood sentiment runs on. It reads two things:

- **The text**, the way the owner would: VPN pitches, referral links, "contact
  me on Telegram". It can turn Akismet's ham into a hold, never the reverse.
- **The writer**, with the writer's last day and the site's last hour as
  context. An `agent` answer triggers a step-up on its own. An `unclear`
  answer adds half as much to the step-up score, so it triggers one only
  together with other signals. Neither answer is a moderation hold. An `agent`
  answer keeps a comment held even after its email is confirmed.

If the key is unset, the call times out, or the model refuses, the Akismet
verdict stands alone. The create request waits 8000ms for both checks. If they
run over, the check finishes in the background, so a `held` outcome can turn
into `published` a moment later.

## Mood surface

Comments on mood posts use `surface: 'mood'`. They share every switch, table,
and moderation tool above with the blog: the same `COMMENTS_ENABLED`, the same
`blog_comments` table, the same risk stack, and the same Telegram ops bot.

Mood comments add a bridge into the post's Telegram discussion group, with its
own kill switch. The bridge is covered end to end in
[Comments API § Mood surface](/docs/api/comments#mood-surface-the-telegram-bridge)
and [Telegram pipeline § The comment bridge](/docs/platform/telegram#the-comment-bridge).

`MOOD_COMMENTS_ENABLED` is the mood kill switch. It is independent of
`COMMENTS_ENABLED`. When it is `"false"` (the default):

- Every mood document's `discussionLinked` is forced to `false`. The compose
  box never renders, and `/mood/[id]` keeps the "Leave a comment on Telegram"
  link.
- A `surface: 'mood'` create returns `404`, the same as for an unlinked post.
- Every Telegram call the bridge makes stops: sends, edits, deletes, both
  hourly sweeps, and the reply notification for group replies. Turning the
  switch off mid-incident silences the bot at once.

Reads work either way. The plain Telegram scrape keeps working, rows already
bridged still overlay, and the discussion-thread mapping keeps filling in from
automatic forwards. Turning the switch back on needs no backfill.

| Variable | Purpose |
| --- | --- |
| `MOOD_COMMENTS_ENABLED` | The mood kill switch above |
| `TELEGRAM_DISCUSSION_CHAT_ID` | The discussion group's chat id, from `getChat(@tutumood).linked_chat_id`. `scripts/print-discussion-chat.ts` in `site-api` prints it |
| `COMMENTS_OWNER_TELEGRAM_USERNAME` | Marks the owner's own group replies `byAuthor` on the web, the mood equivalent of `COMMENTS_OWNER_EMAIL_HASH` |

The ops bot must be a **member of the discussion group as an admin**, with
only **Delete messages** granted. Telegram only delivers group messages to the
bot if it is an admin; otherwise bot privacy mode hides them. *Delete messages*
is the one permission the bridge uses, to retract a comment the owner hides or
deletes on the site.

### Phase 0 checklist

Do this one-time setup before you flip the switch, in order:

1. Add the ops bot to the discussion group as admin, with **Delete messages**
   only (see above).
2. Set `TELEGRAM_DISCUSSION_CHAT_ID` from `getChat(@tutumood).linked_chat_id`.
3. Set `COMMENTS_OWNER_TELEGRAM_USERNAME` to the owner's Telegram `@handle`.
4. Allow the `mood_comment_create` Turnstile action on the widget in the
   Cloudflare dashboard. It is separate from `blog_comment_create`, so you can
   tune the two surfaces separately.
5. Ship with `MOOD_COMMENTS_ENABLED=false` first. Check that the bot receives
   group messages and that the mapping backfills for existing posts. Then flip
   it to `true`.

Once `MOOD_COMMENTS_ENABLED=true`, `check-production-readiness.ts` (site-api)
adds `TELEGRAM_DISCUSSION_CHAT_ID` to the required-secrets set. A missing chat
id then fails the readiness check, instead of the bridge never sending
anything.

## Claims and evidence

A comment's ownership and its original authentication evidence are stored
separately. Historical rows without evidence stay `unknown`. New writes record
`anonymous` or `verified`.

| Claim path | How it works |
| --- | --- |
| Same browser | Needs both the original session cookie and the verified mailbox |
| Cross-browser | The reader reviews their history at `/reader/comments`, and only the rows they select are claimed |

Neither path rewrites the authentication evidence. Source profiles show shared
storage and fingerprint values across distinct verified accounts. They don't
merge those accounts or invent a confidence percentage.

## Preview and recovery

Before a ban is applied, the portal previews what it would affect over the last
90 days: distinct accounts, sessions, comments by status, and reactions, plus
the published comments a purge would spare. When you select several keys, they
combine as a union, so overlapping rows count once.

Broad bans are still possible after explicit selection. A purge, though, is
refused when more than 500 comments and reactions would need backups. The
preview still reports the full count when removal is over that limit.

Purge snapshots and the mutations are captured atomically. From the ban history
you can restore eligible content for 30 days without lifting the ban.

- A later content, moderation, ownership, or reaction change makes the affected
  item ineligible. A restore never overwrites those changes.
- Privacy-only sweeps don't disable recovery.
- A restore never brings back risk signals older than their original 90-day
  retention window.
- Scheduled maintenance removes expired snapshots.

## Quality measurements

Insights show the first owner decision on automatically held comments: the
number reviewed, next to the share later approved. Read it as a moderation
outcome. It isn't a ground-truth false-positive rate.

- Temporary AI-pending holds that publish automatically are excluded.
- Legacy approval and hide counts are still labeled as owner actions.

Server-observed request failures have separate denominators for all requests
and for authenticated requests. Browser-reported failures and repeated
challenges are shown separately and marked incomplete and unverified. Missing
measurements show as unavailable, and a zero denominator produces no
percentage.

The underlying hourly counters hold no addresses, identifiers, fingerprints, or
text, and expire after 90 days. None of these counters grants identity or
triggers a ban.
