# Plan 016: Mood search UI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in the "STOP conditions" section occurs, stop and report — do not
> improvise. Your reviewer maintains `plans/README.md`; do not edit it.
>
> **Drift check (run first)**:
> `git diff --stat da8c4747..HEAD -- src/features/mood/ui/Hero.astro src/pages/mood.astro src/features/mood/client packages/contracts tests/unit`
> On drift, compare "Current state" excerpts; mismatch is a STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `../site-api` plan 017 (endpoint) implemented on its
  branch; plan 015 here (tag filter) for shared patterns
- **Category**: direction (feature)
- **Planned at**: `site` commit `da8c4747`, 2026-07-19

## Why this matters

The mood archive is searchable server-side (FTS5 with ranked snippets) but
readers have no way to use it — the feed is infinite-scroll only. This adds
a minimal search affordance on `/mood` backed by the new public endpoint.

## Current state

- Endpoint (being added in `../site-api` plan 017):
  `GET /api/v2/mood/search?q=<2..64 chars>&limit=<1..20>` →
  `{ results: MoodSearchResult[] }`, snippets are HTML-escaped except
  `<mark>` tags; 30 req/min rate limit; 400 on short queries.
- Contracts: `packages/contracts/src/mood.ts:99` defines `MoodSearchResult`
  (`id`, `datetime`, `snippet`, `tags`, `sentiment_label`). This repo is the
  canonical contracts copy — add `MOOD_SEARCH_PATH = '/v2/mood/search'` to
  `packages/contracts/src/routes.ts` and (if site-api's plan defined it)
  `MoodSearchResponse` to `mood.ts`, keeping the two repos' additions
  textually identical (reviewer runs the sync check).
- Placement: `src/features/mood/ui/Hero.astro` (373 lines) renders the feed
  header area — put the search toggle/input there. The page shell is
  `src/pages/mood.astro`; page CSS lives in its `<style>` block (bottom).
- Client conventions: vanilla TS modules in `src/features/mood/client/`
  exporting one `init*` function, wired from `mood.astro`'s bottom script
  block (see `:2222-2232` for the entrypoint pattern). Fetch-with-retry
  exemplar: `fetchMoods` in `feed-controller.ts:220`.
- Detail links: `getMoodDetailHref(id)` from `shared/feed-anchor.ts:29`.
- Reduced motion / a11y house style: see `BackToTop.astro:112-117` and the
  comments popover's `role`/`aria` usage (`feed-comments-popover.ts`).

## UX contract (keep it this small)

- A search button (magnifier icon + `Search` label, matching header-action
  styling) in the Hero area toggles an inline search bar.
- Typing ≥2 chars and pressing Enter (or a 400 ms debounce) fetches results.
- Results render as a list below the bar, replacing nothing: feed stays
  intact underneath; results panel overlays or sits between hero and feed
  (choose the simpler; must not break anchor scroll).
- Each result: time (local), snippet (render as HTML — it is pre-escaped
  server-side; still set via `innerHTML` only after an allowlist check that
  the string contains no `<` except `<mark>`/`</mark>`), tags as plain text.
  Row links to `/mood/{id}`.
- States: loading ("Searching…"), empty ("No results"), error ("Search is
  unavailable right now" + retry on next Enter). Esc or the toggle closes and
  clears.
- Keyboard: input auto-focus on open; Esc closes; results are plain links
  (natural tab order). `role="region"` + `aria-label="Search results"`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Target tests | `bun test tests/unit/mood-search-ui.test.ts` | all pass |
| Typecheck | `bun run check` | exit 0 |
| Unit suite | `bun run test:unit` | all pass |
| E2E (mood) | `bun run test:e2e:site -- --grep mood` | all pass |

## Scope

**In scope**:

- `src/features/mood/client/search-panel.ts` (create)
- `src/features/mood/ui/Hero.astro` (toggle + bar + results container)
- `src/pages/mood.astro` (wire init + panel CSS)
- `packages/contracts/src/routes.ts`, `packages/contracts/src/mood.ts`
  (constants/types as described)
- `tests/unit/mood-search-ui.test.ts` (create)

**Out of scope**:

- `../site-api` (endpoint is its plan 017).
- Search on the detail page, home preview, or blog.
- Query-string persistence (`/mood?q=`) — not in v1.
- Fuzzy/CJK tokenization tuning (FTS5 default tokenizer; note limitations in
  NOTES if observed).

## Git workflow

- Branch: `fix/mood-hardening` (continue on it).
- Conventional Commit: `feat(mood): add feed search panel`
- Do not push (batch-final step handles push/PR per dispatch instructions).

## Steps

### Step 1: Contracts constants (canonical)

Add `MOOD_SEARCH_PATH` (and `MoodSearchResponse` if site-api added it) to
this repo's `packages/contracts`. Keep line content identical to the
site-api mirror edit.

**Verify**: `bun run check` → exit 0.

### Step 2: Search panel module

`client/search-panel.ts`: `initMoodSearchPanel()` — toggle handling, debounce,
fetch `/api${MOOD_SEARCH_PATH}?q=...`, render states and result rows
(`getMoodDetailHref`), the `<mark>`-only allowlist guard before `innerHTML`
(reject any other `<` by falling back to `textContent`), Esc/clear behavior.
Export pure helpers (`isSafeSnippetHtml(snippet)`, `buildResultRow(data)`)
for unit tests.

**Verify**: `bun test tests/unit/mood-search-ui.test.ts` — safe snippet
passes; snippet containing `<img` or `<script` falls back to text; row href
correct; debounce coalesces (fake timers).

### Step 3: Markup + wiring

Hero gets the toggle + bar + results container (hidden by default,
`[hidden]`); `mood.astro` wires `initMoodSearchPanel()` in the entrypoint
block and adds panel CSS consistent with the page's existing tokens (reuse
existing classes where possible; keep new CSS under ~80 lines).

**Verify**: `bun run check`; mood e2e green; if the e2e fixture API can serve
a search route, add one smoke spec (open → type → results render); if
fixtures can't, note it and rely on unit tests.

## Test plan

- `tests/unit/mood-search-ui.test.ts`: snippet allowlist, row building,
  debounce, error/empty state rendering (happy-dom).
- Existing suites green.

## Done criteria

- [ ] Search affordance on `/mood` returns ranked results linking to detail
      pages, with loading/empty/error states and Esc-to-close
- [ ] Snippet HTML can only ever contain `<mark>` markup when inserted
- [ ] All listed commands pass; only in-scope files modified

## STOP conditions

- The `/api` proxy does not forward `/api/v2/mood/search` (check
  `src/pages/api/[...path].ts` routing first — if the proxy allowlists paths
  and search is missing, add it only if that file's pattern makes it a
  one-line change; otherwise report).
- Hero markup cannot host the panel without restructuring beyond ~30 lines.
- Verification fails twice.

## Maintenance notes

- If query persistence (`/mood?q=`) is added later, coordinate with the
  cache normalizer in `registry.ts` (search pages must stay uncached or get
  their own key).
- Endpoint deploy order: `site-api` first, then this UI.
