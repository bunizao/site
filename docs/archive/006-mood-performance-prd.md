# PRD 006 — Mood Navigation & Read-Path Performance

- **Status:** Archived as shipped
- **Date:** 2026-07-10
- **Scope:** `site` repo (primary), `../site-api` (one cross-repo story, flagged)
- **Baseline measured:** production `buxx.me`, 2026-07-10 (see Appendix A)

## 1. Problem

The mood surface couples user-facing latency to live Telegram scraping. Every
cache miss renders HTML by fetching `t.me` synchronously, and the anchor
deep-link scheme (`/mood?N`) fragments every cache layer so misses are the
common case, not the exception.

Measured cold TTFB on production:

| URL | Cold (cache MISS) | Warm |
| --- | --- | --- |
| `/mood?3640` (detail → feed return) | 4.6 s | 0.24 s |
| `/mood?9999` (stale deep link) | 4.4 s | — |
| `/mood/3646` (detail page) | 3.0–3.4 s | fast |
| `/mood` (no query) | 2.8 s | 0.3 s |

Four stacked causes, all confirmed in code:

1. **Query strings bypass the worker edge cache.** `createHtmlCacheOptions`
   ([responses.ts](../../src/features/agent-markdown/server/responses.ts)) returns
   `cacheSearch = null` for any URL with a search string unless the route
   policy defines `normalizeHtmlCacheSearch`. `/mood` defines none, so every
   `/mood?N` skips the worker cache. Cloudflare CDN then caches per unique
   URL — an unbounded key space where nearly every request is cold.
2. **Anchor SSR makes up to two sequential upstream fetches.**
   `loadInitialMoodFeed` ([mood.astro](../../src/pages/mood.astro)) awaits the
   focused window (`before = N+11`) and, when the anchor id is absent, awaits
   a second fallback fetch (`before = N+1`). Stale deep links always pay both.
3. **Per-post comment-count fetches are uncapped.** `getCommentsCount`
   ([telegram-source.ts](../../src/features/mood/server/telegram-source.ts))
   falls back to one `t.me/{channel}/{id}?embed=1&discussion=1` request per
   post with `retry: 2` and **no timeout**. The main feed fetch is capped at
   3 s; these are not, and page latency is the slowest of ~20 parallel
   subrequests.
4. **Detail pages recompute everything every 60 s.**
   `MOOD_DETAIL_PAGE_CACHE_TTL_SECONDS = 60`
   ([registry.ts](../../src/features/agent-markdown/server/registry.ts)) while a
   cold detail render costs ~3 s (embed fetch + `enrichDetailPost`
   subrequests).

The structural fix already has infrastructure waiting: the D1 archive read
path is built in `site-api` and reachable via the `API` service binding
(`loadMoodFeed` with `source === 'archive'`), but reads default to `live`
because D1 lacks live comment counts and reactions.

## 2. Goals

- Cold `/mood?N` TTFB ≤ 3.2 s after WS1–WS3 (single capped upstream fetch),
  ≤ 1.0 s after WS5 (D1 base render).
- Anchor URLs share cache entries: the `/mood?N` key space collapses from
  one-per-id to one-per-10-ids bucket.
- No SSR render path performs more than one *sequential* upstream `t.me`
  round-trip.
- Every upstream subrequest on the SSR path has an explicit timeout.
- Detail pages serve from cache with stale-while-revalidate instead of
  recomputing every 60 s.
- D1 becomes the default base render behind a reversible flag; comment
  counts/reactions hydrate client-side.

## 3. Non-Goals

- The uncommitted working-tree perf changes (no-transform removal, lazy
  video hydration, feed TTL 300 s + SWR 1800 s, analytics delay). **Owner
  handles testing/commit/deploy separately; this PRD assumes they are on
  `main` and deployed before execution starts.** If they are not, stop and
  confirm before touching `middleware.ts`, `responses.ts`, or
  `registry.ts` — the stories below build on that plumbing (notably
  `cacheStaleWhileRevalidateSeconds`).
- Writing new content into D1 (the archive sink pipeline already exists).
- Redesigning the mood UI, wheel, or update watcher.
- Home page / blog performance items (tracked separately; several already
  landed on `main`).
- Removing the live t.me scrape path — it remains as the fallback source.

## 4. Success Metrics

- `curl` cold-TTFB checks (Appendix A) meet the targets in §2.
- Lighthouse performance (median of 5 runs, LHCI config) ≥ 0.90 on `/mood`.
- Worker edge-cache header `x-buxx-mood-page-cache` returns `HIT` for a
  second request to a *different* anchor id in the same 10-id bucket.
- Zero regressions in `bun run test:unit` and mood e2e flows.

## 5. Work Streams

