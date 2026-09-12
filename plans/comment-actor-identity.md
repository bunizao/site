# Comment actor identity: many keys, one ban list, a portal that can act

Written 2026-09-12 from an owner request, after reactions shipped: "I can't
see a commenter's IP or email, I know nothing about them, and I can't judge
or act." The ask is a multi-dimensional identity behind every comment and
reaction, so a spam wave can be recognised across the keys it burns and
stopped from the portal, not from `wrangler kv key put`.

This is a plan, not an implementation. Code lands in `site-api` (migration,
write paths, ban check, admin routes, Telegram card) and here (contracts,
portal, docs, privacy text). It revises decision 7 of
[blog-comments.md](blog-comments.md) ("signals are never identity") and says
exactly how far.

## What is wrong today

Three gaps, each verified in the code at `site-api` `origin/main` (`db8e46f`).

**Reactions are the blind spot.** A `blog_reactions` row records
`identity_key` (an HMAC of the anonymous cookie), `reader_id` and the emoji.
Nothing else. No IP hash, no fingerprint, no user agent, no country. A heart
wave from cookie churn is bounded by the hashed-IP budget (30/min, 120/h in
`src/pages/v2/reactions/toggle.ts`) but leaves zero forensics afterwards.
Worse, it cannot be matched to the comments the same browser wrote:
`blog_comments.session_id` holds the raw cookie value, `blog_reactions.identity_key`
holds `HMAC(cookie)`, so the two tables have no common actor key. And the
shadow-ban list is never consulted on toggle — `isShadowBanned` is called
only in `comment-service.ts`.

**The portal shows nothing an owner can judge on.** `AdminCommentRecord` in
`comments-admin.ts` deliberately drops `ip_hash`, `fp_hash`, `ua`, `asn`,
`session_id` and `email_hash` ("answer no question a human is asking"). The
queue row shows a name, a two-letter country and a `verified` badge. The
question the owner is actually asking — *is this the same source as the
six held comments above it* — has no answer on the page. The Telegram card
(`notify-owner.ts`) shows even less: title, name, body, verdict.

**No lever from the portal.** Shadow ban is a KV key written by hand
(`comments:shadowban:<hash>`, matched on email/IP/fingerprint hash, comments
only). Reader ban is `notify_subscribers.banned`, a column with no UI. The
portal's three verdicts act on one row at a time; nothing acts on a source.

One more detail that matters for the queries below: migration 0018 rebuilt
`blog_comments` and re-created every index except `idx_blog_comments_fp_hash`.
The fingerprint column has been unindexed since.

## Objective

Every write — comment create, reaction toggle — resolves the **actor**: the
full set of keys the request presents. All of them go on the row. Rate limits
and the ban list key on each. The portal can pivot on any of them, sees how
many other rows share each key, and can ban or purge by key. The Telegram card
carries the one line that makes the phone triage possible.

## The dimensions

| Key | Source | What it costs a spammer to change | Comments today | Reactions today |
| --- | --- | --- | --- | --- |
| `reader_id` | verified session cookie | a mailbox or an OAuth account | ✓ | ✓ |
| `email_hash` | typed email, unverified | nothing (typed) | ✓ (nulled at 7d if unverified) | — |
| `session_id` | `__Host-reader_anon` cookie | nothing (clear cookie) | raw | HMAC only |
| `ip_hash` | `cf-connecting-ip`, keyed | a proxy hop | ✓ | — |
| `ip24_hash` | `ip/24` (v4) or `/64` (v6), keyed | a different provider block | — (folded into fp) | — |
| `fp_hash` | `H(ip/24 + UA)` | subnet **and** UA | ✓ | — |
| `asn` | `request.cf.asn` | a different ISP | ✓ | — |
| `country` | `request.cf.country` | — | ✓ | — |
| `ua` | header, plaintext | trivial, rarely bothered with | ✓ | — |

New, all server-derived, all available on every Cloudflare plan:

| Key | Source | Why |
| --- | --- | --- |
| `ip` | `cf-connecting-ip`, plaintext | So the owner can read it, look it up, and recognise a datacenter range. The rate-limit and ban key stays `ip_hash`. **Owner decision A below.** |
| `email` | the typed address, plaintext | So the owner can see `xx@tempmail.io` instead of a hash. Verified readers are already plaintext in `notify_subscribers.email`; this column exists for the unverified ones, which are the spam. **Owner decision A.** |
| `ip24_hash` | as above | A pure subnet key, so a `/24` can be banned regardless of UA. |
| `city`, `as_org` | `request.cf.city`, `request.cf.asOrganization` | For the human reading the row. `blog_analytics_events` already records both for page views. |
| `accept_language` | header, first 64 chars | A cheap, stable bot tell: headless frameworks send `en-US` or nothing; a real reader here sends `zh-CN,zh;q=0.9,en;q=0.8`. Pivot and display only. |

