---
title: Test coverage
description: The behavior surface the Playwright suite covers, and what it deliberately does not.
group: Platform
order: 6
---

This document defines the public behavior surface covered by the Playwright suite.

The goal is full behavior coverage for the first-party public site surface under deterministic E2E fixtures. This is a behavior matrix, not a promise that every internal code branch is covered by browser instrumentation.

## Covered Surface

| Surface | Behavior | Coverage |
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

`/api/*` is answered by `site-api` and tested in that repo. Locally Playwright
sees only fixtures for it, so this suite asserts no API contracts.

## Fixture Rules

- `E2E_SITE_FIXTURE=1` makes the site deterministic for Playwright.
- Playwright starts its own fixture server by default. Set `E2E_REUSE_SERVER=1` only when the existing server was started with the same fixture environment.
- `preview-smoke.pw.ts` runs only when `E2E_BASE_URL` points at a deployed preview; local runs skip it.
- Public mood, comment, project, writing, preview, RSS, and static proxy fixtures avoid external network dependencies.
- Browser-only third-party requests, such as GitHub contributions and YouTube playback, are mocked in the test itself when the behavior needs explicit control.

## Out of Scope

- Third-party service uptime and their live data quality.
- Visual regressions or screenshot snapshot testing.
- Exhaustive internal branch coverage across every browser-only helper.

If the public site surface changes, update this matrix and add the missing Playwright case in the same change.
