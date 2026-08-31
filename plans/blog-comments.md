# Executive Plan: Blog Comments, Reactions & Reader Identity (v2)

Reader-facing comments and reactions on `/blog/[slug]`. Participation is
**anonymous-first**: a name and an email post a comment immediately, through a
layered risk stack instead of a verification gate. Email verification exists
but is **lazy** — a link with a confirm button, sent after the comment is
already live, that promotes the address into the same reader table the
newsletter uses. Identity is an upgrade path, never a door charge.

This is a plan, not an implementation.

## What changed since v1

v1 of this document made the email round trip the only way in: comments were
invisible until a six-digit code or link completed, and reactions required a
session. That has been reversed after weighing it against the Twikoo-class
comment systems this blog's audience actually uses. The spam argument for
blocking verification did not survive contact with the economics: comment spam
chases SEO backlinks, and a client-rendered, nofollow comment list on a
personal blog yields none. Turnstile, heuristics, rate limits, and the
moderation model are sufficient; the verification gate was paying mostly in
lost first comments.

Superseded v1 decisions, recorded here so the reversal is explicit:

- **"No anonymous participation"** → reversed. Name + email post immediately.
- **"Verification mails carry a code and a link"** → replaced. No code. The
  mail carries one link to a confirm page with one button; the button's POST
  consumes the token, so mail-scanner prefetch (Apple MPP, corporate link
  checkers) cannot consume it. Verification no longer blocks anything, so the
  cross-device-draft problem the code solved no longer exists.
- **"Reactions require identity"** → reversed. Anyone can react; identity only
  decides whether your face appears in the stack.
- **"No fingerprinting"** → amended. Still no client-side canvas/WebGL
  fingerprinting. But server-derived risk signals (IP hash, UA, ASN, country)
  are now retained on comment rows for abuse forensics and analytics, and the
  privacy policy says so.
- **"OAuth deferred, `/v2/blog/auth/*` reserved"** → repositioned. OAuth
  becomes a **site-wide reader auth** under `/oauth/reader/*`, an accelerator
  that yields verified email + avatar + name in one click. Still phased after
  launch, but designed in from the start because the reader identity is now
  shared across comments, reactions, and subscriptions.
- **`blog_readers` as a comments-only table** → replaced. There is one reader
  table for the whole site, and it is the subscriber table grown up (see Data
  model). The drafted `0016_blog_comments.sql` in the `site-api`
  `blog-comments` worktree reflects v1 and must be reworked before it lands.

What did **not** change: the moderation design (one small general model, given
the post as context), the ops-bot notify-only posture, the avatar proxy, the
pink heart as the `xia` token, plaintext bodies with a 2000-char cap,
one-level threading, soft delete, the site/site-api boundary, and the
constraint list below.

## Objective

Give readers a way to react and reply with Twikoo-class friction — ten seconds
from impulse to published comment — without handing a third party the reader
list, without an open mail relay, and without turning moderation into a chore.
Grow a durable reader identity out of participation instead of demanding it up
front.

## Constraints that shape the design

Unchanged from v1; properties of the system, not preferences.

1. **`/blog/[slug]` is prerendered.** The whole feature is client-fetched after
   hydration. Keeps HTML cacheable and the public/private split trivially safe.
2. **Posts come from Ghost, keyed by slug for routing.** Comments key on
   `post.id`; renaming a post does not orphan its thread.
3. **The site/site-api boundary holds.** Storage, tokens, email, OAuth,
   moderation live in `site-api`. This repo gets UI, a client controller, and
   contract types.
4. **Admin auth stays single-tenant.** Reader auth is a separate system: own
   cookie, own secret, own OAuth apps, own middleware branch. It never touches
   `admin_session` or `ADMIN_SESSION_SECRET`.
5. **The blog zone is flat and monochrome**, plus the `dai`/`dian`/`ji` inks.
   The pink heart is the one documented exception (`xia`, reaction-only).
6. **Public interactive UI is vanilla, not React.** `.astro` markup plus a
   hand-written controller in `client/*.ts`.

