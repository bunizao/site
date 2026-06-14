# Mood Decoupling Plan

## Scope

This document defines the target architecture and migration plan for decoupling the mood feature.

It covers:

- the `L1` mood feed at `/mood`
- the `L2` mood detail page at `/mood/[id]`
- the home preview component
- shared mood client behavior
- shared mood server shaping
- reusable route-level helpers that can be adopted across the project

It does not propose a Telegram parser rewrite or a full-site middleware rewrite.

## Implementation Status

As of April 19, 2026, the main decoupling plan in this document has already been implemented in the repo.

Current shipped state:

- `/mood` now composes [`src/features/mood/ui/TimelineWheel.astro`](../src/features/mood/ui/TimelineWheel.astro), [`src/features/mood/ui/FeedShell.astro`](../src/features/mood/ui/FeedShell.astro), and [`src/features/mood/ui/NotifyPanel.astro`](../src/features/mood/ui/NotifyPanel.astro)
- feed runtime is split across [`src/features/mood/client/feed-controller.ts`](../src/features/mood/client/feed-controller.ts), [`src/features/mood/client/feed-renderer.ts`](../src/features/mood/client/feed-renderer.ts), [`src/features/mood/client/feed-media-hydration.ts`](../src/features/mood/client/feed-media-hydration.ts), [`src/features/mood/client/feed-update-watcher.ts`](../src/features/mood/client/feed-update-watcher.ts), and [`src/features/mood/client/feed-comments-popover.ts`](../src/features/mood/client/feed-comments-popover.ts)
- `/mood/[id]` now composes [`src/features/mood/ui/DetailArticle.astro`](../src/features/mood/ui/DetailArticle.astro) and [`src/features/mood/ui/CommentsSection.astro`](../src/features/mood/ui/CommentsSection.astro)
- route helpers, mood server services, and Astro UI shells from stages 1-5 are present in the codebase

Remaining hotspots are narrower:

- [`src/pages/mood.astro`](../src/pages/mood.astro) still owns route-local header action injection and mobile-only header collapse behavior
- [`src/pages/mood/[id].astro`](../src/pages/mood/[id].astro) still owns a small inline bootstrap script for back navigation, detail video classification, gallery init, and animated emoji hydration
- [`src/features/mood/shared/utils.ts`](../src/features/mood/shared/utils.ts) is still the broadest mood utility file on the parsing side

## Why This Exists

The current mood implementation works, but the feature boundary is weak.

The main problem is not only file size. The larger issue is that route code, DOM rendering, feature state, cross-page behavior, and server shaping are mixed together.

Remaining hotspots:

- [`src/pages/mood.astro`](../src/pages/mood.astro)
- [`src/pages/mood/[id].astro`](../src/pages/mood/[id].astro)
- [`src/features/mood/client/feed-renderer.ts`](../src/features/mood/client/feed-renderer.ts)
- [`src/features/mood/shared/utils.ts`](../src/features/mood/shared/utils.ts)

Original symptoms that motivated this work:

- feed page owns too many responsibilities
- detail page duplicates client logic already present elsewhere
- home preview duplicates preview rendering and image logic
- server entrypoints reshape mood data independently
- environment reads, query parsing, JSON responses, and rate-limit response patterns repeat across endpoints
- the timeline wheel was only visually separated; its behavior lived in the page

## Current State Summary

### Feed Page

[`src/pages/mood.astro`](../src/pages/mood.astro) now acts as a route shell plus bootstrap layer.

Current page-owned responsibilities:

- header action injection
- mobile header collapse behavior
- route-local layout composition
- bootstrapping of feed / notify / timeline client modules

The feed feature runtime itself now lives in:

