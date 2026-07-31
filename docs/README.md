# Docs Index

How this tree works:

- `docs/*.md` — **living reference**. These describe the current system and must stay accurate. If a change makes one of these wrong, fix the doc in the same PR.
- `docs/plans/` — **active plans**. Work that is proposed or in progress. When a plan ships, move it to `docs/archive/`.
- `docs/archive/` — **frozen records**. Shipped PRDs, completed migrations, resolved investigations. Never updated; they explain why things were built the way they were.
- `docs/research/` — dated research notes. Frozen once written.
- `docs/reviews/` — audits and their remediation indexes.
- `docs/debug/` — local-only debug artifacts, not committed (see its README).

Root-level `plans/` (repo root, numbered files) is the mood-hardening workstream backlog, separate from `docs/plans/`.

## Living reference

| Doc | Read it when |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | You need the runtime shape, directory map, API surface, env vars, or the site/site-api boundary. Start here. |
| [MOOD.md](MOOD.md) | Anything under `/mood`: feed, detail, read path (D1 archive + live fallback), hydration. |
| [HOME.md](HOME.md) | Home page sections, hero, Ghost publish → deploy hook flow. |
| [BLOG-DESIGN.md](BLOG-DESIGN.md) | `/blog` visual system — normative design tokens for 無人之境. |
| [TELEGRAM-PIPELINE.md](TELEGRAM-PIPELINE.md) | Telegram ingestion, webhook, HD images (owned by site-api; this is the site-side view). |
| [EMAIL-NOTIFY.md](EMAIL-NOTIFY.md) | Mood email subscriptions and the admin portal touchpoints. |
| [WORKER-SITE.md](WORKER-SITE.md) | The `site` Worker itself: assets, routes, deploy, CI. |
| [OAUTH-HUB.md](OAUTH-HUB.md) | Admin GitHub OAuth flow. |
| [SECURITY.md](SECURITY.md) | Security boundaries and headers. |
| [PRIVACY-POLICY.md](PRIVACY-POLICY.md) | How the `/privacy` page renders; policy text lives in `src/content/pages/privacy.md`. |
| [SVG-API.md](SVG-API.md) | `/api/status.svg` and friends. |
| [OEMBED-API.md](OEMBED-API.md) | `/api/oembed.json`. |
| [MASCOT.md](MASCOT.md) | The peek mascot: assets and placement rules. |
| [SHARED-LAYOUT.md](SHARED-LAYOUT.md) | Cross-page UI: nav, theme, footer. |
| [SPOTLIGHT-OVERLAY.md](SPOTLIGHT-OVERLAY.md) | The pointer spotlight over the dot grid. |
| [E2E-BEHAVIOR-SCOPE.md](E2E-BEHAVIOR-SCOPE.md) | What the Playwright suites do and do not cover. |

## Active plans

| Doc | Read it when |
| --- | --- |
| [plans/README.md](plans/README.md) | You need the current status, dependency order, rollout gates, or frontend protection boundary for every plan. Start here before implementing an individual plan. |
| [PLAN-ops-portal.md](PLAN-ops-portal.md) | You need the approved roadmap for the portal rework, notify gate, Telegram ops bot, and analytics workstream. |

### Mood media and the static proxy

Independent of each other; `youtube-embed-card` waits on the hardening.

| Doc | Scope |
| --- | --- |
| [plans/mood-media-r2.md](plans/mood-media-r2.md) | Mood video/audio into R2 via the existing MTProto reconciler; removes Telegram from the read path and unblocks the >20 MB files. |
| [plans/static-proxy-hardening.md](plans/static-proxy-hardening.md) | Signed `/static/` URLs + content-type lockdown + edge rate limiting, so the proxy is safe to grow. |

### Blog authoring

`blog-directive-registry` is the foundation; the rest depend on it.

| Doc | Scope |
| --- | --- |
| [plans/blog-directive-registry.md](plans/blog-directive-registry.md) | One server-side directive pass replacing three ad-hoc idioms; moves the poem promoter off the client. |
| [plans/blog-footnotes.md](plans/blog-footnotes.md) | Post-wide footnotes in ordinary Koenig paragraphs, rendered as one block at the article foot. |
| [plans/blog-authorship-credits.md](plans/blog-authorship-credits.md) | Human and model co-author credits with a `pledgeSafe` role vocabulary that keeps the `#not-by-ai` pledge honest. |
| [plans/blog-editor-preview.md](plans/blog-editor-preview.md) | `/dev/prose` playground, Ghost draft preview through the real pipeline, bookmarklet, and snippets. |
| [plans/youtube-embed-card.md](plans/youtube-embed-card.md) | A YouTube card we own: proxied poster, our pre-play UI, capability-probed playback. |
