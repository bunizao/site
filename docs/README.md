# Docs Index

How this tree works:

- `docs/*.md` — **living reference**. These describe the current system and must stay accurate. If a change makes one of these wrong, fix the doc in the same PR.
- `docs/plans/` — **active plans**. Work that is proposed or in progress. When a plan ships, move it to `docs/archive/`.
- `docs/archive/` — **frozen records**. Shipped PRDs, completed migrations, resolved investigations. Never updated; they explain why things were built the way they were.
- `docs/research/` — dated research notes. Frozen once written.
- `docs/reviews/` — audits and their remediation indexes.
- `docs/debug/` — local-only debug artifacts, not committed (see its README).

Root-level `plans/` (repo root, numbered files) is the mood-hardening workstream backlog, separate from `docs/plans/`.

## Published reference

Some references are not internal notes — they are pages readers see. Those live
in the `docs` content collection and ship at `buxx.me/docs`:

| Page | Source |
| --- | --- |
| [/docs/overview](https://buxx.me/docs/overview) | `src/content/docs/overview.md` |
| [/docs/api/oembed](https://buxx.me/docs/api/oembed) | `src/content/docs/api/oembed.md` |
| [/docs/api/svg](https://buxx.me/docs/api/svg) | `src/content/docs/api/svg.md` |
| [/docs/api/feeds](https://buxx.me/docs/api/feeds) | `src/content/docs/api/feeds.md` |
| [/docs/blog/publishing](https://buxx.me/docs/blog/publishing) | `src/content/docs/blog/publishing.md` |

There is deliberately one copy of each — a published page keeps no `docs/*.md`
counterpart, so the reference cannot drift from an internal note. Add a page by
dropping a Markdown file into `src/content/docs/` with `title`, `description`,
`group`, and `order` frontmatter; the sidebar, hub, sitemap, and prev/next all
follow from the collection. Group order lives in
`src/features/docs/server/nav.ts`.

## Living reference

| Doc | Read it when |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | You need the runtime shape, directory map, API surface, env vars, or the site/site-api boundary. Start here. |
| [SEO.md](SEO.md) | Public identity, title conventions, structured data, indexing, and search favicon policy. |
| [MOOD.md](MOOD.md) | Anything under `/mood`: feed, detail, read path (D1 archive + live fallback), hydration. |
| [HOME.md](HOME.md) | Home page sections, hero, Ghost publish → deploy hook flow. |
| [BLOG-DESIGN.md](BLOG-DESIGN.md) | `/blog` visual system — normative design tokens for 無人之境. |
| [TELEGRAM-PIPELINE.md](TELEGRAM-PIPELINE.md) | Telegram ingestion, webhook, HD images (owned by site-api; this is the site-side view). |
| [EMAIL-NOTIFY.md](EMAIL-NOTIFY.md) | Mood email subscriptions and the admin portal touchpoints. |
| [WORKER-SITE.md](WORKER-SITE.md) | The `site` Worker itself: assets, routes, deploy, CI. |
| [OAUTH-HUB.md](OAUTH-HUB.md) | Admin GitHub OAuth flow. |
| [SECURITY.md](SECURITY.md) | Security boundaries and headers. |
| [PRIVACY-POLICY.md](PRIVACY-POLICY.md) | How the `/privacy` page renders; policy text lives in `src/content/pages/privacy.md`. |
| [MASCOT.md](MASCOT.md) | The peek mascot: assets and placement rules. |
| [SHARED-LAYOUT.md](SHARED-LAYOUT.md) | Cross-page UI: nav, theme, footer. |
| [SPOTLIGHT-OVERLAY.md](SPOTLIGHT-OVERLAY.md) | The pointer spotlight over the dot grid. |
| [E2E-BEHAVIOR-SCOPE.md](E2E-BEHAVIOR-SCOPE.md) | What the Playwright suites do and do not cover. |

## Active plans

| Doc | Read it when |
| --- | --- |
| [PLAN-ops-portal.md](PLAN-ops-portal.md) | You need the approved roadmap for the portal rework, notify gate, Telegram ops bot, and analytics workstream. |
| [plans/blog-comments.md](plans/blog-comments.md) | Reader comments and reactions on `/blog/[slug]`: magic-link identity, avatars, public/private threads. Supersedes the anonymous design in `.agents/tasks/prd-blog-comments-likes.md`. |