- [`src/features/mood/client/feed-controller.ts`](../src/features/mood/client/feed-controller.ts)
- [`src/features/mood/client/feed-renderer.ts`](../src/features/mood/client/feed-renderer.ts)
- [`src/features/mood/client/feed-media-hydration.ts`](../src/features/mood/client/feed-media-hydration.ts)
- [`src/features/mood/client/feed-update-watcher.ts`](../src/features/mood/client/feed-update-watcher.ts)
- [`src/features/mood/client/feed-comments-popover.ts`](../src/features/mood/client/feed-comments-popover.ts)

### Detail Page

[`src/pages/mood/[id].astro`](../src/pages/mood/[id].astro) now composes private Astro shells and a smaller bootstrap script.

Current page-owned responsibilities:

- route handling and redirect behavior
- route-level fetch and `404` handling
- back navigation behavior
- detail video classification
- gallery init
- animated emoji hydration bootstrap

Detail shells and comments runtime now live in:

- [`src/features/mood/ui/DetailArticle.astro`](../src/features/mood/ui/DetailArticle.astro)
- [`src/features/mood/ui/CommentsSection.astro`](../src/features/mood/ui/CommentsSection.astro)
- [`src/features/mood/client/detail-comments-controller.ts`](../src/features/mood/client/detail-comments-controller.ts)

### Home Preview

[`src/features/mood/ui/HomePreview.astro`](../src/features/mood/ui/HomePreview.astro) currently owns:

- home-only mood list fetching
- local preview cache behavior
- preview HTML/text rendering
- image fallback logic
- DOM construction for cards
- navigation behavior

### Server Side

[`src/pages/api/moods.ts`](../src/pages/api/moods.ts) currently owns:

- query parsing
- cursor validation
- rate limiting
- environment reads
- avatar proxy resolution
- E2E fixture branching
- Telegram data loading
- feed payload shaping
- probe mode branching

The same feature data is also reshaped independently in:

- [`src/pages/mood/embed.astro`](../src/pages/mood/embed.astro)
- [`src/pages/mood/rss.xml.ts`](../src/pages/mood/rss.xml.ts)
- [`src/pages/api/notify/preview.ts`](../src/pages/api/notify/preview.ts)
- [`src/features/notify/server/service.ts`](../src/features/notify/server/service.ts)

## Design Principles

### 1. Separate feature code from project-wide shared code

Mood-specific logic should first move into a `features/mood` boundary.

Only logic that is clearly reusable outside mood should move into `src/lib`.

### 2. Separate behavior from layout before separating layout from markup

The current problem is mostly controller and rendering coupling.

Do not start by mechanically splitting one Astro file into many Astro files while keeping the same inline scripts. That would increase file count without improving boundaries.

### 3. Preserve route contracts before changing implementation

The first migration steps should keep current behavior and route contracts stable.

Important contracts to preserve first:

- `GET /api/moods`
- `GET /api/moods?probe=1`
- `GET /api/comments`
- `/mood`
- `/mood/[id]`
- `/mood/embed`
- `/mood/rss.xml`

### 4. Do not rewrite the Telegram parser in the same effort

`site-api` is upstream parsing infrastructure for mood content.

It should be consumed through feature services and the Cloudflare `API` service binding.

### 5. Prefer route-level helpers over global middleware

The current project is endpoint-focused, not middleware-centric.

That matches the security documentation in [`docs/SECURITY.md`](./SECURITY.md).

The right first move is shared route helpers, not a global `src/middleware.ts`.

## Target Architecture

## Target Layering

```text
pages / api routes
  -> feature controllers / feature services
    -> feature shared renderers / serializers / contracts
      -> project-wide shared helpers
        -> telegram parser / security / transport
```

## Target Directories

### Mood Feature Layer