Execution order: WS1 → WS2 → WS3 → WS4 are independent quick wins (WS2/WS3
can run in parallel with WS1). WS5 depends on WS1–WS4 only for measurement
clarity, not code.

---

### WS1 — Bucketed anchor cache (`/mood?N`)

**Design decision (approved):** keep SSR-rendered anchor windows, but
normalize the cache key and fetch cursor to 10-id buckets. Precise scroll
positioning stays client-side (existing `#mood-N` fragment logic, which
already reads the anchor from `location.search`).

Bucket math: for anchor `N`, bucket base `B = ceil(N / 10) * 10`
(`B ≥ N`, `B − N ≤ 9`). Window cursor becomes `B + 11` instead of `N + 11`.
t.me returns ~20 messages per page, so any `N ≥ B − 9` stays inside the
window; id gaps larger than that already fail today and are covered by the
fallback fetch.

#### US-101 — Bucketed window cursor helpers

As a visitor following a `/mood?N` link, I want nearby anchors to share one
SSR window so my navigation hits a warm cache.

Acceptance criteria:
- `feed-anchor.ts` gains a bucket helper (e.g.
  `getMoodFeedAnchorBucketBase(anchorId)`) and
  `getMoodFeedAnchorWindowBeforeCursor` returns the bucketed cursor
  (`B + 11`).
- Example: anchors `3631` and `3640` both produce window cursor `3651`;
  anchor `3641` produces `3661`.
- Negative case: non-numeric or empty anchor returns `''` (unchanged
  behavior).
- Existing fragment/scroll behavior unchanged: SSR HTML for bucket `3640`
  still contains `id="mood-3631"` when 3631 exists, and the client scrolls
  to it.
- Unit tests cover bucket boundaries (`N = B`, `N = B − 9`) and the
  20-message window guarantee.

#### US-102 — `normalizeHtmlCacheSearch` for `/mood`

As the worker, I want `/mood?N` to hit the HTML edge cache under a
normalized key instead of bypassing it.

Acceptance criteria:
- The `/mood` route policy in `registry.ts` defines
  `normalizeHtmlCacheSearch`: empty search → `''`; a valid anchor →
  canonical bucketed form (e.g. `?anchor-bucket=3640`); any other search →
  `null` (no cache, current behavior). Follow the existing
  `normalizeMoodEmbedCacheSearch` pattern
  ([embed-query.ts](../../src/features/mood/server/embed-query.ts)).
- Example: `/mood?3631` and `/mood?3640` read/write the same worker cache
  entry; second request returns `x-buxx-mood-page-cache: HIT`.
- Example: `/mood` (no query) keeps its existing cache entry and TTL/SWR.
- Negative case: `/mood?utm_source=x` is not cached and not normalized into
  a bucket key.
- Per `createHtmlCacheOptions`, defining a normalizer switches the CDN-facing
  `Cloudflare-CDN-Cache-Control` to `no-store` for these variants — verify
  the browser-facing `Cache-Control` still carries `s-maxage` so the
  worker cache remains authoritative. Document the final header matrix in
  the story PR.

#### US-103 — Fallback renders must not poison the bucket cache

As the worker, I want anchor responses produced by the per-id fallback path
to skip HTML caching, so one odd id can't cache wrong content for its whole
bucket.

Acceptance criteria:
- When `loadInitialMoodFeed` resolves via the fallback fetch (anchor missing
  from the bucketed window), the response is marked uncacheable for the
  worker HTML cache (e.g. a locals flag or response header consumed by
  `cacheHtmlPageResponse` / `isResponseCacheable`).
- Example: `/mood?9999` (nonexistent id) renders, returns, and a subsequent
  `/mood?9995` still triggers a fresh render (no HIT of poisoned content).
- Negative case: normal bucket-window renders still cache (HIT on second
  same-bucket request).
- Unit test exercises the uncacheable marker end-to-end through
  `withContentPolicy`/`cacheHtmlPageResponse`.

---

### WS2 — Parallelize the anchor window + fallback fetches

#### US-201 — Concurrent focused/fallback loads

As a visitor with a stale deep link, I want the SSR to fire both candidate
window fetches concurrently so the worst path costs one round-trip, not two.

Acceptance criteria:
- `loadInitialMoodFeed` in `mood.astro` starts the focused
  (`before = bucketCursor`) and fallback (`before = N + 1`) fetches
  together (e.g. `Promise.allSettled`) whenever both cursors are distinct;
  selection logic (prefer focused-containing-anchor, then non-empty
  fallback, then merged focused) is unchanged.
- Example: anchor present in focused window → fallback result discarded,
  rendered HTML identical to today.
