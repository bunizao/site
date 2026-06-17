# Mood v2 PRD — Structured Read Migration

Status: **superseded for the read path** (2026-06-17) · Owner: bunizao · Last updated: 2026-06-14 (rev 2: keep both sources, `mediaHtml` as escape hatch)

> ## Decision — 2026-06-17: reads stay live, D1 is a sink (supersedes §1 North Star)
>
> The D1-first read path shipped (`MOOD_API_V2_DEFAULT=true`) and was reverted. **User-facing
> mood reads are served live from `t.me`, exactly as before the migration. D1 is a write-only
> ingestion sink for backup and future structured search/AI — never on the read path.**
> `MOOD_API_V2_DEFAULT` is `"false"`; `?api-v2=true` stays as a per-request escape hatch to test
> D1 reads.
>
> **Why.** D1 populates mutable fields (`comments_count`, reactions, views) once at ingest from
> the Telegram webhook payload — when the count is 0 — and never refreshes. So the v2 feed
> returned `commentsCount: 0` for every post, the L1 comment badge never rendered, and reactions
> froze at post-time state. The live scrape reads the current widget, so it is always real-time.
>
> Real-time interaction is a hard requirement. Once it is, a live `t.me` fetch on every render is
> unavoidable — and the moment that fetch is unavoidable, serving static content from D1 buys
> nothing, because it cannot skip the live call it would have to make anyway. So D1 on the read
> path is pure cost. Its real value (backup + queryable structured archive) is fully satisfied by
> a pure ingestion sink. A periodic reconcile cron was rejected: not real-time enough, and it
> piles onto worker runtime.
>
> **Still valid below:** the ingest/normalizer into D1 (§2 v2 server-side, §4 the
> `webhook → ingest → D1` arm). **No longer the target:** §1 North Star, §3 Goals 1–4, §4's
> `D1 → read path` arm, and §6 Phase 6 cutover. The mood↔post `ContentDocument` unification (§10)
> remains a possible future, but on the live read model, not D1-first.

## 1. North Star (historical — superseded; see decision above)

Mood is served primarily from structured data in `site-api` D1, rendered from typed
`MediaItem[]` and Telegram entities, with the live `t.me` scrape retained as a fallback
**source** inside `site-api`. The public `site` Worker keeps a single structured renderer and
stops carrying its own redundant scraper. `mediaHtml` is demoted to a thin escape hatch for
content the structured model does not yet cover. Mood becomes one instance of a
source-agnostic `ContentDocument` shared with blog posts.

One sentence: **render mood from structured data; keep t.me as a fallback source, not a
second renderer; unify mood and post.**

## 2. Current State (grounded)

- **v1 (legacy):** `site/src/features/mood/server/telegram-source.ts` fetches the
  `t.me/s/<channel>` widget HTML live, cheerio-parses it, and emits a concatenated
  HTML string (`content` / `mediaHtml`). Every component (image, gallery, inline
  video, roundvideo, voice, sticker, video-sticker, oversized video, link preview,
  file) is an HTML fragment distinguished by CSS class.
- **v2 (structured) — already built server-side:** `site-api` D1 stores raw Telegram
  Bot API webhook JSON in structured columns (`text`, `entities`, `media`, `forward`,
  `reply_to`, `reactions`, `link_previews`, `raw`).
  `site-api/src/features/mood/server/mood-repository.ts` maps those to contract
  `MediaItem[]` / `MoodFeedItem` / `MoodContentDocument`; `mediaHtml` stays empty.
  Rich text is rendered from `entities` via `telegram-rich-text.ts`.
- **The gap — the site never calls v2:** `site/src/features/mood/server/api-client.ts`
  accepts `useApiV2` on all four load functions but **ignores it**; both modes run the
  legacy scrape. The `?api-v2=true` flag is plumbed client→server but is a no-op.
- **Contract mismatch:** `MoodFeedItem` is image+`mediaHtml`-centric — it can carry
  `gallery` (images) + `previewMediaType` but has no structured field for
  video/file/link-preview. `MoodContentDocument.media: MediaItem[]` (detail) is complete.

### Naming: three independent axes (do not conflate)

1. **`site` `?api-v2=true` flag** — selects the public site's backend: scrape `t.me` itself
   (legacy) vs delegate to `site-api`. This is the migration toggle.
2. **`site-api` URL `/v1/mood*`** — the version of the mood *read contract*. It is **not** a
   "telegram proxy": `src/pages/v1/mood.ts` resolves a D1-first repository with the `t.me`
   scrape merged in as fallback (`telegram-fallback-repository.ts`), both normalized to the
   same structured contract. `/mood` 302-redirects here.
