# Comment actor identity: many keys, one ban list, a portal that can act

Written 2026-09-12 from an owner request, after reactions shipped: "I can't
see a commenter's IP or email, I know nothing about them, and I can't judge
or act." The ask is a multi-dimensional identity behind every comment and
reaction, so a spam wave can be recognised across the keys it burns and
stopped from the portal, not from `wrangler kv key put`. Revised the same day
after a second ask — finer grain, collect more — which also settled decision
A (raw IP and typed email: yes): the behavioural signals, the forensic blob,
the insights endpoints and the source profile below come from that pass.

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

Two smaller things the code already has and throws away, which the
behavioural signals below pick up: the dwell token carries its mint time
(`DwellPayload.t`) and `verifyDwellToken` reduces it to a boolean; Turnstile's
siteverify answers with `challenge_ts` and `TurnstileVerifyResponse` does not
even declare the field. And migration 0018 rebuilt `blog_comments` and
re-created every index except `idx_blog_comments_fp_hash`, so the fingerprint
column has been unindexed since.

## Objective

Every write — comment create, reaction toggle — resolves the **actor**: the
full set of keys the request presents, the network and client signals behind
it, and what the request itself did (how long the box was open, how old the
Turnstile token was, whether the session is brand new). All of it goes on the
row. Rate limits and the ban list key on the keys. The portal can pivot on
any key, sees how many other rows share it, can open a profile of the source,
can ban or purge it, and has an insights view that shows where the traffic is
coming from and what the automatic pass is doing with it. The Telegram card
carries the lines that make phone triage possible.

## What to collect

### Keys — what a ban or a budget can hold onto

| Key | Source | What it costs a spammer to change | Comments today | Reactions today |
| --- | --- | --- | --- | --- |
| `reader_id` | verified session cookie | a mailbox or an OAuth account | ✓ | ✓ |
| `email_hash` | typed email, unverified | nothing (typed) | ✓ (nulled at 7d if unverified) | — |
| `session_id` | `__Host-reader_anon` cookie | nothing (clear cookie) | raw | HMAC only |
| `ip_hash` | `cf-connecting-ip`, keyed | a proxy hop | ✓ | — |
| `ip24_hash` | `ip/24` (v4) or `/64` (v6), keyed | a different provider block | — (folded into fp) | — |
| `fp_hash` | `H(ip/24 + UA)` | subnet **and** UA | ✓ | — |
| `asn` | `request.cf.asn` | a different ISP | ✓ | — |

### Network and client signals — what a human reads on the row

Own columns when the insights view groups by them; everything else in one
JSON `signals` column per row (`json_extract` still answers an ad-hoc
question; it just has no index, and nothing groups by these).

| Signal | Source | Column or blob | Why |
| --- | --- | --- | --- |
| `ip` | `cf-connecting-ip` | column | Readable, look-up-able, recognisable as a datacenter range. The ban key stays `ip_hash`. |
| `email` | the typed address | column, comments only | `xx@tempmail.io` instead of a hash. Verified readers are already plaintext in `notify_subscribers.email`; this is for the unverified, which are the spam. |
| `ua` | header | column (exists) | — |
| `browser`, `os` | `parseUa(ua)` from `analytics/server/blog-analytics.ts`, exported | columns | Held rate by browser family is a group-by; "Chrome 12x / Windows" beside "HeadlessChrome" is the point. |
| `country`, `city`, `asn`, `as_org` | `request.cf` | columns | Grouped by in insights; `blog_analytics_events` already records all four. |
| `colo` | `request.cf.colo` | blob | A Guangzhou IP served from `LAX` is a proxy. Shown beside the country; no derived flag. |
| `region`, `timezone` | `request.cf` | blob | Finer than country when the city is blank; timezone against `accept-language` is a cheap mismatch to eyeball. |
| `http_protocol`, `tls_version` | `request.cf` | blob | `HTTP/1.1` + `TLSv1.2` from a "Chrome 128" UA is a script. |
| `rtt_ms` | `request.cf.clientTcpRtt` | blob | ~1 ms means the client is in the datacenter next to the colo; a residential reader is tens of ms. |
| `accept_language`, `accept_encoding` | headers, ≤ 64 chars | blob | Headless frameworks send `en-US` or nothing; a real reader here sends `zh-CN,zh;q=0.9,en;q=0.8`. |
| `ch_ua`, `ch_platform`, `ch_mobile` | `sec-ch-ua*` client hints, ≤ 128 chars | blob | Chromium sends them unasked; unpatched headless Chrome sends `"HeadlessChrome"`. Safari and Firefox send none, which is itself information next to a Chrome UA. |
| `sec_fetch` | `sec-fetch-site/mode/dest` joined, e.g. `same-origin/cors/empty` | blob | A browser `fetch()` from the page carries exactly this; `curl` and `requests` carry nothing. |
| `referer`, `origin` | headers | blob | Already handed to Akismet, never kept. A write with no referer, or one from another origin, did not come from the page. |

