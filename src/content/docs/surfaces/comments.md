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

## Who you are

Three grades, and the box climbs them on its own rather than asking anyone to
make an account.

| | How you get there | What it buys |
| --- | --- | --- |
| **Anonymous** | Nothing. A cookie appears when you first post or react | Posting, reacting, and seeing your own rows marked as yours |
| **Verified** | Click the link in the confirmation mail | A persistent avatar, your name remembered, editing and deleting, reply mail |
| **Signed in** | GitHub or Google | The same as verified, with that account's avatar |

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

> 这个名字被拒绝了：可能超过 32 个字符、含有控制字符，或者与站长本人的名字重合（包括用形近字母拼出来的变体）。换一个就好。

A display name is 1–32 characters with no control characters, and it cannot be
one of a small reserved list: the names the site owner writes under. That list
is matched after folding lookalike letters, so a Cyrillic **а** or a Greek
**ο** standing in for the Latin one is refused as the same name. Nothing else
about a name is filtered — it is a name, not a comment.

<a id="comment-error-email"></a>

### `EMAIL` — that address will not work

> 邮箱地址被拒绝了。留空也能发评论——邮箱只是为了以后能编辑、能收到回复提醒。

The address has to be a real, deliverable one. Placeholder domains that a
browser's own validation is perfectly happy with — `example.com`,
`localhost`, anything at `.test` or `.invalid` — are refused here, which is the
usual reason a well-formed address comes back rejected.

Leaving the field empty is always allowed. An address is what buys editing and
reply mail later; it is not a condition of being heard now.

<a id="comment-error-verify"></a>

### `VERIFY` — this post takes confirmed addresses

> 这篇文章只收已验证的邮箱。去收件箱点一下确认链接，回来再发一次；链接只能用一次，24 小时内有效。

A handful of posts are set to accept comments only from confirmed addresses.
This is a refusal, not a moderation hold — nothing was stored, and the draft is
still in the box.

Confirm the link already sitting in the inbox, or send a fresh one from
[`/reader/confirm`](/reader/confirm), then post again in the same tab. A link
signs in one device and expires after 24 hours, so the one from three weeks ago
will not work and neither will one already used elsewhere; asking for another
is free.

<a id="comment-error-closed"></a>

### `CLOSED` — the window has passed

> 可以修改的 15 分钟已经过去了，或者这条评论不属于当前登录的身份。这个不会因为重试而改变。

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

> 找不到这篇文章的评论区，或者这条评论已经被删掉了。刷新一下就知道是哪种。草稿不会丢。

Either the target genuinely no longer exists — a deleted comment, a post that
has been unpublished — or the service that answers "does this post exist" was
briefly unreachable. The alert cannot tell the two apart, which is why it says
"not available right now" rather than guessing.

Refreshing separates them: a thread that comes back was the second case, and
posting again will work. The draft survives either way.