- Example: `/mood?9999` completes in roughly one upstream round-trip
  (measured locally with a mocked slow source: total ≈ max, not sum).
- Negative case: one fetch rejecting does not fail the page if the other
  succeeds; both rejecting falls through to the existing
  `loadMoodFeed(context)` default (wrap so the catch path still works).
- Note the trade-off in the PR: one extra upstream request per anchor miss
  of the *worker* cache (bucket cache from WS1 makes this rare). The
  fallback fetch may be skipped entirely when the focused window already
  contains the anchor — but that's only knowable after the focused fetch
  returns; keep it simple and always fire both, relying on the t.me edge
  cache in `telegram-source.ts` to absorb duplicates.

---

### WS3 — Cap every per-post upstream subrequest

#### US-301 — Timeout on comment-count and enrichment fetches

As the SSR path, I want every t.me subrequest bounded so tail latency can't
exceed the main fetch's 3 s cap.

Acceptance criteria:
- `getCommentsCount` discussion fetch gets `timeout` (1500 ms) and
  `retry: 0`; on timeout it returns `0` (existing catch path) and does not
  cache a wrong value (only cache on success).
- Audit `telegram-source.ts` for the other uncapped `$fetch` calls on the
  render path (`fetchTelegramPostMeta`, embed-state fetch,
  `enrichDetailPost` internals) and apply the same cap. List each call site
  and its chosen timeout in the PR description.
- Example: with a mocked upstream that stalls 10 s on discussion pages, a
  20-post feed render completes in < 4 s and shows `commentsCount: 0` for
  affected posts.
- Negative case: fast upstream (< 1.5 s) still returns real counts;
  existing unit tests for comment parsing stay green.
- No timeout added to background/off-path fetches that don't block SSR
  (leave them as-is; note which in the PR).

---

### WS4 — Detail page TTL + SWR alignment

#### US-401 — `/mood/[id]` cache policy

As a visitor opening a mood detail page, I want it served from cache with
background revalidation instead of a 3 s recompute every 60 s.

Acceptance criteria:
- `MOOD_DETAIL_PAGE_CACHE_TTL_SECONDS` raised 60 → 300 and the
  `matchMoodPost` policy gains
  `cacheStaleWhileRevalidateSeconds` (1800), matching the feed policy.
  (Requires the SWR plumbing from the working-tree changes — see §3.)
- Example: response headers on `/mood/3646` show
  `s-maxage=300, stale-while-revalidate=1800` (browser-facing) and the
  equivalent `Cloudflare-CDN-Cache-Control`.
- Negative case: `/mood/[id]` with a query string keeps current behavior
  (no cache-key change in this story).
- `tests/unit/agent-markdown-registry.test.ts` updated for the new values.
- Trade-off accepted: a new comment on a post may take up to ~5 min to show
  in the SSR HTML. Live counts return via WS5 client hydration; do not
  block this story on it.

---

### WS5 — D1 base render with client-side live-count hydration

**Design decision (approved):** gradual, flag-gated rollout. `live` scrape
remains the fallback. This reverses the standing "user reads stay live"
decision *only* for base content; freshness-sensitive bits (comment counts,
reactions) move to client-side hydration where eventual consistency is
acceptable.

Read-source switch already exists: `resolveMoodReadSource` reads the
`MOOD_READ_SOURCE` env (`live` | `archive`) with per-request `?source=`
override; archive reads go through the `API` service binding to `site-api`.

#### US-501 — Archive read parity validation

As the owner, I want proof the archive path renders an equivalent feed
before any default flips.

Acceptance criteria:
- A checklist (committed as `docs/` note or PR description) comparing
  `/mood?source=archive` vs `/mood` on production: post ordering, media
  rendering (photos/videos/albums via `/static/` proxy), rich text, link
  previews, anchor windows (`/mood?N&source=archive`), detail pages, RSS
  unaffected.
- e2e: mood flow test parameterized to run once with `source=archive`
  against fixtures (extend `tests/e2e/mood-flow.pw.ts`).
- Example: `/mood/3646?source=archive` renders the same post body as the
  live variant (allowing missing commentsCount/reactions).
- Negative case: archive service binding unavailable →
  `fetchMoodArchiveApiJson` throws → page falls back per US-503's fallback
  behavior (before US-503 lands, document the current failure mode).
- Gaps found are filed as blockers on US-503, not silently accepted.

#### US-502 — Live-counts hydration endpoint + client wiring

As a visitor, I want comment counts and reactions to appear shortly after
load even when the base HTML came from D1.

**Cross-repo:** the endpoint lives in `../site-api` (separate deploy);
contract is owned here.