- `src/features/mood/shared/preview.ts`
- `src/features/mood/shared/comments.ts`
- `src/features/mood/client/feed-controller.ts`
- `src/features/mood/client/feed-renderer.ts`
- `src/features/mood/client/feed-media-hydration.ts`
- `src/features/mood/client/feed-update-watcher.ts`
- `src/features/mood/client/feed-comments-popover.ts`
- `src/features/mood/client/feed-types.ts`
- `src/features/mood/client/detail-comments-controller.ts`
- `src/features/mood/client/notify-panel-controller.ts`
- `src/features/mood/client/animated-emoji.ts`
- `src/features/mood/client/timeline-wheel.ts`
- `src/features/mood/server/contracts.ts`
- `src/features/mood/server/channel-service.ts`
- `src/features/mood/server/feed-service.ts`
- `src/features/mood/server/comments-service.ts`
- `src/features/mood/server/serializers.ts`

### Project-Wide Shared Layer

- `src/lib/runtime/env.ts`
- `src/lib/http/json-response.ts`
- `src/lib/http/query.ts`
- `src/lib/http/rate-limited.ts`
- `src/lib/media/responsive-image.ts`

### Optional Astro UI Shells

These now exist in the codebase after controller extraction.

- `src/features/mood/ui/Hero.astro`
- `src/features/mood/ui/FeedShell.astro`
- `src/features/mood/ui/DetailArticle.astro`
- `src/features/mood/ui/CommentsSection.astro`
- `src/features/mood/ui/NotifyPanel.astro`
- `src/features/mood/ui/TimelineWheel.astro`

## Module Responsibilities

### `src/features/mood/server/contracts.ts`

Defines stable feature contracts shared by route handlers, services, and client controllers.

Expected exports:

- `MoodFeedItem`
- `MoodChannelSummary`
- `MoodProbeResult`
- `MoodCommentsPage`
- `MoodQuote`
- `MoodReaction`

This file should become the single source of truth for feed payload shape.

### `src/features/mood/server/channel-service.ts`

Responsible for loading mood data from the upstream Telegram integration and E2E fixtures.

Expected responsibilities:

- read one post
- read feed snapshot
- read channel summary
- centralize E2E fixture switching

It should not know about route response formatting.

### `src/features/mood/server/feed-service.ts`

Responsible for turning upstream posts into feed-ready domain data.

Expected responsibilities:

- sort posts
- derive preview fields
- derive inline media fields
- derive `needsDetailPage`
- derive quote and forwarded metadata
- derive channel avatar URL
- produce `MoodFeedItem[]`

### `src/features/mood/server/comments-service.ts`

Responsible for loading and normalizing comments data.

Expected responsibilities:

- read comments thread
- map upstream comment data into a stable client-facing shape
- centralize cursor handling and pagination response shape

### `src/features/mood/server/serializers.ts`

Responsible for entrypoint-specific formatting.

Expected responsibilities:

- feed serializer
- embed serializer
- RSS serializer
- notify preview serializer

This layer avoids repeating shaping logic in route files.

### `src/features/mood/shared/preview.ts`

Responsible for preview rendering rules shared across home preview and feed.

Expected responsibilities:

- `linkifyText`
- `linkifyHtml`
- `buildPreviewFragment`
- preview-safe inline markup handling

This should replace duplicate logic currently present in:

- [`src/pages/mood.astro`](../src/pages/mood.astro)
- [`src/features/mood/ui/HomePreview.astro`](../src/features/mood/ui/HomePreview.astro)

### `src/features/mood/shared/comments.ts`

Responsible for shared comment rendering helpers.

Expected responsibilities:

- comment content normalization
- reply quote conversion
- comment DOM fragment helpers
- comment date formatting helpers if shared

This should align with the existing behavior in [`src/features/mood/shared/comments.ts`](../src/features/mood/shared/comments.ts).

### `src/features/mood/client/animated-emoji.ts`

Responsible for Telegram animated emoji hydration.

Expected responsibilities:

- dynamic script loading
- emoji metadata fetch
- animation data caching
- root hydration entrypoint

This should replace duplicate implementations in:

- [`src/pages/mood.astro`](../src/pages/mood.astro)
- [`src/pages/mood/[id].astro`](../src/pages/mood/[id].astro)

### `src/features/mood/client/feed-controller.ts`

