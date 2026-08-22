# Executive Plan: Blog Comments & Reactions

Reader-facing comments and reactions on `/blog/[slug]`. Email magic link is the
primary identity, GitHub is the optional fast path, avatars come from Gravatar
through our own proxy, and every comment is either public or a private note to
the author.

This is a plan, not an implementation. Section "Open decisions" is the part that
needs an answer before Phase 1 starts.

## Relationship to the existing PRD

`.agents/tasks/prd-blog-comments-likes.md` already specifies this feature, and
it answers the identity question the opposite way: **anonymous comments**, name
plus optional private email, Turnstile only, likes de-duplicated by
`hash(IP + slug + salt)` plus a cookie, and post-moderation. Its non-goals
explicitly rule out reader accounts, sessions, and OAuth.

The brief this plan responds to — magic-link verification, GitHub sign-in,
Gravatar avatars, and a public/private split — is incompatible with that
decision, so this document supersedes the PRD's identity, moderation, and data
model. It should be moved to `docs/archive/` when this plan is approved.

What survives from it unchanged, and is folded in below: the contracts-first
sequencing, the Turnstile widget lifecycle reuse from `subscribe-panel.ts`, the
`/api/*` proxy discipline, the admin moderation surface, plaintext-only bodies
with a 2000-character cap, soft delete, and the e2e story.

Two things in it are stale and should not be copied: it says Astro v5 (the repo
is on v7), and it puts the migration in `../site-api/migrations`, which is the
`MOOD_DB` directory. Comment tables belong in `NOTIFY_DB`
(`scripts/sql/migrations/`), alongside `blog_analytics_events` and the
subscriber records this feature shares an email identity with.

Its "likes" keyed on `slug` also become reactions keyed on `post.id`, per
constraint 2 below.

## Objective

Give readers a way to react and reply without creating an account, without
handing a third party our reader list, and without adding a second admin login
system to the codebase.

## Constraints that shape the design

These came out of reading the existing code and are not negotiable-by-preference
— they are properties of the system as it stands today.

1. **`/blog/[slug]` is prerendered.** `astro.config.mjs` sets `output: 'static'`
   and the route uses `getStaticPaths`. Comments and reaction counts therefore
   cannot be server-rendered per request; the whole feature is client-fetched
   after hydration. This is a simplification, not a problem — it keeps the HTML
   cacheable and makes the public/private split trivially safe.
2. **Posts come from Ghost, keyed by slug for routing.** `PostRecord` already
   carries an immutable `id` plus `commentId` / `commentsEnabled` fields that
   are currently unwired. Comments key on `post.id`; `slug` only resolves the
   route, so renaming a post does not orphan its thread.
3. **The site/site-api boundary holds.** All storage, tokens, email, and
   moderation live in `site-api`. This repo gets UI, a client controller, and
   contract types. Same split as mood.
4. **Admin auth is deliberately single-tenant.** `docs/OAUTH-HUB.md` states
   "keep one human authority: the allow-listed GitHub login" and lists building
   a generic OAuth provider as a non-goal. Reader auth is a **separate** system:
   its own cookie, its own secret, its own middleware branch. It must never
   touch `admin_session` or `ADMIN_SESSION_SECRET`.
5. **The blog zone is flat and monochrome.** `docs/BLOG-DESIGN.md` allows the
   `hsl(var(--foreground) / α)` grey scale plus the `dai` / `dian` / `ji` blue
   ink set, forbids drop shadows and second hues, and fixes the measure at
   720px. The reference screenshot's pink heart is outside that palette (see
   Open decisions).
6. **Public interactive UI is vanilla, not React.** Mood and the subscribe panel
   are `.astro` markup plus a hand-written controller in `client/*.ts`. React is
   reserved for the admin portal and heavy home-page visuals.

## What already exists and gets reused

Nothing here needs inventing:

