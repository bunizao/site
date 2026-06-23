# Phase 4 — Dev portal data (ingest health + search)

**Goal:** give the maintainer ops visibility — archive-vs-live drift, enrichment coverage, and
full-text search over the archive.

**Depends on:** P0 (schema/contracts). Health drift is more meaningful after P1/P3 enrichment but
does not block on them. **Unblocks:** nothing.

---

## Scope
Ingest-health endpoint + panel, FTS5 search endpoint + console. Both behind the existing admin
guard, mounted in the existing dev portal shell. The model selector itself ships in Phase 3
(Step 3.7) — this phase assembles the rest of the Mood data page around it.

Out of scope: any new auth (reuse the portal's session).

---

## Steps

### Step 4.1 — Ingest health endpoint (`site-api`)
`GET /v2/admin/mood/health` (admin guard) → `MoodIngestHealth`:
- last ingested `message_id` + `datetime`, live latest id (probe), **drift count**,
  sentiment coverage (scored/total), tag coverage, snapshot `generatedAt`.
- Negative: unauthenticated request → guard rejects (401/redirect), not served.

### Step 4.2 — FTS search endpoint (`site-api`)
`GET /v2/admin/mood/search?q=` (admin guard) → `MoodSearchResult[]`
(`{ id, datetime, snippet, tags, sentiment_label }`), querying `mood_posts_fts`.
- Empty `q` → empty result + a "type to search" prompt; **never** a full-table dump.
- Negative: unauthenticated → rejected.

### Step 4.3 — Dev portal Mood data page (`site`)
In the existing portal shell (reuse layout + admin session):
- **Health panel** bound to `/v2/admin/mood/health` (drift, coverage, last ingested, snapshot age).
- **Search console** bound to `/v2/admin/mood/search`: query input + results list with snippet and
  a link to the post/detail.
- Sits alongside the Phase 3 model selector on the same page.

---

## Acceptance
- Authenticated maintainer sees drift + coverage and can full-text search the archive.
- All endpoints reject unauthenticated access via the existing guard.
- Gates pass in both repos.

## Negative cases
- Archive lagging live by N → panel shows `drift = N`.
- Empty search query → prompt, not full dump.
- Unauthenticated request to any `/v2/admin/mood/*` → rejected.

## Verification (UI)
Repo Playwright behind an authenticated session for the panel + search interaction; compress
screenshots.