Deliberately **not** collected: client-side fingerprinting (canvas, WebGL,
fonts — the original decision stands: breaks on this readership's browsers,
Turnstile is the better bot signal), `cf.latitude`/`longitude`/`postalCode`
(creepy and useless past the city), JA3/JA4 and bot scores
(`cf.botManagement` is Enterprise-only), Turnstile `ephemeral_id`
(Enterprise), and a second `H(asn + UA + language)` fingerprint (every China
Mobile iPhone collapses to one key; the profile page pivots on `asn` + `ua`
by hand instead).

### Behavioural signals — what the request did

All integers, all derived from things the write path already holds, all kept
past the 90-day sweep because none of them identifies anyone.

| Signal | Rows | Source | What it separates |
| --- | --- | --- | --- |
| `dwell_ms` | comments | `now - DwellPayload.t`; `verifyDwellToken` returns the age instead of a boolean | A human takes 20 s to minutes to write. A bot with one replayed token shows one fixed number, or 3 001 ms. The 3 s floor stays. |
| `turnstile_age_ms` | both | `now - challenge_ts`; `verifyTurnstileToken` surfaces `challengeTs` | Solved a second before the write is a widget; solved four minutes ago and held is a harvested token. |
| `session_new` | both | `anonSession.setCookie !== null` — this write minted the cookie | A wave where every write is from a brand-new session is cookie churn, visible without a join. |
| `auth` | reactions | `turnstile` / `pass` / `verified` | Which door the heart came through. A pass-only run from new sessions is a replay of one solve. |
| `link_count` | comments | `countLinks(body)`, already computed for the heuristic | The one body feature worth grouping by. The body itself is on the row. |

Rate limits are unchanged: comments on session/ip/fp/reader, reactions on
identity/ip. The ban list is the lever; none of the above becomes a budget
key, because a counter on `dwell_ms` is a rule a bot satisfies by waiting.

## Design

### One resolver, both write paths

`resolveActor(request, anonSession, readerRow, email, secret)` in a new
`site-api/src/features/comments/server/actor.ts`, returning:

```ts
interface Actor {
  /** Ban-list and rate-limit keys. Every value is a hash or an id, never raw. */
  keys: { readerId, emailHash, sessionId, ipHash, ip24Hash, fpHash, asn };
  /** The column signals. */
  signals: { ip, ua, browser, os, country, city, asn, asOrg, sessionNew };
  /** The blob, serialised once at insert. */
  detail: { colo, region, timezone, httpProtocol, tlsVersion, rttMs, acceptLanguage,
            acceptEncoding, chUa, chPlatform, chMobile, secFetch, referer, origin };
}
```

`comment-service.ts` and `toggle.ts` both call it once, ahead of their rate
limit step, and stop computing `ipHash`/`fpHash` inline. `risk-heuristics.ts`
keeps the hash primitives (`hashIp`, `truncateIpToSubnet`,
`computeFingerprintHash`); `actor.ts` is only the composition. The
behavioural fields are added at the call site, where the dwell and Turnstile
results are.

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
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  asn: number | null;
  asOrg: string | null;
  sessionNew: boolean;
  /** The blob, parsed. Null once the sweep has run. */
  detail: ActorDetail | null;
  /** Comments: dwellMs, turnstileAgeMs, linkCount. Reactions: turnstileAgeMs, auth. */
  behaviour: { dwellMs?: number; turnstileAgeMs?: number; linkCount?: number; auth?: 'turnstile' | 'pass' | 'verified' };
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

### Source profile: who is this

`GET /admin/sources/:type/:value` answers the whole question about one key
in one response, and `/dev/portal/comments/source/:type/:value` draws it.
Reached from every key handle on a queue row, from the reactions list, and
from the insights tables below.

