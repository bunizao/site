---
title: Owner Messages API
description: POST /api/v2/messages — the private inbox behind /message. One write route, no read route, and the Telegram reply path that answers it.
group: API
order: 5.6
---

`/message` is a form that writes to one person. What it stores never appears
on the site, in a feed, in an OG image, or in any response body — there is no
route that reads it back. The owner reads it in Telegram and answers there.

It is deliberately not a comment. [Blog comments](/docs/api/comments) are
public by default and become visible by reaching `status = 'published'`;
messages live in their own `owner_messages` table with no publish state at
all, so making one public would take new code rather than a wrong click. That
separation is the whole design — everything below follows from it.

What it *does* share with comments is the machinery: the same reader identity,
the same Turnstile action pipeline, the same dwell token, the same durable
rate limiter, the same Akismet client, and the same kill switch. A message is
a different kind of writing, not a different kind of request.

## POST /api/v2/messages

Same-origin only, like every `/v2` route. `201` on success — including for the
silent drops described under [Tripwires](#tripwires).

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
| `displayName` | yes | 1–32 characters. Overridden by the session's own name when the sender is a signed-in reader |
| `email` | yes | Must be a valid address. Buys a reply and nothing else — see [Why an address is required](#why-an-address-is-required) |
| `turnstileToken` | yes | Action `owner_message_create` |
| `dwellToken` | yes | Minted by `GET /api/v2/comments/dwell-token` — the same endpoint, because it signs the same timestamp with the same secret |
| `website` | no | Honeypot. Must be empty |
| `locale` | no | `zh` or `en`; anything else falls back to `zh`. Chooses the language of the verification mail and of the owner's reply. `/message` is English only and always sends `en` |

```json
{
  "id": "1f0c…",
  "createdAt": "2026-09-05T02:14:07.000Z",
  "replyable": true,
  "verificationSent": false
}
```

`replyable` and `verificationSent` are the only interesting fields, and they
are what the receipt on `/message` reads to decide what it can honestly
promise:

| `replyable` | `verificationSent` | What happened |
| --- | --- | --- |
| `true` | `false` | The address is already a confirmed reader. An answer can reach it |
| `false` | `true` | An address was given but has never been confirmed. A verification mail went out; clicking the link makes a reply possible |
| `false` | `false` | A tripwire fired, or the verification mail did not go out. Nothing can be answered |

### Refusals

| Status | `error` | Cause |
| --- | --- | --- |
| `400` | `body must be 2-4000 characters` | Length, after trimming |
| `400` | `displayName must be 1-32 characters…` | Empty, over-long, control characters, or a reserved name |
| `400` | `email is required and must be a valid address` | Missing or malformed |
| `400` | `turnstileToken is required` / `dwellToken is required` | Missing |
| `400` | `turnstile_failed` | The token did not verify, or carried the wrong action |
| `413` | `body is too large` | Over 32 KB, whatever the character count says |
| `429` | `Too Many Requests` | See [Rate limits](#rate-limits) |
| `503` | `turnstile_unavailable` | Turnstile is unconfigured or unreachable. A refusal, not a bypass |
| `404` | `not_found` | Comments are switched off site-wide |

That last one is not a typo. The route rides `COMMENTS_ENABLED` rather than
carrying a second switch: the two share the reader identity, the risk stack
and the ops bot, so leaving this open while comments are off would keep
running exactly the machinery the switch exists to stop.

## Why an address is required

The comment box channels rather than blocks: it takes an address when one is
offered, because a comment nobody can answer is still worth publishing. This
endpoint blocks, because the opposite is true here — a private message nobody
can answer is a dead letter, seen once and then stuck.

An address is necessary for a reply, not sufficient. Anyone can type anyone's
address into a public form, and if a reply were mailed to whatever arrived in
`email`, this endpoint would be a way to aim the site's outbound mail at a
stranger. So an unverified address gets the ordinary lazy verification mail —
the same one the comment box sends — and a reply becomes possible only once
someone has clicked the link in it.

Nothing is lost by ignoring that mail. The message is already stored and the
owner already has it; the only thing on the other side of the link is the
ability to be answered.

A sender who verifies *later* is still answerable: the reply path re-resolves
the reader by email hash rather than trusting the `reader_id` that was null at
write time.

## Rate limits

Three dimensions — anonymous session, hashed IP, and a hashed
IP+User-Agent fingerprint — each against two windows:

| Window | Max |
| --- | --- |
| 10 minutes | 3 |
| 24 hours | 8 |

Looser than the comment limits on the short window and much tighter on the
long one. Someone writing to the owner legitimately sends a handful of
messages ever, not a handful an hour; the burst allowance only exists so that
hitting send twice, or writing again after remembering something, is not
treated as an attack.

## Tripwires

A tripped honeypot, an unsigned dwell token, or a `drop` heuristic verdict all
return `201` with a well-formed body that stores nothing. The envelope has to
be indistinguishable from a real success — a distinguishable one teaches a bot
exactly which field to leave alone.

Akismet judges everything that survives, with `comment_type: contact-form`,
which is what a private note to a site owner actually is; the classifier
weighs it differently from a public comment. Unlike the comment path the
verdict is awaited rather than raced against a deadline: no reader is watching
for the row to appear, so there is no reason not to file it with its real
answer. A `spam` verdict files the message quietly and skips the Telegram
alert. A moderation outage files it as `new` — the cost of a false negative in
a private inbox is one line to skim.

## The reply path

New messages arrive as a Telegram alert from the ops bot carrying the sender,
the body, and one inline button whose callback data holds the message id.
Swipe-reply to that alert and the reply text is mailed to the sender.

The id travels on the alert's own keyboard, so there is no pending-action
state to expire and no way to answer the wrong message by replying late.

Replies ignore the reader's `notify_replies` preference: that flag governs
unsolicited alerts about other people's activity, and swallowing a
hand-written personal answer because of it would be the wrong reading of a
switch nobody set with this in mind. Suppression is still honoured — a hard
bounce or a spam complaint means the address is not mailed at all.

For the same reason the reply mail carries no settings link. There is nothing
to configure: it is one hand-written answer, not an alert, and the only thing
the footer offers is "reply to this email to keep going".

The bot says why a reply could not be sent rather than failing quietly:
the message is gone, there is no address on it, the address was never
confirmed, or it is suppressed.

## Storage

`owner_messages` keeps the body, the display name, a hashed address (never the
address itself), the locale, a state of `new` / `read` / `replied` /
`archived` / `spam`, and the same request-shape columns the comments table
keeps for abuse work: hashed IP, User-Agent, country, ASN, and fingerprint
hash.

There is no retention job. Messages are kept until deleted by hand.