| Need | Existing implementation |
| --- | --- |
| Signed one-time token | `createNotifyToken` / `verifyNotifyToken` in `site-api` `src/features/notify/server/security.ts` — HMAC-SHA256 over a base64url payload with `action`, `exp`, optional `jti` |
| One-time-use token table | The `jti` PK + `token_hash` UNIQUE + `expires_at` + `consumed_at` shape from `0008_email_change_requests.sql` |
| Email delivery | Resend, via `notify/server/resend.ts` and `templates.ts` |
| Bot defence | `site-api` `src/lib/security/turnstile.ts` — `verifyTurnstileToken({ expectedAction })`. `/blog/[slug].astro` already receives `turnstileSiteKey` for the subscribe panel, so the client key is plumbed |
| Rate limiting | `withDurableRateLimit` from `src/lib/http/rate-limited.ts`, backed by `RateLimitDO`. Note the sibling `withRateLimit` is observability-only and does not block — a spam-prone write path needs the durable variant |
| Edge rate limits | `scripts/configure-cloudflare-rate-limits.ts`, applied with `bun run rate-limits:configure` |
| Avatar storage | The `BLOG_IMAGES` R2 bucket already exists and is bound |
| Owner approval UI | The Telegram `ops-bot` (`src/features/ops-bot/`) with inline-button callbacks |
| Image proxying | The signed static proxy at `src/pages/static/[...path].ts`, which already handles `youtube/<id>/avatar.jpg` |
| Self-serve deletion | `notify_delete_requests` / `notify_deletions` from `0009_record_deletion.sql` |
| Preferences surface | `/subscribe/manage`, rebuilt recently, gains a "my comments" section |

The mood comment UI is **not** reusable as a data layer — it is a read-only
mirror of Telegram with no write path — but its CSS, skeleton loading, avatar
initial-fallback, relative-date formatting, and `before`/`hasMore` cursor
pagination are the right visual and interaction reference to copy.

## Design

### Identity: the email address is the account

One table, `blog_readers`, primary-keyed on `email_hash` to match the existing
`notify_subscribers` convention. There is no separate identities table and no
join. OAuth is not a parallel identity — it is just a faster way to prove you
control an email address, and it writes the provider name and avatar onto the
same reader row.

The trade-off: one reader cannot hold two emails, and switching your GitHub
account's primary email makes you a new reader. For a personal blog that is the
right call, and promoting `blog_readers` to a `readers` + `reader_identities`
pair later is a contained migration. Building the join table now would be
speculative structure for a problem we do not have.

A random `reader_id` (ULID) is the **only** identifier ever sent to a browser.
The email and its hash never leave the worker.

Auto-linking rule: an OAuth sign-in adopts an existing reader row **only** when
the provider asserts the email is verified (`email_verified` on Google,
a verified primary email on GitHub). Otherwise it creates a distinct reader.
Skipping this check is the standard account-takeover hole in email-linked
identity, and it costs one boolean to close.

### Auth flow: hold the draft, then verify

The obvious flow — make people sign in before they can type — loses the comment
that motivated them to sign in. Instead:

1. Reader writes the comment, enters their email, solves Turnstile, submits.
2. `site-api` stores the comment with `status = 'pending_verification'` and
   issues a magic-link token carrying the comment's id.
3. Email arrives. Clicking the link hits `site-api`, which verifies the token,
   flips the comment to `published` (or `pending_review`, see Moderation),
   sets the reader session cookie, and 302s to
   `/blog/<slug>?c=<comment_id>#comment-<comment_id>`.
4. The client controller sees the `c` param, scrolls to the comment, and shows
   a confirmation.

The draft is never lost, it survives opening the link on a different device, and
unverified comments are invisible until the round trip completes — which is
spam protection for free. After step 3 the session cookie means every later
comment and reaction posts instantly with no second email.

### Session

This is the one place the design deliberately departs from notify. The
subscriber system is **entirely cookieless**: every privileged action carries a
fresh signed token in the URL, and `/subscribe/manage` even sets
`Referrer-Policy: no-referrer` so the token cannot leak. That is right for an
action a reader performs twice a year, and wrong for reacting to a post —
emailing a link per heart-click is absurd.