Deliberately **not** added: client-side fingerprinting (canvas, WebGL, fonts
— the original decision stands: breaks on this readership's browsers,
Turnstile is the better bot signal), JA3/JA4 and bot scores (`cf.botManagement`
is Enterprise-only), Turnstile ephemeral IDs (Enterprise), a second
`H(asn + UA + language)` fingerprint (every China Mobile iPhone collapses to
one key; too coarse to key anything on, and the portal can already pivot on
`asn` + `ua` by hand).

Reactions get the same set as comments, minus `email`/`email_hash` (a
reaction has no email field) plus `session_id` raw, so the two tables finally
share one actor key.

## Design

### One resolver, both write paths

`resolveActor(request, anonSession, readerRow, email, secret)` in a new
`site-api/src/features/comments/server/actor.ts`, returning:

```ts
interface Actor {
  /** Ban-list and rate-limit keys. Every value is a hash or an id, never raw. */
  keys: { readerId, emailHash, sessionId, ipHash, ip24Hash, fpHash, asn };
  /** What goes on the row. */
  signals: { ip, ua, country, city, asn, asOrg, acceptLanguage };
}
```

`comment-service.ts` and `toggle.ts` both call it once, ahead of their rate
limit step, and stop computing `ipHash`/`fpHash` inline. `risk-heuristics.ts`
keeps the hash primitives (`hashIp`, `truncateIpToSubnet`,
`computeFingerprintHash`); `actor.ts` is only the composition.

### The ban list moves to D1

```sql
CREATE TABLE blog_bans (
  key_type   TEXT NOT NULL CHECK (key_type IN ('email', 'session', 'ip', 'ip24', 'fp', 'asn')),
  key_value  TEXT NOT NULL,           -- the hash (or the ASN number as text); never raw
  note       TEXT,                    -- one human line, from the owner
  source     TEXT NOT NULL CHECK (source IN ('portal', 'telegram', 'script')),
  created_at TEXT NOT NULL,
  expires_at TEXT,                    -- NULL = until lifted
  PRIMARY KEY (key_type, key_value)
);
```

One indexed query per write:

```sql
SELECT key_type FROM blog_bans
 WHERE (key_type, key_value) IN ((?,?),(?,?),...)
   AND (expires_at IS NULL OR expires_at > ?)
```

Effect is **shadow** in both paths, and only shadow — a hard refusal tells
the source to rotate, a silent one lets it keep spending on a dead channel:

- comment create: `held`, note `Shadow-banned writer.` — unchanged behaviour,
  just a different store and more keys.
- reaction toggle: answer the ordinary success envelope from
  `summaryForEmoji` with `reacted: true` and the count unchanged, write no
  row, issue no reader pass.

Why D1 over the KV it replaces: one query instead of six eventually-consistent
reads; the list can be **listed**, which the portal needs; `expires_at` is a
column instead of a KV TTL the owner cannot see. The existing
`comments:shadowban:*` keys are copied over once by
`scripts/migrate-shadowban-to-d1.ts` and the KV path is deleted, not kept as a
fallback.

`notify_subscribers.banned` stays what it is: the lever that revokes an
account (session refused, hearts dropped from counts, mail stopped). Banning
a verified reader's comment by `email` key already holds their future
comments; the portal's ban dialog offers "revoke account" as one extra
checkbox on verified rows, writing that column.

### Admin read model: the actor block and its cluster

`AdminCommentRecord` gains:

```ts
actor: {
  readerId: string | null;
  email: string | null;            // plaintext when the row still holds it
  ip: string | null;               // plaintext while inside the 90-day window
  ua: string | null;
  country: string | null;
  city: string | null;
  asn: number | null;
  asOrg: string | null;
  acceptLanguage: string | null;
  /** Short handles (first 8 hex) so two rows can be eyeballed as the same
      source, and the full value the pivot links carry. */
  keys: { session: string; ip: string | null; ip24: string | null; fp: string | null; email: string | null };
  /** Which of this row's keys are on the ban list right now. */
  banned: Array<'email' | 'session' | 'ip' | 'ip24' | 'fp' | 'asn'>;
  /** Other rows sharing each key in the last 90 days, excluding this one. */
  cluster: Record<'session' | 'ip' | 'ip24' | 'fp' | 'email', { comments: number; held: number; reactions: number }>;
}
```