## What already exists and gets reused

| Need | Existing implementation |
| --- | --- |
| Signed one-time token | `notify/server/security.ts` HMAC token, lifted to a shared `src/lib/email-challenge.ts` with a `purpose` field (unchanged from v1) |
| Email delivery | Resend via `notify/server/resend.ts` + `templates.ts` |
| Moderation | Akismet `comment-check` (`AKISMET_API_KEY`; `AKISMET_TEST_MODE=1` on staging so probes never train the classifier) |
| Bot defence | `site-api` `src/lib/security/turnstile.ts`; the blog page already receives `turnstileSiteKey` |
| Rate limiting | `withDurableRateLimit` (`RateLimitDO`). The sibling `withRateLimit` is observability-only and must not be used on write paths |
| Edge rate limits | `scripts/configure-cloudflare-rate-limits.ts` |
| Avatar storage | `BLOG_IMAGES` R2 bucket |
| Owner notifications | Telegram `ops-bot`, plain messages, no callback round trip |
| Image proxying | The signed static proxy at `src/pages/static/[...path].ts` |
| Self-serve deletion | `notify_delete_requests` receipt-ledger pattern |
| Preferences surface | `/subscribe/manage` gains a "my comments" section |
| Subscriber table | `notify_subscribers` — **becomes the reader table** (see Data model) |

## Design

### Identity: three grades, one table

A reader can stand at one of three grades, and every write records the highest
grade the browser holds:

| Grade | How you get it | What it buys |
| --- | --- | --- |
| **L0 anonymous session** | Set automatically on first comment or reaction: `reader_anon` cookie, random ULID, 1-year TTL, `HttpOnly; Secure; SameSite=Lax` | Edit/delete your own comments from this browser; reaction dedup; your typed name + email pre-filled next time (localStorage mirror) |
| **L1 verified email** | Click the link in the lazy-verification mail, press the button | A row in the reader table shared with the newsletter: manage all your comments from any browser via `/subscribe/manage`, opt into reply notifications, one-tap subscribe |
| **L2 OAuth** | GitHub or Google, one click (phase 3) | L1 instantly, plus provider avatar and display name pre-filled |

The compose box needs **a name; the email is optional**. Requiring the
address just manufactured fakes — and every fake fed the verification-mail
bounce exposure the suppression ledger exists to absorb. A supplied email is
what makes the avatar work (Gravatar chain below), pre-arms lazy
verification, and is the natural key that later unifies with the subscriber
list; an omitted one means the comment is owned by its anon session alone
(identicon avatar, no reply notifications, never claimable). The name is
the reader's own choice, never derived from the email's local part — deriving
it would publish an address fragment beside their words.

An unverified email is displayed at face value: the comment shows the name
typed and the avatar its address resolves to. Someone can type someone else's
address and wear their Gravatar — that is Twikoo's accepted risk too, it is
low-stakes on a personal blog, and moderation plus the owner's Telegram feed
is the kill switch. The one thing an unverified address can **never** do is
receive email (see Notifications) — that line is what keeps us from being an
open relay, and it is not negotiable.

### Compose: name required, email recommended, post immediately

1. The field is writable from first paint. Primary button always says Post.
2. First Post press with an empty identity row reveals it: name (required) +
   email (optional) under the draft. (An empty draft reveals nothing and
   focuses the field.)
3. A Post press with the email still empty arms a one-shot green
   recommendation box — benefit-framed (reply notifications, your own
   avatar), never an error state — and the next press submits as anonymous.
   A filled email submits on the first press. The second press is the
   "post without email" confirmation, so the friction only ever lands on
   the no-email path and carries information.
4. The submit carries: Turnstile token, honeypot, dwell-time stamp, body,
   name, email (when given). `site-api` runs the risk stack and moderation
   **inline** and answers `published` or `held`. The row appears in the
   thread immediately — real, not optimistic-pending.
