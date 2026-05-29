# Public Docs Plan (buxx.me/docs)

Starlight-powered docs served at `/docs`, alongside the main Astro app. Pages
marked `internal: true` are gated behind the existing admin OAuth session.

## Phases

- **Phase 1 (done)**: Starlight skeleton, full IA, navigable stubs, brand theme.
- **Phase 2**: Auth gating — extract middleware guards into a registry, add a
  docs guard driven by a build-time internal-slug manifest, render a "this page
  is private" notice (keeps URL), exclude internal bodies from Pagefind.
- **Phase 3**: Migrate the 20 source docs into the collection; rewrite the 9
  public pages, move the 11 internal pages in as-is.

## Decisions (signed off)

- URL: `buxx.me/docs` (subpath, no separate DNS).
- Internal entries: shown in the sidebar with a lock badge (visibility is
  static, from frontmatter). Slugs/titles are always public.
- Unauthorized access to an internal page: render a private notice at the same
  URL with a sign-in link; do not 404 or silently redirect.
- Auth scope: reuse the existing single-admin GitHub OAuth (`ADMIN_GITHUB_LOGIN`).
- Search: internal page bodies excluded from the Pagefind index; titles remain.

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
