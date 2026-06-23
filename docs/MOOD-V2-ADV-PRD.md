# Mood V2 Advanced — Analytics, Sentiment & Tags

Status: **planned** (2026-06-18) · Owner: bunizao · Builds on [`MOOD-V2-PRD.md`](./MOOD-V2-PRD.md)

This is the **spec** (why / what / invariants). The **how**, broken into small shippable
phases, lives in [`plans/mood-v2-adv/`](./plans/mood-v2-adv/README.md). Read this for context,
then execute the phase plans in order.

---

## 1. Problem & Goal

The Mood D1 archive (v2) exists but only serves backup/structured reads. Turn it into
**insight and discovery** without changing the read-path contract:

- **Discovery:** click any tag → see every post carrying it.
- **Insight (public):** activity heatmap, hour×weekday rhythm, a sentiment timeline, posting
  streaks, media composition.
- **Insight (private):** a dev-portal data page with ingest health, full-text search, and
  **free LLM-model selection** for the AI features.

Hard constraint inherited from `MOOD-V2-PRD.md`: **user-facing post reads stay on the live v1
Telegram mirror.** D1 is the analytics source of truth, not a read replacement.

---

## 2. Architecture: three data planes

Keep these separated — mixing them is the main failure mode.

| Plane | Source | Consumer | Rule |
| --- | --- | --- | --- |
| **Public analytics** | KV snapshot (cron-computed from D1) | `/mood/stats`, anonymous traffic | One KV read per visit. **Never query D1 from the public path.** |
| **Private analytics** | D1 direct (indexed/FTS) | dev portal, behind admin guard | Ad-hoc, low-frequency, authenticated. |
| **Post reads** | live v1 Telegram mirror | `/mood`, `/mood/[id]` | Unchanged. Real-time comments/reactions. |

```
Telegram webhook ─► ingest enrichment ─► D1 (mood_posts, source of truth)
                    (tags + sentiment)        │
                                              ├─► hourly Cron ─► KV snapshot ─► /v2/mood/stats ─► /mood/stats (public)
                                              └─► D1 direct (FTS / joins) ─────────────────────► dev portal (admin)
```

Two repos:
- **`site`** (canonical, public worker): frontend pages, `@bunizao/contracts` (canonical),
  `api-client.ts` archive plumbing, dev-portal frontend.
- **`site-api`** (private worker): D1, KV, ingest webhook, cron, admin guard, **all AI calls**,
  the BYOK secret.

Contracts are edited in `site` first, then mirrored to `site-api` via `bun run sync:contracts`
(run in `site-api`). Both copies stay byte-identical.

---

## 3. Enrichment at ingest (never at read)

Computed **once** when a post is written, stored on the row. Read/aggregation paths never call AI.

### 3.1 Tags
- Extract from Telegram **hashtag entities** (fallback: slice `text` by `offset/length`).
- Normalize: strip leading `#`, lowercase, dedupe.
- Store in **`mood_post_tags`** (indexed on `tag`) — not `json_each` scans, so filtering stays
  indexed as the archive grows.

### 3.2 Sentiment
- Classify text → `{ label, valence }`, `label ∈ {joy, calm, melancholy, anger, anxiety,
  neutral}`, `valence ∈ [-1, 1]`. **(Decided — fixed taxonomy, both a label and a score.)**
- Store `sentiment_label`, `sentiment_score`, `sentiment_model`, `sentiment_at` on `mood_posts`.
- **Sentiment failure must not fail ingest** — post still written, sentiment null, filled later.
- Empty/whitespace text → `neutral / 0` **without** an API call.

---

## 4. AI stack (BYOK, provider-agnostic, model-selectable)

**Workers AI is out.** Provider is BYOK Anthropic.

- **SDK:** Vercel AI SDK (`ai`) + `@ai-sdk/anthropic`, structured output via `generateObject` +
  `zod`. Chosen for provider-swappability and one unified API for future AI features.
- **Gateway:** route through **Cloudflare AI Gateway** (`ai-gateway-provider`) for token-spend
  analytics, caching, and provider fallback.
- **No LangChain** — violates the no-heavy-abstraction rule.
- **Secret:** `wrangler secret put ANTHROPIC_API_KEY` in `site-api`. Server-side only. **Never**
  reaches the public worker, the browser, or D1.

### 4.1 Model selection lives in the dev portal (not hardcoded)
The model is **runtime-configurable from the Mood dev portal**, not pinned in code:

- An allowlist of selectable models is defined in `@bunizao/contracts` (e.g. `claude-haiku-4-5`,
  `claude-sonnet-4-6`, `claude-opus-4-8`), so UI and server agree.
- The active config (primary + fallback model) is persisted in KV (`mood:ai:config`).
- The AI client reads this config per call (short cache), falling back to **`claude-haiku-4-5`**
  when unset — the sensible cheap default for high-frequency ingest classification.
- The dev portal exposes a selector to change primary/fallback; changes take effect for
  subsequent classifications (and any future interactive AI).

### 4.2 Backfill
All ~3000 historical posts scored in **one resumable batch run** via the **Anthropic Batch API**
(50% cost), using the currently-configured model. Idempotent: re-running skips posts that already
have a `sentiment_score` unless `--force`. Tags backfilled in the same pass. Failed items logged
and left null (never written as `0`).

---

