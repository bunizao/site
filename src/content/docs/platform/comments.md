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
| `COMMENTS_OWNER_EMAIL_HASH` | `sha256(normalizeEmail(ownerEmail))`. Binds portal-issued access codes and drives the author badge on verified rows. Unset means neither capability is available |
| `COMMENTS_OWNER_DISPLAY_NAME` | Trusted owner name used by website and Telegram replies. It may match the otherwise reserved owner-name list |
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
| `CACHE` / `SESSION` (KV) | Shadow-ban keys. Absent fails open, meaning nobody is shadow-banned |
| `BLOG_IMAGES` (R2) | Cached reader avatars, keyed by email hash |

## Scheduled work

All of it runs from `/notify/schedule`, which fires on the site's
15-minute cron (every scheduled trigger except the hourly mood-stats one).
Each job is a bounded, idempotent sweep, so running it ninety-six times a day
costs nothing beyond the four statements it issues.

| Job | What it removes |
| --- | --- |
| Unverified address sweep | An address that never confirmed, 7 days on |
| Comment risk signals | `ip_hash`, `fp_hash`, `ua`, `country`, `asn`, nulled in place 90 days after the comment was written. The comment itself stays |
| Expired email-change requests | Tokens nobody used |
| Expired delete requests | Same |

The 90-day sweep is the retention promise behind
[the privacy map](/docs/platform/privacy#what-the-policy-has-to-match). The
risk signals exist to catch a wave of abuse as it happens; three months later
they are not evidence of anything, they are just a per-comment record of where
somebody was sitting.

## Stopping somebody

Two mechanisms, deliberately independent, because they answer different
questions.

**Shadow ban** — a KV key under `comments:shadowban:`, matched on email hash,
IP hash, or fingerprint hash. A listed writer's comment is created and held,
and they are never told: their own browser shows the normal "sent for review"
state, and nobody else ever sees the row. There is no admin-portal write path;
the list is managed with `wrangler kv key put`, keyed individually so a lookup
never fetches a growing blob. Missing KV fails open.

**Reader ban** — `notify_subscribers.banned` on the reader row. This one is not
quiet. A banned reader's session is refused on sight, so it takes effect on the
next request rather than at the next cookie expiry; their hearts drop out of
reaction counts and reactor lists; and reply mail stops. It is the lever for an
identity that should lose its account, where a shadow ban is the lever for a
source that should stop being productive without learning why.

Neither retroactively deletes anything. Both leave existing published rows
standing — removing those is a moderation action of its own.

## Moderation surfaces

- **Telegram ops bot** at `/webhooks/telegram-ops` — the notification for a new
  or held comment, with the decision keyboard attached, plus direct reply when
  `COMMENTS_TELEGRAM_DIRECT_REPLY` is on. Separate path, separate secret, and
  an operator-id allowlist; see [Internal routes](/docs/api/internal#webhooks).
- **Admin portal** — the comment routes under `/admin`, listed in the same
  place.
- **Akismet** — every submission is checked; ham publishes, spam holds, and
  the "blatant" signal rejects. Any error, timeout, or unparseable answer
  holds. The create request waits 1500ms for the verdict and finishes the
  check in the background if it runs over, so a `held` outcome can quietly
  become `published` a second later.
