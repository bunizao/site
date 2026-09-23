# 035 — Mood reconcile: channel difference instead of probing

Successor to plan 034. That plan makes polling cheap; this one stops polling.

## Idea

Telegram keeps a monotonic `pts` per channel. `updates.getChannelDifference`
takes the last `pts` seen and returns only what changed since: new messages,
`updateEditChannelMessage`, and `updateDeleteChannelMessages` with the exact
deleted ids, plus the new `pts`. The reconciler stops asking "are these 100
still alive" and instead asks "what happened since last time".

Cost follows change volume (3 posts/day, 34 deletions in 4 years), not
archive size (3,308 rows). A quiet tick touches no D1 row at all.

| | probe (today / 034) | pts difference |
| --- | --- | --- |
| deletion signal | sample of 100 ids, `MessageEmpty` inferred | Telegram's own deletion log, exact |
| old-post deletion latency | 2.75h today, ~2.3 days under 034 | one tick, same as fresh posts |
| quiet tick D1 cost | ~55 rows read, 5 written (034) | 0 rows; KV heartbeat only |
| recovery after an outage | hope the sweep finds it | replay from the stored `pts`, idempotent |
| false-positive guard | safety valve is load-bearing | safety valve is insurance |
| missed edit webhook | found by current-state repair, eventually | delivered in the same difference |

## Measured on the VPS, 2026-09-03

`scripts/mood-reconcile/verify-channel-difference.mjs` (read-only; never saves
session state, so the live timer is untouched) against the production bot
session on `orange-sin`. The whole channel log replays in 39 calls and 16
seconds.

### The precondition holds

`--back=200` returned `UpdateDeleteChannelMessages` with ids 3723 and 3724 --
exactly the two newest tombstones in D1 (`deleted_at` 2026-08-12). Bot API
withholds deletions; `getChannelDifference` delivers them to a bot session.

### `channelDifferenceTooLong` is driven by `limit`, not retention

Replaying from pts 1 with `limit: 500` returns `TooLong`; the same call with
`limit: 20000` returns the real difference. The server refuses when the gap
holds more updates than the caller asked for, so **the reconciler must size
`limit` to the gap it is recovering**, not to a page size. Retention itself
reaches channel inception: a replay from pts 1 yields deletions from message
id 2 onward, in 2022.

An earlier draft claimed "no practical retention horizon". The full picture is
two independent conditions: the server answers `TooLong` when the gap exceeds
the caller's `limit`, **or** when the requested `pts` is older than the
retained update box, documented as roughly `latestPts - 100000` and explicitly
not to be relied on. This channel's entire four-year history spans 9,058 pts,
comfortably inside that box, so only the `limit` arm can fire here and a full
replay is available. A channel an order of magnitude busier would lose old
history and the audit below becomes the only route.

Production code must therefore branch on the *result shape*, never on an
inferred cause: paginate an ordinary non-final difference by its returned
`pts`; on `TooLong`, reset from the supplied dialog `pts` and fall back to a
dense id audit for the range the log can no longer replay.

### Everything the stream carries

Full-history survey, pts 1 to 8903:

| Signal | Count |
| --- | ---: |
| new messages | 3,312 |
| service messages | 33 |
| deleted ids (unique) | 457 |
| `UpdateEditChannelMessage` | 64 |
| `UpdatePinnedChannelMessages` | 17 |

Those three update types are the *only* ones `other_updates` ever contained.
The survey was re-run with `force: false` as a control, because Telegram
documents `force: true` as permission to skip "possibly unneeded updates" and
a single-arm survey could not rule out a skipped class. Both arms returned
byte-identical tallies, so the inventory stands.
No reaction or view-count update appears anywhere in four years of log, which
settles a question this plan previously guessed at: **reactions and comment
counts are not in this stream and still require the live Telegram mirror.**
The difference log replaces deletion probing, not the freshness path.

`UpdatePinnedChannelMessages` is a signal the archive does not model at all.
Pinned mood posts would be free to support once the stream is consumed.

### Audit 1: the archive's deletion state is exactly right

457 deleted ids in the log, diffed against `mood_posts`:

| Check | Result |
| --- | ---: |
| deleted ids that ever reached the archive | 34 |
| of those, correctly tombstoned | 34 |
| **rows still live that Telegram deleted** | **0** |
| tombstones with no deletion in the log | 0 |

The other 423 were deleted before the archive existed and were never
ingested. Both directions agree: the existing reconcile pipeline has never
produced a ghost row or a false tombstone. This is a validation of the current
design, not a defect found.

### Audit 2: ingest has silently dropped posts

Diffing the log's 3,312 surviving message ids against the archive's 3,343
rows (the 34 extra are precisely the tombstones) leaves three ids present on
Telegram and absent from D1:

| id | date | type |
| --- | --- | --- |
| 1742 | 2024-11-17 | text |
| 2274 | 2025-06-09 | `MessageMediaUnsupported` |
| 2472 | 2025-08-03 | `MessageMediaUnsupported` |

**Correction, same day.** An earlier revision of this plan called 2274 and 2472
a deliberate drop by an ingest whitelist. That was wrong. `supportedMoodTypes`
lives in `mood-reconcile.ts` and guards the *reconcile report* adapter, not
ingest; `toMoodRecord` in `telegram-normalizer.ts` writes a row whenever
message id, channel and datetime are present, with no type filter. All three
ids are the same class of defect: content that exists on Telegram and never
reached D1.

**Resolved 2026-09-03.** Inspecting the three with `--ids=` settled what they
are. 1742 carries 80 characters of text and a `MessageFwdHeader` pointing at
another channel's post 425: a real forwarded post, genuinely missing from the
archive. 2274 and 2472 carry no text, no forward header, and
`MessageMediaUnsupported`, and are **channel client events** rather than
content -- Telegram delivers channel settings changes such as a new
direct-message star price as messages, and an old MTProto layer cannot name
them. They are correctly excluded from the feed and must stay excluded, which
makes classification a requirement on any future MTProto ingest adapter rather
than a detail. See plan 036 phase 2.

No mechanism in the current architecture could notice 1742:
the reconcile probe only verifies ids that are already in the archive, so a
post that never arrived is invisible to it forever.

This is the strongest argument for the plan. Deletion latency was the stated
motivation; closing a silent-loss hole in ingest is the larger prize. Stage 1
should treat the difference stream as the authority on *membership*, not only
on deletion: an id in `new_messages` that has no archive row is a repair.

## Stage 1 — same VPS, same wire contract

`scripts/mood-reconcile/reconcile.mjs`:

- `state.json` gains `pts`; first run seeds it from `channels.getFullChannel`.
- Replace `channels.GetMessages` with `updates.getChannelDifference({ pts,
  limit: 100, force: true })`. Loop while `final` is false.
- Collect `deleted` ids from `updateDeleteChannelMessages`, `edited` messages
  from `updateEditChannelMessage`/`new_messages`, and report them. Persist the
  new `pts` only after the report succeeds, so a failed report replays.
- `channelDifferenceTooLong` (gap beyond Telegram's retention) switches the
  next run into resync mode: plan 034 lanes A and B run once over the full
  archive, then `pts` is re-seeded and normal mode resumes. Plan 034 becomes
  the recovery path, not the steady state.
- Drop the preview scrape (plan 034 moves it into the Worker at ingest).

Worker `/v2/mood/reconcile/report` accepts `deleted`, `edited` (current
states), and `new` ids. Eligibility is one primary-key select over those ids
(plan 034's single-select report); writes are deltas only. `due` shrinks to
"is resync mode requested" plus the lane A/B lists when it is. Heartbeat and
`pts` mirror live in KV so the pipeline monitor reads KV, not
`MAX(last_verified_at)`; `last_verified_at` is stamped only during resync.

Lane A (posts < 48h) may stay as an hourly integrity check at ~10 rows per
run. Cheap belt-and-braces against a dropped update; not required.

## Stage 2 — retire the VPS

Telegram serves MTProto over WebSocket (Telegram Web's transport; GramJS has
a browser WebSocket connection). One Durable Object holds the
`StringSession` auth key and `pts`, and either pulls a difference from an
alarm every 5 minutes or keeps the connection open for pushed updates.

Plan 032 rejected "GramJS in the Worker" because each cron invocation would
redo the DH handshake and the crypto on a cold isolate. A Durable Object
keeps the auth key resident, so the handshake happens once per eviction, not
once per tick. That objection no longer applies; the remaining risk is
GramJS's Node dependencies under workerd, which a spike must settle before
committing. If the spike fails, stage 1 on the hardened VPS is already a
complete design.

## D1 cost

| | rows read / day | rows written / day |
| --- | ---: | ---: |
| today | ~192,000 | ~38,800 |
| plan 034 (`k = 5`) | ~16,000 | ~1,400 |
| stage 1, quiet day | < 100 | < 20 |
| stage 1 with hourly lane A | ~1,300 | < 20 |

## Order

0. ~~Verify the precondition on the VPS.~~ Done 2026-09-03; see above.
1. Ship plan 034's Worker side (single-select report, previews at ingest);
   it is the resync mode here and is needed regardless.
2. Stage 1 script change. Run one week with resync-on-`TooLong` exercised
   once deliberately (delete `state.json`'s `pts`).
3. Spike the Durable Object transport; decide stage 2 on the result.
