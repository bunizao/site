---
title: Owner Messages API
description: POST /api/v2/messages, the private inbox behind /message. One write route, no read route, replies via Telegram.
group: API
order: 5.6
---

`/message` is a form for writing privately to the site owner. What it stores
never appears on the site, in a feed, in an OG image, or in any response body,
because no route reads it back. The owner reads messages in Telegram and
answers there.

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
  "locale": "en"
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
| `400` | `turnstile_failed` | The token did not verify, or carried the wrong action |
| `413` | `body is too large` | Over 32 KB, whatever the character count says |
| `429` | `Too Many Requests` | See [Rate limits](#rate-limits) |
| `503` | `turnstile_unavailable` | Turnstile is unconfigured or unreachable. The request is refused, never let through |
| `404` | `not_found` | Comments are switched off site-wide |

The `404` is intentional. The route uses `COMMENTS_ENABLED` instead of a
switch of its own. Messages share the reader identity, the risk stack, and the
ops bot with comments, so leaving this route open while comments are off would
keep running the machinery the switch exists to stop.

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

A tripped honeypot, an unsigned dwell token, or a `drop` heuristic verdict each
return `201` with a well-formed body, and nothing is stored. The response must
look exactly like a real success. A response that looks different teaches a bot
which field to leave alone.

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

## Storage

The `owner_messages` table keeps:

- the body and the display name
- a hashed address, never the address itself
- the locale
- a state: `new` / `read` / `replied` / `archived` / `spam`
- the request-shape columns the comments table also keeps for abuse work:
  hashed IP, User-Agent, country, ASN, and fingerprint hash

There is no retention job. Messages stay until someone deletes them by hand.
