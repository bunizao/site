# Spin-off candidates: what in `site` + `site-api` could stand alone

Written 2026-09-15 from a read-only sweep of both repos (five parallel audits:
blog theme, mood pipeline, Cloudflare infra, notify/comments/admin/mascot, UI +
perf tooling) plus a prior-art check on GitHub. Ranking weighs "nobody has
shipped this" × "small enough to finish" × "someone else would actually use it".

## Headline

- The single most unprecedented artifact is `../site-api/workers/mood-converge`:
  a from-scratch MTProto 2.0 client (obfuscated abridged transport over a
  Workers outbound WebSocket, IGE via `@cryptography/aes`, hand-encoded TL for
  one RPC) running in a Durable Object alarm under the 10 ms CPU budget. Every
  "MTProto on Workers" repo on GitHub is a byte relay for browser clients; none
  makes RPC calls from the Worker. It is live: the `mood-converge` DO ticks
  every five minutes, reads `updates.getChannelDifference`, and posts the
  reduced page to site-api's `POST /v2/mood/converge/report` over a service
  binding (landed on `main` in site-api PR #55, 2026-09-08). Verified
  2026-09-15 via KV `mood:converge:status` (`reportedAt` three minutes old,
  `pts` 9150). Note: the local `../site-api` checkout was on a stale
  `codex/*` branch when this audit ran; read `origin/main`.
- The site already distributes components through a shadcn registry
  (`/r/<slug>`: `decode-text`, `list-hover`, `mood-wheel`, `conversation`,
  `projects-deck`, …) verified end-to-end by `scripts/verify-component-registry.ts`
  running the pinned shadcn CLI. This is the extraction channel; a monolithic
  Astro theme would be a step backwards.
- Do not extract "the blog theme". Ghost-headless Astro themes already exist
  (`astro-ghost-simply`, `astro-ghostcms`) and the layout is ordinary. The
  novel parts are the directive engine, the conversation DSL, and the
  internal-tag i18n scheme, and those extract as libraries.

## Tier S: new category, real users, finishable

| # | Name | Source | Effort | Why it is new |
|---|------|--------|--------|---------------|
| 1 | `mtproto-workers` | `../site-api/workers/mood-converge/src/*` (1,285 lines on `origin/main`) | M | MTProto client inside a Worker/DO, in production since 2026-09-03; reuses a gramJS `StringSession` auth key so no DH handshake in the Worker; p95 2–4 ms per tick, 65.7 KiB gzip; two RPCs (`getChannelDifference`, `channels.getMessages`). Prior art is relays only. Needs: mtcute TL codegen for more RPCs, reconnect/backoff, a bootstrap CLI. |
| 2 | `tg-channel-archive` | `../site-api/src/features/mood/ingest/*` (~2,600 lines), migrations 0001–0011, reconcile protocol (`/due` + `/report`) | L | Durable, self-healing Telegram channel archive on the Workers Free tier: budgeted re-verification (75 recent / 25 stale slots), tombstones with a mass-delete safety valve, reply-edge repair, `group_id` + partial covering indexes tuned to D1 per-row-scanned billing. BroadcastChannel scrapes live with no persistence; geekshareArchive (67 stars) has webhook + D1 + R2 but no drift detection or read-budget design. Pairs with #1 as the prober. |
| 3 | pixel sprite engine | `src/features/mascot/peek/{model,layer,compose,timeline,catalog,slots}.ts`, `lib/svg.ts`, `scripts/mascot.ts` (~1.2k generic lines) | S | Sprite-animation-as-code: three authoring DSLs (`sparse`, `rows`, `rle`), `beat()` timelines, SVG-as-rectangles output, animated favicon route, ANSI terminal preview + PNG diff CLI. No equivalent on npm; existing tools are editors or spritesheet loaders. |
| 4 | `timeline-wheel` | `src/features/mood/client/timeline-wheel.ts` (1,447), `wheel-feedback.ts` (157), `timeline-date-tracker.ts` (98), `ui/TimelineWheel.astro` (644) | M | Physics-driven date scrubber (velocity window, decaying spring, snap) with synthesized WebAudio ticks and an iOS haptic via `<input type="checkbox" switch>`. Already a registry item (`mood-wheel`); needs a data adapter that is not the mood feed. |
| 5 | conversation DSL | `src/features/content/conversation.ts` (713, pure), `Conversation.astro`, `conversation.css` | S | Chat-thread markup from a fenced block: own-side semantics, run collapsing, OKLCH contrast walk so any author hex stays AA. Already a registry item; publish as a package with a Markdown/remark plugin. |

## Tier A: sharp fixes for documented gaps

| # | Name | Source | Effort | Notes |
|---|------|--------|--------|-------|
| 6 | view-transition-name broker | `src/lib/view-transition-names.ts` (153) + incoming half in `ViewTransitionReveal.astro` | S–M | Only the clicked, on-screen, same-destination element morphs. Astro `transition:name`, `astro-vtbot`, `next-view-transitions` apply names unconditionally. |
| 7 | CWV HUD | `src/lib/performance-debug-panel.ts` (867) | M | In-page CLS/LCP/INP/long-task overlay that highlights the DOM boxes that shifted and filters its own layout churn. `web-vitals` has no UI; Lighthouse is not live. One `moodId` special case to remove. |
| 8 | route-doc coverage guard | `scripts/check-docs-coverage.ts` (134) | S | "Fails CI when an implemented route is mentioned by no doc page", derived from router source, no OpenAPI needed, cross-repo. Needs router adapters (Astro pages today; Next `app/api`, Hono). |
| 9 | iOS root-scroller kit | `src/lib/page-scroll.ts` (54), `scroll-dock.ts` (160), `PageScroller.astro` (63) | S | Documented iOS Safari toolbar-collapse fix + scroll restoration for non-root scrollers + scroll-timeline with rAF fallback sharing one model. |
| 10 | `telegram-entities-html` | `../site-api/src/features/mood/server/telegram-rich-text.ts` (270), `telegram-text-entities.ts` (143) | S | Bot API `MessageEntity[]` → HTML with correct nesting via open/close event sort, spoilers, expandable quotes, linkify backfill. Ecosystem is gists. Add a Markdown target. |
| 11 | shadcn registry smoke test | `scripts/verify-component-registry.ts` | M | Serve the built registry, run the real pinned `shadcn` CLI against every slug into a temp dir. Registry starters ship JSON shape only. |
| 12 | Ghost directive engine | `src/features/posts/server/directives/*`, `rich-content.ts`, `code-blocks.ts` | M | Per-output-target rendering (`web`/`rss`/`og`/`excerpt`/`agent-markdown`), cheerio source-location masking so directives never touch code. Ship with `poem`, `footnotes`, `authors`; keep `mood`/`music` as opt-in plugins. |
| 13 | `RateLimitDO` | `../site-api/src/features/security/rate-limit-do.ts` (56) + pure counter | S | Exact per-key limiter in one DO class, self-expiring via alarm. |
| 14 | Turnstile ready loader | `src/lib/turnstile-script.ts` (61) | S | Handles the load-event-vs-`window.turnstile` race. A gist-sized package. |

## Tier B: exists elsewhere, or too entangled

- **Comments backend** (`../site-api/src/features/comments/server/*`): well layered (Turnstile → honeypot → dwell token → heuristics → DO rate limit → Akismet → shadow ban; L0/L1/L2 identity), but Garrul and Waline already occupy "comments on one Worker with Akismet". The UI is 2.5k lines of bespoke CSS. L effort for an incremental win.
- **Notify** (12.8k lines): textbook outbox/retry/queue done right. The one distinctive piece is the flood gate state machine (`gate.ts`, `gate-release.ts`); listmonk/buttondown own the rest.
- **Edge cache primitive** (`src/lib/http/edge-cache.ts`): good, but Astro now ships `cacheCloudflare()` route caching and `plans/edge-cache.md` is about consolidating onto it. Fold, do not publish.
- **Agent markdown negotiation**: `astro-slop`, `astro-markdown-for-agents` already do this.
- **Claude Code hooks** (`scripts/hooks/*`, `worktree-gc.sh`): useful, but the hooks ecosystem is crowded and the detection regexes are Astro-specific.
- **Admin portal**: being removed from `site` per `plans/admin-portal-removal.md`.
- **Analytics**: fused to blog/newsletter/listening dimensions; umami/plausible win the generic case.
- **Embed widget, image proxy, hybrid archive+live read, glyph-field, ProjectStack, CommandPalette**: ordinary or saturated markets.

## Things that do not exist yet (do not claim them)

- No committed Playwright CLS regression spec; the `?debug=performance` +
  fixed-viewport work was ad hoc. Building one on top of #7's `snapshot()` is a
  new project, not an extraction.
- `@bunizao/decode-text@0.1.0` publishes raw `src/index.ts` with `exports`
  pointing at it. Ship a compiled `dist/` before promoting it.

## Internal consolidation worth doing regardless

- `site/src/lib/http/edge-cache.ts` and `site-api/src/lib/http/worker-cache.ts`
  wrap `caches.default` twice at different sophistication levels.
- Two rate limiters (in-memory in `site`, DO in `site-api`) share only the pure
  counter function.

## Suggested order

1. Quick wins that are already near-packaged: decode-text `dist/`, pixel
   sprite engine, conversation DSL, `telegram-entities-html`. Two weekends.
2. Flagship: `mtproto-workers` productionised (session bootstrap CLI, TL
   codegen, backoff), then `tg-channel-archive` consuming it as the prober.
   This is the project with the "nobody has done this" story.
3. UI singles from Tier A as time allows: view-transition broker, CWV HUD,
   iOS root-scroller kit, route-doc coverage guard.