5. The response sets the `reader_anon` cookie. Name and email mirror into
   `localStorage` (`buxx:reader`), so the identity row never has to be typed
   twice on this browser; on later visits the box footer shows the claimed
   identity ("以 {name} 的身份评论 · 换一个") instead of the input row.
6. If a supplied email is not yet a verified reader, the receipt area under the box
   shows one non-blocking line: verification nudge and, when applicable, the
   subscribe offer (see below). Dismissable; never modal; never gates anything.

Moderation now runs on every accepted submission rather than only on verified
ones. Nothing reaches Akismet without passing Turnstile, the honeypot, dwell
time, heuristics, and rate limits, and a comment-check call is cheap; if
someone burns effort defeating Turnstile, the shadow-ban list and edge rules
take over.

### Lazy verification: a link and a button

Fired at most once per address per cooldown window, on the first comment from
an unverified email (and again only on explicit "resend"):

1. Mail: "Confirm it's you on buxx.me" — one button-styled link to
   `/reader/confirm?token=…`.
2. The page (SSR, tiny) shows the address, what confirming enables, and one
   button. **GET renders; only the button's POST consumes.** Mail scanners and
   Apple MPP prefetch GETs, so a link whose GET consumed the token would
   silently verify half our readers and burn the other half's tokens.
3. The POST verifies the HMAC token (shared `email-challenge` module, purpose
   `reader_verify`), upserts the reader row with `confirmed_at`, sets the
   verified `reader_session` cookie (180-day rolling, `COMMENTS_SESSION_SECRET`,
   generation-stamped for revocation — unchanged from v1), and binds the
   browser's past anonymous comments (same email hash) to the reader row.
4. If the reader ticked "also subscribe" in the nudge, the same POST activates
   the subscription — one email, one click, both confirmations. Double opt-in
   is preserved because the confirm button **is** the opt-in.

No token table. The action is idempotent (confirm + optionally subscribe), so
single-use enforcement buys nothing; the consumption record is the reader
row's own `confirmed_at`. This keeps the v1 boundary rule: low-stakes address
proof is stateless; destructive actions keep the `jti` ledger and stay
link-only.

### Sessions and ownership: edit and delete

Two grades of ownership. *Visibility* ownership (`mine`, seeing your own
held rows) = the verified reader row matches, **or** the `reader_anon`
cookie matches the comment's `session_id`. *Mutation* ownership requires the
verified `reader_id` match alone — the anon cookie is a bearer key that a
shared or public machine hands to its next user, so it reads, never writes.
Rows a verified reader owns grow quiet edit/delete affordances, keyed off
the wire fields `editableUntil`/`deletable`, never off `mine`.

- **Edit**: verified owner only, within 15 minutes of posting
  (server-enforced). Edits re-run moderation and the row shows an "edited"
  marker. After 15 minutes, edit is delete-and-repost — a longer window plus
  replies underneath equals silently rewriting a conversation.
- **Delete**: verified owner only, any time. A deleted comment with
  replies becomes a tombstone row ("此评论已删除") so the thread keeps its
  shape; without replies it disappears. Soft delete either way (status +
  `deleted_at`), consistent with mood.
- **Verified readers** additionally manage everything — list, edit visibility,
  delete one or all — from the "my comments" section of `/subscribe/manage`,
  from any browser, via the existing token-link flow.

The anon cookie is the weakest credential in the system, and that is
acceptable because everything it can do is scoped to rows it created itself
from the same browser.

### Avatars: the Gravatar chain, proxied

The browser only ever sees `GET /static/avatar/<key>?s=<size>` on the existing
signed static proxy. Server-side resolution order, cached into `BLOG_IMAGES`:

1. **OAuth avatar** if the reader has one (L2).
2. **QQ avatar** if the address is `<digits>@qq.com`:
   `q1.qlogo.cn/g?b=qq&nk=<digits>&s=100`. Public, undocumented, stable for a
   decade, and the highest-hit-rate source for a Chinese readership.
