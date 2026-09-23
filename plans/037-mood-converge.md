# 037 — Mood converge: event stream, not probe

Replaces plans 034 and 036 (deleted). Plan 035 stays as the measurement
record this design is built on; nothing in it is re-argued here.

Two owner goals, in priority order:

1. **Cut D1 consumption.** Retire the full-archive reconcile scan.
2. **Leave the VPS entirely.** A Durable Object if it proves out.

Owner decision 2026-09-03: **media over 20 MB is not archived.** That was
the last job only MTProto on a box could do (Bot API `getFile` refuses
files above 20 MB), so `mood-media-sync` is retired unbuilt and the box has
no remaining reason to exist once the converge loop runs on Cloudflare.
Media at or under 20 MB archives in-Worker per plan 033 item 1; the pending
generations whose source exceeds 20 MB get a terminal `skipped-large` state
so they stop reading as backlog.

Two owner constraints that shape every choice below:

- **The Bot API webhook stays the only writer of content rows.** It is fast,
  Cloudflare-native, and already correct. Nothing in this plan inserts or
  edits post content from MTProto.
- **Reactions and comment counts stay live.** They never touch D1; the v1
  Telegram mirror keeps serving them. The pts stream does not carry them
  anyway (plan 035, four-year survey).

## Why the current design burns rows

`mood-reconcile` is a *probe*: every 5 minutes it asks Telegram "are these
100 ids still alive?" and stamps `last_verified_at` on the survivors. Because
the recent lane donates its unused slots to the stale lane, the box
re-verifies all 3,308 live rows every 2.75 hours. Measured 2026-09-02:

| | rows read / day | rows written / day |
| --- | ---: | ---: |
| reconcile | ~192,000 | ~38,800 |
| feed reads | ~48,000 | 0 |
| reconcile share | **80%** | **85%** |

The probe exists to answer one question, "what was deleted", by inference
(`messageEmpty`). Telegram already answers it exactly: the channel's `pts`
log delivers `updateDeleteChannelMessages` with the ids, to a bot admin
session, with four years of replayable history (plan 035). Everything the
probe stamps, repairs and re-checks is scaffolding around that inference.

## The design in one paragraph

Two paths, two jobs. The **webhook** ingests: new posts and edits land in
seconds, as today. A **converge loop** consumes the channel's `pts`
difference every 5 minutes and applies only *state*: tombstones from
deletion events, and divergence alerts when an edit or a new message in the
stream has no matching archive row. A quiet tick touches zero D1 rows. The
loop runs in a Durable Object with the MTProto auth key in its storage; the
VPS is the fallback runtime for the same code, not a second design.

## What stops existing

Each row is a piece of today's reconcile and why it goes.

| Today | After | Reason |
| --- | --- | --- |
| `due` query over recent + stale + tombstone lanes | nothing | no probe, no lanes |
| `last_verified_at` stamps (100 writes / tick) | nothing | the cursor's age is the freshness signal |
| `messageEmpty` inference + 25-dead safety valve | exact ids from the deletion log | inference gone, so its guard goes |
| weekly tombstone re-probe (resurrection check) | nothing | false tombstones need inference; there is none |
| current-state repair (`datetime`, `type`, `media_group_id`) | nothing | historical rows converged long ago (2.75 h full rotation for weeks); the webhook writes these on ingest |
| reply-edge repair | nothing | same; the normalizer already writes `reply_to` |
| link-preview scrape on the box | unfurl at ingest in the Worker | plain HTTPS to `t.me/…?embed=1`, no MTProto involved |
| `/v2/mood/reconcile/due`, `/report`, `/v2/webhooks/telegram/deletions` | retired | no external caller |
| `mood_posts_reconcile_recent_idx`, `_stale_idx`, `mood_posts_tombstone_idx` | dropped | three fewer index writes per ingest |
| `health.replyIntegrity.unverifiedPosts / oldestVerifiedAt` | `health.converge` from the DO | that health query scans every live row; the cursor is one KV read |