So readers get a cookie: `reader_session`, secret `COMMENTS_SESSION_SECRET`,
the same two-segment HMAC shape as the notify token but its own code path and
key. 90-day TTL, `HttpOnly; Secure; SameSite=Lax`.

Revocation reuses the existing generation-stamping trick rather than inventing
one. Notify tokens embed `subscriberCreatedAt` and re-check it against the live
row on every verify, so a token minted for a deleted-and-recreated subscriber
is rejected even though its signature and expiry are fine. Reader sessions
embed `readerCreatedAt` and do the same. That is zero new columns, zero KV, and
it closes the delete-then-recreate hole for free.

### Avatars: proxy them, never hotlink Gravatar

Gravatar is the requested source, but the browser must not talk to
`gravatar.com` directly, for three reasons:

- **Reachability.** `gravatar.com` is not dependably reachable from mainland
  China. For a Chinese-language blog, hotlinking means a broken avatar grid for
  a meaningful share of readers.
- **De-anonymisation.** A Gravatar URL is the hash of the commenter's email. Put
  those hashes in public HTML and anyone can brute-force common addresses
  against them to unmask who commented. Proxying keeps the hash server-side.
- **Policy surface.** Hotlinking leaks every reader's IP to Automattic and adds
  a third-party origin we would have to declare in the privacy policy.

So: `GET /static/avatar/<reader_id>?s=<size>` extends the existing signed static
proxy. `site-api` resolves `reader_id` to an avatar source in priority order —
OAuth avatar, then Gravatar computed from the server-held email hash, then a
generated fallback — fetches, and caches. The fallback is a deterministic SVG
identicon seeded from `reader_id` and drawn in the blog ink palette, so a reader
with no Gravatar still gets something on-brand rather than a grey blob.

### Public and private comments

`visibility` is `'public'` or `'private'`. A private comment is a note to the
author: visible to its writer and the owner, nobody else.

Because the page is static and comments are client-fetched, enforcing this is
straightforward and cache-safe:

- `GET /v2/blog/:postId/comments` returns public comments only. Anonymous,
  edge-cacheable, no `Vary: Cookie` needed.
- `GET /v2/blog/:postId/comments?scope=mine` returns the caller's own private
  threads, requires the session cookie, and responds `Cache-Control: no-store`.
  The client merges it into the rendered list in timestamp order.

Two request shapes means two cache keys, which is safer than one endpoint whose
body depends on a cookie. Private bodies are filtered in SQL, not in the client.

Replies inherit their parent's visibility, enforced server-side — a reply to a
private comment can never be published publicly. Private comments are excluded
from the public count. The reader's own private comments render with a "visible
only to you and the author" marker.

### Reactions

Matching the reference: a count pill, an avatar stack of recent reactors, a
`+N` overflow chip, and a sign-in prompt for anonymous visitors.

- One reaction type (❤️) at launch, but the table has an `emoji` column from
  day one, so adding more is data-only.
- `UNIQUE(target_type, target_id, reader_id, emoji)`; toggling is insert/delete.
- Counts come from `COUNT(*)`. At this traffic a denormalised counter is
  premature; add one when a query plan says so.
- The stack returns the five most recent reactors' `reader_id` and display name
  plus the total.
- Optimistic toggle in the client, reconciled on response.

Reactions require identity, as the reference implies. The cost is one magic
link for a first-time reader; after that it is one click forever. Reacting also
works on individual comments, same table, different `target_type`.

### Comment content

Plain text. No Markdown, no HTML, 2000 character cap. Rendering escapes
everything, converts newlines to `<br>`, and autolinks bare `http(s)` URLs.

Accepting Markdown means shipping a sanitiser into the worker bundle and owning
an XSS surface forever, in exchange for readers being able to bold a word. The
mood comment path already carries sanitisation complexity precisely because it
ingests foreign HTML; there is no reason to opt into that for content we
control the input of.

### Threading

One level. `parent_id` is nullable and must point at a root comment. Deeper
nesting is a recursive read, an unbounded indent on a 720px measure, and a
mobile layout problem, for a conversation volume that will not need it.

### Moderation

