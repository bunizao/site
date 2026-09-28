---
title: Comments
description: What the blog comment box asks for, what it keeps and refuses, and what each refusal code means.
group: Surfaces
order: 7
---

Every post at `/blog/[slug]` ends with a comment thread. This page covers the
reader's side: what the comment box asks for, what happens after you post, and
what to do when it refuses. For routes, payloads, statuses and the risk stack,
see [Blog Comments API](/docs/api/comments).

| Topic | Section |
| --- | --- |
| Fields, limits and formatting | [Write a comment](#write-a-comment) |
| Publishing and holds | [What happens when you press Post](#what-happens-when-you-press-post) |
| Anonymous, verified and signed-in readers | [Who you are](#who-you-are) |
| The 15-minute edit window | [Edit and delete](#edit-and-delete) |
| Reactions | [Hearts](#hearts) |
| Confirmation and reply mail | [Mail](#mail) |
| Refusal codes | [When a comment is refused](#comment-errors) |

## Write a comment

A comment needs a name and some text. The email field is optional. If you leave
it blank, you still post a real comment that people can read and reply to.

| Field | Limit | Notes |
| --- | --- | --- |
| Name | 1–32 characters | No control characters, and not one of the owner's own names |
| Email | optional | Gives you an avatar, editing, and reply mail. See [Who you are](#who-you-are) |
| Comment | 1–2000 characters | A small Markdown subset, below |

A character counter appears under the box only when you get near the limit.

Comments support part of Markdown: `**bold**`, `*italic*`, `` `code` ``, fenced
blocks, `> quotes`, lists, `[links](url)`, and bare URLs. Headings, tables and
images aren't supported. A comment shouldn't be able to out-shout the post above
it, and an image would be a remote URL that every other reader's browser fetches.

A stray reload doesn't lose your text:

- The top box is saved to this browser's local storage and restored the next
  time you open the same post.
- Any box with text in it asks before the page closes.

The reply box only gets the close warning. It is one element that moves around
the thread and doesn't remember which comment it was answering, so restoring it
would leave a reply under nothing.

## What happens when you press Post

Your comment shows up in the thread right away, before the server has answered.
The blog and mood threads both do this. A bot check plus a spam check takes two
to four seconds, and the comment was going to be accepted anyway, so the form
doesn't make you wait for it.

For a moment the new row pulses and says *Publishing*. This isn't a review
queue:

- For an anonymous writer, the API waits up to eight seconds while a language
  model reads the comment.
- After three seconds the label changes to *Still checking — a few more
  seconds*, so a long wait never looks stuck.
- A verdict slower than eight seconds comes back formally held and goes public
  a moment later.

The page watches for that change and stops the pulse when it lands. It keeps
watching for about a minute and a half, which is longer than a slow verdict
takes.

The row only leaves a note when the wait really ends without a publish. The note
tells you that everyone else sees a thread without this row. This is rare, and
the page never shows it for the ordinary case.

Other outcomes:

| Outcome | What you see |
| --- | --- |
| Held until you confirm your address | The row says so, and so does the nudge under the box. Opening the link in your inbox sends it through the checks again, and it publishes if they pass. This is the one hold you can end yourself |
| Asked for an email (`NOMAIL`) | The email field gets focus. Anything you typed into the box while the request was out is kept after the returned draft |
| Refused | The page undoes the post (see below) and names the refusal |

When a write is refused, the page undoes it in order:

1. The row is removed.
2. Your text goes back into the box.
3. A reply goes back to being a reply to the comment it was under.

Then the alert names the refusal, because a rate limit and a dropped connection
need opposite next steps. See [When a comment is refused](#comment-errors).

## Who you are

There are three levels. The box moves you up them on its own, so nobody has to
create an account.

| Level | How you get there | What you get |
| --- | --- | --- |
| **Anonymous** | Nothing. A cookie appears when you first post or react | Posting, reacting, and seeing your own rows marked as yours |
| **Verified** | Click the link in the confirmation mail | A persistent avatar, your name remembered, editing and deleting, reply mail |
| **Signed in** | GitHub or Google. Built, but not offered yet | The same as verified, with that account's avatar |

Signed in isn't offered today. The comment box has no sign-in button, so every
reader with an identity here got it from the mail. It's in the table because the
data model and the routes already support it.

The confirmation mail is sent automatically with your first comment from a new
address. There is no separate signup step. Most comments publish right away,
confirmed or not, and verification only controls what *you* can do later. The
exception is a comment the checks flag (see [`NOMAIL`](#comment-error-nomail)).
If it came with an address, it waits, unseen, until you open the link.

The anonymous cookie is weak by design. It marks rows as yours so the thread
reads correctly. It never lets anyone edit or delete anything, because on a
shared machine the next person who sits down gets the same cookie.

## Edit and delete

You can edit or delete only a comment that a verified identity owns. Editing is
open for fifteen minutes after posting. A comment written without an email can
never be claimed, so it stays exactly as written. The site owner can remove it
on request.

Deleting has no time limit. If a published reply sits under the deleted comment,
the row stays as an empty placeholder so the thread keeps its shape.

## Pinned and closed threads

The owner can pin one comment per post. It leads the thread under a **Pinned**
label, whatever its date, and a new comment lands just below its thread.

The owner can also close one thread to replies. Its comment says **Replies
closed** where the Reply button was, and nothing in that thread offers one.
Everything already written stays, hearts still work, and the rest of the post
stays open. A reply box opened before the close is refused with `NOREPLY`.

A mood post's thread at `/mood/[id]` shows the same marks on comments written
on the web. Messages written in the Telegram group can't be pinned or closed,
and neither mark stops a reply written there.

Whether a post takes comments at all can change without a rebuild of the page.
So a thread that has just loaded may open or close its box, or appear or
disappear, a moment after the page does. Readers who have never commented see
these changes within about a minute and a half.

## Hearts

Each person can give one heart per thing: the post, and each comment. Hearts are
one-way by design, so you can't take one back. Reacting needs no name and no
address.

## Mail

The comment box sends two kinds of mail. Both are switchable.

| Mail | When it's sent | Notes |
| --- | --- | --- |
| **Confirm your address** | Once, automatically, on your first comment from an unrecognised address | Resend it from the same box or from [`/reader/confirm`](/reader/confirm) if the link has gone stale |
| **Someone replied** | Turned on when you confirm. The confirmation mail tells you this | Turn it off from the preferences link in any of them. You can also mute a single conversation |

The confirmation link signs in exactly one device (whichever opens it first) and
expires after 24 hours. Opening it again later confirms nothing and signs in
nobody, so a forwarded or quoted link can't be used to get into the account. To
sign in a device that was left out, request a fresh link. That's the whole fix.

<a id="comment-errors"></a>

## When a comment is refused

Every refusal shows one sentence that names your next step, plus a short code
in the corner of the alert. The code helps when the sentence isn't enough. It
survives translation, retelling and a photo of a screen, and it's the thing to
quote in a report. When there's more to explain than fits in the alert, the code
is a link to one of the sections below.

| Code | What happened | What to do |
| --- | --- | --- |
| `NET` | The request never left the browser | Reconnect and post again. The draft is safe |
| `RATE` | Too many writes too quickly | Wait. Retrying right away only makes it worse |
| `BOT` | The invisible human check couldn't decide | Answer the challenge that opens under the box |
| [`GONE`](#comment-error-gone) | The thread or the comment isn't there | Refresh |
| `THREAD` | The comment you're replying to is gone | Refresh the thread |
| [`CLOSED`](#comment-error-closed) | The claim on that comment ran out | Nothing to retry |
| `LOCKED` | The post has stopped taking comments | Nothing to retry |
| `NOREPLY` | Replies under that one comment are closed | Nothing to retry. The rest of the post is open |
| [`VERIFY`](#comment-error-verify) | The post only takes confirmed addresses | Confirm, then post |
| [`NOMAIL`](#comment-error-nomail) | This comment needs an address to confirm | Add one, post, then open the link |
| [`NAME`](#comment-error-name) | The name was refused | Pick another |
| [`EMAIL`](#comment-error-email) | The address was refused | Correct it, or leave it blank |
| `LONG` | Over 2000 characters | Trim it |
| `STALE` | The page sat open long enough to go stale | Refresh. The draft is saved |
| `INPUT` | A refusal the page has no name for | Refresh and try once more |
| `SERVER` | Something failed on the server side | Try again shortly |

A code is often followed by a number, like `RATE 429` or `STALE 400`. The
number is the HTTP status of the refusal, and it narrows a report to one route.
A code with no number means the request never reached a server.

<a id="comment-error-name"></a>

### That name won't work (`NAME`)

A display name must be 1–32 characters with no control characters. It also
can't be on a small reserved list: the names the site owner writes under. The
list is matched after folding lookalike letters, so a Cyrillic **а** or a Greek
**ο** in place of the Latin letter counts as the same name. Nothing else about a
name is filtered.

<a id="comment-error-email"></a>

### That address won't work (`EMAIL`)

The address must be real and deliverable. Some placeholder domains pass the
browser's own validation but are refused here:

- `example.com`
- `localhost`
- anything at `.test` or `.invalid`

That's the usual reason a well-formed address is rejected.

You can usually leave the field empty. An address gives you editing and reply
mail later. The one time you need it to be heard now is
[`NOMAIL`](#comment-error-nomail).

<a id="comment-error-verify"></a>

### This post takes confirmed addresses (`VERIFY`)

A few posts only accept comments from confirmed addresses. This is a refusal,
so nothing was stored and your draft is still in the box. It isn't a moderation
hold.

Open the confirmation link already in your inbox, or send a fresh one from
[`/reader/confirm`](/reader/confirm). Then post again in the same tab. A link
signs in one device and expires after 24 hours. A link from three weeks ago
won't work, and neither will one already used on another device. Asking for a
new one is free.

<a id="comment-error-nomail"></a>

### This comment needs an address (`NOMAIL`)

The request looked enough like automation that it can't go through without an
email address to confirm. Signals include:

- a data-centre network
- a browser without a graphics card
- several posts in a few minutes
- one browser writing under several names

You can also get it during a site-wide lockdown after a flood of comments, or
within 24 hours of this browser tripping a spam check. A verified reader
posting from their own browser is never asked. How the words were typed,
dictated or pasted never counts. Nothing was stored, and your draft is still
in the box.

Add an address and post again. The comment waits, unseen, until you open the
link in the confirmation mail. Then it goes through the usual checks and
appears. An agent without a mailbox gets no further, and a person gets through
with one click. Anyone who already gave an address gets the same treatment,
without the refusal first.

<a id="comment-error-closed"></a>

### The edit window has passed (`CLOSED`)

You can edit a comment for fifteen minutes after posting it, and only as the
verified identity that owns it. After that the comment is final, and a retry
will be refused again.

Two cases look like an expired window but aren't:

- A comment written with no address has no owner, so it was never editable.
- A signed-out browser no longer holds the identity that wrote the comment.
  Signing back in restores it.

Deleting has no time limit. If a comment needs to come down long after it went
up, the delete button still works. If the identity is gone for good,
[the owner can remove it](/docs/platform/privacy).

<a id="comment-error-gone"></a>

### That thread isn't available (`GONE`)

This means one of two things:

- The target no longer exists, for example a deleted comment or an unpublished
  post.
- The service that checks whether a post exists was briefly unreachable.

The alert can't tell these apart, so it says "not available right now" instead
of guessing. Refresh to find out: if the thread comes back, it was the second
case, and posting again will work. Your draft survives either way.
