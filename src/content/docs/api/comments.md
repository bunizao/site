---
title: Blog Comments API
description: Reading and posting comments on a blog post, reacting, lazy email verification, reader OAuth, and the avatar proxy — the anonymous-first identity model behind /blog/[slug].
group: API
order: 5.5
---

Comments on `/blog/[slug]` are anonymous-first: reading is open to everyone,
and posting a comment or reacting needs only a name — the email is optional.
An address buys a persistent avatar and the claiming
path; leaving it empty just means the comment belongs to its anonymous
session alone. Email verification and OAuth sign-in are upgrade paths
(grades L1/L2 below), never a door charge, and the address itself never
appears in a response body or public HTML.

This route family also carries `mood`'s comments, on the `surface` parameter
below — see [Mood surface: the Telegram bridge](#mood-surface-the-telegram-bridge).
It is not `mood`'s read-only per-post comment count (see
[Mood API](/docs/api/mood#comments)), which stays the plain Telegram scrape
this route bridges into.

## Per-post policy

Every write route below asks the post one question first, and the answer comes
from the post's own internal tags in Ghost — `#comments-off`,
`#comments-readonly` (or the older `#no-comments`), `#reactions-off`,
`#comments-verified` — folded onto a site-wide default. The full table is in
[Internal tags](/docs/writing/tags#comment-policy).

Both halves of the system derive it with one function,
`commentPolicyFromTags` in `@bunizao/contracts/comments`: `/blog/[slug]`
at build time from the Admin API, site-api per request from the Content API,
which returns internal tags for `include=tags` and is cached with the post for
60 seconds. So the page and the API cannot disagree, and a closed thread is
closed to `curl` too.

Three refusals come out of it, all `403`:

| Slug | Cause |
| --- | --- |
| `comments_closed` | The post takes no new comments (`readonly` or `off`). Applies to create and to edit; delete is always allowed, since removing your own words is not adding to a thread. |
| `email_verification_required` | The post takes verified addresses only, and this writer has none. An honest refusal, not a moderation hold. |
| `reactions_disabled` | The post's hearts are off — on the post and on its comments. |

Reads are never gated: a read-only thread has to stay readable, and a post
with no section rendered is simply not linked to. The `off` and `readonly`
difference is drawn by the page, not enforced by the API — to a write, both
mean no.

## Identity: three grades, one table

| Grade | How it's reached | What it unlocks |
| --- | --- | --- |
| L0 | Nothing — a `reader_anon` cookie, set automatically on first comment or reaction | Post and react; your own rows show as `mine` by cookie match, but cannot be edited or deleted |
| L1 | Click the link in the lazy-verification email | The comment's `reader_id` attaches; past comments from the same address get claimed; a persistent avatar and display name; edit and delete on rows the `reader_id` owns |
| L2 | Sign in with GitHub or Google (`/oauth/reader/...`) | Same as L1, `provider` reflects the OAuth provider instead of `email` |

**L2 is not reachable today.** The routes are built and work, but nothing on
the site links to them — there is no sign-in button in the comment box and no
client calls the route — and the provider credentials are not configured, so
`/oauth/reader/:provider` answers `404`. Every reader who verifies today is
L1. Treat L2 as a shape the data model already accommodates, not a path
anybody is walking.

`GET /api/v2/reader/me` reports the calling browser's current grade (`null`
when it's L0). There is no L0 sign-in call — the cookie is minted as a side
effect of the first `POST /api/v2/comments` or
`POST /api/v2/reactions/toggle`, never on a bare `GET`.

## List comments

```
GET /api/v2/comments?post=<postId>&before=<cursor>&limit=20
```

`post` is Ghost's `post.id` (stable across slug renames), required. `before`
is a root comment id cursor; omit it for the first page. `limit` defaults to
20, capped server-side at 50.

```json
{
  "comments": [
    {
      "id": "01H...",
      "postId": "...",
      "parentId": null,
      "author": { "name": "A Reader", "avatarUrl": "/api/v2/reader/avatar/<hash>", "byAuthor": false },
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

Pagination is by root comment: every visible reply under a returned root
comes back alongside it, unpaginated (threading is one level deep, so a
root's reply count stays bounded). `mine` is computed against the calling
browser's session cookie / `reader_id` — a plain `GET` never mints a
`reader_anon` cookie, so a first-time visitor with no cookie yet simply owns
nothing. `editableUntil` and `deletable` are stricter than `mine`: both
require the verified `reader_id` match, so an anonymous writer sees their
row flagged `mine` with no mutation rights, and clients must key edit/delete
affordances off these two fields, never off `mine`. `held`/`rejected` rows are visible only to their
own writer; a `deleted` row still appears as a tombstone (`body`/`author`
blanked) when a published reply hangs underneath it, otherwise it's gone
from the page entirely. `total` counts published comments only.

Always `private, no-store` — visibility depends on who's asking.

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
  "locale": "zh"
}
```

`surface` is `"blog"` (default) or `"mood"` — one table, one route, two
callers. Sending `mood` requires the post to exist in the mood archive,
not be soft-deleted, and have a linked Telegram discussion thread
(`discussion_message_id` set — surfaced to the reader as
`MoodContentDocument.discussionLinked`, see
[Mood API](/docs/api/mood#detail)); anything else is the same
`404 not_found` / `503 comment_target_unavailable` a bad blog `postId`
gets. `parentId` on `mood` is either another `mood` comment's own row id, or
— once [`discussionRepliesEnabled`](/docs/api/mood#detail) — the Telegram
message id of a `telegram`-origin comment; see
[Mood surface: the Telegram bridge](#mood-surface-the-telegram-bridge) for
what happens to a `mood` write next. `turnstileToken` uses a distinct
`expectedAction` per surface (`blog_comment_create` / `mood_comment_create`),
everything below Turnstile in the risk stack runs unchanged and shares its
counters across both surfaces (one person, one budget). `locale` on `mood`
is always `"en"` — the mood zone has no other language.

`body` is 1-2000 characters. `displayName` is 1-32 characters, no control
characters, can't collide with a small reserved list (the blog owner's own
names), and can't carry a blocked term — profanity, and the role names an
impersonator reaches for. Both checks fold lookalike letters from other
alphabets, so a term spelled in a second script is refused too; the term list
itself is not published. A name already stored on a signed-in reader is
checked for shape only, so a later edit to the term list never locks an
existing account out — the owner renames those from the moderation queue. `email` is optional — omitted or empty means an anonymous
comment (session-owned, identicon avatar, never
claimable); a non-empty value must be a valid address (`400` otherwise).
`turnstileToken` uses `expectedAction: 'blog_comment_create'`.
`locale` is the post page language (`zh` or `en`) and keeps the verification
mail aligned with the page where the comment was written.
`dwellToken` is minted by `GET /api/v2/comments/dwell-token` (see below) —
required. `website` is a visually-hidden honeypot field; a human never fills
it in. `notifyReplies` sets the writer's reply-mail preference — see
[What `notifyReplies` actually sends](#what-notifyreplies-actually-sends).

A comment written without an email serializes with `avatarUrl: ""`; the
client renders a deterministic identicon for it.

An `email` that belongs to a verified reader does **not** by itself attach
that reader's `reader_id` to the row. The identity comes from the session
cookie, and the address only has to agree with it. Typing somebody else's
verified address writes an ordinary unbound comment, exactly as any other
address would — the avatar, the author badge, and the ability to edit all
follow the session, never the typed field.

Every submission runs the full risk stack, in order:

1. **Turnstile.** A failed or missing token is the only step that answers
   plainly with `400`/`503` — everything below this line either succeeds
   outright or fails silently.
2. **Honeypot, dwell time, duplicate body.** Tripping any of these returns
   a fabricated `201 { "outcome": "held", ... }` envelope that is **never
   persisted** — a bot gets no signal to iterate against. The duplicate
   check is per-post over 24 hours and only applies to bodies of 20+
   characters, so two readers independently posting the same short praise
   are both heard; only copy-pasted paragraphs trip it.
3. **Heuristics** (disposable email domain, keyword blocklist, link count) —
   a hit **holds** the comment (it is created, but only its writer can see
   it) rather than dropping it. A first comment carrying a link is fine —
   there is deliberately no first-session-link hold; Akismet judges it like
   anything else. A verified (L1/L2) writer skips the disposable-domain
   check — verification already priced out the throwaway identity — and
   gets a higher link ceiling (6 instead of 3). The duplicate-body tripwire
   and the keyword blocklist apply to everyone.
4. **Rate limits**, durably enforced across three dimensions (anonymous
   session, IP, server-derived fingerprint) and two windows each: 5/minute
   and 20/hour for anonymous writers; 10/minute and 60/hour for verified
   readers, who are additionally budgeted on a fourth per-`reader_id`
   dimension so their allowance follows the account rather than the
   network. The first exhausted limit returns `429` with the standard
   `X-RateLimit-*`/`Retry-After` headers (see
   [Rate limits](/docs/api/overview#rate-limits)) — the only rate-limited
   route family on this whole site running in durable, not observability,
   mode.
5. **Akismet moderation** (skipped when heuristics already held) — one
   `comment-check` call carrying the body, author fields, IP, user agent,
   referrer, and post permalink. Ham publishes; spam holds (the owner can
   rescue a false positive); Akismet's "blatant spam" signal rejects so a
   spam wave never floods the moderation queue. Fails closed to `hold` on
   any error, timeout, or non-verdict response; the HTTP call itself is
   abandoned after 10 seconds.

   The request does not wait the full ten. Akismet normally answers in
   100-400ms, and after **1500ms** the create returns with the row stored as
   `held` and finishes the check in the background — a late verdict then
   upgrades the row and notifies the owner with the real outcome. The
   upgrade is guarded on `updated_at`, so a writer who edits in the meantime
   keeps their row held rather than having it clobbered by a stale verdict.
   A `held` response is therefore not always final.
6. **Shadow-ban.** A shadow-banned writer's otherwise-`publish` verdict is
   quietly downgraded to `hold` — they see their own comment as normal;
   nobody else ever does.

```json
{ "outcome": "published", "comment": { "...": "..." }, "unverifiedEmail": true }
```

`outcome` is `"published"` or `"held"`. `unverifiedEmail` is true when a
supplied `email` doesn't already belong to a verified reader — the client
shows the verification nudge. It is always false when no email was sent;
the add-an-email recommendation is the client's own state, not this flag.
On the true first comment from an unverified address, a lazy-verification
email goes out automatically (see below); this call never waits on that
send. A create without an email never sends mail at all.

**Errors:** `400` for a malformed body (see the field list above for exact
messages), `400 invalid_parent` for a `parentId` that doesn't exist, isn't a
root comment, or belongs to a different post, `404 not_found` for an unknown
`postId`, `503 comment_target_unavailable` when the Ghost registry can't be
reached, `403 comments_closed` and `403 email_verification_required` from the
[per-post policy](#per-post-policy), `400 turnstile_failed` /
`503 turnstile_unavailable` (with a `code` extra) for Turnstile,
`429 Too Many Requests` for a rate limit.

Same-origin only — no CORS header.

## Mood surface: the Telegram bridge

A `mood` write runs the full risk stack above unchanged, then — as a side
effect, never blocking the response — bridges into the post's Telegram
discussion group:

- **`published`** sends an HTML message into the group, replying to the
  post's own copy there (or to the parent comment's Telegram message when
  `parentId` names a `telegram`-origin comment):

  ```
  <b>{displayName}</b> <a href="{commentUrl}">via buxx.me</a>

  {body, rendered to the same small Markdown subset the blog accepts}
  ```

  `commentUrl` is `https://buxx.me/mood/<postId>#c-<token>`, where `token`
  is `commentAnchorToken(commentId)` — the first 12 hex characters of
  `sha256(commentId)` (`@bunizao/contracts/comments`). The link, not visible
  text, is what a Telegram reader sees; it is also the read path's match key
  (below), so the two sides never depend on Telegram's own message ids
  agreeing with anything the site chose. On success the row remembers the
  group's `message_id`; on failure it is retried hourly for the next 24h.
  The bridge send failing never fails the create — the comment is already
  published on the site (`outcome` in the response is unaffected either
  way).
- **`held`** never reaches Telegram. Approving a held comment (card or
  portal) runs the same bridge step then, at that point — not before. A
  rejected comment is never bridged, ever.
- **Edit** (the same 15-minute, verified-reader-only window as the blog)
  edits the bridged message in place; Telegram shows "edited". **Delete** —
  by the reader, or by the owner — deletes the bridged message. Both are
  logged and retried on failure rather than blocking; the site is the
  source of truth for whether a row is gone, not the group.

Reading a `mood` thread (`GET /api/comments?postId=` /
`GET /api/v2/mood/{id}/comments`, see
[Mood API](/docs/api/mood#comments) and
[`/api/comments`](/docs/api/content#comments-by-post-id)) still scrapes the
group's public embed — the bridge does not change how mood comments are
read, only what a web reader can add to them. The scrape is overlaid with
the site's own `mood`-surface rows before it reaches a client: a scraped
message whose text carries a `#c-<token>` link matching a published row is
replaced with that row's author, avatar, and body and marked `origin: "web"`
with `commentId` set (so the writer's own browser can mark it `mine` and
offer edit/delete); a `mood` row not yet visible in the scrape (bridge
pending, or the scrape's edge cache hasn't caught up) is appended instead,
so a writer sees their own comment immediately rather than after the cache
TTL. A row whose bridged message was removed directly in Telegram is
treated as deleted, never resurrected.

Disabled entirely by `MOOD_COMMENTS_ENABLED` (site-api, default off) — while
off, `surface: "mood"` on this route answers exactly like an unlinked post
(`discussion_message_id` unset): `resolveCommentablePost` finds nothing to
write into, and no bridge call (send, edit, delete, sweep) reaches Telegram.
See [Comments platform](/docs/platform/comments) for the kill switch and the
Phase 0 setup it gates.

## Dwell-time token

```
GET /api/v2/comments/dwell-token
```

```json
{ "token": "..." }
```

Mints the risk stack's dwell-time stamp: a short-lived signed timestamp the
client controller fetches once, at first interaction with the compose box,
and holds until submit. `POST /api/v2/comments` rejects (silently — see
above) a body whose `dwellToken` is missing, unsigned, or younger than 3
seconds old. The stamp also carries a 24-hour expiry, which is the ceiling
on how long a tab can sit open before its token has to be re-minted; the
client refreshes at 20 hours rather than discovering the wall. Not rate-limited — it signs nothing but the current time, so
there's no per-call cost worth gating; `POST /api/v2/comments`'s own limits
apply regardless of how many tokens get minted.

## Edit or delete a comment

```
PATCH  /api/v2/comments/:id
DELETE /api/v2/comments/:id
```

Both require **verified ownership**: the calling browser's `reader_id` must
match the row's writer. The `reader_anon` session cookie never grants
mutation — it is a bearer key a shared or public machine hands to its next
user, so it makes rows visible as `mine` but never editable or deletable.
An anonymous row written *with* an email becomes mutable once that address
verifies (claiming attaches the `reader_id`); a row posted with no email is
never claimable, so it is permanently frozen as written — deletion requests
go to the site owner. `PATCH` body:

```json
{ "body": "..." }
```

Edits are only allowed within **15 minutes** of `createdAt`, inclusive of
the exact boundary. An edit re-runs moderation against the new body (same
post-title/excerpt context) and the row's `editedAt` gets set — the client
should show an "edited" marker. Response: `{ "comment": { "...": "..." } }`.

`DELETE` has no time window. It's always a soft delete:

```json
{ "ok": true, "tombstone": true }
```

`tombstone: true` means a published reply hangs underneath it, so the row
stays as a shape-preserving placeholder (`body`/`author` blanked at read
time) instead of disappearing.

**Errors (both methods):** `404 not_found` (missing, or already deleted),
`403 not_owner`. `PATCH` additionally: `409 edit_window_closed`,
`403 comments_closed` on a post that has stopped taking comments, `400` for a
malformed body. `PATCH` is rate-limited at 10/minute per reader/session,
durably enforced.

## Reactions

```
GET /api/v2/reactions?targets=post:<id>,comment:<id>,...
```

`targets` is a comma-separated list of `type:id` pairs, up to 50. Anonymous
counts, identified faces: every reaction is visible to anyone, but only
identified reactors (L1/L2, or an L0 reactor whose claimed email resolves)
ever show up in `reactors`.

```json
{
  "reactions": {
    "post:abc123": [
      { "emoji": "❤️", "count": 3, "reacted": true, "reactors": [{ "name": "A Reader", "avatarUrl": null }] }
    ]
  }
}
```

`reacted` is specific to the calling browser, so this is always
`private, no-store` — a shared cache entry here would show one reader's
filled heart to another, which is why the batch read is uncacheable and
rate-limited instead: 120/minute per reader, or per hashed IP when there is
no session, durably enforced.

`reactors` is capped at 12 names per emoji; the `count` is the true total.
A banned reader is filtered out of both — their name leaves the list and
their heart leaves the number.

```
POST /api/v2/reactions/toggle
```

```json
{ "targetType": "post", "targetId": "abc123", "emoji": "❤️", "reacted": true, "turnstileToken": "..." }
```

No sign-in required — anyone can react, no prompt, no round trip of their
own. `turnstileToken` uses `expectedAction: 'blog_reaction'` and is expected
to solve invisibly (managed/widget mode), so in practice this never costs
the reader anything extra. `emoji` defaults to the one reaction shipped at
launch (❤️) if omitted. `reacted` is the desired final state — repeating the
same request is safe (idempotent). `targetType: 'comment'` targets a live
(non-deleted) comment row directly; `targetType: 'post'` is validated
against the same Ghost post registry `POST /api/v2/comments` uses.

```json
{ "reaction": { "emoji": "❤️", "count": 4, "reacted": true, "reactors": [] } }
```

Rate-limited at 30/minute per identity (reader, or a keyed hash of the
anonymous session), durably enforced, plus hashed-IP network budgets that
exist to stop anonymous cookie churn: 30/minute and 120/hour per IP.
A verified reader — whose identity cannot churn — is exempt from the
per-minute IP cap and bound only by their own identity budget and the
hourly network ceiling. **Errors:** `400` for a malformed
body, `400 turnstile_failed` / `503 turnstile_unavailable`, `404 not_found`
for an unknown target, `503 reaction_target_unavailable`,
`403 reactions_disabled` on a post whose hearts are off.

## Reader session

```
GET    /api/v2/reader/me
DELETE /api/v2/reader/me
```

`GET` always answers `200` — a signed-out reader is a normal state, not an
error:

```json
{ "reader": null }
```

or, when signed in:

```json
{
  "reader": {
    "readerId": "...",
    "grade": "l1",
    "provider": "email",
    "displayName": "A Reader",
    "avatarUrl": "/api/v2/reader/avatar/<email_hash>",
    "notifyReplies": false,
    "subscribed": false
  }
}
```

Never includes email or its hash. `DELETE` signs out: clears the session
cookie and returns `204`. Idempotent — calling it with no session already
set still succeeds, so the client never needs to check sign-in state first.
Neither is rate-limited.

Two cookies, both `__Host-` prefixed, `Secure`, `HttpOnly`, `SameSite=Lax`,
path `/`:

| Cookie | Lifetime | Carries |
| --- | --- | --- |
| `__Host-reader_session` | 180 days | The signed L1/L2 session: `reader_id`, provider, and the reader row's creation stamp, which acts as a generation counter |
| `__Host-reader_anon` | 365 days | An opaque keyed session id, minted on the first write. Marks rows as `mine`; never grants mutation |

An unprefixed legacy `reader_session` cookie is cleared wherever one is
still presented. A session whose reader row is missing, banned, or has lost
its `reader_id` is refused on sight, so a ban takes effect on the next
request rather than at the next expiry.

## Lazy email verification

```
POST /api/v2/reader/verify
```

```json
{ "token": "...", "subscribe": false }
```

This is the confirm button's `POST` — the click target of the link mailed
after a first unverified comment (or resent via the endpoint below). `GET`
on the equivalent page is deliberately not part of this API: the confirm
page itself is a small SSR page in the public `site` Worker at
`/reader/confirm`, and only its button's `POST` ever consumes the token, so
a mail client's link-prefetch `GET` can never silently burn it.

```json
{ "outcome": "confirmed", "reader": { "...": "..." } }
```

`outcome` is one of `confirmed`, `already_confirmed`, or `invalid` — a
malformed and an expired token both currently report `invalid`; the
contract also defines an `expired` outcome, but nothing produces it yet. On
`confirmed`, this
also binds every past anonymous comment from the same browser matching the
verified email hash to the new `reader_id`, turns reply notifications on
(the mail that carried the link promises them, and a first confirmation is
the only place they're switched on unasked — see the endpoint below for
moving them afterwards), and — when the token itself was minted with a
subscribe intent — activates the newsletter subscription in the same
request, without a second confirmation round trip. The request body's own
`subscribe` field is not honoured on its own: it would let whoever holds a
token add that address to the newsletter, which the address's owner never
asked for. Rate-limited at 10/minute per email hash, durably enforced.

**The session is minted once.** Only a `confirmed` outcome sets the reader
cookie; replaying the same token afterwards answers `already_confirmed` and
signs in nobody. So a link forwarded, quoted in a reply, or sitting in a
mailbox somebody else can read is not a way into the account — it signs in
the one device that redeemed it first, and a device left out gets a fresh
link rather than a second use of the old one. The token still expires 24
hours after it is minted.

The confirm page submits this on load rather than waiting for a press: a
browser runs the page's script, a mail scanner does not, so the token still
cannot be burned by a prefetch and a real reader never has to click twice.
The button stays in the served HTML as the no-JS path.

```
POST /api/v2/reader/resend
```

```json
{ "email": "reader@example.com", "notifyReplies": false, "locale": "zh" }
```

```json
{ "ok": true }
```

Mail goes out only to an address that has actually commented; there is
nothing to confirm for one that has not, and sending anyway would let this
route mail a stranger on request. Always answers the same shape and status
either way, and regardless of whether the address is currently suppressed
by the per-address send limit below — this can never be used to probe which addresses have
commented. Two independent rate limits apply, both durably enforced: a
per-IP route limit (5/minute, answers `429` — this one carries no address
information, so it's safe to surface) and a per-address send suppression (1
mail per 10 minutes, 5 per day, 8 per 30 days — enforced silently inside
the send path, never surfaced as a `429` here).

Beyond the counters, the send path itself refuses two classes of address
outright, equally silently: anything on the suppression ledger (an address
that ever hard-bounced or raised a spam complaint — fed by the Resend
delivery webhook, see [internal routes](/docs/api/internal)), and anything
whose domain verifiably cannot receive mail (no MX and no fallback address
record, checked over DNS-over-HTTPS with a per-domain cache; DNS trouble
fails open). Both guards protect the sending domain's bounce and complaint
rates — the numbers mail providers score reputation on — from the fake
addresses a no-account comment box inevitably collects.

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

The switches on the confirm page. Authenticated by the reader session
cookie alone — it takes no address, so it can never move a stranger's
preferences by naming them, and answers `401 not_signed_in` without one.
Every field is optional and independent; the client sends only the switch
that moved, and a body carrying none of them is a `400`. `notifyReplies`
writes the reader's own column; `subscribed` activates or unsubscribes the
newsletter subscription without touching reply notifications, and vice
versa — leaving the newsletter and muting your own replies are separate
decisions. Rate-limited at 20/minute per reader, durably enforced. The
response carries the reader row as it now stands, in the same shape
`/api/v2/reader/me` returns.

`GET /reader/confirm` with no token is the page these switches live on: a
signed-in reader gets the preference card, and everyone else gets the
expired-link card. That is where the reply mail's settings link points, so the
switch is always one click from the mail that prompted it.

### What `notifyReplies` actually sends

A published reply to a comment mails that comment's author, once, with the
comment and the reply quoted. It goes out only when the author is a verified
reader (an anonymous comment carries no address anyone may reuse), still has
`notify_replies` set, has not muted this thread, is not banned, and is not the person who just replied.
Held and rejected replies send nothing — mailing about one would leak the
moderation queue. Capped at 12 per reader per hour and keyed on the reply id,
so a retried write cannot mail the same reply twice; suppressed addresses are
skipped like every other outbound.

## Muting one conversation

```
POST /api/v2/reader/mute
```

```json
{ "token": "<signed>", "muted": true }
```

```json
{ "outcome": "muted", "postId": "..." }
```

The reply mail's own mute button, and the only mute there is: this
**conversation** goes quiet, or the global switch turns **every** reply alert
off. A single argument in one thread is the usual reason someone reaches for
an off switch, and if the only switch in reach is the global one, that is the
one they pull. (A third, per-article scope shipped briefly on the settings
card and was removed — a reader done with an article stops reading it, so the
switch answered a question nobody was asking.)

A mute stays until it is undone — a reader who has left a conversation has
left it, and an alert that quietly turns itself back on is worse than one that
was never offered. The landing page carries the undo. `outcome` is `muted`, `unmuted` (that undo, sent as `muted: false`), or
`invalid` for an expired, tampered, or unknown token — one flat answer, so the
endpoint cannot be used to probe which tokens are real. Rate-limited at
20/minute per reader.

Authenticated by the token alone, never a session: the mail is usually open on
a device that has never signed in here, and an off switch that starts with a
sign-in is one people replace with the spam button. The token is a bearer
capability naming a reader, a thread, and a post, valid 90 days, and it can do
nothing but mute or unmute that one thread. `GET` answers `405`; the page that
carries the button lives in the public Worker.

`GET /reader/mute?token=…` is that page. Like `/reader/confirm`, the GET only
renders and the POST does the writing, so a mail scanner prefetching every URL
in the message cannot silence a conversation on the reader's behalf.

### Unverified addresses expire

The verification mail promises that unconfirmed records are cleared within
seven days, and the notify sweep keeps that promise: it nulls `email_hash` on
any `blog_comments` row older than that which still has no `reader_id`. No new
cron — it rides the schedule that already runs the other notify maintenance.
The comment itself stays published; it simply degrades to the shape a comment
posted without an address has always had, meaning anon-session ownership, an
identicon, and no claim-on-verify. Confirming afterwards mints a fresh reader
and does not adopt the old comment.

## Reader avatar

```
GET /api/v2/reader/avatar/:key
```

A comment row, reactor chip, or `ReaderMe` carries this path only when an
avatar has actually resolved for that address; otherwise the field is empty
and the client draws its own generated one. The endpoint answers an identicon
for any key it does not recognise, so handing out the path for every address
made every face an identicon. Avatars resolve on both sign-in paths — the
OAuth callback and email verification, each being a moment the plaintext
address exists — through the chain in `avatar.ts`: the OAuth picture, then QQ,
then the Gravatar-protocol mirrors.

`:key` is `sha256(normalized email)` — the same hash notify uses, never the
plaintext address. Serves the reader's cached avatar from R2 when one
exists (`ETag`/`If-None-Match` supported, `304` on a match), otherwise falls
back to a deterministic SVG identicon seeded from the hash — including for
a malformed or unrecognized key, so this endpoint can never be used to
distinguish a real hash from a made-up one beyond what the hash already
reveals (something any client could compute for any address itself).
`?s=<pixels>` requests an identicon size, snapped up to the nearest of
40/80/120/160. `Content-Security-Policy: default-src 'none'; sandbox` on
every response. Not rate-limited (cacheable image proxy).

## Reader OAuth (GitHub, Google)

```
GET /api/oauth/reader/:provider
GET /api/oauth/reader/:provider/callback
```

`:provider` is `github` or `google`. The first starts a sign-in redirect
(optionally `?return=/blog/some-post` to land back somewhere other than the
homepage); the second completes it. Both are plain `302` redirects, never
JSON — an unconfigured or unknown provider is a clean `404` rather than a
crash, so the site still boots with only one provider configured. Every
callback failure (bad state, a provider error, an unverified email upstream,
missing config) redirects to `/?signin=failed` with no detail in the URL or
body; the real reason is only ever logged server-side. Neither is
rate-limited.
