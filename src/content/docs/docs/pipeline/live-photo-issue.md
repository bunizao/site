---
title: Live photo issue
description: Telegram added live photos in 2026; the mood pipeline still treats them as still images.
internal: true
---

Telegram announced support for live and motion photos on 2026-03-31. The current mood pipeline doesn't model live photos as a first-class type — webhook ingest stores only static image assets, and frontend rendering treats new media as either plain image HTML or normal video HTML. That assumption is now too narrow.

## What goes wrong

- Motion is lost entirely on live-photo posts.
- Feed and detail can disagree on rendering behavior.
- The HD worker ingest can't preserve the moving part.
- Media-group indexing is photo-only, so a live photo inside an album can land at the wrong index.

For users: a live photo can show up as a still image even when Telegram clients render it as motion. Rendering can disagree across Telegram native, Telegram embed, the mood feed, and detail.

## Evidence

**Webhook ingest only handles `message.photo`.** The legacy webhook resolves targets and ingests when `message.photo?.length` exists. The Cloudflare worker follows the same pattern and only resolves Telegram file URLs for image ingest. The ingest layer is image-specific by design.

**Media-group indexing is photo-node-only.** Album indexing comes from `.tgme_widget_message_photo_wrap` nodes. If Telegram represents live-photo motion through video-like markup, current indexing logic won't track it.

**Parsing has partial video support, no live-photo modeling.** The Telegram parser already emits `<video>` from embed HTML, and separately emits image blocks from photo wraps. Enough for plain video and plain photo — no explicit live-photo normalization.

**Feed shaping assumes either inline `<video>` or static image preview.** Preview logic returns the first `<video>` if one exists; otherwise it falls back to image extraction. Too simplistic for live photos: the desired UX is preserve a high-quality still as the baseline, optionally expose motion where supported.

## Constraint from the Bot API

Telegram's Bot API still exposes the familiar buckets — `photo`, `video`, `animation`, `document` — not a dedicated live-photo media type. Even though clients render live photos with motion, the bot-facing data model doesn't give us a clean abstraction. Don't assume we can reliably ingest "the motion component" without first capturing real production payloads and embed HTML from a live-photo post.

## Options compared

**Option A: GIF-like animated preview.** Pros: motion in feed and detail. Cons: GIF is the wrong transport — quality, size, and CPU cost; large bandwidth increase on feed scroll; lower visual quality than the original still; the worker uses Cloudflare image resizing, not video transcoding; new storage and caching path; hard to guarantee autoplay/fallback/poster across browsers. **Not recommended.** If motion is needed later, use MP4/WebM, not GIF.

**Option B: Full-quality large still only.** Pros: fits the current HD architecture immediately; highest reliability; best quality per byte for the default state; works in feed, detail, RSS, email, and any fallback surface; minimal schema/render changes. Cons: motion is lost; not feature-parity with Telegram clients. **Best first production fix.**

**Option C: Two-layer — high-quality still first, motion clip second.** Pros: correct product model; safe fallback for all surfaces; motion can be progressively enhanced where supported. Cons: more work; needs real samples before building; new media typing, storage metadata, frontend rules. **Best long-term direction.**

## Plan

**Phase 1 — make live photos degrade cleanly to high-quality stills.**

1. Add explicit media classification in Telegram parsing and shaping: `photo`, `video`, `live_photo_candidate`.
2. Treat any uncertain live-photo payload as image-first, not animation-first.
3. Keep using the HD worker image path (`mood/<postId>/<imageIndex>`).
4. Extend feed API payload to expose a media kind field instead of inferring from HTML shape.
5. Frontend prefers the high-quality still for ambiguous live-photo content; video preview only when a stable playable source is proven.

**Phase 2 — add real motion support behind a separate path.**

1. Capture real samples: raw webhook payload, embed HTML, rendered Telegram CDN URLs.
2. Determine the actual transport shape (plain photo + hidden motion source / video-backed live photo / document-backed media / client-only effect).
3. Add a dedicated media model: `kind: 'image' | 'video' | 'live-photo'`, `posterUrl`, `motionUrl`, `motionContentType`.
4. Store motion separately. Suggested route: `GET /mood/:postId/:imageIndex` for the still, `GET /mood/:postId/:imageIndex/motion` for the optional motion asset.
5. Render motion progressively — feed uses poster-first and only plays on interaction or viewport visibility; detail offers inline playback; unsupported surfaces stay on the still.

## Acceptance

**Phase 1.** A Telegram live photo always displays as a clear high-quality still in `/mood`, `/mood/[id]`, RSS, and notify/email surfaces. No broken media box or empty player. Existing photos and videos don't regress.

**Phase 2.** Motion plays only when a reliable motion source exists. Feed stays fast and doesn't autoplay heavy media aggressively. Detail has a stable poster and fallback. The still remains available when motion fails.

## Risks

Telegram may support live photos only at the client UX layer, not as a stable bot-retrievable asset. Embed HTML may change without notice. Building motion support before sample capture will overfit to guesswork. A GIF path would increase transfer size and reduce quality while still not solving the modeling problem.

## Next action

Implement Phase 1 now: capture one real live-photo webhook payload and embed HTML, add normalized media kind classification, force ambiguous live-photo content onto the HD still-image path, defer motion playback until a real retrievable motion asset is confirmed.
