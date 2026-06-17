---
title: Mood decoupling
description: Notes on the in-progress effort to split mood feature code from route shells, server shaping, and client controllers.
internal: true
---

The mood feature works, but the boundary is weak — route code, DOM rendering, feature state, cross-page behavior, and server shaping have been bleeding into each other. This page is a working note on the decoupling plan and where it stands.

## Status (2026-04-19)

The main decoupling has shipped:

- `/mood` composes `TimelineWheel.astro`, `FeedShell.astro`, `NotifyPanel.astro`.
- Feed runtime is split into `feed-controller`, `feed-renderer`, `feed-media-hydration`, `feed-update-watcher`, `feed-comments-popover`.
- `/mood/[id]` composes `DetailArticle.astro` + `CommentsSection.astro`.
- Route helpers, mood server services, and Astro UI shells from stages 1–5 are in.

Remaining hotspots are narrower:

- `src/pages/mood.astro` still owns route-local header action injection and mobile-only header collapse.
- `src/pages/mood/[id].astro` still owns a small inline bootstrap script for back navigation, detail video classification, gallery init, and animated emoji hydration.
- `src/features/mood/shared/utils.ts` is still the broadest mood utility file on the parsing side.

## Target layering

```
pages / api routes
  -> feature controllers / feature services
    -> feature shared renderers / serializers / contracts
      -> project-wide shared helpers
        -> telegram parser / security / transport
```

## Design principles

- **Separate feature code from project-wide shared code.** Mood logic moves into `features/mood` first. Only logic clearly reusable outside mood moves into `src/lib`.
- **Separate behavior from layout before separating layout from markup.** The current pain is controller and rendering coupling — splitting one Astro file into many while keeping the same inline scripts would just inflate the file count.
- **Preserve route contracts before changing implementation.** Migration steps must keep `/api/moods`, `/api/comments`, `/mood`, `/mood/[id]`, `/mood/embed`, `/mood/rss.xml` stable.
- **Don't rewrite the Telegram parser in the same effort.** Wrap it in feature services first.
- **Prefer route-level helpers over global middleware.** This project is endpoint-focused; that matches the security posture in [Security](/docs/resources/security).

## Stages

1. **Freeze contracts and shared route helpers.** Add `src/lib/runtime/env.ts`, `src/lib/http/json-response.ts`, `src/lib/http/query.ts`, `src/lib/http/rate-limited.ts`, `src/features/mood/server/contracts.ts`. Adapt `moods/comments/oembed/notify` routes.
2. **Extract feature server services.** `channel-service`, `feed-service`, `api-routes`, plus serializers for feed/embed/rss/notify preview. Stops independent reshaping in each entrypoint.
3. **Extract shared client utilities.** `shared/preview.ts`, `shared/comments.ts`, `client/animated-emoji.ts`, `src/lib/media/responsive-image.ts`. Eliminates duplicated preview, image, emoji, and comment helpers.
4. **Extract controllers** in this order: detail comments, notify panel, feed controller, timeline wheel. Order matters — detail comments has the clearest boundary; timeline wheel is tightly coupled to feed DOM and should move last.
5. **Extract Astro UI shells.** Page files end up holding only route metadata, params, service calls, component composition, and controller bootstrap.

## Risks to watch

- **Preview rendering drift.** `previewHtml` is sanitized server-side, but DOM rules are rebuilt in more than one place. Home preview and feed can drift apart if changes aren't shared.
- **Timeline wheel coupling.** Tightly coupled to feed DOM. Don't change feed markup and wheel logic in the same step unless the controller exists.
- **Refresh state machine.** Polling, auto-refresh, and scroll-sensitive behavior should be one controller, not split across UI components.
- **Notify panel.** Touches Turnstile, URL-driven auto-open, focus management, retry states, and API errors — don't move before its helper deps are extracted.
- **Fixture drift.** E2E payloads must match live contracts on `needsDetailPage`, `mediaHtml`, `quote`, `reactions`, `commentsCount`.

## Non-goals

Replacing Astro page scripts with React state management, introducing a global state library, rewriting Telegram parsing internals, introducing site-wide middleware, redesigning the mood UI.

## Exit criteria

The effort is done when:

- mood routes are orchestration shells, not feature monoliths;
- feed/detail/home preview stop duplicating preview and emoji logic;
- feed/embed/rss/notify preview share server shaping;
- routes share the same query and JSON helper layer;
- the timeline wheel is behaviorally modular, not just visually so;
- a single mood behavior change doesn't require editing multiple unrelated entrypoints.