First comment from a new reader is held; once the owner approves it, the reader
is marked `trusted` and everything they write afterwards publishes immediately.
This is the lowest-burden model that still stops a spammer who has completed one
email round trip.

Approval happens in Telegram through the existing `ops-bot`: the notification
carries inline Approve / Reject / Ban buttons with the comment id in
`callback_data`. Note that `ops_pending_actions` has a 15-minute TTL, which is
wrong for moderation — the comment row itself is the durable state, and the
callback carries only the id.

Comments containing two or more links are held regardless of trust.

### Anti-spam layers

Cheapest first, so each layer only sees what the one before it let through:

1. Turnstile on the email-request step and on the first comment, with a
   dedicated `expectedAction` of `blog_comment_create`.
2. A mandatory email round trip before anything becomes visible.
3. `withDurableRateLimit`: 5 magic links per hour per IP, 10 comments per hour
   per reader, 30 reaction toggles per minute per reader.
4. First-comment review, then link-count holds (above).
5. A zone-level rule added to `scripts/configure-cloudflare-rate-limits.ts` so
   the flood never reaches the Worker.

**Trap worth stating explicitly**: `withRateLimit` — the helper that
`notify/subscribe.ts` uses — is observability-only. `checkRateLimit` returns
`allowed: true` unconditionally and consults no store. Copying the subscribe
route's shape verbatim would produce a write endpoint with no rate limiting at
all. Every comment and reaction write must use `withDurableRateLimit`, the
`RateLimitDO`-backed variant that `notify/manage/email.ts` uses.

Request bodies are capped at the existing `MAX_BODY_BYTES` (16 KiB).

### Notifications

- Owner, on every new comment, and always for private ones: Telegram plus email.
- Commenter, when someone replies: opt-in checkbox at submit time, stored as a
  `notify_replies` flag on the reader, with an unsubscribe token in the footer.

Reply notifications are transactional, not a newsletter, so they do not become a
fifth `NotifyChannel` — they stay a boolean on the reader row.

### Deletion and the privacy policy

`/subscribe/manage` gains a "my comments" section: list, delete one, delete
everything plus the reader record. It reuses the `notify_delete_requests`
receipt-ledger pattern.

This is not optional polish. `src/content/pages/privacy.md` currently states
that "the only information you provide directly is an email address, and only if
you choose to subscribe to mood notifications." Shipping comments makes that
sentence false. The policy update — new data categories, Gravatar as a
processor, comment retention, the deletion route — lands in the same PR as
Phase 1.

## Phases

1. **Reactions only.** Post-level ❤️, magic-link identity, session cookie,
   avatar proxy, reader table. No comments at all. This is the smallest slice
   that exercises the entire identity stack, and it is exactly the reference
   screenshot. Privacy policy update ships here.
2. **Public comments.** Flat list, plaintext, draft-hold submit, Telegram
   moderation, owner notifications.
3. **Private comments and replies.** `visibility`, the `scope=mine` overlay,
   one-level threading, reply notifications, `/subscribe/manage` integration.
4. **GitHub OAuth.** Reader-scoped, separate app and secrets from the admin app.

## Non-goals

- No Markdown or rich text in comments.
- No nesting past one reply level.
- No reader profile pages or public reader directory.
- No changes to `admin_session`, `ADMIN_SESSION_SECRET`, or any file under
  `features/admin/server/`.
- No use of Ghost's native comments.
- No server-rendering of comments; `/blog/[slug]` stays prerendered.
- No Google OAuth in the phased plan (see Open decisions).

## Task breakdown

**Contracts (this repo, canonical — sync to `site-api` afterwards)**

0. **Pre-requisite**: `packages/contracts/src/notify.ts` has already drifted —
   `site-api`'s copy carries `subscriberCreatedAt` on `RetryRecord` and this
   repo's does not. Reconcile before adding new modules, or the first
   `sync:contracts` run silently reverts it. (XS)
