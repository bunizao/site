---
title: Test coverage
description: What the Playwright suite covers, the fixture rules that keep it deterministic, and what it leaves out.
group: Platform
order: 6
---

This page lists the public site behavior that the Playwright suite covers, and
which spec file covers it.

The goal is full behavior coverage of the first-party public site, run against
deterministic E2E fixtures (fixed test data that stands in for live services).
The table tracks behavior. It does not promise that browser tests reach every
internal code branch.

## Covered behavior

| Route | Behavior | Spec file |
| --- | --- | --- |
| `/` | Hero, theme persistence, projects, writing, moods preview, footer links | `tests/e2e/site.pw.ts` |
| `/` | GitHub contributions success state and tooltip rendering | `tests/e2e/site.pw.ts` |
| `/` | GitHub contributions failure fallback | `tests/e2e/site.pw.ts` |
| `/mood` | Feed load, detail navigation, rich comment popover | `tests/e2e/mood-flow.pw.ts` |
| `/mood` | Client-rendered YouTube facade, channel metadata hydration, narrow viewport containment, capability-probed playback | `tests/e2e/mood-flow.pw.ts` |
| `/mood` | Feed empty state | `tests/e2e/mood-flow.pw.ts` |
| `/mood` | Notify panel success, already subscribed, validation, rate limit, retryable error | `tests/e2e/mood-flow.pw.ts` |
| `/mood/[id]` | Comments load, back navigation, empty state, error state, pagination dedupe | `tests/e2e/mood-flow.pw.ts` |
| `/mood/[id]?embed=1` | Redirect behavior | `tests/e2e/mood-flow.pw.ts` |
| `/mood/embed` | Query-driven theme, density, font, frame behavior | `tests/e2e/mood-flow.pw.ts` |
| `/mood` | Image fallback to `/static` proxy | `tests/e2e/mood-flow.pw.ts` |
| `/mood/subscribe` | Redirect and auto-open notify panel | `tests/e2e/pages.pw.ts` |
| `/privacy` | Page content and simplified home navigation | `tests/e2e/pages.pw.ts` |
| `/blog/[slug]` | YouTube poster fallback, click-to-load playback, session-scoped timeout fallback, single-video errors, narrow viewport containment | `tests/e2e/blog-ui.pw.ts` |
| `/mood/rss.xml` | RSS content type and XML output | `tests/e2e/api.pw.ts` |
| `/mood`, `/mood/[id]` | Markdown for `Accept: text/markdown`, with no `/agent/*` alias | `tests/e2e/api.pw.ts` |
| `/static/[...path]` | Invalid target rejection plus allowed Telegram and bounded YouTube poster proxy success | `tests/e2e/api.pw.ts` |
| `/dev/portal/analytics` | Renders demo data in local dev without site-api | `tests/e2e/admin-portal.pw.ts` |
| `/dev/portal/newsletter` | Template filters and a keyboard-reachable focus mode | `tests/e2e/admin-portal.pw.ts` |
| `/dev/portal/subscribers` | Source filters, optional source counts, and the blog welcome send | `tests/e2e/admin-portal.pw.ts` |
| `/dev/portal/broadcasts` | Preview and start against blog and mood sources | `tests/e2e/admin-portal.pw.ts` |
| `/dev/portal/comments` | Owner session handoff and the refusal reason | `tests/e2e/admin-portal.pw.ts` |

`site-api` answers `/api/*`, and that repo tests it. Locally, Playwright sees
only fixtures for `/api/*`, so this suite asserts no API contracts.

## Fixture rules

Playwright starts its own fixture server by default. These variables change how
the suite runs:

| Variable | Effect |
| --- | --- |
| `E2E_SITE_FIXTURE=1` | Makes the site deterministic for Playwright. |
| `E2E_REUSE_SERVER=1` | Reuses the existing server. Set it only when that server was started with the same fixture environment. |
| `E2E_BASE_URL` | `preview-smoke.pw.ts` runs only when this points at a deployed preview. Local runs skip it. |

- Public mood, comment, project, writing, preview, RSS, and static proxy
  fixtures avoid external network dependencies.
- Browser-only third-party requests, such as GitHub contributions and YouTube
  playback, are mocked in the test itself when the behavior needs explicit
  control.

## Out of scope

- Third-party service uptime and the quality of their live data.
- Visual regressions or screenshot snapshot testing.
- Exhaustive internal branch coverage across every browser-only helper.

When public site behavior changes, update this table and add the missing
Playwright case in the same change.
