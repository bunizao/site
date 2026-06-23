# Phase 1 — Tags (click-to-filter)

**Goal:** click any tag → see every post carrying it. Cheapest user value, zero AI.

**Depends on:** P0 (schema + contracts). **Unblocks:** nothing (independent of P2/P3/P4).

---

## Scope
Tag extraction at ingest, tag backfill for history, indexed tag filter API, and clickable tags in
the feed UI.

Out of scope: sentiment, stats page, dev portal.

---

## Steps

### Step 1.1 — Tag extractor (`site-api`)
Pure function `extractTags(entities, text) -> string[]`:
- Parse Telegram hashtag entities; fallback to slicing `text` by `offset/length` when the entity
  has no text.
- Normalize: strip `#`, lowercase, dedupe, drop empties.
- No DB/network. Unit tests: casing dedupe (`#Claude` + `#claude` + body `#AI` → `['claude','ai']`),
  no-hashtag post → `[]` (never null), offset-slice fallback.

### Step 1.2 — Populate tags at ingest (`site-api`)
On webhook ingest of a new/edited post, upsert `mood_post_tags`. On edit, **replace** the post's
prior tags (delete-then-insert for that `(channel, message_id)`).
- Verify: ingesting `#happy great morning` yields a `mood_post_tags` row `tag='happy'`.

### Step 1.3 — Backfill tags for history (`site-api`)
Script that walks all existing posts and populates `mood_post_tags` via `extractTags`. Idempotent
(safe to re-run). This is tag-only; sentiment backfill is Phase 3.
- Verify: after running, a known historical `#`-tagged post appears in `mood_post_tags`.

### Step 1.4 — Tag filter on archive feed API (`site-api`)
Extend `GET /v2/mood` to accept `tag`, joining `mood_post_tags` (indexed), ordered `datetime
DESC`, with existing pagination. Normalize the param (lowercase, strip `#`) before lookup.
- Verify: `/v2/mood?tag=claude` returns only `claude`-tagged posts; `?tag=doesnotexist` → empty
  list with valid pagination shape (not an error).

### Step 1.5 — Wire through `api-client.ts` + UI (`site`)
- Add optional `tag` to `MoodFeedQuery` in `src/features/mood/server/api-client.ts`; pass to the
  archive source. The filtered post **list** comes from the archive; individual post rendering
  stays live where applicable (PRD invariant).
- `/mood` reads the `tag` search param; when present, render the filtered feed with a visible
  "filtered by #tag" indicator + a clear/reset control.
- Tags on posts/cards become real keyboard-accessible `<a href="/mood?tag=...">` (not div+onClick).

---

## Acceptance
- Clicking `#claude` navigates to `/mood?tag=claude`; list shows only `#claude` posts.
- New posts get tags at ingest; all history tagged via backfill.
- Gates pass in both repos.

## Negative cases
- `/mood?tag=unknown` → empty state, not full feed, not a crash.
- Post with no hashtags → `extractTags` returns `[]`.
- Re-running tag backfill → no duplicate rows (PK holds).

## Verification (UI)
Use repo Playwright (preview tab pauses rAF) to confirm tag-click navigation and the
filtered/empty states. Compress screenshots before attaching.