1. `packages/contracts/src/comments.ts`: `BlogComment`, `CommentVisibility`,
   `CommentStatus`, `ReactionSummary`, `ReactorChip`, plus `CommentCreateInput`
   / `CommentListResponse` style names — requests are `XxxInput`, responses are
   `XxxResult` or `XxxResponse`, per the existing convention. Types are plain
   TypeScript; there is no zod in the contract layer and request bodies are
   hand-validated in the route. Add the export entry to
   `packages/contracts/package.json`. (S)
2. Route constants in `packages/contracts/src/routes.ts`. (XS)

**`site-api`**

3. Migration `scripts/sql/migrations/0011_blog_comments.sql` against
   **`NOTIFY_DB`**, not `MOOD_DB`: `blog_readers`, `blog_reader_tokens`,
   `blog_comments`, `blog_reactions`, plus indexes. Follow the house style —
   `CREATE TABLE IF NOT EXISTS`, `CHECK` constraints for enums, TEXT
   timestamps, ids via `lower(hex(randomblob(n)))` with a type-tag prefix.
   Applying it is the owner's manual step
   (`wrangler d1 migrations apply NOTIFY_DB --remote`), not part of CI. (M)
4. `features/comments/server/security.ts`: token create/verify and session
   create/verify, built on the notify HMAC helpers with its own secret. Token
   TTLs mirror notify's: 24h to verify a comment, 1h for a management link. (M)
5. `features/comments/server/service.ts`: submit, verify, list, delete, toggle
   reaction, trust promotion. (L)
6. Route files under `src/pages/v2/blog/`, each `export const prerender = false`
   and each a thin caller of a factory in the feature module, matching the
   `createMoodCommentsRoute` pattern. CORS and rate limiting are applied
   per-route here, not in middleware. Note `/api/comments` is already taken by
   mood, so the new surface is namespaced under `/v2/blog/`. (M)
7. Middleware branch for `reader_session` on `/v2/blog/*`, separate from the
   admin branch. (S)
8. Avatar resolution and caching into `BLOG_IMAGES`, plus the identicon
   generator. (M)
9. Email templates in `templates.ts` using the existing `emailShell`:
   verify-and-publish, reply notification. (S)
10. `ops-bot` moderation command and callback handlers. (M)

**`site`**

11. `src/features/comments/` — `ui/ReactionBar.astro`, `ui/CommentsSection.astro`,
    `ui/CommentForm.astro`, `client/reactions-controller.ts`,
    `client/comments-controller.ts`, `server/contracts.ts`, `styles/`. (L)
12. Slot into `src/pages/blog/[slug].astro` after `<Prose>`, inside `<article>`,
    marked `data-pagefind-ignore`. (XS)
13. `src/pages/static/[...path].ts`: allow the `avatar/<reader_id>` family. (S)
14. `/subscribe/manage`: "my comments" section. (M)
15. `src/content/pages/privacy.md` update. (S)
16. `docs/README.md` index entry plus a new living `docs/COMMENTS.md`. (S)
17. Move `.agents/tasks/prd-blog-comments-likes.md` to `docs/archive/` once this
    plan is approved, so the superseded anonymous design stops reading as
    current intent. (XS)

## Files touched

`packages/contracts/src/{comments,routes}.ts`, `packages/contracts/package.json`,
`src/features/comments/**` (new), `src/pages/blog/[slug].astro`,
`src/pages/static/[...path].ts`, `src/pages/subscribe/manage.astro`,
`src/content/pages/privacy.md`, `docs/{README,COMMENTS}.md`,
`docs/E2E-BEHAVIOR-SCOPE.md`, `tests/e2e/blog-comments.pw.ts` (new).
In `site-api`: `scripts/sql/migrations/0011_blog_comments.sql`,
`src/features/comments/**` (new), `src/pages/v2/blog/**` (new),
`src/middleware.ts`, `src/features/ops-bot/{commands,webhook}.ts`,
`packages/contracts/**` (synced).

## Risks

- **Spam is the failure mode that kills comment systems.** Mitigated in layers:
  Turnstile, a mandatory email round trip, first-comment review, link-count
  holds, and per-IP and per-reader rate limits. If it still gets through, the
  fallback is flipping every reader to untrusted, which turns the system into a
  pure moderation queue without a deploy.
