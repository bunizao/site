# Phase 0 — Foundations

**Goal:** land the shared types and the database schema everything else depends on. No
user-visible change. Keep this PR small and boring — it unblocks all later phases.

**Depends on:** nothing. **Unblocks:** P1, P2, P3, P4.

---

## Scope

1. Contract types in `@bunizao/contracts` (canonical in `site`).
2. D1 migration `0003` in `site-api`: sentiment columns, `mood_post_tags`, `mood_posts_fts`.

Out of scope: any ingest logic, AI, endpoints, UI. Those are later phases.

---

## Steps

### Step 0.1 — Contract types (`site`)
Add to `@bunizao/contracts`:
- `MoodSentiment` — `{ label: MoodSentimentLabel; score: number; model: string; at: string }`
  where `MoodSentimentLabel = 'joy'|'calm'|'melancholy'|'anger'|'anxiety'|'neutral'`.
- `MoodStatsSnapshot` — `{ activity, rhythm, sentimentTimeline, streaks, media, totals,
  generatedAt }` (shapes per PRD §5 KV snapshot).
- `MoodAiConfig` — `{ primary: MoodAiModel; fallback: MoodAiModel; updatedAt: string }` and
  `MoodAiModel` as an allowlist union (`'claude-haiku-4-5'|'claude-sonnet-4-6'|'claude-opus-4-8'`).
- `MoodIngestHealth`, `MoodSearchResult` (fields per PRD §6).
- Extend the mood feed query type with optional `tag?: string`.

Then run `bun run sync:contracts` in `site-api` so both copies match.

**Verify:** `bun run check` in `site`. Importing `MoodStatsSnapshot` type-checks; assigning an
out-of-allowlist sentiment label or model fails type-check.

### Step 0.2 — D1 migration `0003` (`site-api`)
Create `migrations/0003_mood_adv.sql`:
- `ALTER TABLE mood_posts ADD COLUMN sentiment_label TEXT;` (+ `sentiment_score REAL`,
  `sentiment_model TEXT`, `sentiment_at TEXT`) — all nullable.
- `CREATE TABLE IF NOT EXISTS mood_post_tags (channel TEXT, message_id INTEGER, tag TEXT,
  PRIMARY KEY (channel, message_id, tag));` + `CREATE INDEX IF NOT EXISTS mood_post_tags_tag_idx
  ON mood_post_tags(tag);`
- `CREATE VIRTUAL TABLE IF NOT EXISTS mood_posts_fts USING fts5(...)` over post `text`, with a
  documented sync strategy — prefer AFTER INSERT/UPDATE/DELETE triggers on `mood_posts`; if
  triggers are awkward with the existing PK, document that ingest + backfill will maintain it.

**Verify:**
- Migration applies cleanly on a fresh DB and re-applies safely (`IF NOT EXISTS` where possible).
- `SELECT sentiment_score FROM mood_posts LIMIT 1;` returns NULL, no error.
- Duplicate `(channel, message_id, tag)` insert fails the PK constraint.

---

## Acceptance
- `@bunizao/contracts` exports all new types; both repo copies byte-identical.
- Migration `0003` present and applies on fresh + existing DB.
- Gates pass: `bun run check`, `bun run test:unit`, `bun run build` in both repos.

## Negative cases to cover
- Out-of-allowlist sentiment label / AI model → type error.
- Duplicate tag row → constraint error (proves the PK works).