```ts
interface AdminSourceProfile {
  key: { type, value };
  firstSeenAt: string; lastSeenAt: string;
  comments: { total: number; byStatus: Record<status, number>; rows: AdminCommentRecord[] };   // newest 50
  reactions: { total: number; byTarget: Array<{ targetType, targetId, postTitle, count }>; rows: AdminReactionRecord[] };
  /** How many distinct values of every *other* key this source has used. The
      spread is the churn: one fingerprint over 40 sessions and 12 IPs is a
      bot; one session over 3 IPs is a phone that changed networks. */
  spread: Record<'session' | 'ip' | 'ip24' | 'fp' | 'email' | 'asn' | 'ua', number>;
  /** Writes per hour over the source's last 7 days, comments and reactions
      separately — bursts are the shape of a script. */
  hourly: Array<{ hour: string; comments: number; reactions: number }>;
  behaviour: { dwellMsMedian: number | null; turnstileAgeMsMedian: number | null;
               newSessionShare: number; authMix: Record<'turnstile' | 'pass' | 'verified', number> };
  bans: AdminBan[];
}
```

Every count here is one `WHERE <key> = ?` over an indexed column, on two
tables; the spread is one `COUNT(DISTINCT …)` per other key.

### Insights: where it comes from and what the pass does with it

`GET /admin/comments/insights?window=7d|30d|90d` and
`GET /admin/reactions/insights?window=48h|7d`, drawn on a new
`/dev/portal/comments/insights` page (a segmented tab beside the queue). The
existing summary block (`byStatus`, `today`, `oldestHeldAt`, `reasons`,
`topPosts`, `daily`) stays on the queue page; these are the questions it
cannot answer. Every table carries a held rate, because a source is only
interesting relative to how the automatic pass treats it.

Comments:

| Table | Grouped by | Columns | The row that matters |
| --- | --- | --- | --- |
| Networks | `asn` + `as_org`, top 15 | comments, held, held rate, distinct sessions | `AS16509 AMAZON — 12 comments, 100% held` |
| Countries | `country`, top 15 | same | — |
| Subnets | `ip24_hash`, top 15, shown with one sample `ip` | same | one `/24` behind twenty names |
| Browsers | `browser` × `os`, top 15 | same | `HeadlessChrome` anywhere |
| Daily by status | day | published, held, rejected, deleted | the current chart is one total bar per day; split it |
| Dwell buckets | `< 5 s`, `5–15 s`, `15–60 s`, `1–5 min`, `5–30 min`, `> 30 min` | count, held rate per bucket | bots pile into the first bucket |
| Session age | `session_new` | share of writes from brand-new sessions, by day | a spam day reads near 100% |
| Email | with / without, and of those with: verified / unverified / disposable | count, held rate | verify conversion: comments carrying an address whose hash now matches a `confirmed_at` reader row |
| Overturns | from `blog_activity_log` | `comment.approve` after a hold (false positives), `comment.hide` after a publish (false negatives), per week | whether Akismet is earning its keep |
| Ban hits | from `blog_bans` | rows in the window matching each ban | a ban that never matched anything is dead weight |

Reactions:

| Table | Grouped by | Columns | The row that matters |
| --- | --- | --- | --- |
| Hourly | hour | reactions, distinct sessions, distinct `ip24` | sessions ≫ subnets in one hour is churn |
| Auth mix | `auth` | count, share, by day | a pass-only surge is one solve replayed |
| Targets | `target_type` + `target_id`, top 15 in window | reactions, distinct `ip24`, distinct `fp` | 500 hearts from 3 subnets is pumped |
| Networks, Countries, Subnets, Browsers | as for comments | reactions, distinct sessions | — |
| Session age | `session_new` | share of brand-new sessions by day | — |

Cost: admin-only page loads, each a handful of `GROUP BY`s over at most 90
days of rows on indexed columns — hundreds of comments, thousands of
reactions. Nothing here touches the public read path or the D1 read budget
that matters.

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

### Telegram card: three more lines, at most

```
🌐 CN · Guangzhou · AS4134 CHINANET · 113.xx.xx.xx · colo HKG
🧭 Chrome 128 / Windows · dwell 4s · new session · HTTP/1.1 · no referer
🔁 same source: 6 comments (5 held) · 140 reactions · 2h
```

The second line lists only what is there (`no referer` appears when the
header was absent; `new session` when the write minted the cookie); the third
appears only when any cluster count is non-zero. These are the lines that
turn "🟠 held" into a decision.

### Retention