- **Private comments leaking into a public response** would be the worst bug
  here. Mitigated by filtering in SQL rather than the client, by separate
  endpoints with separate cache keys, and by an e2e test that asserts an
  anonymous fetch of a post with private comments returns none of their text.
- **Email deliverability**: a magic link that lands in spam reads as a broken
  site. Resend is already warmed for notify, and the submit UI must say
  "check your spam folder" explicitly rather than just "email sent".
- **Static pages mean a visible loading state** on every post. Mitigated by
  reserving the reaction bar's height so counts arriving does not shift layout,
  and by rendering the comment skeleton the way mood already does.
- **Reader auth drifting into admin auth.** Mitigated by separate secrets and
  files, and by the non-goal above being explicit.

## Rollout & verification

- Preview deploy with the feature behind `PUBLIC_COMMENTS_ENABLED`, off in
  production until Phase 1 is verified end to end.
- Manual pass on the full magic-link round trip, including opening the link on
  a different device from the one that submitted.
- E2E, added to `docs/E2E-BEHAVIOR-SCOPE.md` in the same change: reaction toggle
  optimism and reconciliation, anonymous sign-in prompt, comment submit to
  pending state, private-comment invisibility to anonymous readers, rate-limit
  and Turnstile failure states.
- Unit tests in `site-api` follow the house pattern: `bun:test` plus an
  in-memory `bun:sqlite` database wrapped in a hand-rolled D1 shim, with route
  handlers called directly as functions. Cover token create/verify, generation
  rejection, the plaintext renderer's escaping, and the visibility filter.
  Note the standing hazard in that pattern — test fixtures re-declare the
  schema by hand rather than reading the migration file, so the new tables must
  be kept in sync in both places.
- Lighthouse on `/blog/[slug]` before and after; the comment island must not
  regress LCP or introduce CLS.

## Open decisions

These need your answer; the rest of the plan is ready to execute.

1. **Reaction gating.** The reference requires sign-in to react. That is one
   magic link before a reader can express the lightest possible signal. The
   alternative is anonymous reactions keyed on a hashed IP, which raises the
   count but leaves the avatar stack — the good part — empty. My call: keep the
   gate, because the avatar stack is the feature.
2. **Moderation posture.** First-comment-held, or publish-immediately with a
   report button? Held is safer and, at this volume, costs you a few Telegram
   taps a week. My call: held.
3. **Providers.** GitHub is the audience fit and the one in the reference.
   Google means a second OAuth app, second set of secrets, and a consent screen
   to maintain. My call: GitHub only, revisit if readers ask.
4. **The heart's colour.** `BLOG-DESIGN.md` says monochrome greys plus the blue
   ink set, no second hue, no shadows. The reference is pink. Either the heart
   uses `dai` blue and the blog stays coherent, or the palette gains a
   documented exception for a single accent. My call: `dai`, with the filled
   state carrying the weight instead of the hue — but this is your design
   system, and a deliberate exception is legitimate if you want the warmth.
5. **Owner replies to private comments.** Always private, or can the owner
   promote a good private question into a public thread? Promotion is a nice
   feature and a consent problem. My call: always private in Phase 3; add
   "ask the sender to make this public" later if it comes up.
6. **Comment key.** `post.id` from Ghost, on the assumption Ghost never
   re-creates a post record on edit. Worth confirming against one real post
   before the migration lands, because getting this wrong orphans threads.

## Dependencies

- `site-api` owns tasks 3 through 10; this repo cannot ship Phase 1 without them.
- Contract types land here first and sync to `site-api` via `bun run sync:contracts`.
  Reconcile the existing `notify.ts` drift first (task 0).
- New secrets: `COMMENTS_SESSION_SECRET`, `COMMENTS_TOKEN_SECRET`, and later
  `GITHUB_READER_OAUTH_CLIENT_ID` / `_SECRET` — all distinct from the admin
  ones. Uploaded out of band via `bun run secrets:upload` in `site-api`.
- Applying the D1 migration is a manual owner step, not CI.
- This branch is cut from `feat/docs-site`; rebase onto `main` once that merges.