## 5. Data model

### `mood_posts` (existing — add columns)
PK `(channel, message_id)`. New nullable columns:
`sentiment_label TEXT`, `sentiment_score REAL` (valence `[-1,1]`), `sentiment_model TEXT`,
`sentiment_at TEXT` (ISO).

### `mood_post_tags` (new)
```
channel TEXT, message_id INTEGER, tag TEXT,
PRIMARY KEY (channel, message_id, tag),
INDEX (tag)
```

### `mood_posts_fts` (new, FTS5)
Full-text over `text`, synced via triggers (preferred) or rebuilt by ingest + backfill. Used by
dev-portal search.

### KV `mood:stats:v1` (new — public snapshot)
```jsonc
{
  "activity":          [{ "date": "2026-06-18", "count": 4 }],
  "rhythm":            [[/* 24 */], /* ...7 weekdays */],
  "sentimentTimeline": [{ "bucketStart": "2026-06-15", "avgValence": 0.42,
                          "dominantLabel": "calm", "scoredCount": 12 }], // weekly buckets, daily also kept
  "streaks":           { "current": 12, "longest": 30 },
  "media":             { "text": 10, "photo": 5, "video": 1, "other": 0 },
  "totals":            { "posts": 3000, "firstPostAt": "...", "lastPostAt": "..." },
  "generatedAt":       "2026-06-18T10:00:00Z"
}
```

### KV `mood:ai:config` (new — dev-portal AI settings)
```jsonc
{ "primary": "claude-haiku-4-5", "fallback": "claude-sonnet-4-6", "updatedAt": "..." }
```

---

## 6. Surfaces

### Public
| Route | Purpose |
| --- | --- |
| `/mood?tag=:tag` | Live feed filtered to a tag. Post **list** from D1 tag join; rendering stays live. Tags are real keyboard-accessible anchors. Unknown tag → empty state, not full feed. |
| `/mood/stats` | Activity heatmap, rhythm, sentiment timeline, streaks, media composition. **Single fetch** of `/v2/mood/stats`. Friendly empty state when snapshot not ready. |
| `GET /v2/mood/stats` | Returns the KV snapshot. Missing snapshot → documented unavailable response; **never** live D1 compute. Aggregate-only, no raw text/PII. |
| `GET /v2/mood?tag=` | Existing archive feed + indexed tag filter. |

### Private (dev portal, existing admin guard)
| Route | Purpose |
| --- | --- |
| `GET /v2/admin/mood/health` | Last ingested id/datetime, live latest (probe), drift, sentiment + tag coverage, snapshot `generatedAt`. |
| `GET /v2/admin/mood/search?q=` | FTS5 search → `{ id, datetime, snippet, tags, sentiment_label }[]`. Empty query → prompt, never full-table dump. |
| `GET/PUT /v2/admin/mood/ai-config` | Read/update the LLM model selection (`mood:ai:config`). Allowlisted models only. |
| `/portal/mood` (site) | Mood data page: health panel + search console + **model selector**. Reuse existing portal shell + session. |

### Visualization notes
- Activity heatmap = GitHub-style calendar by local date; color by posts/day; accessible hover.
- Rhythm heatmap = 7×24 grid; reuse calendar color tokens.
- Sentiment timeline = avg valence per bucket; **zero-scored buckets render as gaps, not 0**.
- Respect `prefers-reduced-motion`; reuse existing mood design tokens + SVG/chart conventions.

---

## 7. Phased delivery

Big-bang is out. Ship in five independently-verifiable phases — see
[`plans/mood-v2-adv/`](./plans/mood-v2-adv/README.md):

| Phase | Ships | AI? |
| --- | --- | --- |
| **0 — Foundations** | contracts + D1 migration `0003` | no |
| **1 — Tags** | click-to-filter tags end to end | no |
| **2 — Activity analytics** | `/mood/stats` minus sentiment (heatmaps, streaks, media) | no |
| **3 — AI sentiment** | AI stack + dev-portal model selection + sentiment timeline + backfill | yes |
| **4 — Dev portal data** | ingest health + FTS search console | no |

Phases 1 and 2 deliver real value with zero AI cost/risk; AI is isolated to Phase 3.

---

## 8. Quality gates
Every change must pass: `bun run check`, `bun run test:unit`, `bun run build`.
UI phases may add `bun run test:e2e:site` where it helps.

---

## 9. Non-goals
- Moving user-facing reads off live v1.
- Cloudflare Workers AI (BYOK Anthropic only).
- Tag cloud / frequency widget (tags are click-to-filter only).
- Reaction/comment-count rankings as live — those are **frozen at ingest** in D1; label as
  archive-time or omit.
- Site-visitor engagement analytics (who viewed what) — separate **Analytics Engine** effort.
- Recomputing aggregates or calling AI on the read path.

---

## 10. Invariants (do not violate)
- **Public path never touches D1.** Snapshot missing ⇒ unavailable response, not live compute.
- **AI only at ingest/backfill/cron**, never on read.
- **BYOK key is server-side only** in `site-api`; model selection is allowlisted.
- **Frozen counts**: reaction/comment counts in D1 are archive-time; never present as live.
- **Backfill is idempotent + resumable**; failures leave null, never fabricated `0`.
- **Empty-data correctness**: empty DB / empty buckets / unknown tag → valid empty states.