3. **Gravatar** by SHA-256 of the lowercased address, `d=404`. Fetched via
   **Cravatar/WeAvatar-class mirrors first** (they are Gravatar-protocol
   compatible and reachable where `gravatar.com` is not), falling back to
   gravatar.com from the Worker, which sits outside the wall anyway.
4. **Generated fallback**: deterministic SVG identicon seeded from the key,
   drawn in the blog ink palette.

There is no public Google by-email avatar API; Google avatars only exist on
the OAuth path. `unavatar.io` is noted and rejected as a dependency: it is a
third party rate-limited aggregator doing what steps 2–3 already do.

Reasons for the proxy (unchanged from v1): mainland reachability,
de-anonymisation (email hashes must not enter public HTML), and keeping
third-party origins out of the privacy policy.

### Reactions: anonymous counts, identified faces

Anyone can react. No login, no prompt, no round trip — press the heart, it
fills, the count moves.

- Dedup key: `reader_id` when the browser holds one, else
  `hash(anon_session_id)`; unique per `(target_type, target_id, key, emoji)`.
  Toggling is insert/delete; counts are `COUNT(*)`.
- **The stack shows faces only for reactions that carry an identity with an
  avatar** (L1/L2, or L0 whose claimed email resolves); purely anonymous
  reactions fold into the `+N` chip. The stack stays honest and the number
  stays cheap.
- The decided posture on gating: reactions must not require OAuth. Google
  OAuth is unreachable from mainland China and GitHub is unreliable there; an
  OAuth-gated heart on a Chinese-language blog is a heart nobody presses.
  OAuth is the way to get your **face** in the stack with one click, never the
  way to get your reaction counted.
- One reaction type (❤️) at launch; `emoji` column from day one.
- Reactions work on posts and on individual comments — same table.

### The heart

Unchanged from v1. Pink ships as the fourth ink `xia` (霞), a documented
reaction-only accent with per-mode values (`#B84A6E` light / `#EE7FA8` dark)
through `blogPalette`, exposed as `--blog-xia`. `/docs/surfaces/blog` amends
its Don't list in the same PR: one named exception with a stated scope.
Unreacted state stays outline-in-faint, so an unloved post reads monochrome.

### Subscribe prompt: one email, one button

The compose box already collected an email, so the subscribe ask becomes a
zero-input follow-up instead of a separate form:

- After a successful post from an address that is not an active subscriber,
  the receipt line offers it: "订阅新文章邮件？" with a checkbox/soft button.
- Accepting does **not** send a second mail. It marks the intent, and the one
  lazy-verification mail's confirm button activates both (comment identity +
  subscription). One address, one email, one click, double opt-in intact.
- Already-verified readers who accept later get the standard subscribe flow
  minus the email step — their address is already proven.
- Frequency guard: the prompt shows at most once per session and never again
  after a dismissal (localStorage flag). A nag converts nobody.

This is the normalization the shared table exists for: subscribing stops being
a separate account system and becomes an attribute a reader can flip.

### OAuth: site-wide reader auth, phase 3

`/oauth/reader/<provider>` + callback in `site-api`, providers GitHub and
Google. Completing it upserts the reader row (`provider`, avatar, suggested
display name), marks the email verified (the provider proved it), and sets
the same `reader_session` cookie the email path sets. It is the same identity,
reached faster — not a parallel account system.

Site-wide by construction: nothing in the reader session or the reader table
is blog-scoped, so a future surface (mood reactions, whatever) reuses the
session and the `/v2/reader/*` endpoints as-is. Separate OAuth apps from
admin's, per constraint 4.

### Moderation: Akismet

Replaced the v1/v2 LLM-gateway call (task-guard alias, `comments:ai:config`
KV pair). Akismet is the purpose-built comment-spam service: it takes the
request-level signals a text-only model never saw (IP, user agent, referrer,
permalink) alongside the body and author fields, carries two decades of
cross-site reputation data, and answers in ~100-400ms instead of 2-3s — so
the submit round-trip usually publishes synchronously instead of riding the
held-then-upgrade continuation. Mapping: ham → `publish`; spam → `hold` (the
owner can rescue a false positive); the `X-akismet-pro-tip: discard` header
("blatant spam") → `reject`, so a spam wave never floods the queue. Fail
closed to `held` on any error, timeout, or non-verdict — a held comment is
visible to its writer with the "Held for review" note and to the owner in
the moderation queue. Toxicity that is not spam-shaped is out of Akismet's
scope on purpose: the owner reads every comment and can delete or
shadow-ban, which is the real enforcement layer on a personal blog.