| Column | Table | Retention |
| --- | --- | --- |
| `email` | comments | Unverified: nulled at 7 days alongside `email_hash` (existing sweep, extended). Verified: lives with the row — the address is already in `notify_subscribers`. |
| `ip`, `ua`, `city`, `as_org`, `country`, `asn`, `ip_hash`, `ip24_hash`, `fp_hash`, `signals` | both | Nulled at 90 days by `cleanupCommentRiskSignals` in `maintenance.ts`, extended to the new columns and to `blog_reactions`. |
| `browser`, `os` | both | Kept. Two coarse family names, not a person; what the 90-day-plus browser table groups by. |
| `session_new`, `dwell_ms`, `turnstile_age_ms`, `auth`, `link_count` | both | Kept. Integers about the request, not the requester. |
| `session_id` | both | Lives with the row (it is ownership, and already does on comments). |
| `blog_bans` | — | Hashes only. Rows live until lifted or `expires_at`. |

`country` and `asn` stay inside the 90-day sweep even though the insights
tables would like them longer: the published policy names them among the
erased signals, and a 90-day window is plenty for a personal blog.

### Data model

Migration `0025_comment_actor_signals.sql` in `site-api`:

```sql
-- Keys and column signals
ALTER TABLE blog_comments ADD COLUMN email TEXT;
ALTER TABLE blog_comments ADD COLUMN ip TEXT;
ALTER TABLE blog_comments ADD COLUMN ip24_hash TEXT;
ALTER TABLE blog_comments ADD COLUMN browser TEXT;
ALTER TABLE blog_comments ADD COLUMN os TEXT;
ALTER TABLE blog_comments ADD COLUMN city TEXT;
ALTER TABLE blog_comments ADD COLUMN as_org TEXT;
ALTER TABLE blog_comments ADD COLUMN signals TEXT;              -- JSON, see ActorDetail
-- Behaviour
ALTER TABLE blog_comments ADD COLUMN session_new INTEGER NOT NULL DEFAULT 0 CHECK (session_new IN (0, 1));
ALTER TABLE blog_comments ADD COLUMN dwell_ms INTEGER;
ALTER TABLE blog_comments ADD COLUMN turnstile_age_ms INTEGER;
ALTER TABLE blog_comments ADD COLUMN link_count INTEGER;

ALTER TABLE blog_reactions ADD COLUMN session_id TEXT;
ALTER TABLE blog_reactions ADD COLUMN ip TEXT;
ALTER TABLE blog_reactions ADD COLUMN ip_hash TEXT;
ALTER TABLE blog_reactions ADD COLUMN ip24_hash TEXT;
ALTER TABLE blog_reactions ADD COLUMN fp_hash TEXT;
ALTER TABLE blog_reactions ADD COLUMN ua TEXT;
ALTER TABLE blog_reactions ADD COLUMN browser TEXT;
ALTER TABLE blog_reactions ADD COLUMN os TEXT;
ALTER TABLE blog_reactions ADD COLUMN country TEXT;
ALTER TABLE blog_reactions ADD COLUMN city TEXT;
ALTER TABLE blog_reactions ADD COLUMN asn INTEGER;
ALTER TABLE blog_reactions ADD COLUMN as_org TEXT;
ALTER TABLE blog_reactions ADD COLUMN signals TEXT;
ALTER TABLE blog_reactions ADD COLUMN session_new INTEGER NOT NULL DEFAULT 0 CHECK (session_new IN (0, 1));
ALTER TABLE blog_reactions ADD COLUMN turnstile_age_ms INTEGER;
ALTER TABLE blog_reactions ADD COLUMN auth TEXT CHECK (auth IS NULL OR auth IN ('turnstile', 'pass', 'verified'));

-- Partial where the sweep nulls the column: a NULL never needs finding.
CREATE INDEX idx_blog_comments_ip_hash   ON blog_comments(ip_hash, created_at)   WHERE ip_hash IS NOT NULL;
CREATE INDEX idx_blog_comments_ip24_hash ON blog_comments(ip24_hash, created_at) WHERE ip24_hash IS NOT NULL;
CREATE INDEX idx_blog_comments_fp_hash   ON blog_comments(fp_hash, created_at)   WHERE fp_hash IS NOT NULL;  -- lost in 0018
CREATE INDEX idx_blog_comments_session   ON blog_comments(session_id, created_at);
CREATE INDEX idx_blog_comments_asn       ON blog_comments(asn, created_at)       WHERE asn IS NOT NULL;
CREATE INDEX idx_blog_reactions_ip_hash   ON blog_reactions(ip_hash, created_at)   WHERE ip_hash IS NOT NULL;
CREATE INDEX idx_blog_reactions_ip24_hash ON blog_reactions(ip24_hash, created_at) WHERE ip24_hash IS NOT NULL;
CREATE INDEX idx_blog_reactions_fp_hash   ON blog_reactions(fp_hash, created_at)   WHERE fp_hash IS NOT NULL;
CREATE INDEX idx_blog_reactions_session   ON blog_reactions(session_id, created_at) WHERE session_id IS NOT NULL;
CREATE INDEX idx_blog_reactions_asn       ON blog_reactions(asn, created_at)       WHERE asn IS NOT NULL;
CREATE INDEX idx_blog_reactions_created   ON blog_reactions(created_at);           -- the hourly series

CREATE TABLE blog_bans ( ... as above ... );
```

