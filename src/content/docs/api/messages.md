---
title: Owner Messages API
description: POST /api/v2/messages, the private inbox behind /message. One public write route, no public read route, replies via Telegram or the portal.
group: API
order: 5.6
---

`/message` is a form for writing privately to the site owner. What it stores
never appears on the site, in a feed, in an OG image, or in any public response
body, because no public route reads it back. The owner reads messages in
Telegram or in the admin portal's inbox, and answers from either.

A message is not a comment. [Blog comments](/docs/api/comments) are public by
default and become visible when they reach `status = 'published'`. Messages
live in their own `owner_messages` table with no publish state at all, so
making one public would take new code instead of a wrong click.

Messages do reuse the comment machinery:

- the reader identity
- the Turnstile action pipeline
- the dwell token
- the durable rate limiter
- the Akismet client
- the actor record and the ban list
- the kill switch

## Send a message

`POST /api/v2/messages` stores one message. Like every `/v2` route, it accepts
same-origin requests only. It returns `201` on success, and also for the silent
drops described under [Tripwires](#tripwires).

```json
{
  "body": "I read the piece on quiet architecture twice.",
  "displayName": "someone",
  "email": "you@example.com",
  "turnstileToken": "0.abc…",
  "dwellToken": "1738…:9f2…",
  "website": "",
  "locale": "en",
  "clientFp": { "navigator": {}, "screen": {}, "canvas": "..." },
  "interaction": { "composeMs": 42000, "keyEvents": 180 },
  "storageId": "0123456789abcdef0123456789abcdef"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `body` | yes | 2–4000 characters after trimming, and at most 32 KB of UTF-8 |
| `displayName` | yes | 1–32 characters. When the sender is a signed-in reader, the session's own name replaces it |
| `email` | yes | Must be a valid address. It is used for a reply and nothing else. See [Why an address is required](#why-an-address-is-required) |
| `turnstileToken` | yes | Action `owner_message_create` |
| `dwellToken` | yes | Minted by `GET /api/v2/comments/dwell-token`. Messages share that endpoint with comments because it signs the same timestamp with the same secret |
| `website` | no | Honeypot. Must be empty |
| `locale` | no | `zh` or `en`; anything else falls back to `zh`. Sets the language of the verification mail and of the owner's reply. `/message` is English only and always sends `en` |
| `clientFp`, `interaction`, `storageId` | no | The comment box's client evidence, with the same shapes and bounds. See [Post a comment](/docs/api/comments#post-a-comment) |

The form collects the client evidence with the same module the compose box
uses. The module loads on the first interaction with the form, never on a page
view. The evidence is never a gate here either: a body without it, or with a
malformed one, is written the same way and stores NULL. The form doesn't wait
past the module's two-second deadline, so a slow browser costs a missing
fingerprint, not a slow send.

```json
{
  "id": "1f0c…",
  "createdAt": "2026-09-05T02:14:07.000Z",
  "replyable": true,
  "verificationSent": false
}
```

The fields that matter are `replyable` and `verificationSent`. The receipt on
`/message` reads them to decide what it can honestly promise:

| `replyable` | `verificationSent` | What happened |
| --- | --- | --- |
| `true` | `false` | The address is already a confirmed reader. An answer can reach it |
| `false` | `true` | An address was given but has never been confirmed. A verification mail went out; clicking its link makes a reply possible |
| `false` | `false` | A tripwire fired, or the verification mail did not go out. Nothing can be answered |

### Errors

| Status | `error` | Cause |
| --- | --- | --- |
| `400` | `body must be 2-4000 characters` | Length, after trimming |
| `400` | `displayName must be 1-32 characters…` | Empty, too long, control characters, or a reserved name |
| `400` | `email is required and must be a valid address` | Missing or malformed |
| `400` | `turnstileToken is required` / `dwellToken is required` | Missing |
| `400` | `invalid_dwell_token` | The dwell token's signature did not verify, for instance a page left open across a secret rotation. Reload and send again |
| `500` | `messages_not_configured` | The comments session secret is missing. Nothing is acknowledged |
| `400` | `turnstile_failed` | The token did not verify, or carried the wrong action |
| `413` | `body is too large` | Over 32 KB, whatever the character count says |
| `429` | `Too Many Requests` | See [Rate limits](#rate-limits) |
| `503` | `turnstile_unavailable` | Turnstile is unconfigured or unreachable. The request is refused, never let through |
| `404` | `not_found` | Comments are switched off site-wide |

The `404` is intentional. The route uses `COMMENTS_ENABLED` instead of a
switch of its own. Messages share the reader identity, the risk stack, and the
ops bot with comments, so leaving this route open while comments are off would
keep running the machinery the switch exists to stop. The portal's site-wide
comment switches close comments only, not this route.

## Why an address is required

The comment box takes an address when one is offered but does not require it,
because a comment nobody can answer is still worth publishing. This endpoint
requires one. A private message nobody can answer is a dead letter: the owner
sees it once and can do nothing with it.

An address is necessary for a reply, but it is not enough. Anyone can type
anyone's address into a public form. If replies went to whatever arrived in
`email`, this endpoint would let anyone aim the site's outbound mail at a
stranger. So an unverified address gets the ordinary lazy verification mail
(the same one the comment box sends), and a reply becomes possible only after
someone clicks the link in it.

Ignoring that mail loses nothing. The message is already stored and the owner
already has it. The link only makes the sender answerable.

A sender who verifies *later* can still get a reply. The reply path looks the
reader up again by email hash instead of trusting the `reader_id`, which was
null at write time.

## Rate limits

The limiter counts three dimensions separately: the anonymous session, the
hashed IP, and a hashed IP+User-Agent fingerprint. Each has two windows:

| Window | Max |
| --- | --- |
| 10 minutes | 3 |
| 24 hours | 8 |

Compared with the comment limits, the short window is looser and the long one
is much tighter. A legitimate sender writes to the owner a handful of times in
total. The burst allowance exists so that pressing send twice, or writing again
after remembering something, is not treated as an attack.

## Tripwires

A tripped honeypot, a signed dwell token younger than three seconds, or a `drop`
heuristic verdict each return `201` with a well-formed body, and nothing is
stored. The response must look exactly like a real success. A response that
looks different teaches a bot which field to leave alone.

An expired dwell token is a form left open past a day, not a bot: the message
is filed like any other. A token that does not verify is refused with
`400 invalid_dwell_token` rather than swallowed.

Akismet then judges every message that gets through, with
`comment_type: contact-form`. That is what a private note to a site owner is,
and the classifier weighs it differently from a public comment.

Unlike the comment path, this route waits for the verdict instead of racing it
against a deadline. No reader is watching for the row to appear, so the message
can be filed with its real answer:

- A `spam` verdict files the message without a Telegram alert.
- A moderation outage files it as `new`. A false negative in a private inbox
  costs one line to skim.

## Replies

New messages arrive as a Telegram alert from the ops bot. The alert shows the
sender, the body, and one inline button whose callback data holds the message
id. When the owner swipe-replies to that alert, the reply text is mailed to the
sender.

The message id travels on the alert's own keyboard. There is no pending-action
state to expire, and a late reply cannot answer the wrong message.

Replies ignore the reader's `notify_replies` preference. That flag controls
unsolicited alerts about other people's activity, and nobody set it with a
hand-written personal answer in mind. Suppression still applies: after a hard
bounce or a spam complaint, the address is not mailed at all.

For the same reason, the reply mail has no settings link. It is one
hand-written answer, not an alert, so there is nothing to configure. The only
thing the footer offers is "reply to this email to keep going".

When a reply cannot be sent, the bot says why:

- the message is gone
- there is no address on it
- the address was never confirmed
- the address is suppressed

The portal inbox (`/admin/messages`, see
[Internal routes](/docs/api/internal#admin-api)) is the second way to answer.
It can:

- list messages by state, or new, read and replied together as the inbox
- show one message with the sender's earlier messages and actor record
- file a message as read, archived or spam
- reply through the same mailer, with the same refusals

Fetching one message doesn't mark it read. The portal files a new message as
read itself, the moment the owner opens it.

## Senders and bans

A message resolves to the same actor record as a comment, before the rate
limits run. It is checked against the whole
[ban list](/docs/api/comments#post-a-comment) on every key it carries. A banned
sender's message is still stored, filed as `spam` with the note
`Shadow-banned sender.`, and answered `201` like any other.

Only a signed-in write ties a message to a reader. `reader_id` is whoever the
typed address resolves to, which a reply needs, and anybody can type a
reader's address. So `auth_at_write` records who actually sent it:

| `auth_at_write` | Meaning |
| --- | --- |
| `verified` | A live reader session sent it |
| `anonymous` | No reader session sent it |
| `unknown` | The row was written before the column existed |

The portal names a sender as a signed-in reader only for `verified`, and a
typed address never links a device to that reader. A reply to an `anonymous`
message still goes to that reader's address, so the reply box warns that it
may reach someone who never wrote.

Banning a sender from the portal bans the keys the owner ticks, then files that
message as spam. Undoing it lifts both. Earlier messages stay where they are:
messages are private, so a ban has nothing of theirs to take down.

## Storage

The `owner_messages` table keeps:

- the body and the display name
- the address hash, and the address as typed so the owner can read it in the
  portal
- the locale
- a state: `new` / `read` / `replied` / `archived` / `spam`
- `auth_at_write` (see [Senders and bans](#senders-and-bans))
- the same actor columns a comment keeps for abuse work: the IP and its
  hashes, User-Agent, browser and OS, country, city and ASN, the server-side
  and client-side fingerprint hashes, the storage-id hash, and the client
  evidence

The message itself stays until someone deletes it by hand. Two parts expire
sooner:

| Data | Removed |
| --- | --- |
| The anti-abuse columns | 90 days after the row was written, on the same sweep as comments |
| The address as typed, when no reader session sent the message | 7 days after the row was written |

The address hash stays, because a reply finds the sender through it once they
confirm.