Not modelled, deliberately: pins (`updatePinnedChannelMessages`). The feed
has no concept of a pinned post; adding one is a product decision, not a
side effect of this plan.

## Converge loop

Pure function first, runtime second. `applyChannelDifference(diff, db, now)`
in `site-api/src/features/mood/converge/` takes a *reduced* difference:

```ts
interface ChannelDiff {
  pts: number;
  final: boolean;
  newMessages: Array<{ id: number; date: string; kind: 'post' | 'service' | 'unsupported' }>;
  edits: Array<{ id: number; editDate: string }>;
  deleted: number[];
}
```

Reduction happens at the transport edge (DO or VPS shell) and carries **ids,
dates and a kind — never text or media**. That is what keeps the content
boundary honest: the apply function cannot write content because it never
receives any.

Per tick:

1. Read `pts` from storage. First run seeds it from
   `channels.getFullChannel().fullChat.pts`.
2. `updates.getChannelDifference({ pts, limit: 100, force: false })`, loop
   while `final` is false, reducing each page.
3. **Deletions.** For ids present in `mood_posts` and live: the existing
   `buildMoodDeletionStatements` (tombstone, `mood_post_deletions` row, media
   retirement, group re-elect). Ids the archive never held are ignored.
   Deletions are exact, so there is no cap; a single diff carrying more than
   25 raises an ops alert *after* applying.
4. **Edits.** One primary-key read per edited id. If the archive's
   `edit_date` is older than the stream's by more than 10 minutes, the
   webhook missed the edit: record the id under KV `mood:converge:stale-edits`
   and alert. Detection only. Today's reconcile does not repair edited text
   either, so this is no regression; 64 edits in four years, nearly all
   delivered by the webhook.
5. **Membership.** For each `newMessages` entry of kind `post` older than one
   hour with no archive row, record under `mood:converge:missing` and alert.
   The one-hour grace covers a webhook still in Telegram's retry queue.
   `service` and `unsupported` kinds (2274, 2472: channel client events) are
   classified, not missing. Post 1742 is repaired once by hand; one lost
   post in four years does not justify an ingest path.
6. Persist `pts` **only after** the D1 batch commits. A failed batch replays
   the same page next tick; every statement is idempotent.
7. Mirror `{ pts, lastOkAt, lastError }` to KV `mood:converge:status` so the
   health page and the dead-man cron read one key, not the DO.

Result-shape handling, never inferred cause:

- `ChannelDifferenceEmpty`: persist `pts`, done.
- `ChannelDifferenceTooLong`: reset `pts` from the returned `dialog.pts`,
  then schedule a **dense sweep** for the gap. Plan 035 measured the two
  arms (gap larger than `limit`, or `pts` behind the retained box); the
  handler does the same thing for both.
- `FLOOD_WAIT_X`: sleep the server-directed seconds plus jitter, do not
  advance.

**Dense sweep.** `channels.getMessages` with 200 exact ids per call, ids 1
through `MAX(message_id)`: 19 calls for this channel, one
`SELECT message_id, is_deleted FROM mood_posts` (≈3,300 rows). Live rows that
come back `messageEmpty` on two consecutive sweeps are tombstoned; ids that
come back as posts with no archive row go to `mood:converge:missing`. Runs
after any `TooLong`, once at cutover, then monthly. It is the only
membership check that works when the log cannot reach back, and it is the
proof that the event path has not drifted.

## Runtime: Durable Object

`MoodConvergeDO`, one instance, `idFromName('tutumood')`. Lives in a **new
Worker `mood-converge`**, not in `site-api`: GramJS with its TL schema is
about 1.5 MB minified, and the request-path Worker should not pay that cold
start or share a script with a loop that can crash. It binds `MOOD_DB` and
the `CACHE` KV directly. `site-api` reaches it only through a `script_name`
binding for the admin status/force-tick surface.

Storage: `session` (auth key + DC, GramJS `StringSession`), `channel`
(id, access hash), `pts`, `lastOkAt`, `lastError`, `consecutiveFailures`.

