---
title: Blog Comments API
description: Read, post and react to comments on blog and mood posts. Posting needs only a name; email is optional.
group: API
order: 5.5
---

Use these routes to read and post comments on `/blog/[slug]`, react with
hearts, and manage a reader's identity. Anyone can read. Posting a comment
needs only a name, and the email is optional. Reacting needs neither.

An email gives the reader a persistent avatar and a way to claim their
comments later. Without one, the comment belongs to its anonymous browser
session alone. Email verification and OAuth sign-in are optional upgrades
(grades L1 and L2, below). An anonymous comment waits for a confirmed
address in two cases: on a post that takes comments from confirmed addresses
only (see [Per-post policy](#per-post-policy)), and when the email step-up
asks an anonymous writer for one (see [the risk stack](#the-risk-stack)). The address
itself never appears in a response body or public HTML.

The same routes also serve `mood`'s comments, chosen with the `surface`
parameter (see [Mood surface (the Telegram bridge)](#mood-surface-the-telegram-bridge)).
They don't serve `mood`'s read-only per-post comment count (see
[Mood API](/docs/api/mood#comments)). That count is still the plain Telegram
scrape this route bridges into.

## Endpoints

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v2/comments` | [List comments](#list-comments) | None |
| `POST` | `/api/v2/comments` | [Post a comment](#post-a-comment) | Turnstile and a dwell token |
| `GET` | `/api/v2/comments/dwell-token` | [Get a dwell-time token](#get-a-dwell-time-token) | None |
| `PATCH`, `DELETE` | `/api/v2/comments/:id` | [Edit or delete a comment](#edit-or-delete-a-comment) | Reader session that owns the row |
| `GET` | `/api/v2/reactions` | [Read reactions](#read-reactions) | None |
| `POST` | `/api/v2/reactions/toggle` | [Toggle a reaction](#toggle-a-reaction) | Turnstile or a reader pass |
| `GET`, `DELETE` | `/api/v2/reader/me` | [Reader session](#reader-session) | Reader session, optional |
| `POST` | `/api/v2/reader/verify` | [Confirm an email](#lazy-email-verification) | Emailed token |
| `POST` | `/api/v2/reader/resend` | [Resend the link](#resend-the-verification-link) | None |
| `POST` | `/api/v2/reader/preferences` | [Reader preferences](#reader-preferences) | Reader session |
| `POST` | `/api/v2/reader/mute` | [Mute a conversation](#mute-a-conversation) | Token from the reply mail |
| `GET` | `/api/v2/reader/avatar/:key` | [Reader avatar](#reader-avatar) | None |
| `POST` | `/api/v2/reader/avatar-seed` | [Drawn avatars](#drawn-avatars) | None |
| `GET`, `POST` | `/api/v2/reader/claims` | [Claim earlier comments](#review-and-claim-earlier-comments) | Reader session |
| `POST` | `/api/v2/reader/owner-sign-in` | [Owner sign-in](#the-owner) | One-time owner code |
| `GET` | `/api/oauth/reader/:provider` and `/api/oauth/reader/:provider/callback` | [Reader OAuth](#reader-oauth-github-google) | None |
| `POST` | `/api/v2/comments/telemetry` | [Client telemetry](#client-telemetry) | None |

## Reader identity

Every browser has one of three identity grades. The grade decides what it can
do with its own comments.

| Grade | How a reader gets it | What it unlocks |
| --- | --- | --- |
| L0 | Nothing. A `reader_anon` cookie is set automatically on the first comment or reaction. | Post and react. Your own rows show as `mine` by cookie match, but you can't edit or delete them. |
| L1 | Click the link in the lazy-verification email | The comment's `reader_id` attaches. Past comments that match both the verified address and this browser session are claimed. A persistent avatar and display name. Edit and delete on rows the `reader_id` owns. |
| L2 | Sign in with GitHub or Google (`/oauth/reader/...`) | Same as L1, but `provider` is the OAuth provider instead of `email`. |

**L2 isn't reachable today.** The routes are built and work, but nothing on
the site links to them: the comment box has no sign-in button, and no client
calls the route. The provider credentials aren't configured either, so
`/oauth/reader/:provider` answers `404`. Every reader who verifies today is
L1. The data model supports L2, but no reader reaches it yet.

`GET /api/v2/reader/me` returns the calling browser's current grade (`null`
at L0). L0 has no sign-in call. The first `POST /api/v2/comments` or
`POST /api/v2/reactions/toggle` sets the cookie; a bare `GET` never does.

Each comment also records how its writer was authenticated when they wrote
it, separately from who owns it now:

- `auth_at_write` is `verified`, `anonymous`, or `unknown` (for records
  without historical evidence). It never changes, even after a claim.
- A later claim sets `claimed_at` and `claim_method` (`session` or
  `confirmed`) instead.

The author badge needs verified-at-write evidence. An old or claimed row is
never upgraded to count as authenticated.

### Cookies

Both cookies are `__Host-` prefixed, `Secure`, `HttpOnly`, and
`SameSite=Lax`, with path `/`.

| Cookie | Lifetime | Contents |
| --- | --- | --- |
| `__Host-reader_session` | 180 days | The signed L1/L2 session: `reader_id`, provider, and the reader row's creation stamp, which acts as a generation counter |
| `__Host-reader_anon` | 365 days | An opaque keyed session id, set on the first write. Marks rows as `mine`; never grants mutation |

A browser that still sends the old unprefixed `reader_session` cookie gets it
cleared. A session whose reader row is missing, banned, or has lost its
`reader_id` is refused on sight, so a ban takes effect on the next request
instead of at the next expiry.

### The owner

The blog owner is an L1 reader whose address matches the configured owner
hash. Rows they write carry `author.byAuthor: true` and the owner badge. The
comment box has no admin login. Instead, the admin portal gives the owner's
own browser a reader session in two steps:

```
POST /api/admin/comments/owner-code      → { "code", "expiresAt" }   (admin session)
POST /api/v2/reader/owner-sign-in { code } → { "reader" } + Set-Cookie   (public)
```

The code is single-use, expires in ten minutes, and is stored only as a
digest. Redeeming it is atomic, so each handoff produces exactly one session.
The owner's first sign-in ever supplies their address so a reader row can be
created. The address is checked against the hash, and a different address is
refused. Every later sign-in reads the address from that row. *Write as the
owner*, in the ⋯ menu of the portal's Comments screen or in ⌘K, runs both
steps. To sign out,
use the ordinary `DELETE /api/v2/reader/me`.

## Rate limits

The comment routes are the only rate-limited route family on this site that
runs in durable mode instead of observability mode.

| Route | Limit | Counted per |
| --- | --- | --- |
| `POST /api/v2/comments` | Anonymous: 5/minute and 20/hour. Verified: 10/minute and 60/hour | Anonymous session, IP, and server-derived fingerprint; verified readers also per `reader_id` |
| `PATCH /api/v2/comments/:id` | 10/minute | Reader or session |
| `GET /api/v2/reactions` | 120/minute | Reader, or hashed IP without a session |
| `POST /api/v2/reactions/toggle` | 30/minute, plus 30/minute and 120/hour per IP | Identity (reader or anonymous session), then hashed IP |
| `POST /api/v2/reader/verify` | 10/minute | Email hash |
| `POST /api/v2/reader/resend` | 5/minute, plus a silent per-address send limit | IP, then address |
| `POST /api/v2/reader/preferences` | 20/minute | Reader |
| `POST /api/v2/reader/mute` | 20/minute | Reader |
| `GET`/`POST /api/v2/reader/claims` | 20/minute | Reader |
| `POST /api/v2/reader/avatar-seed` | 30/minute | IP |
| `POST /api/v2/comments/telemetry` | 60/minute | Hashed IP |

These routes aren't rate-limited: `GET /api/v2/comments/dwell-token`,
`GET`/`DELETE /api/v2/reader/me`, `GET /api/v2/reader/avatar/:key`, and the
reader OAuth routes.

## Per-post policy

Every write route checks the post's comment policy. On
`POST /api/v2/comments`, a closed thread is refused before Turnstile, and the
verified-only rule is the email step-up (see [the risk stack](#the-risk-stack)).
The policy comes from the post's internal tags in Ghost (`#comments-off`, `#comments-readonly`
or the older `#no-comments`, `#reactions-off`, and `#comments-verified`),
applied on top of a site-wide default. The full table is in
[Internal tags](/docs/writing/tags#comment-policy). The owner can also
override one post's mode from the portal, and two site-wide switches sit above
both (see [The portal override](#the-portal-override) and
[Site-wide switches](#site-wide-switches)).

Both halves of the system derive the policy with one function,
`commentPolicyFromTags` in `@bunizao/contracts/comments`:

- `/blog/[slug]` runs it at build time, with tags from the Admin API.
- site-api runs it per request, with tags from the Content API. The Content
  API returns internal tags for `include=tags`, and site-api caches them with
  the post.

The page and the API can't disagree about the tags, so a closed thread is
closed to `curl` too.

site-api's cached registry is fresh for 60 seconds. After that it still
answers at once while a background fetch replaces it. A tag change is
therefore enforced from the first request after those 60 seconds plus the
refresh. A post missing from a stale copy waits for the refresh instead of
being refused.

The policy refuses a write in two ways, both `403`:

| Slug | Cause |
| --- | --- |
| `comments_closed` | The post takes no new comments (`readonly` or `off`). Applies to create and edit. Delete is always allowed, since removing your own words adds nothing to a thread. |
| `reactions_disabled` | Hearts are off for the post, both on the post and on its comments. |

`#comments-verified` refuses nothing by itself. It is the site-wide
[email switch](#site-wide-switches) for one post: an anonymous comment with
no `email` gets `403 email_required` and nothing is stored, and one with an
address is stored `held` and publishes once the address is confirmed.
Signed-in readers post as usual, and edits are unaffected.

Reads are never gated, because a read-only thread has to stay readable. An
`off` post draws its section hidden, and nothing links to its thread. Only the
page tells `off` and `readonly` apart; to a write, both mean no.

### The portal override

The owner can set one post's mode from the admin portal without touching its
tags. The override replaces the tag-derived `mode` in both directions: it can
close an open post, or reopen one tagged `#comments-off`. `reactions` and
`requireVerifiedEmail` still come from the tags. Clearing the override hands
the post back to its tags. Every write route reads the override beside the tags
(one primary-key read), so the refusals above follow it at once.

The page is built from the tags alone, so it can draw the wrong mode until the
thread loads. The first page of [List comments](#list-comments) carries
`policy` whenever an override exists, and the client redraws from its `mode`:
it opens or closes the compose box, and shows or hides the whole section. A
post with no override gets no `policy` field while no
[site-wide switch](#site-wide-switches) is on, and the page's own drawing
stands.

| Mode | When the client applies it |
| --- | --- |
| `off` | The moment the first page arrives, before any comment is drawn, so neither the rows nor their hearts are read |
| `readonly` | Together with the rows |

A section already on screen still disappears one round trip after first paint,
because the HTML is cached and never reads the override. So a post meant to
stay closed should carry the tag as well.

A mood post takes the same `policy` from the first `mood` page of this route,
which its thread reads beside the Telegram scrape (see
[Mood surface (the Telegram bridge)](#mood-surface-the-telegram-bridge)).

### Site-wide switches

The owner has two more switches in the admin portal. Each one covers every
post, blog and mood alike.

**Comments everywhere: read-only or off.** Every post takes whichever is
stricter, this mode or its own (tags, then any override), so a post that is
already off stays off. From the moment the switch is set, a write is refused
with `403 comments_closed`, the same as on a closed post. When the switch goes
back to open, every post follows its own mode again.

**Require a confirmed email.** Anonymous comments and replies wait until the
writer confirms an address. This is the same email step-up the automatic
flood protection uses, with no end:

- A write with no `email` gets `403 email_required`, and nothing is stored.
  The page keeps the draft and asks for an address.
- A write that includes an email is stored `held`, and it publishes once the
  address is confirmed.
- Signed-in readers post as usual.

The `#comments-verified` tag applies the same rule to a single post.

While either switch is on, the first page of [List comments](#list-comments)
carries `policy` with the switches folded in, and the page draws from both
fields:

| Field | Value | What the page does |
| --- | --- | --- |
| `mode` | The stricter of the two modes | The same as for an override |
| `requireVerifiedEmail` | True while the email switch is on, or on a `#comments-verified` post | Marks the address field required and says so in its placeholder. The compose box then asks for an address before it sends |

Under the email switch, the field only tells the page what to draw. What
happens to a write is the hold described above. Cookie-less reads of that first
page come from the edge cache, so a page follows a switch within about 90
seconds. Writes follow it at once.

## List comments

```
GET /api/v2/comments?post=<postId>&before=<cursor>&limit=20
```

| Parameter | Required | Description |
| --- | --- | --- |
| `post` | Yes | Ghost's `post.id`, which is stable across slug renames |
| `before` | No | A root comment id cursor. Omit it for the first page. |
| `limit` | No | Defaults to 20. The server caps it at 50. |

```json
{
  "comments": [
    {
      "id": "01H...",
      "postId": "...",
      "parentId": null,
      "author": { "name": "A Reader", "avatarUrl": "/api/v2/reader/avatar/<hash>", "avatarSeed": 1234567, "byAuthor": false },
      "body": "Nice post.",
      "status": "published",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "editedAt": null,
      "mine": false,
      "editableUntil": null,
      "deletable": false,
      "tombstone": false
    }
  ],
  "hasMore": false,
  "nextBefore": null,
  "total": 1
}
```

Pages are counted by root comment. Every visible reply under a returned root
comes back with it, unpaginated. Threads are one level deep, so a root's reply
count stays bounded. `total` counts published comments only.

### Owner marks

Three owner-set fields are optional on the wire. A client treats each one as
absent when it is missing.

| Field | On | Meaning |
| --- | --- | --- |
| `pinned: true` | The pinned root only | The owner pinned it. The first page lists it ahead of every other root, with its replies, whatever its date. |
| `locked: true` | A locked root only, never its replies | The owner closed replies under this thread. It stays readable and likable. |
| `policy` | The first page only, when the portal overrides the post's mode or a [site-wide switch](#site-wide-switches) is on | The effective [per-post policy](#per-post-policy) with the site-wide switches folded in. The client acts on `policy.mode` and `policy.requireVerifiedEmail`. |

A post has at most one pin. The pin is never one of the date-ordered roots, so
the first page can carry `limit + 1` roots, and `nextBefore` and the later
pages don't change. A pinned row that is hidden or deleted drops back to its
place in date order, and returns to the top if it is published again.

### Ownership and visibility

`mine` is computed against the calling browser's session cookie or
`reader_id`. A plain `GET` never mints a `reader_anon` cookie, so a
first-time visitor with no cookie yet owns nothing.

`editableUntil` and `deletable` are stricter than `mine`: both require a
verified `reader_id` match. An anonymous writer sees their row flagged `mine`
with no rights to change it. Clients must decide whether to show edit and
delete controls from these two fields, never from `mine`.

Some rows are hidden or blanked:

- `held`/`rejected` rows are visible only to their own writer. A row that
  belongs to a reader account needs that account's session; the anonymous
  cookie it was written under does not reveal it, so a shared browser cannot
  read a signed-in reader's private comments. The cookie matches only rows
  that never had an account.
- A `deleted` row with a published reply under it still appears as a
  tombstone, with `body`/`author` blanked. Without such a reply, it's gone
  from the page entirely.

### Caching

What a reader sees depends on who's asking, but only through the reader
session and `reader_anon` cookies.

| Request | Cache headers |
| --- | --- |
| Carries either cookie | `private, no-store` |
| Carries neither cookie | `Cache-Control: public, max-age=0`, `Cloudflare-CDN-Cache-Control: max-age=30, stale-while-revalidate=60`, and `Vary: Cookie` |
| Any error | `private, no-store` |

Every request with neither cookie gets the same page, so the edge shares it.
A new comment, a moderation decision, a pin, a lock, or a mode override can
take up to about 90s to reach cookie-less readers. Nothing purges the cache.
The writer never waits for this, because every write sets `reader_anon`.

## Pinned and locked threads

The owner sets both from the admin portal, and both apply to a root. A lock
set on a reply lands on its root.

A lock refuses a new reply under the thread with `403 thread_locked`. The rest
of the post stays open, and edits, deletes and likes under the thread still
work. The owner's own reply from the portal is not refused. Replies written in
a mood post's Telegram discussion group arrive through the bridge, so the lock
doesn't reach them.

## Post a comment

```
POST /api/v2/comments
```

```json
{
  "surface": "blog",
  "postId": "...",
  "body": "...",
  "parentId": null,
  "displayName": "A Reader",
  "email": "reader@example.com",
  "turnstileToken": "...",
  "dwellToken": "...",
  "website": "",
  "notifyReplies": false,
  "avatarSeed": 1234567,
  "locale": "zh",
  "clientFp": { "navigator": {}, "screen": {}, "canvas": "..." },
  "interaction": { "composeMs": 42000, "keyEvents": 180, "keyIntervalCv": 220 },
  "storageId": "0123456789abcdef0123456789abcdef"
}
```

### Request fields

| Field | Required | Description |
| --- | --- | --- |
| `surface` | No | `"blog"` (default) or `"mood"`. See [Mood surface (the Telegram bridge)](#mood-surface-the-telegram-bridge). |
| `postId` | Yes | The post to comment on |
| `body` | Yes | 1-2000 characters |
| `parentId` | No | The root comment this replies to, or `null` for a root comment |
| `displayName` | Yes | 1-32 characters. See [Display names](#display-names). |
| `email` | No | Omitted or empty means an anonymous comment. See [Email and identity](#email-and-identity). |
| `turnstileToken` | Yes | Uses `expectedAction: 'blog_comment_create'` |
| `dwellToken` | Yes | Minted by `GET /api/v2/comments/dwell-token` (see [Get a dwell-time token](#get-a-dwell-time-token)) |
| `website` | No | A visually-hidden honeypot field. A human never fills it in. |
| `notifyReplies` | No | The newsletter opt-in, despite its name (see below) |
| `avatarSeed` | No | The drawn face the writer picked. See [Email and identity](#email-and-identity). |
| `locale` | No | The post page language (`zh` or `en`). Keeps the verification mail in the language of the page where the comment was written. |
| `clientFp`, `interaction`, `storageId` | No | Optional client evidence. See [Client evidence](#client-evidence). |

`notifyReplies` on this input is the **newsletter** opt-in, despite its name.
site-api carries it into the verification link, and confirming the address
activates a newsletter subscription. Both clients send `false`. The reply-mail
preference is the reader's own `notifyReplies` switch
(`/api/v2/reader/preferences`); see
[Reply notifications](#reply-notifications).

### Display names

`displayName` is 1-32 characters, with no control characters. It can't
collide with a small reserved list (the blog owner's own names), and it can't
contain a blocked term: profanity, or the role names an impersonator reaches
for. Both checks fold lookalike letters from other alphabets, so a term
spelled in a second script is refused too. The term list itself isn't
published.

A name already stored on a signed-in reader is checked for shape only, so a
later edit to the term list never locks an existing account out. The owner
renames those from the moderation queue.

### Email and identity

`email` is optional. Omitted or empty means an anonymous comment: owned by the
session, with a drawn avatar, and never claimable. A non-empty value must be a
valid address (`400` otherwise).

A comment written without an email serializes with `avatarUrl: ""`, and the
client draws a face for it instead (see [Drawn avatars](#drawn-avatars)).
`avatarSeed` is the face the writer picked, a uint32 from
`/api/v2/reader/avatar-seed`. Any other value is dropped; the request isn't
refused. A verified reader's stored seed wins over the one sent. A reader with
no stored seed yet adopts the one sent, so a face picked before signing in is
the one kept.

An `email` that belongs to a verified reader does **not** by itself attach
that reader's `reader_id` to the row. The identity comes from the session
cookie, and the address only has to agree with it. Typing somebody else's
verified address writes an ordinary unbound comment, like any other address.
The avatar, the author badge, and the ability to edit all follow the session,
never the typed field.

### Client evidence

`clientFp`, `interaction` and `storageId` are optional client evidence. A
module collects them, and the page loads that module on the first focus inside
the compose box, never on a page view.

| Field | What it holds |
| --- | --- |
| `clientFp` | What the browser says about itself: platform, screen, time zone, a canvas and audio hash, the font families a width probe found, and media queries |
| `interaction` | How the form was filled, as aggregates only: counts, one spread figure for the gaps between keystrokes (per mille), and a few timings. Never the key sequence, the intervals themselves, or what was typed. |
| `storageId` | A random 32-hex value the module keeps in IndexedDB. The server stores only its HMAC and never uses it to set, restore, or extend a cookie. |

**Leaving them out is never a gate.** A body that omits them, sends the wrong
type, or sends an object over the bounds below is still written. The server
stores what survives its bounds and NULL for the rest. The whole request body
is capped at 16 KiB, so a larger one gets `400` before any of this runs.

`interaction` never counts against a comment. Dictation, input methods and
assistive technology all put text in the box without key presses, so the
server records how the words got there and never judges it.

Before storing, the server enforces these bounds:

- Strings: at most 128 characters.
- `fonts`: at most 32 entries.
- Numbers: bounded integers.
- The whole object: under 4 KiB.

The client never sends a hash of its own fingerprint. The server hashes the
canonical component JSON itself, so a browser can't claim to be a different
device.

### The risk stack

Every submission runs a fixed series of anti-abuse checks before anything is
stored. What a client can observe is small on purpose:

| Answer | When | Stored? |
| --- | --- | --- |
| `400` / `503` | Turnstile failed or could not be verified | No |
| `429` | A [rate limit](#rate-limits) is spent | No |
| `403 email_required` | The email step-up asked an anonymous writer for an address and none was sent | No |
| `201` | Everything else: the comment is `published` or `held` | Usually |

A `held` answer never says which check caused it. The one exception is the
email step-up: when the writer did send an address, the comment waits for that
address to be confirmed, and the response sets `awaitingEmail` (see
[Response](#response)). Confirming publishes it unless moderation still holds
it. Some refusals also answer with an ordinary `held` envelope and store
nothing, so a `201` is not a promise that the row exists.

An anonymous writer meets the email step-up on a `#comments-verified` post,
while the owner's [site-wide email switch](#site-wide-switches) is on, during
the automatic flood protection, and when a submission looks automated.
Verified readers never meet it.

Akismet judges every submission, and a model behind the owner's AI gateway
reads anonymous ones as well. The create request waits up to 8000ms for both.
A check that runs longer finishes in the background, so a `held` answer can
turn into `published` a moment later.

The signals, weights and thresholds behind these checks are not published.

### Response

```json
{ "outcome": "held", "comment": { "...": "..." }, "unverifiedEmail": true, "awaitingEmail": true }
```

| Field | Meaning |
| --- | --- |
| `outcome` | `"published"` or `"held"` |
| `unverifiedEmail` | True when a supplied `email` doesn't already belong to a verified reader, so the client shows the verification nudge. Always false when no email was sent. |
| `awaitingEmail` | True when the comment is held until that address is confirmed (the email step-up). The client then says that confirming publishes it, instead of showing an ordinary hold. |

`awaitingEmail` is known only for a verdict that landed inside the 8000ms
window. A later step-up reads as an ordinary `held`, and the verification mail
still says the right thing. Clients treat an absent field as false.

On the true first comment from an unverified address, a lazy-verification
email goes out automatically (see
[Lazy email verification](#lazy-email-verification)). This call never waits
on that send. A create without an email never sends mail at all.

### Errors

| Error | When |
| --- | --- |
| `400` | Malformed body (see the field list above for exact messages) |
| `400 invalid_parent` | `parentId` doesn't exist, isn't a root comment, or belongs to a different post |
| `403 thread_locked` | `parentId` is a thread the owner [locked](#pinned-and-locked-threads) |
| `404 not_found` | Unknown `postId` |
| `503 comment_target_unavailable` | The Ghost registry can't be reached |
| `403 comments_closed` | From the [per-post policy](#per-post-policy) |
| `400 turnstile_failed`, `503 turnstile_unavailable` | Turnstile failed or is unavailable. Both carry a `code` extra. |
| `403 email_required` | The email step-up asks an anonymous writer for an address, including on a `#comments-verified` post |
| `429 Too Many Requests` | A rate limit |

The route is same-origin only and sends no CORS header.

## Mood surface (the Telegram bridge)

Mood posts use the same comment table and the same route as the blog. Send
`surface: "mood"` to `POST /api/v2/comments`, and once the comment is
published, site-api also posts it into the post's Telegram discussion group.

### Post to a mood post

A `mood` write needs a post that:

- exists in the mood archive,
- isn't soft-deleted, and
- has a linked Telegram discussion thread (`discussion_message_id` set, which
  readers see as `MoodContentDocument.discussionLinked`; see
  [Mood API](/docs/api/mood#detail)).

Anything else gets the same `404 not_found` / `503 comment_target_unavailable`
a bad blog `postId` gets.

A few fields behave differently on `mood`:

| Field | On `mood` |
| --- | --- |
| `parentId` | Either another `mood` comment's own row id, or, once [`discussionRepliesEnabled`](/docs/api/mood#detail) is on, the Telegram message id of a `telegram`-origin comment |
| `turnstileToken` | Each surface has its own `expectedAction` (`blog_comment_create` / `mood_comment_create`) |
| `locale` | The language the page negotiated for the reader (`?lang`, then the `blog_lang` cookie, then `Accept-Language`), the same as on `blog` |

Everything after Turnstile in the risk stack runs unchanged and shares its
counters across both surfaces, so one person has one budget.

### Bridge to Telegram

A `mood` write runs the full risk stack above unchanged. Then, as a side
effect that never blocks the response, site-api bridges it into the post's
Telegram discussion group:

- **`published`** sends an HTML message into the group, replying to the
  post's own copy there (or to the parent comment's Telegram message when
  `parentId` names a `telegram`-origin comment):

  ```
  <b>{displayName}</b> · <a href="{commentUrl}">buxx.me</a>

  {body, rendered as bold, italic, code, links and `>` quotes}
  ```

  `commentUrl` is `https://buxx.me/mood/<postId>#c-<token>`, where `token`
  is `commentAnchorToken(commentId)`: the first 12 hex characters of
  `sha256(commentId)` (`@bunizao/contracts/comments`). In Telegram the URL
  sits behind the link instead of showing as text. It is also the read path's
  match key (below), so neither side depends on Telegram's own message ids
  agreeing with anything the site chose.

  On success, the row stores the group's `message_id`. On failure, the send
  is retried hourly for the next 24h. A failed bridge send never fails the
  create: the comment is already published on the site, and `outcome` in the
  response is the same either way.
- **`held`** and **`rejected`** never reach Telegram. Approving either (card
  or portal) runs the same bridge step at that point, not before.
- **Edit** (the same 15-minute, verified-reader-only window as the blog)
  edits the bridged message in place, and Telegram shows "edited". **Delete**,
  by the reader or by the owner, deletes the bridged message. Both are logged
  and retried on failure instead of blocking. Whether a row is gone is decided
  by the site, not the group.

### Read a mood thread

Reading a `mood` thread (`GET /api/comments?postId=` /
`GET /api/v2/mood/{id}/comments`, see [Mood API](/docs/api/mood#comments) and
[`/api/comments`](/docs/api/content#comments-by-post-id)) still scrapes the
group's public embed. The bridge changes only what a web reader can add to
mood comments, not how they're read.

Before the scrape reaches a client, the site's own `mood`-surface rows are
laid over it:

- A scraped message whose text carries a `#c-<token>` link matching a
  published row is replaced with that row's author, avatar, and body. It is
  marked `origin: "web"` with `commentId` set, so the writer's own browser
  can mark it `mine` and offer edit and delete.
- A `mood` row not yet visible in the scrape (bridge pending, or Telegram's
  embed hasn't caught up) is appended.
- A row whose bridged message was removed directly in Telegram is treated as
  deleted and never resurrected.

The assembled thread is shared across readers for about 15s (up to ~45s with
revalidation, see [`/api/comments`](/docs/api/content#comments-by-post-id)).
The writer's own browser shows their comment straight away, from the write
response and the `no-store` `/api/v2/comments` verdict poll.

The scrape carries none of the owner's marks. So a mood page linked to the
group also prefetches `GET /api/v2/comments?surface=mood&post=<id>&limit=20`
while it parses, and takes the pin, the locks and `policy` from that first
page:

- The pinned web comment leads the thread. It is drawn from that page when the
  scrape's first page doesn't hold it.
- A locked root says it is closed to replies.
- `policy.mode` hides the section or closes the compose box.

The thread draws once both reads land. Messages written in the group have no
site row, so they are never pinned or locked, and a lock or a `readonly` post
doesn't reach replies written there. A locked root beyond that first page is
not marked, but the server's `thread_locked` refusal still covers it.

### Kill switch

`MOOD_COMMENTS_ENABLED` (site-api, default off) disables the whole feature.
While it's off, `surface: "mood"` on this route answers exactly like an
unlinked post (`discussion_message_id` unset). `resolveCommentablePost` finds
nothing to write into, and no bridge call (send, edit, delete, sweep) reaches
Telegram. The kill switch and the setup it gates are in the owner-only
[comments operations](/dev/docs/comments-operations#mood-surface) reference.

## Get a dwell-time token

```
GET /api/v2/comments/dwell-token
```

```json
{ "token": "..." }
```

Returns the risk stack's dwell-time stamp: a signed timestamp. The client
fetches it when the page loads and holds it until submit.

`POST /api/v2/comments` answers a missing `dwellToken` with `400`, and one
whose signature does not verify with `400 invalid_dwell_token`. A signed
token minted too close to the submit is dropped silently, with the ordinary
`held` envelope. The client never mints a token at submit for that reason.

The stamp also carries a 24-hour expiry. Every focus in a compose box
re-mints a token older than 20 hours, so a tab left open overnight still
posts. A tab that outlives the expiry without a new focus is not lost: the
server stores its comment for review instead of dropping it.

The route isn't rate-limited. It signs nothing but the current time, so a call
costs nothing worth gating, and `POST /api/v2/comments`'s own limits apply
however many tokens get minted.

## Edit or delete a comment

```
PATCH  /api/v2/comments/:id
DELETE /api/v2/comments/:id
```

Both require **verified ownership**: the calling browser's `reader_id` must
match the row's writer. The `reader_anon` session cookie never grants
mutation. It is a bearer key that a shared or public machine hands to its next
user, so it shows rows as `mine` but never makes them editable or deletable.

An anonymous row written *with* an email becomes mutable once that address
verifies, because claiming attaches the `reader_id`. A row posted with no
email is never claimable, so it stays frozen as written. Deletion requests for
it go to the site owner.

### Edit

`PATCH` body:

```json
{ "body": "..." }
```

You can edit within **15 minutes** of `createdAt`, including the exact
boundary. An edit re-runs moderation against the new body (with the same
post-title/excerpt context) and sets the row's `editedAt`, so the client
should show an "edited" marker. Response: `{ "comment": { "...": "..." } }`.

`PATCH` is rate-limited at 10/minute per reader/session, durably enforced.

### Delete

`DELETE` has no time window. It's always a soft delete:

```json
{ "ok": true, "tombstone": true }
```

`tombstone: true` means a published reply hangs under the row. The row then
stays as a placeholder that keeps the thread's shape (`body`/`author` blanked
at read time) instead of disappearing.

### Errors

| Error | Method | When |
| --- | --- | --- |
| `404 not_found` | Both | The comment is missing, or already deleted |
| `403 not_owner` | Both | The caller doesn't own the row |
| `409 edit_window_closed` | `PATCH` | The 15-minute edit window has passed |
| `403 comments_closed` | `PATCH` | The post has stopped taking comments |
| `400` | `PATCH` | Malformed body |

## Reactions

Reactions are hearts on a post or a comment. Anyone can read them and anyone
can react.

### Read reactions

```
GET /api/v2/reactions?targets=post:<id>,comment:<id>,...
```

`targets` is a comma-separated list of `type:id` pairs, up to 50.

Counts are anonymous; faces need an identity. Anyone can see every reaction
in the count, but only a reaction with an identity behind it shows up in
`reactors`. That means:

- a verified reader, or
- an anonymous reaction from a browser that has published a comment. It uses
  the name, avatar and `avatarSeed` of that browser's most recent published
  comment, so a like and a comment from the same person show the same face.

A browser that has only ever liked stays out of `reactors`, and a held or
deleted comment never lends its name.

```json
{
  "reactions": {
    "post:abc123": [
      { "emoji": "❤️", "count": 3, "reacted": true, "reactors": [{ "name": "A Reader", "avatarUrl": null, "avatarSeed": 1234567 }] }
    ]
  }
}
```

`reactors` is capped at 12 names per emoji; the `count` is the true total. A
banned reader is filtered out of both: their name leaves the list and their
heart leaves the count.

`reacted` is specific to the calling browser. A request with a reader session
or `reader_anon` cookie is therefore `private, no-store`, because a shared
cache entry would show one reader's filled heart to another. A request with
neither has `reacted: false` everywhere, so it gets the same short edge policy
as the comment list (`public, max-age=0`, CDN
`max-age=30, stale-while-revalidate=60`, `Vary: Cookie`).

Every request that reaches the Worker is rate-limited at 120/minute per
reader, or per hashed IP when there is no session:

- An anonymous request (no reader session) is checked against the per-colo
  Workers Rate Limiting binding `REACTIONS_READ_LIMITER` when it is
  configured, and against the durable limiter otherwise.
- A signed-in reader's read always uses the durable limiter, for an exact
  count against the same D1 budget Mood shares.

### Toggle a reaction

```
POST /api/v2/reactions/toggle
```

```json
{ "targetType": "post", "targetId": "abc123", "emoji": "❤️", "reacted": true, "turnstileToken": "...", "clientFp": {}, "interaction": {}, "storageId": "..." }
```

No sign-in is needed: anyone can react, with no prompt and no extra round
trip.

| Field | Description |
| --- | --- |
| `targetType`, `targetId` | What to react to. `targetType: 'comment'` targets a published comment row directly. A held, rejected or deleted comment answers `404 not_found`, the same as an unknown id. `targetType: 'post'` is validated against the same Ghost post registry `POST /api/v2/comments` uses. |
| `emoji` | Defaults to the one reaction shipped at launch (❤️) if omitted |
| `reacted` | The desired final state. Repeating the same request is safe (idempotent). |
| `turnstileToken` | Uses `expectedAction: 'blog_reaction'`. May be empty while the browser holds a reader pass (below). |
| `clientFp`, `interaction`, `storageId` | Optional [client evidence](#client-evidence), as on comment create |

The Turnstile token is expected to solve invisibly (managed/widget mode), so
in practice it never costs the reader anything extra.

```json
{ "reaction": { "emoji": "❤️", "count": 4, "reacted": true, "reactors": [] }, "passUntil": 1789120800000 }
```

**A banned source's heart.** A reaction from a source on the ban list gets
this same envelope, with the `reacted` state it asked for and a `count` that
didn't move. No row is written and no reader pass is issued. There is no error
and no hint, since a ban that announced itself could be tested around.

**Reader pass.** An accepted reaction also sets an HttpOnly
`__Host-reader_pass` cookie, signed against the `reader_anon` session and good
for one hour (renewed on every accepted reaction). While a browser holds one,
`turnstileToken` may be the empty string: the route verifies the pass locally
instead of calling Turnstile. A reader who likes several comments then solves
once instead of once per heart. Before the pass, a run of solves from one IP
made Cloudflare escalate to an interactive challenge.

`passUntil` (epoch ms) tells the client when to start minting tokens again. A
`400 turnstile_failed` on a pass-backed request means the pass is gone. The
pass grants nothing the token didn't: the identity and IP budgets below still
apply.

**Rate limits.**

| Budget | Limit |
| --- | --- |
| Per identity (the reader, or a keyed hash of the anonymous session) | 30/minute, durably enforced |
| Per hashed IP, to stop anonymous cookie churn | 30/minute and 120/hour |

A verified reader's identity can't churn, so they're exempt from the
per-minute IP cap. They're bound only by their own identity budget and the
hourly network ceiling.

**Errors**

| Error | When |
| --- | --- |
| `400` | Malformed body |
| `400 turnstile_failed`, `503 turnstile_unavailable` | Turnstile failed or is unavailable |
| `404 not_found` | Unknown target, or a comment that isn't published |
| `503 reaction_target_unavailable` | The Ghost post registry can't be reached |
| `403 reactions_disabled` | The post's hearts are off |

## Reader session

```
GET    /api/v2/reader/me
DELETE /api/v2/reader/me
```

`GET` always answers `200`. A signed-out reader is a normal state:

```json
{ "reader": null }
```

When the reader is signed in:

```json
{
  "reader": {
    "readerId": "...",
    "grade": "l1",
    "provider": "email",
    "displayName": "A Reader",
    "avatarUrl": "/api/v2/reader/avatar/<email_hash>",
    "avatarSeed": 1234567,
    "notifyReplies": false,
    "subscribed": false
  }
}
```

The response never includes the email or its hash. `subscribed` is true only
for an active subscription that includes the `blog` channel, so a mood-only
subscriber reads `false`.

`DELETE` signs out: it clears the session cookie and returns `204`. It's
idempotent, so calling it with no session set still succeeds, and the client
never needs to check sign-in state first.

Neither method is rate-limited. The cookies behind the session are described
in [Cookies](#cookies).

## Lazy email verification

After a reader's first comment from an unverified address, site-api mails them
a confirmation link. Confirming makes them an L1 reader.

```
POST /api/v2/reader/verify
```

```json
{ "token": "...", "subscribe": false }
```

This is the `POST` behind the confirm button. The reader gets there from the
link mailed after a first unverified comment, or from a resent link (see
[Resend the verification link](#resend-the-verification-link)).

The link opens `/reader/confirm`, a small SSR page in the public `site`
Worker. This API has no `GET` for it, and only the button's `POST` ever
consumes the token, so a mail client's link-prefetch `GET` can never burn it.
The page submits the `POST` on load instead of waiting for a press. A browser
runs the page's script and a mail scanner doesn't, so a prefetch still can't
burn the token and a real reader never has to click twice. The button stays in
the served HTML as the no-JS path.

```json
{ "outcome": "confirmed", "reader": { "...": "..." } }
```

`outcome` is one of `confirmed`, `already_confirmed`, or `invalid`. A
malformed token and an expired token both currently report `invalid`. The
contract also defines an `expired` outcome, but nothing produces it yet.

On `confirmed`, the same request also:

- binds every past anonymous comment from the same browser that matches the
  verified email hash to the new `reader_id`;
- turns reply notifications on, because the mail that carried the link
  promises them. A first confirmation is the only place they're switched on
  without asking; to change them later, see
  [Reader preferences](#reader-preferences);
- activates the newsletter subscription when the token itself was minted with
  a subscribe intent, without a second confirmation round trip.

The request body's own `subscribe` field isn't honoured on its own. It would
let whoever holds a token add that address to the newsletter, which the
address's owner never asked for.

Rate-limited at 10/minute per email hash, durably enforced.

**The session is minted once.** Only a `confirmed` outcome sets the reader
cookie. Replaying the same token afterwards answers `already_confirmed` and
signs in nobody. Consumption and subscription intent are applied atomically,
and a replay changes neither preferences nor the timestamp used by a newer
link.

So a link that is forwarded, quoted in a reply, or sitting in a mailbox
somebody else can read is not a way into the account. It signs in only the
first device that redeems it. A device left out gets a fresh link instead of a
second use of the old one. The token still expires 24 hours after it is
minted.

### Resend the verification link

```
POST /api/v2/reader/resend
```

```json
{ "email": "reader@example.com", "notifyReplies": false, "locale": "zh" }
```

```json
{ "ok": true }
```

`notifyReplies` here is the same newsletter opt-in as on comment create,
recovered from the stale link. It isn't the reply-mail switch.

Mail goes out only to an address with comment history or an existing verified
reader identity. This also lets a verified reader sign in after changing their
email address.

The route always answers with the same shape and status. That holds whether
or not mail went out, and whether or not the per-address send limit below is
currently suppressing the address. The route can never be used to probe which
addresses have commented.

Two independent rate limits apply, both durably enforced:

| Limit | Value | Surfaced to the caller |
| --- | --- | --- |
| Per-IP route limit | 5/minute | Yes, as `429`. It carries no address information, so it's safe to surface. |
| Per-address send suppression | 1 mail per 10 minutes, 5 per day, 8 per 30 days | No. Enforced silently inside the send path, never surfaced as a `429` here. |

The monthly unconfirmed-address limit doesn't apply to a verified reader; the
short, daily, and global limits still apply.

The send path also refuses two kinds of address outright, equally silently:

- Anything on the suppression ledger: an address that ever hard-bounced or
  raised a spam complaint. The Resend delivery webhook feeds the ledger.
- Anything whose domain verifiably can't receive mail: no MX and no fallback
  address record, checked over DNS-over-HTTPS with a per-domain cache. DNS
  trouble fails open.

Both guards protect the sending domain's bounce and complaint rates, which
mail providers use to score its reputation, from the fake addresses a
no-account comment box inevitably collects.

### Unverified addresses expire

The verification mail promises that unconfirmed records are cleared within
seven days. The notify sweep keeps that promise: it nulls `email_hash` on any
`blog_comments` row older than that which still has no `reader_id`. It needs
no new cron; it runs on the schedule that already handles the other notify
maintenance.

The sweep doesn't change the comment's status, so a published comment stays
published. It falls back to the shape a comment posted without an address has
always had: anon-session ownership, a drawn face, and no claim-on-verify.
Confirming afterwards mints a fresh reader and doesn't adopt the old comment.
A comment still awaiting its confirmation (the email step-up) stays
held, and from then on only the owner can release it.

## Reader preferences

```
POST /api/v2/reader/preferences
```

```json
{ "notifyReplies": true, "subscribed": false }
```

```json
{ "reader": { "...": "..." } }
```

These are the switches on the confirm page. The reader session cookie alone
authenticates the route. It takes no address, so it can never change a
stranger's preferences by naming them. Without a session it answers
`401 not_signed_in`.

Every field is optional and independent. The client sends only the switch
that moved, and a body with none of them is a `400`.

| Field | Effect |
| --- | --- |
| `notifyReplies` | Writes the reader's own column (reply mail, see [Reply notifications](#reply-notifications)) |
| `subscribed` | The `blog` channel, matching the "latest posts" label. On adds `blog` to an active or pending subscription, or starts one on `["blog"]` for a reader with none. Off removes `blog` and unsubscribes only when no other channel remains; only that unsubscribe invalidates pending newsletter confirmations. |

`subscribed` never touches reply notifications, and `notifyReplies` never
touches the newsletter. Leaving the newsletter and muting your own replies are
separate decisions.

Rate-limited at 20/minute per reader, durably enforced. The response carries
the reader row as it now stands, in the same shape `/api/v2/reader/me`
returns.

`GET /reader/confirm` with no token is the page these switches live on. A
signed-in reader gets the preference card, and everyone else gets the
expired-link card. The reply mail's settings link points there, so the switch
is always one click from the mail that prompted it.

### Reply notifications

A published reply to a comment mails that comment's author, once. The mail
says there is a reply and where, and quotes the author's own comment. It
**never** includes the reply's text or the replier's name. The mail goes out
unattended, to an address someone chose to write under, so quoting the
replier would let any stranger use the site's sender reputation as a relay.

The mail goes out only when the comment's author:

- is a verified reader (an anonymous comment carries no address anyone may
  reuse),
- still has `notify_replies` set,
- hasn't muted this thread,
- isn't banned, and
- isn't the person who wrote the reply.

Held and rejected replies send nothing, since mailing about one would leak the
moderation queue.

| Cap | Value |
| --- | --- |
| Per reader | 12 per hour |
| Per reader, when the replier is anonymous | 3 per hour |

Sends are keyed on the reply id, so a retried write can't mail the same reply
twice. Suppressed addresses are skipped like every other outbound mail.

## Mute a conversation

```
POST /api/v2/reader/mute
```

```json
{ "token": "<signed>", "muted": true }
```

```json
{ "outcome": "muted", "postId": "..." }
```

This is the reply mail's own mute button, and the only mute there is. It
silences this **conversation**. The other option is the global switch, which
turns **every** reply alert off. A single argument in one thread is the usual
reason someone reaches for an off switch, and if the global switch is the only
one in reach, that's the one they pull.

A third, per-article scope shipped briefly on the settings card and was
removed. A reader done with an article stops reading it, so the switch
answered a question nobody was asking.

A mute stays until it is undone, because an alert that turns itself back on
is worse than one that was never offered. The landing page has the undo.

`outcome` is `muted`, `unmuted` (that undo, sent as `muted: false`), or
`invalid` for an expired, tampered, or unknown token. It's one flat answer, so
the endpoint can't be used to probe which tokens are real. Rate-limited at
20/minute per reader.

The token alone authenticates the request, never a session. The mail is
usually open on a device that has never signed in here, and if an off switch
starts with a sign-in, people press the spam button instead. The token is a
bearer capability naming a reader, a thread, and a post. It's valid for 90
days and can do nothing but mute or unmute that one thread.

`GET` answers `405`. The page with the button lives in the public Worker at
`GET /reader/mute?token=…`. As with `/reader/confirm`, the `GET` only renders
and the `POST` does the writing, so a mail scanner that prefetches every URL
in the message can't silence a conversation for the reader.

## Reader avatar

```
GET /api/v2/reader/avatar/:key
```

Serves a reader's avatar image, looked up by a hash of their address. `:key`
is `sha256(normalized email)`, the same hash notify uses, never the plaintext
address.

The endpoint serves the reader's cached avatar from R2 when one exists
(`ETag`/`If-None-Match` supported, `304` on a match). Otherwise it falls back
to a deterministic SVG identicon seeded from the hash. It does the same for a
malformed or unrecognized key, so the endpoint can never be used to tell a
real hash from a made-up one beyond what the hash already reveals (which any
client could compute for any address itself).

- `?s=<pixels>` requests an identicon size, snapped up to the nearest of
  40/80/120/160.
- Every response sends `Content-Security-Policy: default-src 'none'; sandbox`.
- Not rate-limited (cacheable image proxy).

A comment row, reactor chip, or `ReaderMe` carries this path only when an
avatar has actually resolved for that address. Otherwise the field is empty
and the client draws its own generated face. Handing out the path for every
address would make every face an identicon, since the endpoint answers an
identicon for any key it doesn't recognise.

Avatars resolve on both sign-in paths, the OAuth callback and email
verification, because those are the moments the plaintext address exists.
They go through the chain in `avatar.ts`: the OAuth picture, then QQ, then the
Gravatar-protocol mirrors.

## Drawn avatars

Anyone without a picture gets a face drawn in the browser. The three styles
are ported from Boring Avatars to `src/features/comments/drawn-avatar.ts`:

| Style | Look |
| --- | --- |
| `beam` | A cartoon face |
| `marble` | A blurred wash |
| `mist` | The wash, with its palette lifted halfway to white |

Colours come from 653 five-colour sets of Nice Color Palettes, the ones whose
colours all stay clearly apart.

A seed is a uint32:

- `seed % 20` is its colour class: which two of the palette's five colours are
  base and accent (never the same one).
- The rest of the seed picks, in turn, the style, the palette, and where the
  shapes sit.

`avatarSeed` on a comment author, a reactor chip, or `ReaderMe` is that seed.
It is `null` for anything older than the feature, and the client draws those
from the row id as before.

### Get a seed

```
POST /api/v2/reader/avatar-seed
```

```json
{ "current": 1234567, "mode": "issue" }
```

```json
{ "seed": 7654320, "persisted": false }
```

`mode` is `issue` (the default), `offer`, or `choose`:

| Mode | Body | Answer | Counts a class | Stores on a reader |
| --- | --- | --- | --- | --- |
| `issue` | `current` | `{ seed, persisted }` | yes | yes |
| `offer` | `current` | `{ seeds }`, five seeds | no | no |
| `choose` | `current`, `seed` | `{ seed, persisted }` | yes | yes |

An unknown `mode` is `400 invalid_mode`; `choose` without a valid uint32
`seed` is `400 invalid_seed`.

- `issue` hands out a seed in the least-issued colour class across the site,
  never the class of `current`. A new face lands on a colour pair the fewest
  people already wear.
- `offer` returns five seeds in the five least-issued classes, again never
  `current`'s. It counts none of them, so browsing batches costs the balance
  nothing.
- `choose` then counts the one picked, and gives back the class `current` was
  counted in.

The route keeps a count per class instead of counting every reader and
comment, so each call reads twenty rows.

Anonymous writers can call it too. They get `persisted: false`, and the
browser keeps the seed and posts it with each comment. A signed-in reader's
`issue` or `choose` is stored on their reader row and every comment they own
(`persisted: true`). Their stored seed is the one replaced, whatever `current`
says.

Responses are `private, no-store`. Rate-limited at 30/minute per IP.

### Picking a face in the browser

The client asks for the first seed once the reader focuses or types in a
compose box, not on page load. Until then, the face beside the name field is a
silhouette. It never follows the name typed there.

Pressing the reader's own face throws an offer's five faces out onto an arc to
its right, and turns the face into a button that asks for five more. The
client restyles the five so neighbours on the arc differ (class and palette
kept), and draws five locally if the offer fails. The pick is shown and kept
in the browser at once, then sent as `choose`.

The like stack avoids clashes on screen by itself. Likes with no reader behind
them each wear their own palette and class, none that the named faces beside
them wear, and no two neighbours share a style. The server balances only the
colour class. It leaves the style and palette of a seed it issues to chance,
which spreads evenly.

## Reader OAuth (GitHub, Google)

```
GET /api/oauth/reader/:provider
GET /api/oauth/reader/:provider/callback
```

These routes serve L2 sign-in, which no reader reaches today (see
[Reader identity](#reader-identity)).

`:provider` is `github` or `google`. The first route starts a sign-in
redirect. Add `?return=/blog/some-post` to land back somewhere other than the
homepage. The second route completes the sign-in.

Both answer plain `302` redirects, never JSON. An unconfigured or unknown
provider gets a clean `404` instead of a crash, so the site still boots with
only one provider configured. Every callback failure (bad state, a provider
error, an unverified email upstream, missing config) redirects to
`/?signin=failed`, with no detail in the URL or body. The real reason is only
logged server-side. Neither route is rate-limited.

## Review and claim earlier comments

A signed-in reader can list unclaimed comments written under their address
and choose which ones to claim.

### List claimable comments

`GET /api/v2/reader/claims?offset=0` lists up to 50 unclaimed, non-deleted
comments that match the authenticated mailbox. It requires a valid reader
session, accepts a non-negative offset up to 10000, and returns
`{ "comments": [...], "hasMore": false }`.

Each item carries `id`, `surface`, `postId`, `body`, `createdAt`, and
`authorName`, so the reader can recognize their own words. The
`/reader/comments` page makes that selection explicit. Opening it or paging
through it claims nothing.

### Claim comments

`POST /api/v2/reader/claims` accepts `{ "commentIds": ["..."] }` with 1–50
IDs and returns `{ "claimedIds": ["..."] }`. The update repeats the mailbox,
unclaimed, and non-deleted conditions atomically. It changes only ownership
and claim metadata, never the original session or authentication evidence. A
claimed comment still awaiting its email confirmation (the email step-up)
is then released through content moderation.

Both methods:

- return `401 reader_sign_in_required` without a valid reader session,
- use `Cache-Control: private, no-store`, and
- are rate-limited at 20/minute per reader, durably enforced.

### Automatic claiming

Email verification, OAuth, and owner sign-in claim comments automatically only
when both the mailbox matches and the browser has an existing valid anonymous
session cookie. After email verification, claimed comments awaiting
confirmation are released the same way. Comments from another browser stay
unclaimed until the reader selects them explicitly.

## Client telemetry

`POST /api/v2/comments/telemetry` accepts a small, optional report from the
browser:

```json
{ "kind": "comment", "outcome": "network_error", "challenges": 2 }
```

| Field | Values |
| --- | --- |
| `kind` | `comment` or `reaction` |
| `outcome` | `accepted`, `http_error`, `network_error`, or `challenge_failed` |
| `challenges` | An integer from 0 to 10 |

Reports contain no comment text, email, account/session identifier or
fingerprint. The endpoint answers `204` and never controls a comment's
outcome. Invalid or rate-limited reports are ignored. Reports have their own
budget of 60 per minute per hashed IP, separate from the write budgets.

Reports are unverified, and incomplete when a browser can't deliver them.
Separately, server request counters measure accepted HTTP responses, invalid
requests, rate limits, challenge failures and unavailable services, including
retries. An accepted HTTP response is not proof of publication or of benign
traffic. Hourly aggregate counters expire after 90 days.
