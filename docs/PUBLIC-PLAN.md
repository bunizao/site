# Graded Docs Plan (buxx.me/docs)

Starlight-powered docs served at `/docs`, alongside the main Astro app. The
docs remain Markdown files in this repository. Each page chooses its visibility
with frontmatter: `public: true` renders without auth; anything else stays
behind the existing admin identity gate.

## Phases

- **Phase 1 (done)**: Starlight skeleton, full IA, navigable stubs, brand theme.
- **Phase 2 (done)**: Visibility gating — render Starlight docs on demand
  and protect only non-public `/docs/**` pages in middleware.
- **Phase 3 (done)**: Migrate the source docs into the collection; rewrite
  public pages and move protected pages in with minimal cleanup.

## Decisions (signed off)

- URL: `buxx.me/docs` (subpath, no separate DNS).
- Source: Markdown stays in the repo so agents and humans can update the same
  operational docs during development.
- Repository visibility: make the GitHub repository private if the raw source
  should not be public outside the deployed site.
- Public entries: set `public: true` in frontmatter.
- Protected entries: omit `public: true`; the page shows a lock badge after
  authentication.
- Unauthorized access to protected docs: return `401` with `no-store`; Cloudflare
  Access owns the human login challenge in production.
- Auth scope: reuse the existing Cloudflare Access admin identity.
- Search: disabled for now because Starlight Pagefind requires prerendered
  pages, while this docs surface must be rendered on demand for middleware auth.

## Source doc → docs slug map

| Source                          | Slug                          | Public |
| ------------------------------- | ----------------------------- | -------- |
| (new)                           | overview/about                | yes      |
| ARCHITECTURE.md                 | overview/architecture         | yes      |
| HOME.md                         | surfaces/home                 | no       |
| MOOD.md                         | surfaces/mood-feed            | yes      |
| MOOD-DECOUPLING.md              | surfaces/mood-decoupling      | no       |
| MASCOT.md                       | surfaces/mascot               | yes      |
| SPOTLIGHT-OVERLAY.md            | surfaces/spotlight-overlay    | no       |
| SHARED-LAYOUT.md                | surfaces/shared-layout        | no       |
| TELEGRAM-PIPELINE.md            | pipeline/telegram             | no       |
| TELEGRAM-LIVE-PHOTO-ISSUE.md    | pipeline/live-photo-issue     | no       |
| IMAGE-QUALITY-UPGRADE.md        | pipeline/image-quality        | no       |
| EMAIL-NOTIFY.md                 | pipeline/email-notify         | no       |
| OEMBED-API.md                   | apis/oembed                   | yes      |
| SVG-API.md                      | apis/svg                      | yes      |
| WORKER-SITE.md                  | infra/worker-site             | yes      |
| OAUTH-HUB.md                    | infra/oauth-hub               | yes      |
| E2E-BEHAVIOR-SCOPE.md           | quality/e2e-scope             | no       |
| debug/*                         | quality/debug-logs            | no       |
| PRIVACY-POLICY.md               | resources/privacy             | yes      |
| SECURITY.md                     | resources/security            | yes      |

## Phase 3 completion notes

- Public docs are rewritten under `src/content/docs/docs/**` with `public: true`.
- Protected docs omit `public: true` and use `internal: true` where the page body
  should show the protected badge.
- `docs/debug/*` stays local-only; `/docs/quality/debug-logs` documents the rule
  instead of publishing scratch artifacts.
- Search remains disabled because the docs render on demand for auth-aware pages.

## Layout note

Starlight requires its collection root at `src/content/docs/`. To serve under
`/docs`, content is nested one level deeper at `src/content/docs/docs/`, so every
slug starts with `docs/`. The `docs/docs` path on disk is intentional.
