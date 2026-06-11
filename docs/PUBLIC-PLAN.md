# Graded Docs Plan (buxx.me/docs)

Starlight-powered docs served at `/docs`, alongside the main Astro app. The
docs remain Markdown files in this repository. Each page chooses its visibility
with frontmatter: `public: true` renders without auth; anything else stays
behind the existing admin OAuth session.

## Phases

- **Phase 1 (done)**: Starlight skeleton, full IA, navigable stubs, brand theme.
- **Phase 2 (done)**: Visibility gating — render Starlight docs on demand,
  protect only non-public `/docs/**` pages in middleware, and preserve the
  requested docs URL through the Cloudflare OAuth flow.
- **Phase 3**: Migrate the source docs into the collection; rewrite public
  pages and move protected pages in with minimal cleanup.

## Decisions (signed off)

- URL: `buxx.me/docs` (subpath, no separate DNS).
- Source: Markdown stays in the repo so agents and humans can update the same
  operational docs during development.
- Repository visibility: make the GitHub repository private if the raw source
  should not be public outside the deployed site.
- Public entries: set `public: true` in frontmatter.
- Protected entries: omit `public: true`; the page shows a lock badge after
  authentication.
- Unauthorized access to protected docs: redirect to `/oauth/login?next=...`
  and return to the requested docs URL after successful sign-in.
- Auth scope: reuse the existing single-admin Cloudflare OAuth (`ADMIN_CLOUDFLARE_EMAIL`).
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
| TELEGRAM-PIPELINE.md            | pipeline/telegram             | yes      |
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

## Layout note

Starlight requires its collection root at `src/content/docs/`. To serve under
`/docs`, content is nested one level deeper at `src/content/docs/docs/`, so every
slug starts with `docs/`. The `docs/docs` path on disk is intentional.
