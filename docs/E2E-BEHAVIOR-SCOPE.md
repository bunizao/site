# E2E Behavior Scope

This document defines the public behavior surface covered by the Playwright suite.

The goal is full behavior coverage for the first-party public site surface under deterministic E2E fixtures. This is a behavior matrix, not a promise that every internal code branch is covered by browser instrumentation.

## Covered Surface

| Surface | Behavior | Coverage |
| --- | --- | --- |
| `/` | Hero, theme persistence, projects, writing, moods preview, footer links | `tests/e2e/site.pw.ts` |
| `/` | GitHub contributions success state and tooltip rendering | `tests/e2e/site.pw.ts` |
| `/` | GitHub contributions failure fallback | `tests/e2e/site.pw.ts` |
| `/mood` | Feed load, detail navigation, rich comment popover | `tests/e2e/mood-flow.pw.ts` |
| `/mood` | Client-rendered YouTube facade, narrow viewport containment, capability-probed playback | `tests/e2e/mood-flow.pw.ts` |
| `/mood` | Feed empty state | `tests/e2e/mood-flow.pw.ts` |
| `/mood` | Notify panel success, already subscribed, validation, rate limit, retryable error | `tests/e2e/mood-flow.pw.ts` |
| `/mood/[id]` | Comments load, back navigation, empty state, error state, pagination dedupe | `tests/e2e/mood-flow.pw.ts` |
| `/mood/[id]?embed=1` | Redirect behavior | `tests/e2e/mood-flow.pw.ts` |
| `/mood/embed` | Query-driven theme, density, font, frame behavior | `tests/e2e/mood-flow.pw.ts` |
| `/mood` | Image fallback to `/static` proxy | `tests/e2e/mood-flow.pw.ts` |
| `/mood/subscribe` | Redirect and auto-open notify panel | `tests/e2e/pages.pw.ts` |
| `/privacy` | Page content and simplified home navigation | `tests/e2e/pages.pw.ts` |
| `/blog/[slug]` | YouTube poster fallback, click-to-load playback, session-scoped timeout fallback, single-video errors, narrow viewport containment | `tests/e2e/blog-ui.pw.ts` |
| `/api/moods` | Payload shape, cursor validation, probe mode | `tests/e2e/api.pw.ts` |
| `/api/comments` | Param validation and payload shape | `tests/e2e/api.pw.ts` |
| `/api/oembed.json` | Validation, list/detail payloads, OPTIONS | `tests/e2e/api.pw.ts` |
| `/mood/rss.xml` | RSS content type and XML output | `tests/e2e/api.pw.ts` |
| SVG APIs | `status`, `tech-stack`, `site-badge`, `project` response behavior | `tests/e2e/api.pw.ts` |
| Notify APIs | Invalid methods, unauthorized flows, preview payload | `tests/e2e/api.pw.ts` |
| `/static/[...path]` | Invalid target rejection and allowed Telegram proxy success | `tests/e2e/api.pw.ts` |
| `/dev/portal` | Passive cards do not expose fake hover affordance | `tests/e2e/admin-portal.pw.ts` |
| `/dev/portal/subscribers` | Subscriber table hydrates from API, passive rows stay still on hover, row menu opens without layout squeeze | `tests/e2e/admin-portal.pw.ts` |
| `/dev/portal/mood-embed` | Mood embed iframe grows and shrinks from resize messages | `tests/e2e/admin-portal.pw.ts` |
| `/dev/portal/newsletter` | Newsletter preview supports compacted, regular, and expanded card sizing | `tests/e2e/admin-portal.pw.ts` |

## Fixture Rules

- `E2E_SITE_FIXTURE=1` makes the site deterministic for Playwright.
- Playwright starts its own fixture server by default. Set `E2E_REUSE_SERVER=1` only when the existing server was started with the same fixture environment.
- Public mood, comment, project, writing, preview, RSS, and static proxy fixtures avoid external network dependencies.
- Browser-only third-party requests, such as GitHub contributions and YouTube playback, are mocked in the test itself when the behavior needs explicit control.

## Out of Scope

- Third-party service uptime and their live data quality.
- Visual regressions or screenshot snapshot testing.
- Exhaustive internal branch coverage across every browser-only helper.

If the public site surface changes, update this matrix and add the missing Playwright case in the same change.
