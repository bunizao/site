# Plan 015: Make mood tags clickable filters

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in the "STOP conditions" section occurs, stop and report — do not
> improvise. Your reviewer maintains `plans/README.md`; do not edit it.
>
> **Drift check (run first)**:
> `git diff --stat da8c4747..HEAD -- src/features/mood/server/api-client.ts src/features/mood/ui/FeedShell.astro src/features/mood/ui/Hero.astro src/features/mood/client/feed-renderer.ts src/features/mood/client/feed-controller.ts src/pages/mood.astro src/features/agent-markdown/server/registry.ts tests/unit`
> On drift, compare "Current state" excerpts; mismatch is a STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans 009–014 landing first on the shared branch (same
  files churn); functionally independent
- **Category**: direction (feature)
- **Planned at**: `site` commit `da8c4747`, 2026-07-19

## Why this matters

The author hashtags mood posts intentionally; the backend persists tags in a
join table and the archive feed API already accepts a `?tag=` filter — but
the UI renders tags as inert text, so readers cannot follow a theme. This
plan turns tags into links and gives `/mood?tag=<slug>` a real filtered feed.

## Current state

- Backend support ALREADY EXISTS (read-only reference, `../site-api`):
  `createMoodFeedRoute` reads `?tag=` via `readTag`
  (`src/features/mood/server/mood-api-routes.ts:433-437`, normalized
  lowercase, no `#`) and `listQuery` joins `mood_post_tags` with the
  `mood_post_tags_tag_idx` index (`mood-repository.ts:465-478`). The public
  archive route is `/api/v2/mood`. Nothing to change in `site-api`.
- This repo's gaps:
  - `src/features/mood/server/api-client.ts` — `MoodFeedQuery` (`:40-47`)
    has no `tag`; `moodFeedParams` (`:121-129`) doesn't emit it. The LIVE
    path (`loadMoodChannelSnapshot`) cannot filter by tag — tag mode must
    force `source: 'archive'` with `fallback: false` (strict).
  - `src/pages/mood.astro:40-67` — reads anchor/source/fresh from the URL;
    no tag handling.
  - `src/features/agent-markdown/server/registry.ts:109-125` —
    `normalizeMoodFeedCacheSearch` returns `null` (uncacheable) for
    `?tag=x`. Extend: a single `tag` param with a valid slug normalizes to
    `?tag=<slug>` so tag pages are edge-cacheable.
  - Tag rendering: SSR `FeedShell.astro:551`
    (`<span class="mood-item-tag">#{post.tag}</span>`), client
    `feed-renderer.ts:772` (`tag.className = 'mood-item-tag'`), detail
    `DetailArticle.astro:45-49` (`.mood-post-tag` spans).
  - `feed-controller.ts` `fetchMoods` (`:220-244`) — no tag param; the feed
    root dataset already carries read source (`:141`).
  - Update watcher: probes channel-latest, meaningless under a tag filter —
    do not init it in tag mode (see `feed-controller.ts:1203-1205`
    `updateWatcher.init()` guard; extend that condition).
- Tag slug validation: lowercase `[a-z0-9_]` up to ~64 chars is a safe
  contract (matches `normalizeMoodTag` output in site-api:
  trim, strip `#`, lowercase). Create the mirror helper here (shared).
- Conventions: pure helpers in `src/features/mood/shared/` + bun unit tests.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Target tests | `bun test tests/unit/mood-tag-filter.test.ts` | all pass |
| Typecheck | `bun run check` | exit 0 |
| Unit suite | `bun run test:unit` | all pass |
| E2E (mood) | `bun run test:e2e:site -- --grep mood` | all pass |

## Scope

**In scope**:

- `src/features/mood/shared/tag-filter.ts` (create: slug validation,
  `getMoodTagHref(tag)`)
- `src/features/mood/server/api-client.ts` (tag in `MoodFeedQuery` +
  `moodFeedParams`)
- `src/pages/mood.astro` (read `?tag=`, pass to loader, hero/title state,
  dataset attribute for the client)
- `src/features/mood/ui/FeedShell.astro`, `ui/Hero.astro` (linkified tags;
  active-tag header with an "All moods" clear link)