The call happens **inline on submit** (there is no verification step to
defer it to), budget-guarded by the risk stack below — a flood never
reaches Akismet.

### The risk stack

Cheapest first; each layer only sees what the previous one passed. Layers 1–6
cost zero tokens.

1. **Edge**: zone rules in `configure-cloudflare-rate-limits.ts` so floods
   never reach the Worker.
2. **Turnstile**, `expectedAction: 'blog_comment_create'` (and
   `blog_reaction` for hearts), widget lifecycle reused from
   `subscribe-panel.ts`. If abuse ever escalates, Turnstile Enterprise's
   ephemeral IDs are the upgrade knob.
3. **Honeypot**: a visually-hidden `website` field; any value → silent drop.
4. **Dwell time**: the form embeds a signed server timestamp at first
   interaction; submits younger than ~3s → drop. Bots type fast.
5. **Heuristics** (pure functions, KV-configurable):
   - link count > 2 → hold (verified readers: > 6); any link on a
     first-time session → hold (skipped for verified readers)
   - keyword blocklist (KV, portal-editable)
   - disposable-email domain list (vendored from the public
     disposable-email-domains dataset; skipped for verified readers — they
     already proved the mailbox)
   - duplicate body hash across recent comments → drop
   - body length bounds (1–2000 chars, request body ≤ 16 KiB)
