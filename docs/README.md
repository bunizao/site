# Docs Index

The living reference for this project is **published**, not internal. It lives in
the `docs` content collection (`src/content/docs/`) and ships at
[buxx.me/docs](https://buxx.me/docs). This tree keeps only the things that are
not reference material.

How this tree works:

- `docs/plans/` — **active plans**. Work that is proposed or in progress. When a plan ships, move it to `docs/archive/`.
- `docs/archive/` — **frozen records**. Shipped PRDs, completed migrations, resolved investigations. Never updated; they explain why things were built the way they were.
- `docs/research/` — dated research notes. Frozen once written.
- `docs/reviews/` — audits and their remediation indexes.
- `docs/debug/` — local-only debug artifacts, not committed (see its README).

Root-level `plans/` (repo root, numbered files) is the mood-hardening workstream backlog, separate from `docs/plans/`.

## Living reference (published)

These describe the current system and must stay accurate. If a change makes one
of these wrong, fix the doc in the same PR. There is deliberately one copy of
each — no `docs/*.md` counterpart — so the reference cannot drift from a private
note.

| Page | Source | Read it when |
| --- | --- | --- |
| [/docs/overview](https://buxx.me/docs/overview) | `src/content/docs/overview.md` | You want the map: what each surface is and who owns it. |
| [/docs/architecture](https://buxx.me/docs/architecture) | `src/content/docs/architecture.md` | You need the runtime shape, directory map, API surface, cache policy, or env vars. |
| [/docs/development](https://buxx.me/docs/development) | `src/content/docs/development.md` | You are setting up, or hit the dev-vs-production runtime gap. |
| [/docs/writing/overview](https://buxx.me/docs/writing/overview) | `src/content/docs/writing/overview.md` | You need the post render pipeline and its output targets. |
| [/docs/writing/directives](https://buxx.me/docs/writing/directives) | `src/content/docs/writing/directives.md` | You are writing or adding a `[!name]` directive. |
| [/docs/writing/poem](https://buxx.me/docs/writing/poem) | `src/content/docs/writing/poem.md` | Verse blocks, stanzas, attribution, auto-detection. |
| [/docs/writing/music](https://buxx.me/docs/writing/music) | `src/content/docs/writing/music.md` | The Apple Music listening card. |
| [/docs/writing/mood](https://buxx.me/docs/writing/mood) | `src/content/docs/writing/mood.md` | Embedding a mood inside a post. |
| [/docs/writing/youtube](https://buxx.me/docs/writing/youtube) | `src/content/docs/writing/youtube.md` | The YouTube facade. |
| [/docs/writing/footnotes](https://buxx.me/docs/writing/footnotes) | `src/content/docs/writing/footnotes.md` | Footnote syntax, numbering, and warnings. |
| [/docs/writing/authors](https://buxx.me/docs/writing/authors) | `src/content/docs/writing/authors.md` | AI credit lines and the model registry. |
| [/docs/writing/tags](https://buxx.me/docs/writing/tags) | `src/content/docs/writing/tags.md` | Public tags and internal `#hash-` tags. |
| [/docs/writing/media](https://buxx.me/docs/writing/media) | `src/content/docs/writing/media.md` | Images, blur-up, and code highlighting. |
| [/docs/writing/publishing](https://buxx.me/docs/writing/publishing) | `src/content/docs/writing/publishing.md` | Ghost publish → deploy hook flow. |
| [/docs/api/overview](https://buxx.me/docs/api/overview) | `src/content/docs/api/overview.md` | Who serves `/api`, versioning, auth tiers, rate limits, the two error shapes, caching, CORS. |
| [/docs/api/mood](https://buxx.me/docs/api/mood) | `src/content/docs/api/mood.md` | The mood feed, detail, comments, search, stats, and live-counts endpoints. |
| [/docs/api/notify](https://buxx.me/docs/api/notify) | `src/content/docs/api/notify.md` | Subscribe, confirm, unsubscribe, manage — the email subscription API. |
| [/docs/api/oembed](https://buxx.me/docs/api/oembed) | `src/content/docs/api/oembed.md` | Embedding a mood elsewhere. |
| [/docs/api/svg](https://buxx.me/docs/api/svg) | `src/content/docs/api/svg.md` | The SVG badge endpoints. |
| [/docs/api/feeds](https://buxx.me/docs/api/feeds) | `src/content/docs/api/feeds.md` | RSS, sitemap, `llms.txt`, agent Markdown. |
| [/docs/surfaces/home](https://buxx.me/docs/surfaces/home) | `src/content/docs/surfaces/home.md` | Home page sections and reveal choreography. |
| [/docs/surfaces/blog](https://buxx.me/docs/surfaces/blog) | `src/content/docs/surfaces/blog.md` | The 無人之境 design system — normative tokens. |
| [/docs/surfaces/mood](https://buxx.me/docs/surfaces/mood) | `src/content/docs/surfaces/mood.md` | Anything under `/mood`: feed, detail, read path, hydration. |
| [/docs/surfaces/layout](https://buxx.me/docs/surfaces/layout) | `src/content/docs/surfaces/layout.md` | Cross-page UI: nav, theme, command palette, footer. |
| [/docs/surfaces/spotlight](https://buxx.me/docs/surfaces/spotlight) | `src/content/docs/surfaces/spotlight.md` | The pointer spotlight over the dot grid. |
| [/docs/surfaces/mascot](https://buxx.me/docs/surfaces/mascot) | `src/content/docs/surfaces/mascot.md` | The peek mascot: assets and placement rules. |
| [/docs/surfaces/components](https://buxx.me/docs/surfaces/components) | `src/content/docs/surfaces/components.md` | The component register and the shadcn registry at `/r`. |
| [/docs/platform/worker](https://buxx.me/docs/platform/worker) | `src/content/docs/platform/worker.md` | The `site` Worker itself: assets, routes, deploy, CI. |
| [/docs/platform/telegram](https://buxx.me/docs/platform/telegram) | `src/content/docs/platform/telegram.md` | Telegram ingestion, webhook, HD images. |
| [/docs/platform/notify](https://buxx.me/docs/platform/notify) | `src/content/docs/platform/notify.md` | Mood email subscriptions and the admin touchpoints. |
| [/docs/platform/auth](https://buxx.me/docs/platform/auth) | `src/content/docs/platform/auth.md` | Admin GitHub OAuth flow and the credential roadmap. |
| [/docs/platform/security](https://buxx.me/docs/platform/security) | `src/content/docs/platform/security.md` | Security boundaries, headers, rate limits. |
| [/docs/platform/seo](https://buxx.me/docs/platform/seo) | `src/content/docs/platform/seo.md` | Public identity, structured data, indexing. |
| [/docs/platform/testing](https://buxx.me/docs/platform/testing) | `src/content/docs/platform/testing.md` | What the Playwright suites do and do not cover. |
| [/docs/platform/privacy](https://buxx.me/docs/platform/privacy) | `src/content/docs/platform/privacy.md` | How `/privacy` renders; policy text lives in `src/content/pages/privacy.md`. |

Add a page by dropping a Markdown file into `src/content/docs/` with `title`,
`description`, `group`, and `order` frontmatter; the sidebar, hub, sitemap, and
prev/next all follow from the collection. Group order lives in
`src/features/docs/server/nav.ts`.

## Active plans

| Doc | Read it when |
| --- | --- |
| [PLAN-ops-portal.md](PLAN-ops-portal.md) | You need the approved roadmap for the portal rework, notify gate, Telegram ops bot, and analytics workstream. |
| [plans/blog-comments.md](plans/blog-comments.md) | Reader comments and reactions on `/blog/[slug]`: GitHub/Google/magic-link identity, proxied avatars, model moderation, writer-chosen public or private comments. Supersedes the anonymous design in `.agents/tasks/prd-blog-comments-likes.md`. |