3. **`site-api` URL `/v2/*`** — newer private surfaces (notify, admin, images, posts). Mood
   does **not** live here.

So "keep both APIs in parallel" is already satisfied: `/v1/mood` fuses D1 + `t.me` behind one
contract. The redundancy to remove is the public site's *own* second scraper, not a data source.

## 3. Goals / Non-Goals

### Goals
1. Public site reads mood from `site-api` via the `API` service binding; the public Worker
   keeps no mood parsing of its own.
2. Feed, detail, home preview, embed, RSS, comments, and update-probe all run on the v2 path.
3. Every legacy component renders at visual parity from structured `MediaItem[]`.
4. **Both data sources preserved.** `site-api` serves D1-first with the `t.me` scrape merged
   in as fallback. Only the redundant scraper inside the public `site` Worker is retired.
5. `mediaHtml` survives as an optional escape hatch for unmodeled content, not a primary path.
6. `?api-v2` is kept as a permanent backend selector / escape hatch (no removal step).
7. Parity is guarded by automated tests (CI gate + production smoke).

### Non-Goals (this effort)
- Redesigning the mood UI.
- Rewriting `site-api`'s ingest/normalizer (it is done).
- Replacing Astro page scripts with a React/global-state rewrite.
- Building the mood↔blog `ContentDocument` unification (tracked as a stretch, §10).

## 4. Target Architecture

```
Telegram webhook ─▶ site-api ingest (normalizer) ─▶ D1 (structured columns)
                                                       │
public site /mood, /api/moods ─ API binding ─▶ site-api /v1/mood* ─ mood-repository
                                                       │
                                          MoodFeedResponse / MoodContentDocument
                                          (MediaItem[], entity-rendered bodyHtml)
                                                       │
                          structured client renderer (no mediaHtml, no t.me scrape)
```

The public site keeps zero mood parsing logic. `site-api`'s built-in t.me fallback
repository (`createTelegramFallbackRepository`) covers the empty-D1 case, so the public
Worker can drop its own scraper entirely.

## 5. Contract Changes (`@bunizao/contracts`, canonical in `site`)

1. **Add `media: MediaItem[]` to `MoodFeedItem`** (and optional on `MoodData`). This is
   the structural fix: the feed must carry typed video/file/link-preview/audio, not only
   images. Keep `gallery`/`image*` as derived convenience fields during transition.
2. **Keep `mediaHtml` as an optional escape hatch.** Structured-first: the renderer reads
   `media[]`; `mediaHtml` is consumed only for content the structured model does not yet
   cover (exotic embeds, future Telegram message types). Do not delete it — this is the
   "keep both" hedge at the field level.
3. **Add `poll` (or reuse `embed`)** to `ContentMediaType` — legacy content includes polls,
   the enum currently omits them.
4. Sync every change into `site-api` via `bun run sync:contracts`.

## 6. Workstreams (phased)

### Phase 0 — Unblock local dev (prerequisite)
- Switch to Node ≥ 22.12 (`.node-version` now set). Confirm `wrangler --version` runs.
- Seed local D1: `cd ../site-api && bun scripts/backfill-mood-posts.ts`.
- Stand up multi-worker dev: `site-api` under `wrangler dev`, `site` wired to it via the
  `API` service binding, so `?api-v2=true` resolves locally.
- **Exit:** `GET /api/moods?api-v2=true` locally returns a D1-backed payload.

### Phase 1 — Wire the read path
- Branch the four functions in `api-client.ts` on `useApiV2`: call `env.API`
  (`/v1/mood`, `/v1/mood/[id]`, `/v1/mood/[id]/comments`, probe) instead of the legacy
  scrape. Keep legacy as the `else` branch.
- Map `MoodProbeResult` to a cheap latest-id read.
- **Exit:** every mood surface works end-to-end with `?api-v2=true`; legacy unchanged.

### Phase 2 — Structured-media renderer (the bulk)
- Replace `feed-renderer.ts` `media.innerHTML = mediaHtml` with a renderer over
  `MediaItem[]`. One renderer per `ContentMediaType` (≈8): image, gallery (n images),
  video (incl. roundvideo + oversized poster fallback), audio (voice), document (file),
  link-preview, sticker, location.
- Detail (`DetailArticle.astro`) already receives `media` — fill the non-image types.
- Verify forwarded / quote(reply) / reactions / comments render from their existing
  structured fields.
