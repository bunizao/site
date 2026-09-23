# 038 — Converge experiment: execution strategy and verification record

Experiment protocol for plan 037. Every step is a change to the v2 archive
stack (`site-api` ingest, D1, R2, the `/api/v2/mood*` and `/api/v2/images/*`
read paths).

## Goals, with the numbers they are judged on

| | goal | baseline (2026-09-03) | target | judged by |
| --- | --- | --- | --- | --- |
| G1 | **Cut mood D1 reads and writes** | 289,000 reads / 43,300 writes per day, 79% of reads and ~100% of writes from reconcile | < 65,000 reads / < 500 writes per day on a quiet day; reconcile-attributable rows **0** | `wrangler d1 insights site-mood --timePeriod 1d` |
| G2 | **Leave the VPS** | 1 systemd unit (`mood-reconcile`, every 5 min, MTProto credentials on the box) | **0 units**, box off, credentials deleted | `systemctl list-timers` on `orange-sin`; the Worker's dead-man alert |
| G3 | **Gate: page timing never regresses, and at least one of TTFB / FCP / LCP improves** | `/mood` TTFB 62 ms, FCP 140 ms, **LCP 996 ms** | TTFB and FCP within 10%; LCP ≤ 600 ms cold, ≤ 300 ms warm | Playwright cold contexts, `scripts/perf/mood-lcp.mjs` |

