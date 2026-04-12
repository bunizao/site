# Issue: Mood Telegram Live Photo Does Not Render Correctly

Status: Investigated  
Date: 2026-04-07

## Summary

Telegram officially announced support for "Live and Motion Photos in all apps" on March 31, 2026:

- https://telegram.org/blog/live-streams-and-motion-photos

The current Mood pipeline does not model live photo media as a first-class type. It is still built around two assumptions:

1. webhook ingest stores only static image assets
2. frontend rendering can treat new Telegram media as either plain image HTML or normal video HTML

That assumption is now too narrow. As a result, newly supported Telegram live photos can degrade incorrectly in Mood:

- motion is lost entirely
- feed and detail may disagree on rendering behavior
- HD Worker ingest cannot preserve the moving part
- media-group indexing is photo-only

## User Impact

- A live photo post can appear as a still image even when Telegram now treats it as motion-capable media.
- A live photo may render inconsistently between:
  - Telegram native clients
  - Telegram embed HTML
  - Mood feed `/mood`
  - Mood detail `/mood/[id]`
- The current HD image pipeline can only guarantee a large still image, not the motion component.

## Current Evidence

### 1. Webhook ingest only handles `message.photo`

The legacy webhook only resolves targets and ingests when `message.photo?.length` exists:

- [src/pages/api/telegram-webhook.ts](/Users/tutu/Library/CloudStorage/Dropbox/Dev/site/src/pages/api/telegram-webhook.ts#L135)
- [src/pages/api/telegram-webhook.ts](/Users/tutu/Library/CloudStorage/Dropbox/Dev/site/src/pages/api/telegram-webhook.ts#L398)

The Cloudflare Worker follows the same pattern and only resolves Telegram file URLs for image ingest:

- [workers/telegram-image-proxy/src/index.ts](/Users/tutu/Library/CloudStorage/Dropbox/Dev/site/workers/telegram-image-proxy/src/index.ts#L369)
- [workers/telegram-image-proxy/src/index.ts](/Users/tutu/Library/CloudStorage/Dropbox/Dev/site/workers/telegram-image-proxy/src/index.ts#L428)
- [workers/telegram-image-proxy/src/index.ts](/Users/tutu/Library/CloudStorage/Dropbox/Dev/site/workers/telegram-image-proxy/src/index.ts#L446)

This means the ingest layer is image-specific by design.

### 2. Media-group target resolution is photo-node only

Album indexing is derived from `.tgme_widget_message_photo_wrap` nodes:

- [src/pages/api/telegram-webhook.ts](/Users/tutu/Library/CloudStorage/Dropbox/Dev/site/src/pages/api/telegram-webhook.ts#L167)
- [workers/telegram-image-proxy/src/index.ts](/Users/tutu/Library/CloudStorage/Dropbox/Dev/site/workers/telegram-image-proxy/src/index.ts#L360)

If Telegram represents live photo motion through video-like markup, current indexing logic will not track it.

### 3. Parsing already has partial video support, but not live-photo-aware modeling

Telegram parsing can already emit `<video>` tags from embed HTML:

- [src/features/mood/server/telegram-source.ts](/Users/tutu/Library/CloudStorage/Dropbox/Dev/site/src/features/mood/server/telegram-source.ts#L372)

It separately emits image blocks from `.tgme_widget_message_photo_wrap`:

- [src/features/mood/server/telegram-source.ts](/Users/tutu/Library/CloudStorage/Dropbox/Dev/site/src/features/mood/server/telegram-source.ts#L298)

This is enough for plain video and plain photo, but there is no explicit "live photo" normalization step.

### 4. Feed shaping still assumes either inline `<video>` preview or static image preview

Feed preview logic returns the first `<video>` if one exists; otherwise it falls back to image extraction:

- [src/features/mood/shared/utils.ts](/Users/tutu/Library/CloudStorage/Dropbox/Dev/site/src/features/mood/shared/utils.ts#L296)
- [src/features/mood/shared/utils.ts](/Users/tutu/Library/CloudStorage/Dropbox/Dev/site/src/features/mood/shared/utils.ts#L334)

That is too simplistic for live photos because the desired UX is usually:

- preserve a high-quality still as the baseline
- optionally expose motion where supported

## Likely Root Cause

The bug is not one isolated rendering error. It is a pipeline mismatch:

1. Telegram added a new end-user media capability on 2026-03-31.
2. Mood still stores media in an image-only HD pipeline.
3. Mood does not classify live photo payloads separately from plain photos or plain videos.
4. The fallback chain is optimized for still images, not motion media.

In practice, the moving component is the unstable part and the still component is the only reliable part today.

## Constraint From Telegram APIs

Telegram's Bot API documentation still exposes the familiar media buckets such as `photo`, `video`, `animation`, and `document`, not a dedicated live-photo media type:

- https://core.telegram.org/bots/api

That matters because our ingest path depends on Bot API webhook payloads and `getFile`. Even though Telegram clients now support live photos, the bot-facing data model does not currently give us a clean, explicit live-photo abstraction to build against.

This means we should not assume we can reliably ingest "the motion component" without first capturing a real production payload and real embed HTML from an actual live-photo post.

## Option Comparison

### Option A: Convert live photo into a GIF-like animated preview

Pros:

- Users see motion in feed and detail.
- Behavior is visually closer to Telegram native clients.

Cons:

- GIF is the wrong transport for quality, size, and CPU cost.
- Large bandwidth increase for feed scrolling.
- Lower visual quality than the original still image.
- Current Worker uses Cloudflare image resizing, not video transcoding.
- Requires a new storage and caching path.
- Hard to guarantee correct autoplay, fallback, and poster behavior across browsers.

Assessment:

- Not recommended as the first fix.
- If motion is required later, use MP4/WebM, not GIF.

### Option B: Preserve a full-quality large still image only

Pros:

- Fits the current HD Worker architecture immediately.
- Highest reliability.
- Best quality per byte for the default state.
- Works in feed, detail, RSS, email, and any fallback surface.
- Minimal schema and rendering changes.

Cons:

- Motion is lost.
- User experience is not feature-parity with Telegram native clients.

Assessment:

- Best first production fix.
- This should be the baseline fallback even if motion support is added later.

### Option C: Two-layer support: high-quality still first, motion clip second

Pros:

- Correct product model.
- Safe fallback for all surfaces.
- Motion can be progressively enhanced only where supported.

Cons:

- More implementation work.
- Requires actual Telegram live-photo samples before building.
- Needs new media typing, storage metadata, and frontend rendering rules.

Assessment:

- Best long-term direction.
- Implement in two phases: still image first, motion enhancement second.

## Recommendation

Do not build a GIF path.

Recommended order:

1. ship a stable full-quality still-image fallback first
2. add explicit live-photo detection and metadata
3. add optional motion playback later using video, not GIF

If the question is "GIF snippet or one large high-quality image, which is better right now?", the answer is:

- choose the large high-quality image now
- keep motion as a second-phase enhancement
- if motion is later required, store a short MP4/WebM clip, not a GIF

## Proposed Solution

### Phase 1: Make live photos degrade cleanly to high-quality still images

Goal:

- every live photo must render as a good still image everywhere

Changes:

1. Add explicit media classification in Telegram parsing and shaping:
   - `photo`
   - `video`
   - `live_photo_candidate`

2. Treat any uncertain live-photo payload as image-first, not animation-first.

3. Keep using the HD Worker image path for the primary asset:
   - `mood/<postId>/<imageIndex>`

4. Extend feed API payload to expose a media kind field instead of inferring everything from HTML shape alone.

5. Keep existing frontend behavior, but prefer:
   - high-quality still image for ambiguous live-photo content
   - video preview only when the parser can prove a stable playable source exists

### Phase 2: Add real motion support behind a separate path

Goal:

- preserve motion only when Telegram payloads and embed HTML make it reliable

Changes:

1. Capture one or more real live-photo samples:
   - raw webhook payload
   - embed HTML
   - rendered Telegram CDN URLs

2. Determine the real transport shape:
   - plain photo plus hidden motion source
   - video-backed live photo
   - document-backed media
   - client-only effect with no usable bot asset

3. Add a dedicated media model in the app layer:
   - `kind: 'image' | 'video' | 'live-photo'`
   - `posterUrl`
   - `motionUrl`
   - `motionContentType`

4. Store motion separately from still images.

Suggested route pattern:

- `GET /mood/:postId/:imageIndex` for the still asset
- `GET /mood/:postId/:imageIndex/motion` for the optional motion asset

5. Render motion progressively:
   - feed uses poster-first rendering and only plays on interaction or viewport visibility
   - detail page can offer inline playback
   - unsupported surfaces stay on the still image

## Implementation Plan

### Step 1. Capture a real live-photo sample

Add temporary local-only instrumentation in the webhook path to log:

- full `channel_post` payload keys
- presence of `photo`, `video`, `animation`, `document`, `media_group_id`
- file ids and mime types

Also save the Telegram embed HTML for the same post.

Success criteria:

- we know exactly how Telegram exposes a live photo to bots and embeds

### Step 2. Introduce a stable media classification layer

Refactor parsing so the app does not infer behavior purely from HTML snippets.

Output shape should include fields like:

```ts
type MoodMediaKind = 'image' | 'video' | 'audio' | 'bookmark' | 'live-photo-candidate';
```

Success criteria:

- feed and detail use the same normalized media semantics

### Step 3. Make the default rendering image-first

When media is ambiguous, render the large still image from the existing HD path instead of attempting motion playback.

Success criteria:

- no broken or partial live-photo rendering
- no accidental low-quality preview regression

### Step 4. Add optional motion path

Only after sample capture proves the motion asset is reliably retrievable:

- add separate motion storage
- add route and caching rules
- add poster-first playback UI

Success criteria:

- motion works without regressing feed performance

## Acceptance Criteria

### Phase 1 acceptance

- A Telegram live photo always displays as a clear high-quality still image in:
  - `/mood`
  - `/mood/[id]`
  - RSS content
  - notify/email surfaces that consume related image links
- No broken media box or empty player appears.
- Existing normal photos and videos do not regress.

### Phase 2 acceptance

- Motion plays only when a reliable motion source exists.
- Feed remains fast and does not autoplay heavy media aggressively.
- Detail page has a stable poster and fallback behavior.
- Still image remains available when motion fails.

## Risks

- Telegram may support live photos only at the client UX layer, not as a stable bot-retrievable asset.
- Telegram embed HTML may change without notice.
- Building motion support before sample capture will likely overfit to guesswork.
- A GIF-based solution would increase transfer size and reduce quality while still not solving the underlying modeling problem.

## Suggested Priority

Priority: High

Reason:

- Telegram shipped the feature on 2026-03-31
- current Mood media assumptions are now stale
- a still-image fallback fix is low-risk and production-friendly
- motion support can be staged after payload confirmation

## Recommended Next Action

Implement Phase 1 now.

Specifically:

1. capture one real live-photo webhook payload and embed HTML
2. add normalized media kind classification
3. force ambiguous live-photo content onto the HD still-image path
4. defer motion playback until we confirm a real retrievable motion asset