Responsible for feed orchestration and runtime state handoff.

Expected responsibilities:

- initial loading
- infinite pagination
- render staging
- handing off DOM work to dedicated feed submodules

It should not own inline markup definitions for the shell.

The current repo now splits those concerns into:

- `src/features/mood/client/feed-renderer.ts`
- `src/features/mood/client/feed-media-hydration.ts`
- `src/features/mood/client/feed-update-watcher.ts`
- `src/features/mood/client/feed-comments-popover.ts`

### `src/features/mood/client/detail-comments-controller.ts`

Responsible for detail-page comments runtime state.

Expected responsibilities:

- initial comments load
- pagination
- dedupe
- empty and error states
- animated emoji hydration for comment content

### `src/features/mood/client/notify-panel-controller.ts`

Responsible for the feed page notify panel behavior.

Expected responsibilities:

- open and close state
- submit gating
- Turnstile lifecycle
- success and error states
- URL-driven subscribe open behavior

### `src/features/mood/client/timeline-wheel.ts`

Responsible for timeline wheel behavior only.

Expected responsibilities:

- date anchor extraction
- notch lifecycle
- active state sync
- scroll position mapping
- loading state sync

The Astro component [`src/features/mood/ui/TimelineWheel.astro`](../src/features/mood/ui/TimelineWheel.astro) should remain the visual shell.

## Project-Wide Shared Helpers

## `src/lib/runtime/env.ts`

Centralize runtime/build env reads currently repeated in multiple files.

Expected helpers:

- `readEnv`
- `readPublicEnv`
- `readOptionalEnv`

Current duplication exists in:

- [`src/pages/api/moods.ts`](../src/pages/api/moods.ts)
- [`src/pages/mood/embed.astro`](../src/pages/mood/embed.astro)
- [`src/features/notify/server/service.ts`](../src/features/notify/server/service.ts)

## `src/lib/http/json-response.ts`

Centralize JSON response boilerplate.

Expected helpers:

- `jsonOk`
- `jsonError`
- `jsonBadRequest`
- `jsonTooManyRequests`

This should reduce repeated response assembly across public APIs.

## `src/lib/http/query.ts`

Centralize route query parsing and validation.

Expected helpers:

- `readNumericQuery`
- `readCursorQuery`
- `readEnumQuery`
- `readBooleanFlag`

Current duplication exists in:

- [`src/pages/api/moods.ts`](../src/pages/api/moods.ts)
- [`src/pages/api/comments.ts`](../src/pages/api/comments.ts)
- [`src/pages/api/oembed.json.ts`](../src/pages/api/oembed.json.ts)

## `src/lib/http/rate-limited.ts`

Centralize the common pattern:

- call `checkRateLimit`
- produce headers
- return early on `429`

This is not global middleware. It is a route-level helper.

## `src/lib/media/responsive-image.ts`

Centralize image helpers reused by mood pages and previews.

Expected helpers:

- `withWidthParam`
- `buildSrcSet`
- `applyResponsiveImage`
- `proxyAvatarUrl` if generic enough

Current duplication exists in:

- [`src/pages/mood.astro`](../src/pages/mood.astro)
- [`src/features/mood/ui/HomePreview.astro`](../src/features/mood/ui/HomePreview.astro)
- [`src/pages/mood/embed.astro`](../src/pages/mood/embed.astro)
- `site-api` mood ingest and rich-text rendering

## Migration Mapping

## Current File to Target File Mapping

### From `src/pages/mood.astro`

Move or isolate:

- notify panel behavior -> `src/features/mood/client/notify-panel-controller.ts`
- feed state and pagination -> `src/features/mood/client/feed-controller.ts`
- timeline wheel behavior -> `src/features/mood/client/timeline-wheel.ts`
- animated emoji hydration -> `src/features/mood/client/animated-emoji.ts`
- preview fragment rendering -> `src/features/mood/shared/preview.ts`
- responsive media helpers -> `src/lib/media/responsive-image.ts`

