# Incident: Mood D1 Daily Row-Read Quota Exhaustion

Status: Resolved  
Date: 2026-09-01 (P0-2026-09-02-MOOD-D1)

## Summary

The `site-mood` D1 database burned through the Workers Free allowance of
5,000,000 rows read per day. Cloudflare answered every binding query with
error 7500, `/api/v2/mood` returned 500, and `/mood` rendered an empty
skeleton for the rest of the UTC day. The live Telegram reader
(`/api/v1/mood`, `/api/moods`) was healthy the whole time, but three layers
had switched their fallback off, so nothing used it.

## Root cause

D1 bills rows scanned, not rows returned. Two paths full-scanned the
~3,300-row `mood_posts` table on every call:

- Feed group expansion (legacy same-second photo pairs and media-group
  albums) ran unpinned `datetime IN (...)` and `media_group_id IN (...)`
  queries with `ORDER BY message_id DESC`, and SQLite chose the feed index
  over the partial indexes. About 6.37M rows a day.
- The reconcile job on `orange-sin` (every five minutes) selected due rows
  and updated `last_verified_at` with statements that scanned the table.
  About 6.32M rows a day.

`fallback=0`, which the site SSR sends on every archive read, was also wired
as a cache bypass, so each `/mood` render paid for the full expansion.

## Fix

- **Degradation chain.** site-api wraps the D1 repository in an availability
  fallback: an archive failure serves the Telegram live reader, a quota error
  trips a per-isolate circuit breaker until 00:00 UTC, and when both readers
  fail the default feed page comes from a KV last-known-good copy. Responses
  carry `X-Mood-Source: archive | live | stale`. The site SSR falls back to
  the live reader on any archive failure, and the browser feed degrades from
  `/api/v2/mood` to `/api/moods`. Tag-filtered reads stay archive-only.
- **`fallback=0` no longer bypasses the edge cache.** Only `fresh` does.
- **Index pinning.** Every `mood_posts` statement in the feed, detail, and
  reconcile paths carries `INDEXED BY` on an existing index, and the
  expansion queries dropped their `ORDER BY`. No migration was needed, which
  mattered because D1 was locked while the fix shipped.
- **Query-plan gate.** `tests/unit/mood/mood-query-plans.test.ts` in site-api
  runs the real statements through `EXPLAIN QUERY PLAN` and fails on any
  `SCAN mood_posts` or temp sort.

## Follow-ups

- Configure a D1 rows-read alert in the Cloudflare dashboard; nothing warns
  before the lockout.
- The reconcile timer on `orange-sin` kept firing during the lockout and
  failed harmlessly. Its statements are now index seeks; re-check
  `wrangler d1 insights site-mood` after a full day.
- Restart the D1 circuit breaker check after the 00:00 UTC reset by
  confirming `X-Mood-Source: archive` on `/api/v2/mood?limit=1`.
