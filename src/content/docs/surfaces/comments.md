---
title: Comments
description: The comment box on a blog post from the reader's side — what it asks for, what it keeps, what it refuses, and what each refusal code means.
group: Surfaces
order: 7
---

Every post at `/blog/[slug]` ends with a thread. This page is the reader's half
of it: what the box asks for, what it does with the answer, and what to do when
it says no. The wire contract behind all of it — routes, payloads, statuses,
the risk stack — is [Blog Comments API](/docs/api/comments).

## Writing one

A name and a comment. The email field is optional and stays optional; leaving
it blank posts a real comment that a real person can read and reply to.

| Field | Limit | Notes |
| --- | --- | --- |
| Name | 1–32 characters | No control characters, and not one of the owner's own names |
| Email | optional | Buys an avatar, editing, and reply mail — see [Who you are](#who-you-are) |
| Comment | 1–2000 characters | A small Markdown grammar, below |

The counter under the box only appears near the end. Formatting is deliberately
partial: `**bold**`, `*italic*`, `` `code` ``, fenced blocks, `> quotes`,
lists, `[links](url)`, and bare URLs. No headings, no tables, no images — a
comment should not be able to out-shout the post above it, and an image in a
comment is a remote URL every other reader's browser would then fetch.

Nothing typed is lost to a stray reload. The top box is backed up to this
browser's local storage and restored on the next visit to the same post, and
any box holding words asks before the page closes. The reply box gets only the
second half: it is one travelling element with no memory of which comment it
was answering, so restoring it would park a stray reply under nothing.

## What happens when you press Post

The comment appears in the thread immediately, before anything has been asked
of the server. Both surfaces do this, and both mean it: the words are already
written, and a form that visibly stops working for the two to four seconds a
bot check plus a spam check takes is charging the reader for a comment that
was going to be accepted anyway.

For a moment the new row breathes and says *Publishing*. That is not a review
— for an anonymous writer the API waits up to eight seconds while a language
model reads the comment, and after three the word becomes *Still checking — a
few more seconds*, so a wait that long never looks stuck. A verdict slower
than that comes back formally held and goes public a moment later.
The page watches for the flip and stops breathing when it lands, and keeps
watching for about a minute and a half, which is longer than a slow verdict
takes.

Only a wait that genuinely ends without a publish leaves a note behind, and
it says the one thing that matters: everyone else is looking at a thread this
row is not in. It is rare, and it is never the ordinary case dressed up as
one. A comment held until its address is confirmed says so instead — the
link in the inbox publishes it — and the nudge under the box says the same,
because that is the one hold the reader can end on their own. A request for
an email (`NOMAIL`) focuses the email field; anything typed into the box
while the request was out is kept after the returned draft.

A refused write takes it all back in the order it was given — the row goes,
the words return to the box, and a reply goes back to being a reply to the
comment it was under — and then says which refusal it was, because a rate
limit and a dropped connection want opposite next moves.

## Who you are

Three grades, and the box climbs them on its own rather than asking anyone to
make an account.

| | How you get there | What it buys |
| --- | --- | --- |
| **Anonymous** | Nothing. A cookie appears when you first post or react | Posting, reacting, and seeing your own rows marked as yours |
| **Verified** | Click the link in the confirmation mail | A persistent avatar, your name remembered, editing and deleting, reply mail |
| **Signed in** | GitHub or Google — built, but not offered yet | The same as verified, with that account's avatar |

The third row is not on offer today: there is no sign-in button anywhere in
the comment box, so every reader who has an identity here got it from the
mail. It is in the table because the data model and the routes already
accommodate it.

The confirmation mail goes out by itself on the first comment carrying a new
address — no separate signup step. Until it is confirmed, the comment is
published and readable like any other; verification is about what *you* can do
later, not about whether anyone can see what you wrote.

The anonymous cookie is deliberately weak. It marks rows as yours so the thread
reads correctly, and it will never let anyone edit or delete anything: on a
shared machine that cookie is handed straight to the next person who sits down.

## Editing and deleting

Fifteen minutes from posting, and only on a comment a verified identity owns.
A comment written without an email is never claimable, so it is frozen exactly
as written — the owner can remove it on request.

Deleting has no window. If a published reply is hanging underneath, the row
stays as an empty placeholder so the thread keeps its shape.

## Hearts

One per person per thing, on the post and on each comment, and they are
one-way on purpose: a heart already given is not taken back. Reacting needs
nothing at all — no name, no address.

## Mail

Two kinds, both switchable.

- **Confirm your address** — sent once, automatically, on your first comment
  from an unrecognised address. Resendable from the same box or from
  [`/reader/confirm`](/reader/confirm) if the link has gone stale.
- **Someone replied** — turned on when you confirm, because the mail that
  carried the link says so, and turned off from the preferences link in any of
  them. A single conversation can also be muted on its own.

The confirmation link signs in exactly one device — whichever opens it first —
and expires after 24 hours. Opening it again later confirms nothing and signs
in nobody, which is what keeps a forwarded or quoted link from being a way into
the account. A device left out gets a fresh link; that is the whole repair.

<a id="comment-errors"></a>

## When a comment is refused

Every refusal prints one sentence naming the next move, and a short code in the
corner of the alert. The code is for the moment the sentence is not enough —
it survives translation, retelling, and a photo of a screen, and it is the
thing worth quoting in a report. Where there is more to say than fits in the
alert, the code is a link and lands on one of the sections below.

| Code | What happened | Next move |
| --- | --- | --- |
| `NET` | The request never left the browser | Reconnect and post again; the draft is safe |
| `RATE` | Too many writes too quickly | Wait. Retrying immediately only deepens it |
| `BOT` | The invisible human check could not settle it | Answer the challenge that opens under the box |
| [`GONE`](#comment-error-gone) | The thread or the comment is not there | Refresh |
| `THREAD` | The comment being replied to is gone | Refresh the thread |
| [`CLOSED`](#comment-error-closed) | The claim on that comment ran out | Nothing to retry |
| `LOCKED` | The post has stopped taking comments | Nothing to retry |
| [`VERIFY`](#comment-error-verify) | The post takes confirmed addresses only | Confirm, then post |
| [`NOMAIL`](#comment-error-nomail) | This comment needs an address to confirm | Add one, post, confirm the link |
| [`NAME`](#comment-error-name) | The name was refused | Pick another |
| [`EMAIL`](#comment-error-email) | The address was refused | Correct it, or leave it blank |
| `LONG` | Over 2000 characters | Trim it |
| `STALE` | The page sat open long enough to go stale | Refresh; the draft is saved |
| `INPUT` | A refusal this page has no name for | Refresh and try once more |
| `SERVER` | Something failed on our end | Try again shortly |

A code is often followed by a number — `RATE 429`, `STALE 400`. That is the
HTTP status the refusal arrived with, and it narrows a report to one route. A
code with no number means the request never reached a server at all.

<a id="comment-error-name"></a>

### `NAME` — that name will not work

A display name is 1–32 characters with no control characters, and it cannot be
one of a small reserved list: the names the site owner writes under. That list
is matched after folding lookalike letters, so a Cyrillic **а** or a Greek
**ο** standing in for the Latin one is refused as the same name. Nothing else
about a name is filtered — it is a name, not a comment.

<a id="comment-error-email"></a>

### `EMAIL` — that address will not work

The address has to be a real, deliverable one. Placeholder domains that a
browser's own validation is perfectly happy with — `example.com`,
`localhost`, anything at `.test` or `.invalid` — are refused here, which is the
usual reason a well-formed address comes back rejected.

Leaving the field empty is usually allowed. An address is what buys editing
and reply mail later; the one time it is a condition of being heard now is
[`NOMAIL`](#comment-error-nomail).

<a id="comment-error-verify"></a>

### `VERIFY` — this post takes confirmed addresses

A handful of posts are set to accept comments only from confirmed addresses.
This is a refusal, not a moderation hold — nothing was stored, and the draft is
still in the box.

Confirm the link already sitting in the inbox, or send a fresh one from
[`/reader/confirm`](/reader/confirm), then post again in the same tab. A link
signs in one device and expires after 24 hours, so the one from three weeks ago
will not work and neither will one already used elsewhere; asking for another
is free.

<a id="comment-error-nomail"></a>

### `NOMAIL` — this comment needs an address

The request looked enough like automation — a data-centre network, a browser
without a graphics card, several posts in a few minutes, one browser writing
under several names — that it goes nowhere without an email address to
confirm. How the words were typed, dictated or pasted never counts toward
this. Nothing was stored, and the draft is still in the box.

Add an address and post again. The comment waits, unseen, until the link in
the confirmation mail is opened; then it goes through the usual checks and
appears. An agent without a mailbox never gets further, and a person gets
through with one click. The same thing happens, with no refusal first, to
anyone who already gave an address.

<a id="comment-error-closed"></a>

### `CLOSED` — the window has passed

A comment can be edited for fifteen minutes after it is posted, and only by the
verified identity that owns it. Past that, the row is final — retrying is a
guaranteed second refusal.

Two things commonly look like an expired window and are not: a comment written
with no address is owned by nobody, so it was never editable; and a browser
that has been signed out no longer holds the identity that wrote it, which
signing back in restores.

Deleting is not on this clock. If a comment needs to come down long after it
went up, the delete button still works — and where the identity is gone for
good, [the owner can remove it](/docs/platform/privacy).

<a id="comment-error-gone"></a>

### `GONE` — that thread is not available

Either the target genuinely no longer exists — a deleted comment, a post that
has been unpublished — or the service that answers "does this post exist" was
briefly unreachable. The alert cannot tell the two apart, which is why it says
"not available right now" rather than guessing.

Refreshing separates them: a thread that comes back was the second case, and
posting again will work. The draft survives either way.
