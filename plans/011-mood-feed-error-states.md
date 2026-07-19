# Plan 011: Make mood feed failure states visible

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in the "STOP conditions" section occurs, stop and report — do not
> improvise. Your reviewer maintains `plans/README.md`; do not edit it.
>
> **Drift check (run first)**:
> `git diff --stat da8c4747..HEAD -- src/features/mood/ui/FeedShell.astro src/features/mood/client/feed-comments-popover.ts src/features/mood/client/feed-controller.ts src/features/mood/client/feed-media-hydration.ts tests/unit`
> On any in-scope drift, compare "Current state" excerpts before proceeding;
> mismatch is a STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: `site` commit `da8c4747`, 2026-07-19

## Why this matters

Three failure paths currently produce wrong or missing feedback: the SSR'd
above-the-fold feed image (usually the LCP element) has no broken-image
fallback even though a fallback URL is shipped in its markup; a failed
comments-preview fetch renders "No comments yet" next to a badge that proves
comments exist; and upward pagination (`loadNewer`) fails with only a console
line while downward pagination has a full status + retry affordance.

## Current state

- `src/features/mood/ui/FeedShell.astro:462-473` — SSR feed `<img>` carries
  `data-fallback-src={post.imageFallback ?? undefined}` but no error handler.
  The client-rendered equivalent has one, `feed-renderer.ts:600-608`:

  ```ts
  img.dataset.fallbackSrc = fallback;
  img.onerror = () => {
    if (img.dataset.fallbackApplied === '1') return;
    const fallbackSrc = img.dataset.fallbackSrc || '';
    if (!fallbackSrc) return;
    img.dataset.fallbackApplied = '1';
    mediaHydrator.applyResponsiveImage(img, fallbackSrc);
  };
  ```

- `src/features/mood/client/feed-comments-popover.ts:161-163` — `fetchComments`
  catch returns `[]`; `renderPopover` (`:200-206`) renders the
  `'No comments yet'` empty branch for a zero-length array. The detail page
  exemplar for a distinct error state is
  `detail-comments-controller.ts:246-256` ("Failed to load comments").
- `src/features/mood/client/feed-controller.ts:1141-1145` — `loadNewer` catch
  is `console.error(error)` only. The exemplar is `loadMore` (`:1185-1188`)
  which calls `setStatus('Unable to load more moods.')` and shows a retry
  button.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run check` | exit 0 |
| Unit suite | `bun run test:unit` | all pass |
| E2E (mood) | `bun run test:e2e:site -- --grep mood` | all pass |

If a command fails with `EPERM` (Dropbox TCC sandbox), report it in NOTES.

## Scope

**In scope**:

- `src/features/mood/ui/FeedShell.astro` (image error wiring only)
- `src/features/mood/client/feed-media-hydration.ts` (if the fallback attach
  loop belongs there — it owns `applyResponsiveImage`)
- `src/features/mood/client/feed-comments-popover.ts`
- `src/features/mood/client/feed-controller.ts` (`loadNewer` error surface
  only)
- `src/pages/mood.astro` (only if a new status element needs CSS; keep it
  minimal)

**Out of scope**:

- Retry/backoff logic changes to `fetchMoods`.
- Popover open/close interaction model (hover semantics — separate concern).
- Detail page comments controller.

## Git workflow

- Branch: `fix/mood-hardening` (continue on it if it exists).
- Conventional Commit: `fix(mood): surface feed failure states`
- Do not push.

## Steps

### Step 1: Attach fallback swap to SSR feed images

On feed init (a sensible home is `feed-media-hydration.ts`, which already owns
image behavior), scan `[data-mood-list] img[data-fallback-src]` that lack the
handler and attach the same swap logic the renderer uses (reuse one exported
helper rather than copying the closure — extract the renderer's `onerror` body
into a shared function and call it from both sites).

**Verify**: `bun run check` → exit 0; in the built markup path, a unit test or
DOM test (happy-dom is available to bun tests) asserting that an `error` event
on an SSR-shaped `<img data-fallback-src>` swaps `src`.

### Step 2: Distinct popover error state

Make `fetchComments` distinguish rejection from empty (return `null` on
failure or rethrow; do not cache failures). In `renderPopover`, render an
error line ("Couldn't load comments") with the existing link to
`/mood/{id}#comments` instead of the empty state. Wording and classes should
follow the detail controller exemplar.

**Verify**: unit test with a stubbed failing fetch asserts the popover shows
the error text, not `No comments yet`, and a subsequent hover retries (no
failure caching).

### Step 3: Visible `loadNewer` failure

Mirror `loadMore`'s affordance: on catch, surface a status ("Unable to load
newer moods.") and re-arm so the next upward scroll (or a retry control)
attempts again. Reuse the existing status element/pattern; if the top-of-feed
has no status slot, reuse `setStatus` if it is position-appropriate, otherwise
add a minimal top status element mirroring the bottom one.

**Verify**: `bun run check` → exit 0; existing mood e2e specs stay green.

## Test plan

- New/extended unit tests for Steps 1–2 (behavioral, DOM-based; model on
  existing bun tests — no source-string grepping).
- `bun run test:e2e:site -- --grep mood` unchanged and green.

## Done criteria

- [ ] SSR feed image with a dead primary URL swaps to its fallback
- [ ] Popover distinguishes fetch failure from zero comments and retries
- [ ] `loadNewer` failure is user-visible and recoverable
- [ ] `bun run check` + `bun run test:unit` pass; no out-of-scope files touched

## STOP conditions

- The renderer's `onerror` logic cannot be extracted without changing
  `mediaHydrator`'s public API in a way other modules consume.
- The top-of-feed has no viable place for a status without layout rework.
- Verification fails twice.

## Maintenance notes

- Plan 014 (srcset) touches the same image elements; land this first (it is
  smaller) — the shared fallback helper should survive that change.
- If popover hover semantics get a click-to-open mode later, reuse the same
  error state.