Keep in page:

- route metadata
- route-local layout composition
- shell markup
- script bootstrapping

### From `src/pages/mood/[id].astro`

Move or isolate:

- animated emoji hydration -> `src/features/mood/client/animated-emoji.ts`
- comments loading and pagination -> `src/features/mood/client/detail-comments-controller.ts`
- shared comment rendering helpers -> `src/features/mood/shared/comments.ts`

Keep in page:

- route params
- redirect handling for embed mode
- post shell markup
- route-level SEO and `404` behavior

### From `src/features/mood/ui/HomePreview.astro`

Move or isolate:

- preview fragment rendering -> `src/features/mood/shared/preview.ts`
- image fallback logic -> `src/lib/media/responsive-image.ts`
- optional preview cache helpers -> keep local unless reused

Keep in component:

- home-specific shell
- home-only animation timing
- home-only cache policy if it remains unique

### From `src/pages/api/moods.ts`

Move or isolate:

- env reads -> `src/lib/runtime/env.ts`
- cursor parsing -> `src/lib/http/query.ts`
- JSON response boilerplate -> `src/lib/http/json-response.ts`
- rate-limit wrapper -> `src/lib/http/rate-limited.ts`
- feed shaping -> `src/features/mood/server/feed-service.ts`
- payload contracts -> `src/features/mood/server/contracts.ts`

Keep in route:

- route method boundary
- request-to-service orchestration

### From `src/features/mood/shared/utils.ts`

Split only where there is clear boundary value.

Keep here for now:

- Telegram content parsing helpers
- preview extraction helpers
- quote extraction helpers
- media detection helpers

Potential later splits:

- move shared public types into `src/features/mood/server/contracts.ts`
- move generic image helpers into `src/lib/media/responsive-image.ts`

Do not over-split this file before the service layer exists.

## Staged Execution Plan

## Stage 1: Freeze Contracts and Shared Route Helpers

Goal:

- reduce endpoint boilerplate duplication
- define stable feature contracts
- keep existing page behavior unchanged

Changes:

- add `src/lib/runtime/env.ts`
- add `src/lib/http/json-response.ts`
- add `src/lib/http/query.ts`
- add `src/lib/http/rate-limited.ts`
- add `src/features/mood/server/contracts.ts`
- adapt `moods/comments/oembed/notify` routes to use these helpers

Files expected to change:

- [`src/pages/api/moods.ts`](../src/pages/api/moods.ts)
- [`src/pages/api/comments.ts`](../src/pages/api/comments.ts)
- [`src/pages/api/oembed.json.ts`](../src/pages/api/oembed.json.ts)
- [`src/pages/api/notify/subscribe.ts`](../src/pages/api/notify/subscribe.ts)

Do not change yet:

- page DOM structure
- feed rendering behavior
- timeline wheel markup

## Stage 2: Extract Feature Server Services

Goal:

- stop reshaping mood data independently in each entrypoint

Changes:

- add `channel-service`
- add `feed-service`
- add `comments-service`
- add serializers for feed/embed/rss/notify preview

Files expected to change:

- [`src/pages/api/moods.ts`](../src/pages/api/moods.ts)
- [`src/pages/mood/embed.astro`](../src/pages/mood/embed.astro)
- [`src/pages/mood/rss.xml.ts`](../src/pages/mood/rss.xml.ts)
- [`src/pages/api/notify/preview.ts`](../src/pages/api/notify/preview.ts)

Do not change yet:

- Telegram parser internals
- feed page shell

## Stage 3: Extract Shared Client Utilities

Goal:

- eliminate duplicated preview, image, emoji, and comment helpers

Changes:

- add `shared/preview.ts`
- add `shared/comments.ts`
- add `client/animated-emoji.ts`
- add `src/lib/media/responsive-image.ts`

Files expected to change:

- [`src/pages/mood.astro`](../src/pages/mood.astro)
- [`src/pages/mood/[id].astro`](../src/pages/mood/[id].astro)
- [`src/features/mood/ui/HomePreview.astro`](../src/features/mood/ui/HomePreview.astro)

Do not change yet:

- page-level controller ownership

## Stage 4: Extract Controllers

Goal:

- move feature behavior out of page files

Changes:

- add `feed-controller.ts`
- add `detail-comments-controller.ts`
- add `notify-panel-controller.ts`
- add `timeline-wheel.ts`

Recommended order:

1. detail comments controller
2. notify panel controller
3. feed controller
4. timeline wheel controller

Rationale:

- detail comments have the clearest boundary
- notify panel is behavior-heavy but isolated
- feed controller is broader
- timeline wheel is tightly coupled to feed DOM structure and should move last

## Stage 5: Extract Astro UI Shells

Status: implemented in the current repo.

Goal:

- reduce page file size after behavior is already isolated

Changes:

- add `src/features/mood/ui/Hero.astro`
- add `src/features/mood/ui/FeedShell.astro`
- add `src/features/mood/ui/DetailArticle.astro`
- add `src/features/mood/ui/CommentsSection.astro`
- add `src/features/mood/ui/NotifyPanel.astro`

After this stage, page files should mostly contain:

- route metadata
- params handling
- service calls
- component composition
- controller bootstrap

## Validation Strategy

Each stage should keep current behavior stable.

Minimum verification references:

- [`tests/e2e/api.pw.ts`](../tests/e2e/api.pw.ts)
- [`tests/e2e/mood-flow.pw.ts`](../tests/e2e/mood-flow.pw.ts)
- [`tests/e2e/site.pw.ts`](../tests/e2e/site.pw.ts)

Stage-specific concerns:

- Stage 1: route status codes, cursor validation, rate-limit responses
- Stage 2: payload shape parity across feed/embed/rss/notify preview
- Stage 3: preview HTML rendering parity, image fallback parity, emoji parity
- Stage 4: pagination, update polling, notify panel, comment loading, scroll behavior
- Stage 5: no visual regressions in shell composition

## Risks

### Preview Rendering Drift

`previewHtml` is already sanitized server-side, but the client rebuilds DOM rules in more than one place.

If this changes carelessly, the home preview and feed can drift apart.

### Timeline Wheel Coupling

The wheel behavior is tightly coupled to feed DOM structure.

Do not change the feed markup and wheel logic in the same step unless the new controller already exists.

### Refresh State Machine Regressions

The feed update watcher manages polling, auto-refresh, and scroll-sensitive behavior.

It should be extracted as a controller, not split across UI components.

### Notify Panel Regressions

The notify panel touches Turnstile, URL-driven auto-open, focus management, retry states, and API error handling.

It should not be moved before its helper dependencies are extracted.

### Fixture Drift

E2E fixture payloads must stay aligned with live payload contracts.

This is especially important for:

- `needsDetailPage`
- `mediaHtml`
- `quote`
- `reactions`
- `commentsCount`

## Explicit Non-Goals

These are out of scope for the first decoupling effort:

- replacing Astro page scripts with React state management
- introducing a new global state library
- rewriting Telegram parsing internals
- introducing a full-site middleware architecture
- redesigning the mood UI

## Exit Criteria

The decoupling effort is successful when:

- `mood` route files become orchestration shells instead of feature monoliths
- feed/detail/home preview stop duplicating preview and emoji logic
- feed/embed/rss/notify preview use shared server shaping
- route handlers share the same query and JSON helper layer
- the timeline wheel becomes behaviorally modular, not only visually modular
- the mood feature can evolve without editing multiple unrelated entrypoints for one behavior change

## Recommended First Implementation Pass

If this plan is reused as migration history elsewhere, the safest original execution order was:

1. Stage 1
2. Stage 2
3. Stage 3

That sequence gives the highest decoupling value with the lowest UI regression risk.