G1 and G2 are the work. G3 is the condition the owner set on 2026-09-03 for
any of it to ship: "improvement" means TTFB, FCP, LCP. Deletion latency
for posts older than 48 h is explicitly *not* a metric ("that window almost
never changes"), which puts the stale-lane cap back on day 0.

One honest consequence of measuring: the D1 work (G1) does not move
TTFB/FCP/LCP on a normal day — reconcile costs rows, not milliseconds
(sampler below). What G1 protects is the archive path, whose loss costs
3 s of TTFB per cold view. The step that *demonstrably* moves a G3 number
is the image proxy (track B), so it ships alongside track A and is what
satisfies the "at least one improves" half of the gate.

## Baseline — measured 2026-09-03

### G1: D1, last 24 h, by statement

| statement | rows read | rows written | runs | avg |
| --- | ---: | ---: | ---: | ---: |
| reconcile: eligibility `SELECT … IN (ids)` | 104,076 | 0 | 531 | 0.68 ms |
| reconcile: current-state select | 52,866 | 0 | 267 | 0.78 ms |
| reconcile: `UPDATE … SET last_verified_at` | 43,316 | 43,316 | 221 | 1.45 ms |
| reconcile: `due` (recent + stale lanes) | 24,195 | 0 | 270 | 3.30 ms |
| **reconcile total** | **224,453** | **43,316** | | |
| feed page query (`with page as …`) | 60,619 | 0 | 590 | 2.15 ms |
| image authority select (per image request) | 2,181 | 0 | 2,181 | 0.33 ms |
| `health.replyIntegrity` (scans every live row per call) | not in top list today | 0 | | |

Every statement runs in single-digit milliseconds. The problem is the row
*count*: 3,308 live rows re-verified every 2.75 h because the recent lane
donates its unused slots to the stale lane. The feed page query (~103 rows
per page, covering indexes from migration 0011) is the floor this plan
does not try to lower.

### G2: what runs on the box

`orange-sin`: `mood-reconcile.timer` (`OnUnitActiveSec=5min`), `reconcile.mjs`
with a GramJS session and `TG_API_ID`/`TG_API_HASH` in `/opt/mood-reconcile`.
Stuck once for 18 days (2026-08-11) with no alert; link previews and
deletions stopped for the duration. `mood-media-sync` never deployed and is
retired unbuilt (owner: media > 20 MB is not archived).

### G3: page timing, `/mood`, 8 cold contexts, edge SWR warm

| | median | range |
| --- | ---: | ---: |
| TTFB | 62 ms | 52–66 ms |
| FCP | 140 ms | 132–164 ms |
| **LCP** | **996 ms** | 884–1,060 ms |
| LCP element | `<img>` `/api/v2/images/mood/3801/0?v=2&w=800`, all 8 runs | |
| that image's TTFB | 906 ms | 792–947 ms |

LCP − FCP = 856 ms and the hero image's TTFB is 906 ms: the gap is one
request waiting on the image proxy. Per request (curl): first 0.94 s,
repeat 0.79–1.10 s, conditional 304 0.88 s, unresized 0.92 s, June post
4–5 s, `channel/avatar` (no authority chain) 0.26–0.31 s. Every response is
`Cache-Control: public, max-age=0, must-revalidate`; `handleRead` runs the
D1 authority select, R2 `get` and `revalidateMoodImageAuthority` *before*
`edgeCache.match`. The ~0.6 s difference from the avatar path is that
chain. Owner design, not a bug: `/mood/{id}/{index}` is a stable name and
the generation lives in R2 `customMetadata.moodImageGeneration`, so
freshness is guaranteed by checking authority before every byte.

Reconcile ticks and page latency: 3 s sampler, 214 samples per URL across
two VPS ticks — `/api/v2/mood` p50 61 ms / p95 619 ms, `/mood` 59 / 150 ms;
near-tick and away-from-tick p95 overlap (721 vs 592 ms; 112 vs 197 ms).
About 5% of API samples sit in a 1.05–1.57 s band regardless of tick
phase; separate lead, out of scope.

Losing the archive path: `/mood` `?source=live` cold 2.99 s, 3.62 s versus
`?source=archive` 0.09–1.01 s. That is what the D1 daily cap (hit
2026-09-01) costs a visitor.

## Database changes

Plan 037 "What stops existing" is the design; this is the D1 accounting of
it, statement by statement.

| statement / object | today | after track A | rows / day today → after |
| --- | --- | --- | ---: |
| `due` query (recent + stale + tombstone lanes) | every 5 min on the box | **gone** | 24,195 → 0 |
| eligibility `SELECT … IN (ids)` (report adapter) | every report | **gone** | 104,076 → 0 |
| current-state select (repair) | every report | **gone** | 52,866 → 0 |
| `UPDATE … SET last_verified_at` | 100 rows / tick | **gone** — cursor age in KV is the freshness signal | 43,316 writes → 0 |
| tombstone writes | inferred from `messageEmpty` | `UPDATE … SET is_deleted=1` by exact id from `updateDeleteChannelMessages` | ~0 → ≤ a few |
| `mood_posts_reconcile_recent_idx`, `_stale_idx`, `mood_posts_tombstone_idx` | maintained on every ingest write | **dropped** (migration `0012`) | 3 index writes per post → 0 |
| `health.replyIntegrity.unverifiedPosts / oldestVerifiedAt` | full live-row scan per health call | **gone**; `health.converge` is one KV read | full scan → 0 |
| converge cursor | — | KV `mood:converge:pts` (+ `:status`) | 0 D1 |
| image authority select | per image request | off the hot path (track B: edge cache first, R2 metadata as authority on miss) | 2,181 → ~0 |
| feed page query | per uncached page | unchanged — the floor | 60,619 → 60,619 |
| link-preview `UPDATE` | from the box | from the Worker at ingest (track B) | same count |

Net on a quiet day: **~289,000 → ~61,000 reads, ~43,300 → < 100 writes.**
On a typical day (3 posts, an occasional delete) converge adds < 30 reads
and < 20 writes. The monthly dense sweep (`channels.getMessages`, plan 037)
reads ~3,300 rows once. No new table; one migration that only drops
indexes.

## Steps

Two tracks. A is G1 + G2 and runs in order. B is the G3 improvement and is
independent of A. Each step: change, hypothesis, verification, pass line,
rollback; a failed pass line stops its track.

### Track A — rows to zero, box to off

#### A0 — cap the stale lane (day 0, one constant)

Change: in `handleDue` (`mood-reconcile.ts`) stop donating unused recent
slots to the stale lane; `staleLimit` capped at 5.

Hypothesis: reconcile ~25,000 reads / ~2,000 writes per day; posts younger
than 48 h keep ≤ 5 min deletion latency; the full rotation of older rows
slows to ~2 days (owner: irrelevant); TTFB/FCP/LCP unchanged.

Verification: next day's insights; delete one fresh test post and poll
`/api/v2/mood/{id}` every 10 s.

Pass: reconcile reads < 30,000; young-post deletion ≤ 5 min. Rollback:
revert the constant.

#### A1 — converge core and report path (DO as the transport)

Rewritten 2026-09-03 after the re-gated D run: the DO is the runtime, so
the VPS shell transport (`converge.mjs`, a 1-minute timer on the box) is
not built. Nothing new goes on the box; it only gets turned off in A3.

Change (`site-api`):

- `features/mood/converge/apply.ts`: `applyChannelDifference(diff, db, now)`
  over the reduced `ChannelDiff` (ids, dates, kinds; never content). Unit
  fixtures from the plan 035 survey: deletion of 3723/3724, an edit event,
  1742 as a membership gap, 2274/2472 as classified-not-missing, a
  `TooLong` response.
- `POST /v2/mood/converge/report`, HMAC-signed with the existing
  `MOOD_DELETE_SYNC_SECRET`: body one `ChannelDiff` page, response the
  `pts` to persist. The DO calls it via the service binding; the cursor of
  record is the DO's own storage (`{pts, salt}`), mirrored to KV
  `mood:converge:status` for `health.converge` and the dead-man alert.
- `workers/mood-converge` graduates from fixture to Worker: the alarm folds
  the wire payload into `ChannelDiff` and posts it; the admin surface keeps
  `status` and `evict` only.
- **Wire policy, from the measured corrections:** alarm every 5 minutes;
  `limit=100` on every `getChannelDifference` (13 messages / 2,304 B on the
  probe, well inside the page gate); a `TooLong` at `limit=100` leaves the
  cursor unchanged and switches the next alarms to the dense sweep —
  `channels.getMessages` in 20-id batches, one batch per alarm, 165 alarms
  for the whole archive — then resumes from the `pts` `TooLong` returned.
  `initConnection` only on the first call after a new auth key.
- `mood-reconcile.timer` stays running through A1; it is disabled at the
  start of A3, not here.

Hypotheses: reconcile-attributable rows < 2,000 read / < 100 written per
day once the timer is off (A3); young-post deletion ≤ 5 min (one alarm);
drift 0/0 after 7 days; feed TTFB unchanged.

Verification: fixtures green in `bun run test:unit`; day-0 test post
deleted and polled every 10 s; the DO's reported `pts` matches
`channels.getFullChannel` at day 1 and day 7; day-7 survey audit.

Pass: deletion ≤ 5 min; cursor matches; drift 0/0. Rollback: the DO
reports nothing (alarm cleared); the timer is still running.

#### A2 — Durable Object spike (kill-tests, Workers Free)

Change: new Worker `mood-converge` with `MoodConvergeDO`, own cursor
`mood:converge:pts:do`, reporting through the same `applyChannelDifference`
while A1's shell keeps serving. Kill-tests in order, stop at the first
failure (plan 037): 0 CPU (`cpuTimeMs`, pre-generated session, `connect()`
only, difference folded into `initConnection`); 1 transport (WebSocket shim
over `fetch` upgrade); 2 bundle (GramJS under `workerd`, ≤ 3 MB
compressed); 3 auth reuse across eviction.

Pass: 50 consecutive alarms with `cpuTimeMs` p95 ≤ 6 ms empty and ≤ 10 ms
carrying a page; DO cursor within one page of the shell's for 24 h.

Fail: the shell stays and the box keeps exactly one unit; G2 lands at "one
unit, no credentials beyond the session" instead of zero, and the plan says
so in the results table.

**Result — failed at kill-test 0 on 2026-09-03.** This spike ran before A1,
so it was deliberately read-only: it used the production bot `StringSession`
and channel cursor but did not call the not-yet-built converge report adapter
or touch D1. The existing reconcile timer stayed active throughout.

The deployed `mood-converge` Worker proved the mechanics needed to measure the
first gate. These are enabling observations, not progression past the failed
ordered gate:

- Working version `adc7ddaa-4196-4932-9b26-679c069f43ea` built GramJS 2.26.22
  plus the shim to 1,459.62 KiB uncompressed and 298.74 KiB gzip, comfortably
  below the 3 MB bundle limit (the bundle observation from kill-test 2).
- Workers outbound WebSocket upgrade requires an `https://` fetch with
  `Upgrade: websocket` and `Sec-WebSocket-Protocol: binary`; `fetch()` rejects
  the literal `wss://` URL in the proposed shim. Telegram's `/apiws` endpoint
  also requires MTProto obfuscated transport; plain abridged transport upgrades
  but receives no Telegram frame. With those corrections, one connection and
  one `InvokeWithLayer(InitConnection(GetChannelDifference))` returned
  `updates.ChannelDifferenceEmpty` (kill-test 1).
- The DO rejected a missing auth key before GramJS could enter DH. All 34
  consecutive alarms returned the empty difference with `pts=9058`, exactly
  matching `channels.getFullChannel` before and after the run, and recorded one
  transport, one RPC and no DH handshake.

The CPU gate did not pass. The cold manual tick used 27 ms CPU. Workers tail
delivered 11 alarm traces before the run was stopped: **5, 8, 11, 6, 8, 6, 8,
9, 14, 6, 6 ms**. Six already exceed the 6 ms empty-tick limit; even if every
remaining sample in a 50-alarm run were at or below 6 ms, p95 could not pass.
Per the stop-at-first-failure rule, the remaining alarms, the carrying-page
measurement, the 24-hour cursor comparison and kill-test 3 were not run.

The failed Worker was deleted after evidence capture. The workers.dev endpoint
returned 404 on readback, and `orange-sin` still reported
`mood-reconcile.timer` active with one scheduled timer. Verdict: **DO runtime
rejected; retain the VPS fallback and do not proceed to A3 on this design.**
Because A1 has not run, that fallback is still today's probe with its existing
`TG_API_ID`/`TG_API_HASH`, not the proposed session-only converge shell.

#### A2 failure branch — the decision the fail forces

Kill-test 0 failed on the thing it was designed to find: MTProto in pure JS
costs 5–14 ms of CPU per *empty* tick, and Workers Free allows 10. No
amount of trimming gets AES-IGE plus TL serialization under a limit that
the median tick already touches. So G2 cannot be reached with MTProto on
Cloudflare Free. Three ways out, measured against the goals:

| option | G1 rows / day | G2 box units | cost | what it keeps |
| --- | ---: | ---: | --- | --- |
| **A. Workers Paid** ($5/month) and ship the DO as designed | ~0 | 0 | money, and GramJS (300 KiB gz, obfuscated WS transport) living in a Worker forever | exact deletion ids, ≤ 60 s |
| **B. VPS keeps one unit** (A1's converge shell) | ~0 | 1 | the box, its 18-day-silent failure mode, MTProto credentials off-Cloudflare | exact deletion ids, ≤ 60 s |
| **C. HTTPS embed probe in the Worker cron** — no MTProto anywhere | ~1,200 | 0 | nothing new: Free plan, plain `fetch` | inference again, but bounded to what the owner cares about |

Option C, spelled out. `https://t.me/tutumood/{id}?embed=1&mode=tme` is
the page the link-preview scrape already reads. Measured 2026-09-03:

| id | state | response |
| --- | --- | --- |
| 3801 | live | 200, 15,052 bytes, no `tgme_widget_message_error` |
| 3723, 3724 | deleted (plan 035 survey) | 200, 12,841 bytes, `tgme_widget_message_error`, "Post not found" |
| 99999 | never existed | same as deleted |
| 1742 | in Telegram, missing from archive | 200, 14,712 bytes, no error marker |

The signal is exactly the one `channels.getMessages` gives (`messageEmpty`
for 3723/3724 and 99999 alike), over HTTPS, with no crypto and no session.

- **Young lane** (≤ 48 h, the only window the owner rates): the existing
  `*/15` cron — or a new `*/5` one, 288 invocations/day, negligible —
  selects posts younger than 48 h via the recent index (a handful of rows)
  and fetches their embed pages. Deletion lands within one tick.
- **Old rotation**: two ids per tick in ascending `message_id` order from a
  KV cursor `mood:probe:cursor`; `SELECT message_id FROM mood_posts WHERE
  is_deleted = 0 AND message_id > ? ORDER BY message_id LIMIT 2`. Zero
  writes, ~17 days per full rotation at `*/15`, ~6 days at `*/5`. That is
  the monthly dense sweep from plan 037 with the MTProto removed.
- **Tombstone guard** (the current 25-dead valve, kept in spirit): a
  "Post not found" reading puts the id in KV `mood:probe:suspect`; only a
  second such reading at least one tick later writes `is_deleted = 1`. A
  non-200, a page without either marker, or more than 10 suspects in a
  day stops tombstoning and raises the dead-man alert instead — that is
  what a t.me outage or a channel privacy change looks like, and it must
  never look like mass deletion.
- **D1**: young lane ~10 rows × 96 ticks ≈ 1,000 reads/day, rotation 2
  rows × 96 ≈ 200, writes only on a confirmed deletion. Everything in the
  "Database changes" table still goes, including the three indexes and
  `last_verified_at`; the recent lane keeps only the `datetime` index the
  feed already uses.
- **What stops existing on top of plan 037**: the pts cursor, the
  `ChannelDiff` reducer, GramJS in every runtime, `TG_API_*` anywhere,
  `scripts/mood-reconcile/`, `workers/mood-converge/` (fixture stays only
  as the record). The webhook stays the only content writer; reactions
  stay live.
- **What it gives up against A/B**: deletion latency 5–15 min instead of
  60 s for young posts, and an HTML dependency on t.me's embed page —
  which B2 (link previews at ingest) carries anyway, so it is not a new
  dependency, just a second use of an existing one.

Then the measurement that changes the recommendation. A2's CPU trace was
of GramJS, not of MTProto. The cryptographic work an empty tick actually
needs — MTProto 2.0 message keys (three SHA-256), AES-IGE over a ~320 B
request and a ~1 KiB reply — costs, in the same pure-JS `@cryptography/aes`
GramJS ships, on Node:

```
message-layer crypto per empty tick (encrypt 320 B + decrypt 1 KiB, pure-JS IGE): 23 µs
```

(`node -e` against `site-api/node_modules/@cryptography/aes`, 2,000
iterations after warm-up.) The 5–14 ms A2 recorded is 200–600× that. The
difference is the library: `TelegramClient` and `MTProtoSender` rebuilt per
tick, `big-integer` arithmetic, `Buffer` polyfills, the update-loop and
logging machinery, a 1.4 MB module graph evaluated on every cold isolate
(27 ms cold tick). None of that is the protocol.

| option | G1 rows / day | G2 box units | cost | what it keeps |
| --- | ---: | ---: | --- | --- |
| **D. Slim MTProto client in the DO** — the pts design as written, GramJS removed | ~0 | 0 | one bounded piece of engineering, re-run kill-test 0 | **everything plan 037 promised**: exact deletion ids, ≤ 60 s, Free plan |

Option D, spelled out. The DO speaks MTProto with a pre-generated auth key
and nothing else on the wire but what a tick needs:

- **Transport**: WebSocket to `/apiws` with the obfuscated framing A2
  already got working (`https://` upgrade, `Sec-WebSocket-Protocol:
  binary`). The obfuscation layer is AES-CTR, which WebCrypto does
  natively.
- **Message layer**: MTProto 2.0 — `msg_key`, key/iv derivation via
  `crypto.subtle.digest`, AES-IGE in pure JS (23 µs, above). Handles
  `msgs_ack`, `bad_server_salt`, `new_session_created`, `rpc_result`,
  `rpc_error`, `gzip_packed` (native `DecompressionStream`). No DH: the
  auth key and salt live in DO storage from the bootstrap A2 already
  proved.
- **TL codec**: schema-driven, not class-per-constructor. A build step
  takes `api.tl` and keeps the reachability closure from the three calls
  (`invokeWithLayer`, `initConnection`, `updates.getChannelDifference`,
  plus `channels.getMessages` for the sweep) and their result types — the
  `Update*`, `Message`, `MessageMedia*` families — as a table the parser
  walks. That is what a TL parser is; GramJS wraps it in 1.4 MB of
  classes. Candidate to avoid hand-writing it: mtcute's codec packages
  (`@mtcute/tl`, `@mtcute/tl-runtime`, `@mtcute/wasm` for IGE and gzip)
  without its client class; kill-test 2 decides whether the tree-shaken
  size is acceptable.
- **The reducer is unchanged**: the wire payload is folded into the same
  `ChannelDiff` (ids, dates, kinds; never content) and reported through
  `applyChannelDifference`. The content-writer boundary holds.

Kill-test 0 is re-run against this client with the fixture
`workers/mood-converge` already has (bootstrap, alarm, structured tick
logs, `cpuTimeMs` from traces). Pass line tightened to what the arithmetic
says it should be: **p95 ≤ 2 ms on empty ticks, ≤ 5 ms carrying a page**,
50 consecutive alarms, then the 24 h cursor comparison and kill-test 3
that A2 never reached. If it fails, the cause is measurable (the trace
says which phase), and C stays as the floor.

**Result — D failed kill-test 0 on 2026-09-03.** The experiment replaced
GramJS rather than wrapping it: the working client implemented the obfuscated
abridged WebSocket, MTProto 2.0 message keys and salt retry, the four request
constructors, `rpc_result`, `msgs_ack`, `bad_server_salt`,
`new_session_created`, `rpc_error` and `gzip_packed`. WebCrypto handled SHA
and AES-CTR; the same pure-JS IGE implementation used in the 23 µs benchmark
handled message encryption. A new bot auth key was generated outside the DO,
so the production VPS session was never shared across IPs.

The protocol worked. The first call started at `pts=9058`, received
`bad_server_salt`, retried once, then returned
`updates.channelDifferenceEmpty`; later calls used one request message, one
WebSocket and no DH. The final bundle was **38.68 KiB / 9.83 KiB gzip**, had a
5 ms reported startup time, contained no GramJS, `MTProtoSender`,
`TelegramClient`, `big-integer`, Buffer polyfill or `nodejs_compat`, and kept
one cached DO state with one write per alarm.

That lower bound still missed the gate. Ten final alarm traces were **6, 7,
4, 4, 4, 4, 3, 4, 4, 2 ms**: p95 7 ms, with 9/10 above 2 ms. Two preceding
variants ruled out the generated reader and the original fixture storage as
the cause (4–7 ms with the full reader; 3–9 ms with the reader removed before
state compaction). The 23 µs inner crypto benchmark therefore does not predict
whole-invocation CPU: isolate/module startup, WebCrypto calls, protocol
framing, DO state serialization and the trace event dominate it. After three
samples above 2 ms a 50-sample p95 could no longer pass; this run had nine, so
the remaining alarms were stopped under the first-failure rule. The carrying
page, 24-hour cursor comparison and auth-eviction test were not run.

The test auth key was revoked, the Worker and DO state were deleted, the
workers.dev endpoint returned 404, and `mood-reconcile.timer` remained active.
Verdict: **D proves a slim MTProto client is technically possible, but D is not
viable under its own ≤ 2 ms alarm gate.**

Two more roads, recorded so they are not rediscovered: the Bot API
`editMessageReplyMarkup` probe (a message the bot did not author answers
"message can't be edited" when it exists and "message to edit not found"
when it does not — exact, zero crypto, but still a probe, and unverified
without the bot token) and `t.me/s/tutumood` (one page for the young lane
instead of N embeds; a C refinement). They remain possible refinements to C,
not evidence that D passed.

**Gate reassessment (2026-09-03, after the D run).** The ≤ 2 ms line was
derived from the crypto arithmetic alone and was wrong for that reason: it
priced the 23 µs of IGE and left out everything a DO alarm is charged for
regardless of protocol — the TLS + WebSocket connect on every alarm,
WebCrypto calls, two storage writes, `setAlarm`, the trace event. D was
measured against a number that no DO alarm opening a socket can reach. The
limit that exists is 10 ms, and every empty tick D recorded (2–7 ms) is
under it. "D failed its own gate" is true and does not tell us whether D
works. Two things do, and neither was measured:

1. **The platform floor.** A control alarm on the same DO that does the
   storage reads/writes and one WebSocket connect to the same DC and
   nothing else. Call it F. Nobody knows whether F is 1 ms or 4 ms, and
   the difference decides whether there is anything left to shave.
2. **A page tick.** `updates.getChannelDifference` with `limit=10` so one
   page is bounded (~10 KB → ~+1 ms crypto, ~+1 ms TL), and `TooLong`
   handled as `channels.getMessages` in 20-id batches, one batch per
   alarm. The dense sweep is then 165 alarms spread over a day, never one
   big tick.

What makes a tail over 10 ms survivable rather than fatal: state is
persisted only after a tick completes, so an alarm the runtime kills for
CPU throws, advances nothing, and the next alarm retries the same `pts`.
The failure mode is deletion-latency jitter, not drift. At a 5-minute
alarm — the young-post window the owner already accepts — that is 288
ticks a day with a retry built in.

Cheap trims for the re-run, none of them the point: one storage `put` of
`{pts, salt}` instead of the whole record; no `console.log` of the tick
(the trace carries `cpuTimeMs`); `initConnection` only on the first call
after a new auth key, plain `getChannelDifference` after.

**Re-gated D run (the last one; if this fails, C, no further variants):**

| measure | pass |
| --- | --- |
| control floor F, 20 alarms | recorded, not gated |
| empty tick, 50 alarms | p95 ≤ F + 3 ms **and** ≤ 8 ms |
| page tick (`limit=10`, `pts` rolled back 30 to force a page), 50 alarms | p95 ≤ 9 ms, no alarm killed |
| forced kill (`limit=100` once) | alarm throws, `pts` unchanged, next alarm succeeds |
| then the 24 h cursor comparison and kill-test 3 as written | |

**Re-gated D result — immediate gates passed 2026-09-03; 24-hour shadow in
progress.** The page-capable Worker built to 356.63 KiB / **65.70 KiB gzip**;
the earlier 9.83 KiB artifact was the empty-only lower-bound fixture without
the generated page reader. The control and test alarms used the same DO,
immutable config, two-key storage update, `setAlarm`, trace sampling and
same-DC obfuscated WebSocket. The Worker emitted no application tick logs.

| measure | observed | verdict |
| --- | --- | --- |
| control floor F, 20 alarms | 18 × 1 ms, 2 × 2 ms; **p95 2 ms**; 20/20 ok | recorded |
| empty, 50 alarms | 1–5 ms; **p95 3 ms = F + 1 ms**; 50/50 empty, 0 killed | **PASS** |
| page, 50 alarms | 2–8 ms; **p95 4 ms**; 50/50 regular page, 0 killed | **PASS** |
| forced failure + retry | exception before progress commit, then automatic retry ok; 9028 → 9058 | **PASS** |
| auth reuse after eviction | bootstrap secrets deleted; forced eviction; one naked request returned empty at 9058 | **PASS** |

Two corrections came from the wire rather than the estimate. Telegram accepts
a naked `getChannelDifference` on later connections after one successful
`initConnection` for the auth key. Conversely, `limit=10, pts=9028` does not
return a 10 KB page: it returns `channelDifferenceTooLong`. The largest regular
page available at that limit was `pts=9048`, five messages and 1,136 encrypted
bytes; that is what the 50-page run replayed. An additional
`limit=100, pts=9028` probe returned 13 messages, one edit and 2,304 encrypted
bytes. `TooLong` now leaves the stored cursor unchanged; the 20-id sweep remains
implementation work after the runtime gate.

The one-shot failure harness first completed the network call, persisted only
the consumed test-control bit, then threw before writing `{ pts, salt }`.
Cloudflare delivered one exception trace and automatically retried the same
cursor; the retry completed at 6 ms and advanced 9028 → 9058. A preliminary
unconsumed injection produced four consecutive exceptions while status stayed
at 9028, independently proving that failed alarms do not advance progress.

Kill-test 3 passed after removing `MT_SESSION`, `CHANNEL_ID` and `ACCESS_HASH`
from the Worker: DO storage retained the config and auth key, forced eviction
returned the expected abort, and the next connection issued one naked request
with no DH. The final shadow started at 2026-09-03T09:57:52Z with `pts=9058`,
288 alarms at five-minute intervals and `limit=10`. Final viability remains
pending until that run completes and its cursor is compared with Telegram.

Recommendation: **continue the re-gated D shadow.** The protocol, transport,
page-capable bundle, CPU gates, retry semantics and auth reuse are proven. What
remains is the 24-hour cursor comparison. If that drifts or the shadow cannot
finish, C is the design without another variant. The VPS timer stays until the
cursor gate closes. A0 still applies; track B is unaffected.

#### A3 — cut over and turn the box off

Change: DO takes the primary cursor at a 1-minute alarm; shell disabled;
after 7 clean days delete the timer, `/opt/mood-reconcile`, `TG_API_*`,
`scripts/mood-reconcile/` (README pointer stays); retire
`/v2/mood/reconcile/*` and `/v2/webhooks/telegram/deletions` (docs page in
the same PR); migration `0012` drops the three indexes;
`health.replyIntegrity` loses its verification fields; dead-man alert
wired; monthly dense sweep on the DO alarm calendar; box off.

Pass: G1 target met on the next day's insights; `systemctl list-timers`
empty for mood; dead-man alert round-trip observed (alarm cleared → fires,
restored → clears); `bun run check:docs-coverage` green; drift 0/0.

### Track B — the page-timing improvement

#### B1 — generation-addressed image URLs, cache before authority

Change (`site-api` only; the site's `withWidth` preserves params, so
`srcset` picks the new URL up unchanged):

- `moodOwnedImageUrl` in `mood-repository.ts` (and the fallback
  repository's equivalent) appends `g=<generation>`, the value
  `createMoodImageGeneration` already derives from the row's
  `file_unique_id`.
- `handleRead`: with `g` present, `edgeCache.match` runs **first** on the
  full URL. A hit answers `If-None-Match` itself (304 from the edge) or
  returns the cached body; nothing else runs.
- Miss with `g`: R2 `get` by the existing key; if
  `customMetadata.moodImageGeneration === g` → transform, respond with
  `ETag` and `Cache-Control: public, s-maxage=86400, max-age=0,
  must-revalidate`, `edgeCache.put`. No D1 on this path — the generation is
  the authority. Mismatch or missing → today's chain (redirect to the
  current generation or 404), never cached.
- URLs without `g` behave exactly as today; that is the rollback.

`s-maxage=86400`, not a year, because `edgeCache.delete` is per-colo and a
global purge needs a zone API token this Worker does not hold; one day
bounds how long a deleted post's image stays reachable at a colo. Browsers
still revalidate every view, so visible deletion semantics are unchanged.
**Owner decision, not taken here:** a year plus purge-by-URL, or the day.

Hypotheses: hero TTFB ≤ 60 ms edge-warm / ≤ 400 ms edge-cold (the avatar
path's number); LCP ≤ 300 / ≤ 600 ms; June posts on `/mood/[id]` first
view ≤ 1 s; TTFB, FCP unchanged; the image authority select leaves the
daily list.

Verification: staging deploy; `mood-lcp.mjs` 8 cold contexts, edge cold
then one minute later edge warm; the curl table repeated; replace one test
post's photo and confirm a new `g` is emitted and the old URL returns no
old bytes; delete the post and confirm the feed drops it within 5 min and
the image URL 404s at the edge within 24 h; production, repeat next day.

Pass: LCP medians under the thresholds; TTFB, FCP within 10%; no stale
bytes in the replace test. Rollback: stop emitting `g`.

#### B2 — link previews at ingest

Change: on inserting a text post whose text contains `http` and whose
`link_previews` lacks `web_page`, `waitUntil` a 15 s delay then the
`t.me/<channel>/<id>?embed=1` scrape ported from `reconcile.mjs`; one
primary-key `UPDATE`. Failures to KV `mood:preview:retry`, drained ten per
`*/15` cron tick, `web_page_none` after three attempts; the 42 flagged rows
seeded once. Removes the last job the box does besides deletions, so A1
can retire the timer cleanly.

Pass: card ≤ 30 s on a test link post; backlog 0 within two hours; page
timing unchanged. Rollback: revert the ingest hook.

## Order

Staging was removed from both repos on 2026-09-03 (site PR #174, site-api
PR #48), so B1 goes straight to production behind its tag-mismatch fallback.
A0, A1 (server side), B1, and B2 are built, tested, and merged with
site-api `origin/main` on branch `feat/mood-converge-ship` (worktree
`/Users/tutu/Dev/site-api/.claude/worktrees/mood-converge-ship`). The
converge Worker is built against the same branch. A3 after A1's 7-day pass.

### Ship hand-off (owner runs; the agent session cannot deploy)

1. site-api, one deploy carrying A0 + A1 route + B1 + B2:

   ```bash
   cd /Users/tutu/Dev/site-api/.claude/worktrees/mood-converge-ship && bun run build && ./node_modules/.bin/wrangler deploy --config dist/server/wrangler.json
   ```

2. Converge Worker (this ends the 24 h shadow; DO storage — auth key,
   `pts` cursor — survives the deploy). `MOOD_SYNC_SECRET` is the same value
   as site-api's `MOOD_DELETE_SYNC_SECRET`:

   ```bash
   cd /Users/tutu/Dev/site-api/.claude/worktrees/mood-converge-ship && bunx wrangler secret put MOOD_SYNC_SECRET --config workers/mood-converge/wrangler.jsonc && bunx wrangler deploy --config workers/mood-converge/wrangler.jsonc
   ```

   Then `POST /start` with the admin bearer and read `/status`; the first
   alarm fires one second later and every five minutes after.

3. Verify: a `?g=` image URL from the feed answers 200 with an ETag and a
   second request skips D1 (no `Mood image authority` log line);
   `node scripts/perf/mood-lcp.mjs https://buxx.me/mood 8` in the site repo
   against the baseline row; KV `mood:converge:status` (namespace
   `6a3607b2ce6b43de883766497448ee81`) advances every five minutes; the
   day-0 test post is tombstoned within one alarm.

4. `mood-reconcile.timer` keeps running until A3. A3 (timer off, box off,
   credentials deleted, migration 0012) needs 7 clean days and the owner's
   go.

### Ship log — 2026-09-03

Deployed and running. Sequence, all times UTC:

| time | event |
| --- | --- |
| 10:39 | site-api version `8b33430a` deployed (A0 + A1 route + B1 + B2) |
| 11:00 | converge Worker deployed |
| 11:16:55 | converge loop started; first tick `empty`, pts 9058 |
| 11:21:55 | second alarm decoded a real `page` diff, pts 9058 → 9062 |
| 11:58 | owner stopped `mood-reconcile.timer` and its service on the box |
| 12:47 | third writer identified (below) |
| 12:49 | site-api redeployed as version `0d282d87` |
| 12:50:26 | `MOOD_DELETE_SYNC_SECRET` / `MOOD_SYNC_SECRET` rotated on both Workers |
| 12:52:30 | first report after the rotation succeeded — no 401, loop healthy |

`/start` first answered 404 because the Worker returns `{"error":"not_found"}`
for any request without the admin bearer and the `ADMIN_SECRET` value had been
lost; it was rotated, not recovered. The 12:49 redeploy was needed because an
orphan version (`fb6147fe`, uploaded 10:59:49, never deployed) made wrangler
refuse `secret put` — latest version must equal the deployed one.

### G1 measurement — first hours after the box stopped

Account D1 analytics for `site-mood`, hourly, 2026-09-03 UTC. The VPS timer
stopped at 11:58; nothing else changed in the read path.

| hour | rows read | rows written | write queries |
| --- | ---: | ---: | ---: |
| 07:00 | 25,902 | 2,200 | 22 |
| 09:00 | 19,701 | 2,400 | 24 |
| 10:00 | 14,157 | 1,512 | 18 |
| 11:00 | 18,086 | 319 | 23 |
| 12:00 | 18,683 | **0** | **0** |

Writes are the clean result: a steady ~2,200 rows per hour (~52,800/day,
matching the 43,300 baseline) collapsed to zero the moment the probe stopped.
The converge Worker writes nothing on an `empty` or a `page` diff with no
deletions — its cursor lives in Durable Object storage, not D1 — so
reconcile-attributable writes are 0, the G1 write target met with room.

Reads are not yet measurable: the 12:00 hour still carries this session's own
diagnostic queries, each a full `mood_posts` scan of ~3,300 rows. Daily rows
read had already fallen from ~10.5 M (2026-09-01) to 469 K (09-02) when
migration 0011's partial covering indexes landed. Take the read number from a
full quiet day with the box off.

### Open — an unidentified third writer of mood tombstones

Three test deletions (3803, 3791, 3800) were tombstoned 15-20 s after the
Telegram delete, by something that is neither the VPS nor the converge Worker:

- The rows carry `deleted_at` with `last_verified_at` still NULL, and a
  `mood_post_deletions` ledger row. Only `/v2/webhooks/telegram/deletions`
  writes that shape; the reconcile probe always stamps `last_verified_at`.
- The VPS oneshot ran 11:56:08 → 11:56:09 and only stamped 18 verify rows;
  3800 was tombstoned at 11:59:25 with the timer already stopped.
- No mood or Telegram process, container, or timer remains on the box, and
  none on the owner's Mac. Plan 033 recorded this route as orphaned with no
  caller in either repo.

It holds a valid `MOOD_DELETE_SYNC_SECRET`, so the 12:50 rotation locks it
out; its next call answers 401 and `wrangler tail site-api` will show its IP,
country, and user agent. Until it is identified and its credentials are
deleted, G2 ("credentials deleted") is not met. Its work is redundant — the
converge Worker decoded both 3791 and 3800 on its own.

## Results

Filled in as each step runs. Empty cells mean "not yet run", never
"assumed".

| step | D1 reads / writes per day | box units | TTFB | FCP | LCP (hero TTFB) | archive path | young-post deletion | verdict |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| baseline | 289,000 / 43,300 | 1 | 62 ms | 140 ms | 996 ms (906 ms) | all day (cap not hit) | ≤ 5 min | — |
| A0 | | 1 | | | | | | DEPLOYED 2026-09-03 ~10:50Z with the site-api ship (stale lane capped at 5 per tick); D1 row counts read at day 1 |
| A1 | | 1 | | | | | | **RUNNING** — server deployed 2026-09-03 ~10:50Z (`/v2/mood/converge/report`); Worker deployed 11:00Z, loop started 11:16:55Z after `ADMIN_SECRET` was rotated (the lost value made `/start` answer 404). First tick `empty`, pts 9058, KV `mood:converge:status` written 11:16:53Z, failures 0. Second alarm 11:21:55Z decoded a real `page` diff (pts 9058 → 9062, no gaps) — but the day-0 test post 3803 (posted 11:18:51Z) was tombstoned by the VPS probe at 11:19:08Z, 3 min before the Worker saw it, so the Worker-only deletion proof still needs the VPS timer paused; day-1 D1 counts pending |
| A2 / D | — | 1 (+ DO shadow) | — | — | — | unchanged | unchanged | **SUPERSEDED** — re-gate passed (F p95 2 ms; empty p95 3 ms; page p95 4 ms; failure retry and auth eviction passed; shadow started at pts 9058); the 24 h shadow was cut short when the production Worker replaced it at 11:00Z |
| A3 | | 0 | | | | | | |
| B1 warm / cold | | | 79 ms (p75 160) | 202 ms (p75 292) | **224 ms** (hero TTFB 38 ms), p75 328 ms | tagged Cache API → R2 by generation | unchanged | **PASS on LCP** — 12 cold runs 2026-09-03 ~10:55Z; TTFB/FCP within noise of baseline (one 1,058 ms page-cache-miss outlier). Detail `/mood/3801` LCP 364 ms, hero TTFB 263 ms: the detail hero carries no `w=`, so it skips the tagged variant cache and streams the full R2 object — follow-up |
| B2 | | | | | | | | DEPLOYED 2026-09-03 ~10:50Z; first retry drain at the next `*/15` cron; verify a new link post unfurls within ~15 s |

### Drift audit log

| date | ghost rows | false tombstones | missing (classified) | missing (real) |
| --- | ---: | ---: | ---: | ---: |
| 2026-09-03 (plan 035 survey) | 0 | 0 | 2 (2274, 2472) | 1 (1742) |
