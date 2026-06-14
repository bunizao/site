# Mood v2 PRD — Structured Read Migration

Status: draft · Owner: bunizao · Last updated: 2026-06-14

## 1. North Star

Mood is served entirely from structured data in `site-api` D1, rendered from typed
`MediaItem[]` and Telegram entities. The public `site` Worker stops live-scraping
`t.me`, `mediaHtml` is deleted, and mood becomes one instance of a source-agnostic
`ContentDocument` shared with blog posts.

One sentence: **kill the HTML blob; render mood from structured data; unify mood and post.**

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

## 3. Goals / Non-Goals

### Goals
1. Public site reads all mood data from `site-api` via the `API` service binding.
2. Feed, detail, home preview, embed, RSS, comments, and update-probe all run on v2.
3. Every legacy component renders at visual parity from structured `MediaItem[]`.
4. `mediaHtml` and the public-site `t.me` scraper are deleted.
5. Parity is guarded by automated tests (CI gate + production smoke).

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
2. **Deprecate then remove `mediaHtml`** from `MoodFeedItem`. Mark optional first; delete
   after the client renderer no longer reads it.
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

### Phase 6 — Cutover & cleanup
- Flip the default to v2 server-side (env/flag), keep `?api-v2=false` as an escape hatch.
- Bake, monitor, then remove the flag.
- Delete the public-site `t.me` scraper, `mediaHtml` from the contract and renderers, and
  the legacy `else` branches.
- **Exit:** one code path; `?api-v2` retired; no live-scrape in the public Worker.

## 7. Parity Strategy

Legacy is ground truth (hundreds of live posts). v2's bar is byte-for-byte field parity
with legacy on `comparablePost`, plus per-kind feature assertions. The component registry
collapses "dozens of components × two APIs" into one dimension: one golden case per kind,
asserted `v2 ≡ legacy` in both the offline CI gate and the live ops smoke.

## 8. Cutover & Rollback

- Per-request override (`?api-v2`) → server-side default → flag removal.
- Rollback at any pre-removal stage is flipping the default back to legacy.
- The empty-D1 risk is covered by `site-api`'s built-in t.me fallback repository.

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

- 100% of mood surfaces served from `site-api`; zero `t.me` fetches from the public Worker.
- Component registry covers every `ContentMediaType` + structured field; CI gate green.
- `mediaHtml` and the legacy scraper deleted from `site`.
- Feed/detail visual parity confirmed on the full production sample set.

## 11. Open Decisions

- **D1.** Keep `MediaItem[]` on `MoodFeedItem` long-term, or have the feed re-derive media
  client-side from a single source? (Recommendation: carry `media[]`; drop the derived
  `image*`/`gallery` once the renderer is structured.)
- **Stretch / north star.** Unify mood and Ghost posts under `ContentDocument`
  (`source: 'mood' | 'post'`) with a shared renderer. Out of scope here; this PRD keeps the
  contract shaped for it.
