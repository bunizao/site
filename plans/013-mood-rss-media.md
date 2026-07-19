# Plan 013: Include images in mood RSS content

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in the "STOP conditions" section occurs, stop and report — do not
> improvise. Your reviewer maintains `plans/README.md`; do not edit it.
>
> **Drift check (run first)**:
> `git diff --stat da8c4747..HEAD -- src/features/mood/server/serializers.ts tests/unit/mood-rss.test.ts`
> On drift, compare "Current state" excerpts; mismatch is a STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: `site` commit `da8c4747`, 2026-07-19

## Why this matters

Image-only and gallery moods are published to RSS with no image at all: the
structured media renderer used for `content:encoded` filters out `image` and
`sticker` items, and `post.mediaHtml` is empty on the archive path. Feed
readers see bare text for the most visual posts.

## Current state

- `src/features/mood/server/serializers.ts:103-107`:

  ```ts
  const structuredMediaHtml = renderStructuredMoodFeedMediaMarkup(post.media);
  const content = absolutizeHtml(
    [post.previewHtml, structuredMediaHtml || post.mediaHtml].filter(Boolean).join('\n'),
    baseUrl
  );
  ```

- `src/features/mood/shared/feed-media.ts:230-231` — that renderer filters
  `item.type !== 'image' && item.type !== 'sticker'`, by design for the feed
  page (images render via the gallery/thumb path there). Do NOT change this
  shared filter — fix at the RSS call site.
- Exemplar for emitting images from a `MoodFeedItem`: `appendMedia` in the
  same `serializers.ts` (`:185-208`) walks `post.gallery?.items` then
  `post.image` with width/height, using `toAbsoluteUrl`.
- XML safety: content is wrapped via `wrapCdata` (see `content:encoded` line);
  attribute values inside the HTML must still be entity-escaped — use the
  file's existing helpers/conventions.
- Tests: `tests/unit/mood-rss.test.ts` exists; extend it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Target tests | `bun test tests/unit/mood-rss.test.ts` | all pass |
| Typecheck | `bun run check` | exit 0 |
| Unit suite | `bun run test:unit` | all pass |

## Scope

**In scope**:

- `src/features/mood/server/serializers.ts` (RSS item content build only)
- `tests/unit/mood-rss.test.ts`

**Out of scope**:

- `shared/feed-media.ts` (its filter serves the page renderers).
- RSS item count, titles, categories, or the agent-markdown serializer.

## Git workflow

- Branch: `fix/mood-hardening` (continue on it if it exists).
- Conventional Commit: `fix(mood): include images in rss content`
- Do not push.

## Steps

### Step 1: Build RSS image markup

In the RSS item builder, before assembling `content`, construct
`rssImagesHtml`: for `post.gallery?.items` emit one
`<img src="<absolute>" width="" height="" alt=""/>` per item (skip items with
no `src`); else if `post.image`, emit a single `<img>` (use
`post.imageWidth`/`imageHeight` when positive). Absolutize with
`toAbsoluteUrl`. Append it after `structuredMediaHtml || post.mediaHtml` in
the joined content array.

**Verify**: `bun test tests/unit/mood-rss.test.ts` — new assertions: a gallery
post's `content:encoded` contains N `<img` occurrences with absolute URLs; a
text-only post's content contains none; existing assertions stay green.

### Step 2: Guard duplicates

If `post.previewHtml` already contains the same image URL (single-image posts
where preview embeds media), skip emitting the duplicate. A simple
`content.includes(src)` check before appending is acceptable at this scale.

**Verify**: unit case: preview already embedding the image URL yields exactly
one `<img` occurrence.

## Test plan

- Extend `tests/unit/mood-rss.test.ts` with: gallery post (3 images), single
  `post.image` post, text-only post, duplicate-guard case.

## Done criteria

- [ ] Gallery and single-image moods emit `<img>` in `content:encoded` with
      absolute URLs
- [ ] No duplicate images for posts whose preview already embeds the image
- [ ] `bun test tests/unit/mood-rss.test.ts` + `bun run test:unit` +
      `bun run check` pass
- [ ] Only in-scope files modified

## STOP conditions

- `MoodFeedItem` lacks the gallery/image fields described (shape drifted).
- Existing RSS tests assert the absence of images intentionally (would signal
  a decided tradeoff — report before overriding).
- Verification fails twice.

## Maintenance notes

- If the archive read path later populates `mediaHtml` with image markup,
  revisit the duplicate guard.