Acceptance criteria:
- Contract added to `@bunizao/contracts` (this repo is canonical; run
  `bun run sync:contracts` in `../site-api` after):
  `GET /api/v2/moods/live-counts?ids=<id,id,...>` →
  `{ counts: { [id]: { commentsCount: number | null, reactions: Reaction[] | null } } }`,
  max 30 ids per request, cacheable `s-maxage=60`.
- `site-api` implementation may reuse the existing discussion-scrape logic
  with per-id caching; every upstream fetch capped (same rule as WS3).
- Client: after feed render, `feed-controller.ts` collects visible post ids
  and hydrates counts/reactions into the DOM (reuse
  `getCommentsCountInfo` rendering in `feed-renderer.ts`); IntersectionObserver-batched,
  not one request per post.
- Example: feed SSR'd from archive shows counts within ~2 s of viewport
  entry; values match the live page.
- Negative case: endpoint 5xx/timeout → UI keeps SSR values (or hides the
  count chip); no console error spam, no retry storm (single retry max).
- SSR values remain: when the base render *does* have counts (live source),
  hydration only updates changed values — no flicker to 0.

#### US-503 — Flag flip with live fallback

As the owner, I want to flip the default read source to archive with a
one-env-var rollback.

Acceptance criteria:
- `loadMoodFeed` / `loadMoodPost` (and the probe) fall back to the live
  source when the archive call throws, logging a `console.warn` with the
  failure reason (no user-visible error).
- Example: with `MOOD_READ_SOURCE=archive` and site-api healthy, `/mood`
  cold TTFB ≤ 1.0 s (Appendix A method).
- Example: `?source=live` still forces the scrape path (escape hatch
  unchanged).
- Negative case: archive down → feed renders via live scrape within the
  existing latency envelope; e2e covers the fallback with a failing-binding
  fixture.
- Rollout steps documented in the PR: set `MOOD_READ_SOURCE=archive` in
  wrangler config for a preview deploy → verify checklist from US-501 →
  promote to production → watch for one day → remove any temporary
  logging.
- Rollback: unset/reset `MOOD_READ_SOURCE=live`; no code revert needed.
- After the flip is verified stable, update memory/docs
  (`docs/ARCHITECTURE.md` read-path section, and the standing "reads stay
  live" decision note) to reflect the new architecture.

---

## 6. Quality Gates

Run for every story (in the owner's terminal — sandboxed runners hit
Dropbox TCC EPERM):

```bash
bun run check          # Astro type/content check
bun run test:unit      # unit + notify e2e
bun run test:e2e:site  # Playwright site e2e (WS1/WS2/WS5 stories)
```

Production verification after deploy: Appendix A commands + one LHCI pass
(`LHCI_PATHS=/mood` median of 5).

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Bucketed window misses anchor when id gaps > ~19 within a bucket | Fallback fetch (WS2) + uncacheable fallback renders (US-103) |
| WS2 doubles upstream requests on worker-cache misses | Bucket cache (WS1) makes misses rare; t.me HTML edge cache absorbs duplicates |
| D1 archive missing recent posts (sink lag) | US-501 parity check includes freshness; update watcher already surfaces newer posts client-side |
| Live-counts endpoint becomes a new scrape hot spot | Per-id caching + 60 s response cache + 30-id batch cap (US-502) |
| SWR serves stale detail after edits/deletes | Accepted: 5 min TTL + 30 min SWR window; Telegram edits are rare on this channel |

## 8. Open Questions

- Should `/mood?N` eventually redirect (301) to a canonical
  `/mood?post=N` form so the bucket normalizer has a single param shape?
  (Cosmetic; decide during US-102.)
- Does the archive feed include forwarded-post and sticker edge cases the
  scraper handles? US-501 checklist will answer.
- Reactions hydration may need markup the current feed renderer only emits
  when reactions exist — confirm during US-502.

## Appendix A — Measurement Commands

```bash
# Cold/warm TTFB probe (run twice; first may be MISS)
curl -s -o /dev/null -D - "https://buxx.me/mood?3640" \
  -w "ttfb %{time_starttransfer}s\n" | grep -iE "cf-cache-status|x-buxx|ttfb"

# Bucket-sharing check (expect HIT on the second, different-anchor request)
curl -s -o /dev/null -D - "https://buxx.me/mood?3631" | grep -i x-buxx-mood-page-cache
curl -s -o /dev/null -D - "https://buxx.me/mood?3640" | grep -i x-buxx-mood-page-cache

# Lighthouse (needs node 22)
export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"
lighthouse https://buxx.me/mood --only-categories=performance \
  --chrome-flags="--headless=new --no-sandbox" --output=json --output-path=lh-mood.json
```

Baseline numbers (2026-07-10): see §1 table. Home 0.93 / mood 0.90 /
blog 0.79 Lighthouse performance, single run, production.
