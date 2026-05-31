# Private Docs Plan (buxx.me/docs)

Starlight-powered docs served at `/docs`, alongside the main Astro app. The
docs remain Markdown files in this repository and the deployed docs surface is
gated behind the existing admin OAuth session.

## Phases

- **Phase 1 (done)**: Starlight skeleton, full IA, navigable stubs, brand theme.
- **Phase 2 (done)**: Auth gating — render Starlight docs on demand, protect
  `/docs/**` in middleware, and preserve the requested docs URL through the
  GitHub OAuth flow.
- **Phase 3**: Migrate the 20 source docs into the collection; rewrite the 9
  public pages, move the 11 internal pages in as-is.

## Decisions (signed off)

- URL: `buxx.me/docs` (subpath, no separate DNS).
- Source: Markdown stays in the repo so agents and humans can update the same
  operational docs during development.
- Repository visibility: make the GitHub repository private if the raw source
  should not be public outside the deployed site.
- Internal entries: shown with a lock badge driven by frontmatter. This is a
  reading cue, not the auth boundary.
- Unauthorized access to `/docs/**`: redirect to `/oauth/login?next=...` and
  return to the requested docs URL after successful sign-in.
- Auth scope: reuse the existing single-admin GitHub OAuth (`ADMIN_GITHUB_LOGIN`).
- Search: disabled for now because Starlight Pagefind requires prerendered
  pages, while this docs surface must be rendered on demand for middleware auth.

## Source doc → docs slug map

| Source                          | Slug                          | Internal |
| ------------------------------- | ----------------------------- | -------- |
| (new)                           | overview/about                | no       |
| ARCHITECTURE.md                 | overview/architecture         | no       |
| HOME.md                         | surfaces/home                 | yes      |
| MOOD.md                         | surfaces/mood-feed            | no       |
| MOOD-DECOUPLING.md              | surfaces/mood-decoupling      | yes      |
| MASCOT.md                       | surfaces/mascot               | no       |
| SPOTLIGHT-OVERLAY.md            | surfaces/spotlight-overlay    | yes      |
| SHARED-LAYOUT.md                | surfaces/shared-layout        | yes      |
| TELEGRAM-PIPELINE.md            | pipeline/telegram             | no       |
| TELEGRAM-LIVE-PHOTO-ISSUE.md    | pipeline/live-photo-issue     | yes      |
| IMAGE-QUALITY-UPGRADE.md        | pipeline/image-quality        | yes      |
| EMAIL-NOTIFY.md                 | pipeline/email-notify         | yes      |
| OEMBED-API.md                   | apis/oembed                   | no       |
| SVG-API.md                      | apis/svg                      | no       |
| WORKER-SITE.md                  | infra/worker-site             | no       |
| OAUTH-HUB.md                    | infra/oauth-hub               | no       |
| E2E-BEHAVIOR-SCOPE.md           | quality/e2e-scope             | yes      |
| debug/*                         | quality/debug-logs            | yes      |
| PRIVACY-POLICY.md               | resources/privacy             | no       |
| SECURITY.md                     | resources/security            | no       |

## Layout note

Starlight requires its collection root at `src/content/docs/`. To serve under
`/docs`, content is nested one level deeper at `src/content/docs/docs/`, so every
slug starts with `docs/`. The `docs/docs` path on disk is intentional.
