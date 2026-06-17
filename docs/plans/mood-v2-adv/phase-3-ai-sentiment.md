# Phase 3 — AI sentiment (BYOK, model-selectable)

**Goal:** add the mood curve. Stand up the AI stack, make the **model selectable from the dev
portal**, classify at ingest, backfill history, and fill the sentiment timeline in the existing
snapshot/page.

**Depends on:** P0 (schema/contracts) + P2 (snapshot pipeline + stats page). **Unblocks:** future
AI features (embeddings, summaries) reuse this stack.

---

## Scope
AI client + gateway, dev-portal model selection, sentiment classifier, ingest wiring, batch
backfill, snapshot `sentimentTimeline`, timeline component.

This is the only phase that spends money. Isolate it.

---

## Steps

### Step 3.1 — Install + configure AI stack (`site-api`)
- `bun add ai @ai-sdk/anthropic ai-gateway-provider zod`; commit lockfile.
- Env/config: CF account id, AI Gateway id (vars); `wrangler secret put ANTHROPIC_API_KEY`.
- `ai-client` module: `createAiGateway([...])` with a primary + fallback model **read from
  `mood:ai:config`** (Step 3.2), defaulting to `claude-haiku-4-5` → `claude-sonnet-4-6` when unset.
- The key is read server-side only; add a guard/comment that public-site code never imports it.
- Negative: unset `ANTHROPIC_API_KEY` → clear configuration error, no unauthenticated call.

### Step 3.2 — Model selection config + admin endpoint (`site-api`)
- `GET/PUT /v2/admin/mood/ai-config` behind the existing admin guard; reads/writes KV
  `mood:ai:config` (`MoodAiConfig`).
- PUT validates `primary`/`fallback` against the contract allowlist; reject anything else.
- Negative: PUT with a non-allowlisted model → 400; unauthenticated request → guard rejects.

### Step 3.3 — Sentiment classifier (`site-api`)
`classifySentiment(text) -> { label, score, model }` via `generateObject` + the contract zod
schema (label union + valence `[-1,1]`). Returns the model id actually used (for `sentiment_model`).
- Empty/whitespace text → `{ neutral, 0 }` **without** an API call.
- Schema-violating model output is retried/rejected by `generateObject`, never returned malformed.
- Unit tests (mocked AI): empty short-circuit; happy path returns an allowlisted label.

### Step 3.4 — Wire sentiment into ingest (`site-api`)
Extend the ingest write path (alongside Phase 1 tag upsert) to classify + store
`sentiment_label/score/model/at`.
- **Failure must not fail ingest** — post still written, sentiment null, retried by sweep/backfill.
- Test (mocked AI): ingesting a post yields non-null `sentiment_score`; AI throwing still persists
  the post and returns success.

### Step 3.5 — Batch backfill (`site-api` script)
`scripts/backfill-mood-sentiment.ts`: select posts missing `sentiment_score`, submit via the
**Anthropic Batch API** (50% cost) using the configured model, write results back.
- Idempotent + resumable; `--force` re-scores. Failed items logged, left null (never `0`).
- Summary reports unscored count. Document run command + required secret in the header.
- Verify: on a DB with 100/3000 scored, only the remaining 2900 are processed.

### Step 3.6 — Fill `sentimentTimeline` (`site-api`)
Replace the Phase 2 stub: aggregate avg valence per bucket (weekly default; daily also kept),
with `dominantLabel` and `scoredCount`. **Exclude null scores; zero-scored buckets are gaps, not
0.** Cron snapshot now includes real timeline data.

### Step 3.7 — Timeline component + model selector UI (`site`)
- `/mood/stats`: render `sentimentTimeline` as a line/area of avg valence; optional tint by
  `dominantLabel`. Empty timeline → "not enough data yet". Gap buckets render as gaps.
- Dev portal Mood page: a **model selector** (primary + fallback dropdowns from the allowlist)
  bound to `GET/PUT /v2/admin/mood/ai-config`.

---

## Acceptance
- 100% of history has a non-null `sentiment_score` after backfill.
- New posts get sentiment at ingest (non-blocking on failure).
- `/mood/stats` shows the mood curve; dev portal can switch the LLM model and it takes effect for
  subsequent classifications.
- Gates pass in both repos.

## Negative cases
- AI throws at ingest → post still saved.
- Non-allowlisted model in PUT → 400.
- Bucket with zero scored posts → gap, not fabricated 0.
- Backfill failure → null, not `0`; re-run skips already-scored.