- `src/features/mood/ui/DetailArticle.astro` (tags → links)
- `src/features/mood/client/feed-renderer.ts` (tag element → `<a>`)
- `src/features/mood/client/feed-controller.ts` (tag in `fetchMoods`; watcher
  disabled in tag mode)
- `src/features/agent-markdown/server/registry.ts` (cache normalizer)
- `tests/unit/mood-tag-filter.test.ts` (create),
  `tests/unit/agent-markdown-registry.test.ts` (extend)

**Out of scope**:

- `../site-api` (backend done).
- Anchor deep links combined with tag (`?tag=x&3641`) — explicitly
  unsupported; tag links never carry anchors.
- RSS/embed tag variants.
- A tag index/cloud page.

## Git workflow

- Branch: `fix/mood-hardening` (continue on it).
- Conventional Commit: `feat(mood): filter feed by tag`
- Do not push (the batch's final step handles push/PR per dispatch
  instructions).

## Steps

### Step 1: Shared tag helpers

`shared/tag-filter.ts`: `isMoodTagSlug(value)` (`/^[a-z0-9_]{1,64}$/`),
`normalizeMoodTagSlug(value)` (trim, strip leading `#`, lowercase; returns
`''` when invalid), `getMoodTagHref(tag)` → `/mood?tag=<slug>` or `/mood`.

**Verify**: unit tests for the three helpers (valid, `#`-prefixed, mixed
case, hostile input → `''`).

### Step 2: Server pass-through

Add `tag?: string` to `MoodFeedQuery`; `moodFeedParams` emits it. In
`loadMoodFeed`, when `query.tag` is set, force the archive branch regardless
of resolved source (tag is archive-only; keep `fallback` false). In
`mood.astro`, read + normalize `?tag=`; when active: skip anchor logic, call
the plain loader with `{ tag }`, set a `data-mood-tag` attribute on the feed
root, and render an active-filter header (e.g. `#slug` + link back to
`/mood`). Extend `normalizeMoodFeedCacheSearch`: exactly one `tag` param
with a valid slug → `?tag=<slug>`; anything else keeps current behavior.

**Verify**: extend `tests/unit/agent-markdown-registry.test.ts` — `?tag=abc`
normalizes to `?tag=abc`; `?tag=abc&x=1` → `null`; existing anchor cases
unchanged. `bun test tests/unit/mood-api-client.test.ts` extended: tag query
produces archive request with `tag` param.

### Step 3: Client pass-through

`fetchMoods` appends `tag` from `feedEl.dataset.moodTag` when present (both
directions of pagination). Do not init the update watcher when the dataset
tag is present. Anchor reveal/pagination intent logic must treat tag mode as
plain feed (no anchor).

**Verify**: `bun run check` → exit 0; existing mood e2e stays green.

### Step 4: Linkify tags

Replace the three tag render sites with `<a href={getMoodTagHref(tag)}
class="...">#slug</a>` keeping existing classes plus a link affordance
consistent with `.mood-item-details`-style links (reuse existing link
styling; minimal new CSS). Client renderer mirrors SSR exactly.

**Verify**: e2e or DOM unit test — a feed item's tag is an anchor with the
expected href; detail page tags are anchors.

## Test plan

- `tests/unit/mood-tag-filter.test.ts` — helpers.
- `agent-markdown-registry.test.ts` — cache normalizer cases.
- `mood-api-client.test.ts` — tag forces archive + param emission.
- Optional e2e: `/mood?tag=<fixture tag>` renders only tagged posts if the
  e2e fixture supports it; if fixtures lack tags, note it in NOTES and skip.

## Done criteria

- [ ] Tags in feed, client-rendered items, and detail are links to
      `/mood?tag=<slug>`
- [ ] `/mood?tag=<slug>` SSRs a filtered archive feed, paginates in both
      directions with the filter, and is edge-cacheable under a normalized key
- [ ] Update watcher inactive in tag mode
- [ ] All listed commands pass; only in-scope files modified

## STOP conditions

- The archive feed route rejects or ignores `tag` for any reason (test
  against the fixture/service binding first).
- Tag mode requires touching anchor-intent state machinery beyond a guard.
- Verification fails twice.

## Maintenance notes

- If plan 017 (render unification) lands later, the tag anchor markup moves
  into the unified builder.
- A `/mood/tags` index page is a natural follow-up; the join table supports
  counts cheaply.
