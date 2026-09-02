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

Not `mood`'s per-post comment count (see
[Mood API](/docs/api/mood#comments)) — this is a separate feature, a
different table, and a different identity model.

## Identity: three grades, one table

| Grade | How it's reached | What it unlocks |
| --- | --- | --- |
| L0 | Nothing — a `reader_anon` cookie, set automatically on first comment or reaction | Post and react; your own rows show as `mine` by cookie match, but cannot be edited or deleted |
| L1 | Click the link in the lazy-verification email | The comment's `reader_id` attaches; past comments from the same address get claimed; a persistent avatar and display name; edit and delete on rows the `reader_id` owns |
| L2 | Sign in with GitHub or Google (`/oauth/reader/...`) | Same as L1, `provider` reflects the OAuth provider instead of `email` |

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

`body` is 1-2000 characters. `displayName` is 1-32 characters, no control
characters, and can't collide with a small reserved list (the blog owner's
own names). `email` is optional — omitted or empty means an anonymous
comment (session-owned, identicon avatar, never
claimable); a non-empty value must be a valid address (`400` otherwise).
`turnstileToken` uses `expectedAction: 'blog_comment_create'`.
`locale` is the post page language (`zh` or `en`) and keeps the verification
mail aligned with the page where the comment was written.
`dwellToken` is minted by `GET /api/v2/comments/dwell-token` (see below) —
required. `website` is a visually-hidden honeypot field; a human never fills
it in. `notifyReplies` is reserved for a future reply-email preference; the
current release does not send reply notification emails.

A comment written without an email serializes with `avatarUrl: ""`; the
client renders a deterministic identicon for it.

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
   any error, timeout, or non-verdict response.
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
reached, `400 turnstile_failed` / `503 turnstile_unavailable` (with a `code`
extra) for Turnstile, `429 Too Many Requests` for a rate limit.

Same-origin only — no CORS header.

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
seconds old. Not rate-limited — it signs nothing but the current time, so
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
`403 not_owner`. `PATCH` additionally: `409 edit_window_closed`, `400` for a
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
`private, no-store`. Not rate-limited (read-only).

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
for an unknown target, `503 reaction_target_unavailable`.

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

`?post=<postId>` adds `"postMuted": true|false` next to `reader`, answering
whether this reader has muted reply alerts for that one post. Omitted when
the parameter is absent or nobody is signed in.

Never includes email or its hash. `DELETE` signs out: clears the session
cookie and returns `204`. Idempotent — calling it with no session already
set still succeeds, so the client never needs to check sign-in state first.
Neither is rate-limited.

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
moving them afterwards), and — if `subscribe: true` (or
the token itself was minted with a prior subscribe intent) — activates the
newsletter subscription in the same request, without a second confirmation
round trip. Sets the reader session cookie on success. Rate-limited at
10/minute per email hash, durably enforced.

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

Always answers the same shape and status regardless of whether the address
has ever commented, or is currently suppressed by the per-address send
limit below — this can never be used to probe which addresses have
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
{ "mutePost": { "postId": "...", "muted": true } }
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
decisions. `mutePost` is the narrower one: it adds or removes a `post`-scoped row in
`blog_comment_mutes` for that reader, so one article can go quiet while every
other article keeps mailing. It has no expiry — a post mute is a decision, not
a cooldown. Both `postId` and
`muted` are required together, and a response to a `mutePost` write carries
`postMuted` alongside the reader. Rate-limited at 20/minute per reader,
durably enforced. The response carries the reader row as it now stands, in
the same shape `/api/v2/reader/me` returns.

`GET /reader/confirm` with no token is the page these switches live on: a
signed-in reader gets the preference card, and everyone else gets the
expired-link card. That is where the reply mail's "turn these off" link
points, so the switch is always one click from the mail that prompted it.
The link carries `&post=<postId>`, which is what puts the per-post switch on
the card — without it the page shows only the global one.

### What `notifyReplies` actually sends

A published reply to a comment mails that comment's author, once, with the
comment and the reply quoted. It goes out only when the author is a verified
reader (an anonymous comment carries no address anyone may reuse), still has
`notify_replies` set, has muted neither this thread nor this post, is not
banned, and is not the person who just replied.
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

The reply mail's own mute button. Three scopes now exist and they answer
different questions: this **conversation** is on fire, this **post** is one
I'm done with, and I want **no** reply alerts at all. Muting a thread must not
cost the reader the other two — a single argument in one thread is the usual
reason someone reaches for an off switch, and if the only switch in reach is
the global one, that is the one they pull.

A thread mute stays until it is undone, like the post one — a reader who has
left a conversation has left it, and an alert that quietly turns itself back
on is worse than one that was never offered. The landing page carries the
undo. `outcome` is `muted`, `unmuted` (that undo, sent as `muted: false`), or
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