`alarm()`: connect over WebSocket, run the tick, disconnect, `setAlarm(now +
5 min)`. The socket is open for seconds, not minutes, so the object is not
held resident and duration billing stays negligible. A hard 30 s budget per
tick aborts the socket; failures back off (5 → 10 → 20 min, cap 1 h) and
never advance `pts`. Alarms retry on throw, so the tick body catches and
records instead of throwing.

`fetch()` (admin only, signed): `status`, `tick`, `reseed`, `sweep`.

**Dead-man switch** stays in `site-api`'s hourly cron: `lastOkAt` older than
30 minutes posts to the ops bot. That is the only alarm that fires when the
loop is silent rather than failing.

### Spike: four kill-tests, cheapest first

Stop at the first failure; the VPS shell below is then the shipped runtime
and nothing above changes.

0. **CPU budget.** The account is on Workers Free: **10 ms CPU per
   invocation**, and a Durable Object alarm is an invocation. Wall time
   waiting on the socket does not count; crypto and TL parsing do. Three
   rules make an empty tick plausible inside 10 ms, and the test measures
   whether they suffice:
   - **Never run the DH handshake in the DO.** Generate the bot
     `StringSession` once on the box with the existing script, store it in
     DO storage via a secret. Auth keys do not expire; kill-test 3 becomes
     "reuse works", never "handshake fits".
   - **Skip `client.start()`.** It calls `getMe` and starts the update and
     ping loops. Use `connect()` with the stored session, one `invoke`,
     `disconnect()`.
   - **Fold the call into `initConnection`.** GramJS wraps its first request
     in `invokeWithLayer(initConnection(help.getConfig))`; MTProto allows any
     query there. Replacing `getConfig` with `getChannelDifference` makes the
     tick a single round-trip and skips parsing a multi-kilobyte config.
   Instrument: `cpuTimeMs` in Workers Logs (observability is already on).
   Pass if an empty tick stays under 6 ms with the difference page under
   10 ms; a `TooLong` recovery of 39 pages spreads across alarms, one page
   each. Fail: the VPS shell is the runtime.
   Free-plan facts that do not block: SQLite-backed DOs are available
   (100k requests/day; 288 alarms/day), Worker size 3 MB compressed fits
   GramJS, and the 13,000 GB-s/day duration allowance is irrelevant for
   ticks that hold a socket for seconds.
1. **Transport.** Workers open outbound WebSockets via `fetch(url,
   { headers: { Upgrade: 'websocket' } })`, not `new WebSocket()`. GramJS's
   `PromisedWebSockets` wants the `websocket` package's `w3cwebsocket`
   surface (`onopen/onmessage/onclose/send/close`). Ship a 40-line shim with
   that surface over the fetch upgrade and alias `websocket` to it in the
   bundle. Target `wss://<dc>.web.telegram.org/apiws`, the endpoint Telegram
   Web uses.