Existing reaction rows keep NULL signals; the sweep would have nulled them
within 90 days anyway. The insights tables treat NULL as "unknown" and show
it as its own row rather than dropping it.

## Owner decisions

**A. Store the raw IP and the typed email — resolved: yes** (owner,
2026-09-12, "collect more"). The one change that touches a published
sentence: `src/content/pages/privacy.md` promises "the hashed IP address"
among the 90-day signals; it becomes "the IP address", and the same clause
names the connection details (protocol, TLS version, round-trip time, client
hints, referer) as part of the erased set. The email clause already says an
unconfirmed address "is removed after 7 days", which is exactly the retention
above, so that sentence stands. The site's real posture was already
raw-with-bounded-retention: `ua` is plaintext under the same 90-day sweep,
and `blog_analytics_events` stores a raw `ip` per page view.

**B. Ban effect stays shadow-only (recommended: yes).** A `reject` effect
(`403` to the writer) is one column away if it is ever wanted; it is not
added now because nothing asks for it and a spammer who sees a refusal
rotates.

**C. Purge scope on ban (recommended: 90 days, both tables).** Matches the
window the signals exist for; a source older than that cannot be matched
anyway.

## Phases

1. **Contracts** (this repo): `AdminCommentActor`, `ActorDetail`,
   `AdminReactionRecord`, `AdminSourceProfile`, `AdminCommentInsights`,
   `AdminReactionInsights`, `AdminBan`, `AdminBanInput`, in
   `packages/contracts/src/admin.ts`. Bump, publish, raise the pin in
   `../site-api`.
2. **site-api**: migration 0025; `actor.ts`; export `parseUa`; `verifyDwellToken`
   returns the age, `verifyTurnstileToken` surfaces `challengeTs`; both write
   paths capture (columns, blob, behaviour) and ban-check; `blog_bans`
   replaces KV (`shadow-ban.ts` rewritten, one-off KV → D1 copy script);
   sweep extended to the new columns and to reactions; admin routes
   (`comments` actor block + pivot filter, `reactions` list, `sources/:type/:value`,
   `comments/insights`, `reactions/insights`, `bans` CRUD + purge); Telegram
   card lines and `comment:ban:<id>` callback. Apply 0025 to prod D1
   **before** the merge — main deploys within a minute of merging.
3. **Portal** (this repo): actor strip under each queue row (country · city ·
   ASN org · IP · email · browser/os · dwell · new-session, with the cluster
   line and a red `banned` chip per key that is listed; the blob behind a
   disclosure); every key handle links to the source profile; ban dialog;
   `/dev/portal/comments/insights`, `/dev/portal/comments/source/:type/:value`
   and `/dev/portal/comments/bans` pages; the reactions list reached from a
   profile.
4. **Docs**, same PR as each half: `docs/api/internal.md` (new admin routes,
   path + purpose + tier only), `docs/platform/comments.md` (stopping
   somebody: D1 ban list, both write paths, purge; the signals table),
   `docs/platform/privacy.md` and `src/content/pages/privacy.md` (decision
   A), the risk-stack and analytics sections of
   [blog-comments.md](blog-comments.md) and its decision 7.

## Verification

`bun run check` and unit suites in both repos; new unit coverage for
`resolveActor` (every header and `cf` field present and absent), the dwell
age and Turnstile `challengeTs` plumbing, the ban query, the reaction shadow
path (row not written, envelope identical, no pass cookie), the cluster
batching (ten queries for fifty rows), the profile's spread counts, each
insights table against a seeded fixture, the sweep on both tables and the
blob. `bun run check:docs-coverage` with `SITE_API_REPO` pointed at the
site-api checkout. In the browser: a held comment's row shows its actor strip
and a non-zero cluster after a second comment from the same session; the
profile page for that session shows two comments and a spread of one
fingerprint; banning it holds a third; a reaction from the banned session
returns `reacted: true` and moves no count; the insights page shows the
dwell bucket and the network row those writes landed in.