`cluster` is the multi-dimensional judgement: "same fingerprint — 9 comments,
8 held, 140 reactions in two hours" is the whole tell, and it is one line.
Computed per page, not per row: for the 50 rows on the page, collect each
dimension's distinct values and run one `GROUP BY` per dimension per table
(`WHERE fp_hash IN (...) GROUP BY fp_hash`), so a page costs at most ten
indexed queries regardless of row count. Needs the indexes below.

Pivot: `GET /admin/comments?key=fp&value=<hash>` filters the queue by one
key, and `GET /admin/reactions?key=…&value=…` lists that key's reactions
(target, emoji, when, the same actor block minus email). The reactions list
does not exist today and is the smallest thing that makes a heart wave
visible; it is a list, not a dashboard.

### Actions by source

`POST /admin/bans` `{ keys: Array<{type, value}>, note, expiresAt?, purge?: boolean }`
— bans every key in one write; with `purge`, also soft-deletes that source's
comments (`status='deleted'`, note `Purged with ban.`) and deletes its reaction
rows from the last 90 days, each logged to `blog_activity_log` as
`comment.delete` / `reaction.remove` with `actor='owner'`.
`DELETE /admin/bans/:type/:value` lifts one. `GET /admin/bans` lists them
with a hit count (rows in the last 90 days matching each key), so a ban that
never matched anything is visible as dead weight.

The portal's ban dialog on a comment row pre-ticks `email` (if any), `ip`
and `fp`, leaves `ip24`, `session`, `asn` unticked (each one is a wider net),
and offers purge. The Telegram held/rejected card gains a `🚫 Ban source`
button (`comment:ban:<id>`) that applies exactly the pre-ticked set with
no purge — one tap at the bus stop, the wider decisions on the laptop.

### Telegram card: one more line

```
🌐 CN · Guangzhou · AS4134 CHINANET · 113.xx.xx.xx
🔁 same source: 6 comments (5 held) · 140 reactions · 2h
```

The second line appears only when any cluster count is non-zero. This is
the line that turns "🟠 held" into a decision.

### Rate limits

Comments: unchanged (session, ip, fp, reader). Reactions: unchanged
(identity, ip). The ban list is the new lever; adding `fp` to the reaction
budget would only help against a spammer rotating IPs inside one `/24` with
one UA, which the ban on `fp` or `ip24` handles better than a counter.

### Retention

| Column | Table | Retention |
| --- | --- | --- |
| `email` | comments | Unverified: nulled at 7 days alongside `email_hash` (existing sweep, extended). Verified: lives with the row — the address is already in `notify_subscribers`. |
| `ip`, `ua`, `city`, `as_org`, `accept_language`, `country`, `asn`, `ip_hash`, `ip24_hash`, `fp_hash` | both | Nulled at 90 days by `cleanupCommentRiskSignals` in `maintenance.ts`, extended to the new columns and to `blog_reactions`. |
| `session_id` | both | Lives with the row (it is ownership, and already does on comments). |
| `blog_bans` | — | Hashes only. Rows live until lifted or `expires_at`. |

### Data model

Migration `0025_comment_actor_signals.sql` in `site-api`:

```sql
ALTER TABLE blog_comments ADD COLUMN email TEXT;
ALTER TABLE blog_comments ADD COLUMN ip TEXT;
ALTER TABLE blog_comments ADD COLUMN ip24_hash TEXT;
ALTER TABLE blog_comments ADD COLUMN city TEXT;
ALTER TABLE blog_comments ADD COLUMN as_org TEXT;
ALTER TABLE blog_comments ADD COLUMN accept_language TEXT;

ALTER TABLE blog_reactions ADD COLUMN session_id TEXT;
ALTER TABLE blog_reactions ADD COLUMN ip TEXT;
ALTER TABLE blog_reactions ADD COLUMN ip_hash TEXT;
ALTER TABLE blog_reactions ADD COLUMN ip24_hash TEXT;
ALTER TABLE blog_reactions ADD COLUMN fp_hash TEXT;
ALTER TABLE blog_reactions ADD COLUMN ua TEXT;
ALTER TABLE blog_reactions ADD COLUMN country TEXT;
ALTER TABLE blog_reactions ADD COLUMN city TEXT;
ALTER TABLE blog_reactions ADD COLUMN asn INTEGER;
ALTER TABLE blog_reactions ADD COLUMN as_org TEXT;
ALTER TABLE blog_reactions ADD COLUMN accept_language TEXT;

-- Partial: the sweep nulls these, and a NULL never needs finding.
CREATE INDEX idx_blog_comments_ip_hash   ON blog_comments(ip_hash, created_at)   WHERE ip_hash IS NOT NULL;
CREATE INDEX idx_blog_comments_ip24_hash ON blog_comments(ip24_hash, created_at) WHERE ip24_hash IS NOT NULL;
CREATE INDEX idx_blog_comments_fp_hash   ON blog_comments(fp_hash, created_at)   WHERE fp_hash IS NOT NULL;  -- lost in 0018
CREATE INDEX idx_blog_comments_session   ON blog_comments(session_id, created_at);
CREATE INDEX idx_blog_reactions_ip_hash   ON blog_reactions(ip_hash, created_at)   WHERE ip_hash IS NOT NULL;
CREATE INDEX idx_blog_reactions_ip24_hash ON blog_reactions(ip24_hash, created_at) WHERE ip24_hash IS NOT NULL;
CREATE INDEX idx_blog_reactions_fp_hash   ON blog_reactions(fp_hash, created_at)   WHERE fp_hash IS NOT NULL;
CREATE INDEX idx_blog_reactions_session   ON blog_reactions(session_id, created_at) WHERE session_id IS NOT NULL;

CREATE TABLE blog_bans ( ... as above ... );
```

Existing reaction rows keep NULL signals; the sweep would have nulled them
within 90 days anyway.

## Owner decisions

**A. Store the raw IP and the typed email (recommended: yes).** This is the
one change that touches a published sentence. `src/content/pages/privacy.md`
promises "the hashed IP address" among the 90-day signals; it becomes "the IP
address". The email clause already says an unconfirmed address "is removed
after 7 days", which is exactly the retention above, so that sentence stands.
The site's real posture is already raw-with-bounded-retention: `ua` is
plaintext under the same 90-day sweep, and `blog_analytics_events` stores a
raw `ip` per page view. Saying no keeps hashes everywhere; the portal then
shows 8-character handles that can be matched but not read or looked up, and
`email` is dropped from the column list. Everything else in this plan is
unaffected.

**B. Ban effect stays shadow-only (recommended: yes).** A `reject` effect
(`403` to the writer) is one column away if it is ever wanted; it is not
added now because nothing asks for it and a spammer who sees a refusal
rotates.

**C. Purge scope on ban (recommended: 90 days, both tables).** Matches the
window the signals exist for; a source older than that cannot be matched
anyway.

## Phases

1. **Contracts** (this repo): `AdminCommentActor`, `AdminBan`,
   `AdminBanInput`, the reactions-list shapes, in `packages/contracts/src/admin.ts`.
   Bump, publish, raise the pin in `../site-api`.
2. **site-api**: migration 0025; `actor.ts`; both write paths capture and
   ban-check; `blog_bans` replaces KV (`shadow-ban.ts` rewritten, one-off
   KV → D1 copy script); sweep extended; admin routes (`comments` actor block
   + pivot filter, `reactions` list, `bans` CRUD + purge); Telegram card line
   and `comment:ban:<id>` callback. Apply 0025 to prod D1 **before** the merge
   — main deploys within a minute of merging.
3. **Portal** (this repo): actor strip under each queue row (country · city ·
   ASN org · IP · email · UA, with the cluster line and a red `banned` chip
   per key that is listed); pivot links on every key; ban dialog; a `Bans`
   page under `/dev/portal/comments/bans`; the reactions list reached from a
   pivot.
4. **Docs**, same PR as each half: `docs/api/internal.md` (new admin routes,
   path + purpose + tier only), `docs/platform/comments.md` (stopping
   somebody: D1 ban list, both write paths, purge), `docs/platform/privacy.md`
   and `src/content/pages/privacy.md` (decision A), the risk-stack section of
   [blog-comments.md](blog-comments.md) and its decision 7.

## Verification

`bun run check` and unit suites in both repos; new unit coverage for
`resolveActor`, the ban query, the reaction shadow path (row not written,
envelope identical), the cluster batching (ten queries for fifty rows), the
sweep on both tables. `bun run check:docs-coverage` with `SITE_API_REPO`
pointed at the site-api checkout. In the browser: a held comment's row shows
its actor strip and a non-zero cluster after a second comment from the same
session; banning it holds a third; a reaction from the banned session
returns `reacted: true` and moves no count.