- **Exit:** feed + detail render every component from structured data with `mediaHtml` unread.

### Phase 3 — Rich-text body parity
- Body is `telegramTextToHtml(text, entities)` from `site-api`. Verify code blocks
  (Prism highlighting), links, hashtags (`/search`), mentions, line breaks, and animated
  custom emoji hydration match legacy output.
- **Exit:** body parity holds across the text-heavy sample set, including code posts.

### Phase 4 — Ancillary surfaces
- Point embed (`mood/embed.astro`), RSS (`mood/rss.xml.ts`), oEmbed, notify preview, and
  home preview (`HomePreview.astro`) at the v2 path / shared serializers.
- **Exit:** no surface still reshapes legacy mood data independently.

### Phase 5 — Parity harness
- Build a component registry: one entry per component type with `{ kind, prodId,
  fixtureFactory, assert }`. Drive two runners from it:
  - **CI gate** (`test:unit`, offline): fixture-based, asserts v2 ≡ legacy per kind.
  - **Ops smoke** (`test:ops`, live): production-id parity via the existing
    `comparablePost` deep-equal (`tests/ops/mood-api-v2-parity.test.ts`, expanded).
- Cover the gaps the current 5 samples miss: gallery, sticker, voice, roundvideo,
  forwarded, reactions, comments, code block, location, poll.
- **Exit:** registry is the merge gate; adding a component = one registry row.

### Phase 6 — Cutover (no demolition)
- Flip the server-side default to the v2 path; keep `?api-v2=false` as a per-request escape
  hatch and permanent backend selector.
- Retire the **public-site** `t.me` scraper + its `mediaHtml` render path once the structured
  renderer is at parity. The `t.me` *source* survives inside `site-api`'s fallback repository.
- Keep `mediaHtml` in the contract as the escape-hatch field.
- **Exit:** one structured renderer in the public Worker; no second scraper there; both data
  sources still reachable through `site-api`; `?api-v2` retained.

## 7. Parity Strategy

Legacy is ground truth (hundreds of live posts). v2's bar is byte-for-byte field parity
with legacy on `comparablePost`, plus per-kind feature assertions. The component registry
collapses "dozens of components × two APIs" into one dimension: one golden case per kind,
asserted `v2 ≡ legacy` in both the offline CI gate and the live ops smoke.

## 8. Cutover & Rollback

- Per-request override (`?api-v2`) → server-side default. The flag stays (no removal step).
- Rollback at any stage is flipping the default back to legacy.
- The empty-D1 risk is covered by `site-api`'s built-in t.me fallback repository — both
  sources stay live behind one contract.

## 9. Risks

- **Text/media ordering:** legacy interleaves body and media in one HTML string; v2 splits
  `bodyHtml` + `media[]`. Telegram groups media at head/tail, so low impact — assert on
  representative interleaved posts.
- **Rich-text drift:** Prism highlighting and animated custom emoji must match the
  server-rendered `bodyHtml`. Highest-risk parity surface.
- **Media URL resolution:** video posters, file links, sticker, and link-preview
  thumbnails must resolve via the R2 image proxy with t.me CDN fallback.
- **Fixture drift:** real Telegram HTML has malformed shapes fixtures won't model — the
  live ops smoke is what catches these, not the CI gate alone.

## 10. Success Metrics

- 100% of mood surfaces served through `site-api`; the public Worker runs no mood scraper.
- Both sources reachable behind one contract (D1-first, t.me fallback) — resilience verified
  by forcing the fallback path.
- Component registry covers every `ContentMediaType` + structured field; CI gate green.
- `mediaHtml` reduced to the escape-hatch field only; the redundant public-site scraper removed.
- Feed/detail visual parity confirmed on the full production sample set.

## 11. Open Decisions

- **Feed shape.** Keep `MediaItem[]` on `MoodFeedItem` long-term, or have the feed re-derive
  media client-side from a single source? (Recommendation: carry `media[]`; drop the derived
  `image*`/`gallery` once the renderer is structured.)
- **`MediaItem` typing.** Flat optional-bag (current) vs a discriminated union per media type.
  A union is type-safer (no reading `.fileName` off a video) but more verbose across two repos
  and on the wire. Recommendation: keep the flat bag for cross-repo + JSON simplicity; accept
  the looser typing.
- **Stretch / north star.** Unify mood and Ghost posts under `ContentDocument`
  (`source: 'mood' | 'post'`) with a shared renderer. Out of scope here; the contract is
  already shaped for it.