2. **Bundle.** GramJS under workerd with `nodejs_compat`: `node:crypto` for
   SHA and random bytes; `@cryptography/aes` for IGE and CTR; `big-integer`
   for DH. Stub `node-localstorage`, `store2`, `socks`, `fs` (already
   `false` in the package's `browser` field). Success is `TelegramClient`
   constructing and `client.connect()` completing.
3. **Auth reuse.** Import the bot authorization once, persist the
   `StringSession`, evict the object, and make a second alarm run
   `getChannelDifference` without a DH handshake.

### Fallback runtime: VPS shell

The existing read-only `verify-channel-difference.mjs` already does steps 1
and 2 of the tick. Grow it by one POST: reduce the difference to the
`ChannelDiff` shape and send it to a signed `/v2/mood/converge/report`;
`site-api` runs the same `applyChannelDifference` and returns the `pts` to
persist. The cursor lives in the Worker (KV), so the box holds only a
re-derivable MTProto session and is disposable. Same code, same tests,
different transport. Plan 033's `TimeoutStartSec` and `OnFailure` hardening
applies unchanged.

## Link previews at ingest

The second thing the VPS does, and the reason the archive has 42 bare-link
rows flagged forever. Bot API webhooks carry a bare URL; bot MTProto returns
`WebPageEmpty`; the only source is the public `t.me/<channel>/<id>?embed=1`
page, which is plain HTTPS.

- On inserting a text post whose text contains `http` and whose
  `link_previews` lacks `web_page`: `waitUntil` a 15 s delay (Telegram
  unfurls asynchronously) then the scrape, ported from `reconcile.mjs`
  (`scrapeTelegramLinkPreview`, about 40 lines), writing one `UPDATE … SET
  link_previews` by primary key.
- On failure, push the id to KV `mood:preview:retry`. The existing `*/15`
  cron drains at most 10 per tick; after three attempts write a
  `web_page_none` marker so the row stops qualifying.
- The 42 flagged rows drain through the same retry list, seeded once.

## D1 cost

| | rows read / day | rows written / day |
| --- | ---: | ---: |
| today | ~192,000 | ~38,800 |
| step 0 (stale lane capped at 5) | ~25,000 | ~2,000 |
| converge, quiet day | 0 | 0 |
| converge, typical day (3 posts, occasional delete) | < 30 | < 20 |
| monthly dense sweep | ~3,300 once | 0 |

Feed reads (~48,000) become the largest consumer, which is the right shape:
rows spent on readers.

## Execution

Each step is independently shippable and leaves the site working.

**0. Cap the stale lane (day 0).** In `handleDue`, stop donating unused
recent slots to the stale lane: cap `staleLimit` at 5. Posts younger than
48 h keep 5-minute deletion latency; the full rotation of older rows slows
from 2.75 h to about two days. The owner ruled on 2026-09-03 that the
window beyond 48 h "almost never changes", so that latency is not a
visitor metric (plan 038). Reversible in one commit. Acceptance: next
day's `wrangler d1 insights site-mood --timePeriod 1d --sort-by reads` shows
reconcile under 30,000.

**1. Previews at ingest.** Section above. Drop `needs_preview` from the due
response in the same PR (it forces a table read per index row). Acceptance:
the 42-row backlog reaches zero within two hours of deploy.

**2. Converge core.** `applyChannelDifference` plus the reducer, with fixtures
from the plan 035 survey: deletion of 3723/3724, an edit event, 1742 as a
membership gap, 2274/2472 as classified-not-missing, a `TooLong` response.
No runtime yet. Acceptance: `bun run test:unit` green with the fixtures.

**3. Spike the DO.** Kill-tests 0–3 in the new `mood-converge` Worker.
Acceptance: two successive alarms return a correct difference, the second
without a handshake. On failure: build the VPS shell instead and skip to
step 5 with the box as runtime.

**4. Shadow week.** DO alarm live against its own cursor. On the box, the
read-only `verify-channel-difference.mjs --watch` is the control; compare
what each saw. The old reconcile timer keeps running; nothing user-facing
changes yet.

**5. Cut over.** Stop `mood-reconcile.timer`. Run the dense sweep once and
confirm zero drift. Then, in one PR: delete `/opt/mood-reconcile`,
`TG_API_ID`/`TG_API_HASH` on the box, `scripts/mood-reconcile/` except the
README pointer, the three reconcile endpoints, `handleDue`/`handleReport`,
migration `0012` dropping the three indexes, `health.replyIntegrity`'s
verification fields, and the docs internal page (`bun run
check:docs-coverage` gates it). Post 1742 is repaired by hand here.

**6. Decommission the box.** Dead-man alert wired; monthly sweep on the DO
alarm calendar; `scripts/mood-media-sync/` deleted with its README and the
`/v2/mood/media-sync/*` endpoints (docs page in the same PR); the VPS is
turned off. If step 3 failed, the box keeps exactly one unit: the converge
shell.

```
0 ──► 1 ──► 2 ──► 3 ──► 4 ──► 5 ──► 6
                  └─ fail ─► VPS shell ─► 5
```

Step 0 alone reaches goal 1. Step 5 finishes it and reaches goal 2.
