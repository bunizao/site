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