6. **Durable rate limits** (`withDurableRateLimit`): per IP, per anon session,
   per fingerprint — 10 comments/hour, 3/minute for anonymous writers;
   verified readers are judged at 60/hour, 10/minute and additionally
   budgeted per reader_id so a shared NAT can't starve them. 30 reaction
   toggles/minute per identity plus hashed-IP churn budgets (30/minute —
   waived for verified readers, whose identity can't churn — and 120/hour);
   1 verification mail per address per 10 minutes, 5/day, 8/30 days —
   and none at all to an address on the suppression ledger (bounced or
   complained, fed by the Resend webhook at `/webhooks/resend`) or on a
   domain DNS says cannot receive mail (DoH MX/A check, cached, fails open).
7. **Akismet moderation** (above).
8. **Shadow-ban list**: KV set keyed by email_hash / ip_hash / fingerprint;
   listed writers get `held` unconditionally and never know. Portal-managed.
9. ~~**Optional second opinion**: Akismet as a post-model check~~ — retired:
   Akismet was promoted to the primary moderation layer (step 7) and the
   LLM path it was meant to double-check is gone.

**Fingerprint**, defined precisely: `fp_hash = hash(ip /24 + UA + salt)` plus
retained raw signals `ip_hash`, `ua`, `country`, `asn` on each comment row.
Server-derived only — no canvas/WebGL/font client fingerprinting: it breaks on
the browsers this readership actually uses, decays as browsers close the
surfaces, and Turnstile is a better bot signal. The fingerprint is a **risk
and forensics** signal (rate limits, shadow-ban matching, spam-wave analysis),
never an identity input: it must not resurrect a deleted session or attribute
a comment.

### Analytics

Comment-surface events flow into the existing `blog_analytics_events`
pipeline with a `comment_` prefix: `comment_submitted`, `comment_published`,
`comment_held`, `comment_rejected`, `comment_edited`, `comment_deleted`,
`reaction_toggled`, `verify_sent`, `verify_confirmed`, `subscribe_prompted`,
`subscribe_accepted`. Payload: post id, risk-signal summary (country, asn,
fp_hash), moderation verdict + reason, and grade (L0/L1/L2) — enough to graph
the funnel (submit → publish rate, verify conversion, prompt conversion) and
to spot a spam wave by fingerprint clustering, without joining to the
anonymous page-view visitor id, which stays in its own namespace.

Retention for risk signals on comment rows: 90 days, then nulled by the
existing cron sweep pattern; the aggregate analytics events keep only hashes.

### Notifications

- **Owner**: every new comment via Telegram `ops-bot` — post title, excerpt,
  verdict + model note, deep link into the portal queue. Plain messages, no
  inline buttons, no `ops_pending_actions`. Held/rejected flagged loudly;
  published ones are FYI.
- **Commenter (reply notifications)**: opt-in checkbox, but the flag only
  **arms after verification**. An unverified address never receives reply
  mail — someone typing `victim@example.com` must never cause us to email a
  stranger. The nudge line explains it: "确认邮箱后，有人回复会通知你。"
  Transactional, not a newsletter — a boolean on the reader row, not a fifth
  `NotifyChannel`, with an unsubscribe token in the footer.

### Deletion and the privacy policy

`/subscribe/manage` gains "my comments": list, edit visibility, delete one,
delete everything plus the reader record, on the `notify_delete_requests`
receipt-ledger pattern.

The privacy policy update lands in the same PR as phase 1 and now declares:
comment records (name, email, body), the anon and reader session cookies,
server-derived risk signals (IP hash, UA, country, ASN) and their 90-day
retention, the avatar chain (QQ/Cravatar/Gravatar as processors), **Akismet
(Automattic) as a processor for comment text, author fields, IP, and user
agent**, and the deletion route. The v1 sentence still applies: the
processor line is the legally interesting one.

## Data model

All in `NOTIFY_DB` (`scripts/sql/migrations/` in `site-api`). The drafted
`0016_blog_comments.sql` in the site-api `blog-comments` worktree implements
v1 (pending_verification status, token table, comments-only reader table) and
gets reworked to this shape.

**`notify_subscribers` grows into the reader table** — physically keeping its
name for now (renaming a live prod table is risk with zero user value; code
and contracts say "reader"). Added columns:

```sql
ALTER TABLE notify_subscribers ADD COLUMN reader_id TEXT;        -- ULID, UNIQUE index, only id a browser sees
ALTER TABLE notify_subscribers ADD COLUMN display_name TEXT;
ALTER TABLE notify_subscribers ADD COLUMN provider TEXT;         -- 'email' | 'github' | 'google'
ALTER TABLE notify_subscribers ADD COLUMN avatar_source TEXT;
ALTER TABLE notify_subscribers ADD COLUMN avatar_key TEXT;
ALTER TABLE notify_subscribers ADD COLUMN notify_replies INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notify_subscribers ADD COLUMN banned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notify_subscribers ADD COLUMN last_seen_at TEXT;
```

Subscription state stays what it is (`status`, `delivery_mode`, `channels`…) —
a reader who has never subscribed simply has no active subscription. A row now
exists for anyone who **verified** an email (via link or OAuth); unverified
commenters live only on their comment rows.

**`blog_comments`** (new):

```sql
id TEXT PRIMARY KEY,              -- ULID
post_id TEXT NOT NULL,            -- Ghost post.id
parent_id TEXT,                   -- always a root comment (one-level threading)
reader_id TEXT,                   -- set when written (or later claimed) by a verified reader
session_id TEXT NOT NULL,         -- anon session ULID; ownership fallback
display_name TEXT NOT NULL,
email_hash TEXT NOT NULL,         -- avatar resolution + later claim binding
body TEXT NOT NULL,
status TEXT NOT NULL,             -- 'published' | 'held' | 'rejected' | 'deleted'
moderation_action / _reason / _note / _model / moderated_at,   -- as v1 draft
edited_at TEXT,
ip_hash TEXT, ua TEXT, country TEXT, asn INTEGER, fp_hash TEXT, -- risk signals, nulled after 90d
created_at, updated_at, deleted_at
```

Indexes: `(post_id, created_at) WHERE status='published'`,
`(reader_id, created_at)`, `(email_hash)`, `(status, created_at)`,
`(fp_hash, created_at)`.

Dropped from the v1 draft: `visibility` public/private (a private-comment
lane is v1's verified-identity feature; with anonymous posting it collapses
to "just don't publish it" — cut until someone asks), `pending_verification`
status, and the whole `blog_reader_tokens` table (verification is stateless
and idempotent now).

**`blog_reactions`** (new — v1 draft shape with one change):

```sql
id TEXT PRIMARY KEY,
target_type TEXT NOT NULL,        -- 'post' | 'comment'
target_id TEXT NOT NULL,
identity_key TEXT NOT NULL,       -- reader_id if held, else hash(anon session id)
reader_id TEXT,                   -- set only when identified; drives the face stack
emoji TEXT NOT NULL,
created_at TEXT NOT NULL,
UNIQUE (target_type, target_id, identity_key, emoji)
```

## API surface (v2 namespace, all implemented in site-api)

Reader-scoped, not blog-scoped. Documented in `/docs/api/*` per the coverage
guard; `@bunizao/contracts` types land in this repo first and sync over.

| Route | Purpose |
| --- | --- |
| `GET /v2/comments?post=<id>&before=<cursor>&limit=` | Public thread page: rows, counts, `hasMore` |
| `POST /v2/comments` | Create: body, name, email, parent, Turnstile + honeypot + dwell stamp. Sets `reader_anon`. Returns row + `published\|held` |
| `PATCH /v2/comments/:id` | Edit own (15-min window), re-moderates |
| `DELETE /v2/comments/:id` | Delete own (tombstone if replied-to) |
| `GET /v2/reactions?targets=post:<id>,comment:<id>…` | Counts + face stack + viewer state, batched |
| `POST /v2/reactions/toggle` | Toggle; anonymous allowed |
| `GET /v2/reader/me` | Session standing: grade, name, avatar key, subscription state |
| `POST /v2/reader/verify` | The confirm button's POST: consumes link token, upserts reader, sets session, optional subscribe activation |
| `POST /v2/reader/resend` | Re-send the verification mail (rate-limited) |
| `GET/POST /oauth/reader/<provider>`, `/oauth/reader/<provider>/callback` | Site-wide reader OAuth (phase 3) |

`/subscribe/manage` extends its existing token-authed surface with the "my
comments" list; no new namespace.

## Frontend states

The inventory the UI work builds against. Components stay `.astro` + one
vanilla controller (`src/features/comments/client/comments-controller.ts`).

**Compose box** — one container, states driven by `data-*` on the wrapper:

| State | Trigger | What shows |
| --- | --- | --- |
| `idle` | default | Field + "Markdown supported." + Post |
| `identity` | Post pressed, no stored identity | Name + email row unfolds; hint swaps to what the email is for |
| `claimed` | localStorage has name+email | Footer shows "以 {name} 评论 · 换一个"; no input row |
| `ready` | verified session (`/v2/reader/me`) | "Posting as {name}" with avatar |
| `submitting` | in flight | Button disabled, spinner-less (fast path), field readonly |
| `posted` | 201 published | Field clears; receipt line; row appears in thread |
| `held` | 201 held | Same, receipt says held; row appears with pending treatment |
| `nudge` | posted with unverified email | Receipt gains verify line + optional subscribe checkbox; dismissable |
| `error` | 4xx/5xx | Inline error under the box, draft preserved, retry |

**Comment row**: `normal`, `own` (highlight; edit/delete affordances only
when `editableUntil`/`deletable` say so — anonymous own rows get neither,
15-min edit window live-counted down), `editing` (inline textarea swap), `held` (writer
view only), `tombstone`, `by-author` badge, `reply-open` (travelling reply
box, exists), like `pressed/unpressed` with count.

**Thread**: `skeleton` (exists), `empty` (exists), `loaded`, `load-more`
(cursor button + loading), `error` (retry).

**Reaction bar**: `idle/reacted` (exists), burst (exists), face stack from
identified reactors only, `+N` chip.

**Receipt/nudge line**: `verify-pending`, `verify-resent`, `subscribed-offer`,
`subscribed-ok`, dismissed (localStorage).

**Confirm page** (`/reader/confirm`): `valid` (address + one button),
`confirmed` (and "back to the post" link), `expired/invalid` (offer resend),
`already-confirmed`.

## Phases

1. **Comments + reactions, anonymous path end-to-end.** Migration, risk stack,
   moderation, `POST/GET /v2/comments`, reactions, compose/thread/reaction UI
   on `/blog/[slug]`, owner Telegram, privacy policy, docs. Lazy-verify mail
   **sent** but the confirm page may 501 for a few days without hurting
   anything — nothing depends on it.
2. **Identity round trip.** Confirm page, `POST /v2/reader/verify`, reader
   sessions, subscribe prompt fold-in, "my comments" in `/subscribe/manage`,
   reply notifications (armed by verification).
3. **OAuth.** `/oauth/reader/github|google`, avatar/name inheritance, face
   stack enrichment.

Each phase ships alone; nothing in 1 waits on 2.

## Decisions taken (v2)

1. **Anonymous participation is in.** Name + email required; nothing blocks
   publication except the risk stack.
2. **Email verification is lazy and stateless** — link + confirm-button POST,
   no code, no token table; consuming record is the reader row.
3. **Unverified addresses never receive email.** Reply notifications arm only
   after verification.
4. **One reader table, shared with the newsletter** — `notify_subscribers`
   grown, not renamed; subscription is an attribute of a reader.
5. **Reactions are anonymous-capable**; identity only controls face-stack
   attribution. No OAuth gate anywhere on the read-or-react path.
6. **OAuth is site-wide reader auth** under `/oauth/reader/*`, phase 3, an
   accelerator not a door.
7. **Server-side risk signals are retained** (ip_hash, ua, country, asn,
   fp_hash; 90-day retention on rows), declared in the privacy policy. No
   client-side fingerprinting. Signals are never identity.
8. **Moderation**: Akismet comment-check, inline on submit, fail closed to
   `held`. (Replaced the v1/v2 general-model call.)
9. **ops-bot notifies only**; actions live in the portal. (Carried.)
10. **The heart is pink** via the `xia` token, reaction-only scope. (Carried.)
11. **Edit and delete are verified-reader-only** (the anon session cookie
    grants visibility, never mutation); edit window 15 minutes, delete any
    time, tombstone when replied-to.
12. **Avatar chain**: OAuth → QQ → Cravatar/Gravatar → generated identicon,
    always via our proxy; email hashes never in public HTML. (Carried, QQ
    added.)

## Open decisions

1. **Cravatar vs WeAvatar vs direct-gravatar-from-Worker** as the mirror of
   record — pick by measuring fetch reliability from the Worker at build
   time; the chain makes this swappable.
2. **Held-comment visibility to its anonymous writer across visits.** The anon
   cookie shows your own held row; cookie cleared = row invisible to you.
   Accept, or also key on email_hash shown only pre-verification? My call:
   accept — the edge case is rare and the fix leaks other people's held
   comments to whoever types their address.
3. **Rejected-row retention**: 30 days then hard delete (carried from v1),
   vs keeping a spam corpus. My call stands: 30 days.
4. ~~**Model default** for `comments:ai:config`~~ — retired with the LLM
   path; moderation is Akismet now (see "Moderation: Akismet").
5. **Comment key**: confirm Ghost `post.id` stability on one real post before
   the migration lands. (Carried.)

## Dependencies

- `site-api` owns the migration, risk stack, moderation, and all `/v2/*`
  routes; rework its `blog-comments` worktree draft (`0016_blog_comments.sql`)
  to the v2 shape before anything lands.
- Contract types land here first, sync via `bun run sync:contracts`.
- Docs: `/docs/api/*` pages for every route above (coverage guard),
  `/docs/surfaces/blog` amendment for `xia`, privacy policy update in the
  phase-1 PR.
