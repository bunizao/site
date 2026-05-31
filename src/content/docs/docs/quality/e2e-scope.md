---
title: E2E behavior scope
description: What the Playwright suite covers, what it doesn't, and the rules around fixtures.
internal: true
---

The Playwright suite covers the public site surface under deterministic E2E fixtures. The goal is full **behavior** coverage — not full internal-branch coverage. This page is the matrix and the rules.

## Coverage matrix

| Surface | Behavior | Test |
| --- | --- | --- |
| `/` | Hero, theme persistence, projects, writing, moods preview, footer links | `tests/e2e/site.pw.ts` |
| `/` | GitHub contributions success state and tooltip rendering | `tests/e2e/site.pw.ts` |
| `/` | GitHub contributions failure fallback | `tests/e2e/site.pw.ts` |
| `/mood` | Feed load, detail navigation, rich comment popover | `tests/e2e/mood-flow.pw.ts` |
| `/mood` | Feed empty state | `tests/e2e/mood-flow.pw.ts` |
| `/mood` | Notify panel — success, already subscribed, validation, rate limit, retryable error | `tests/e2e/mood-flow.pw.ts` |
| `/mood/[id]` | Comments load, back navigation, empty state, error state, pagination dedupe | `tests/e2e/mood-flow.pw.ts` |
| `/mood/[id]?embed=1` | Redirect behavior | `tests/e2e/mood-flow.pw.ts` |
| `/mood/embed` | Query-driven theme, density, font, frame behavior | `tests/e2e/mood-flow.pw.ts` |
| `/mood` | Image fallback to `/static` proxy | `tests/e2e/mood-flow.pw.ts` |
| `/mood/subscribe` | Redirect and auto-open notify panel | `tests/e2e/pages.pw.ts` |
| `/privacy` | Page content and simplified home navigation | `tests/e2e/pages.pw.ts` |
| `/api/moods` | Payload shape, cursor validation, probe mode | `tests/e2e/api.pw.ts` |
| `/api/comments` | Param validation and payload shape | `tests/e2e/api.pw.ts` |
| `/api/oembed.json` | Validation, list/detail payloads, OPTIONS | `tests/e2e/api.pw.ts` |
| `/mood/rss.xml` | RSS content type and XML output | `tests/e2e/api.pw.ts` |
| SVG APIs | `status`, `tech-stack`, `site-badge`, `project` response behavior | `tests/e2e/api.pw.ts` |
| Notify APIs | Invalid methods, unauthorized flows, preview payload | `tests/e2e/api.pw.ts` |
| `/static/[...path]` | Invalid target rejection and allowed Telegram proxy success | `tests/e2e/api.pw.ts` |
| `/dev/portal` | Passive cards do not expose fake hover affordance | `tests/e2e/admin-portal.pw.ts` |
| `/dev/portal/subscribers` | Subscriber table hydrates from API; passive rows stay still on hover; row menu opens without layout squeeze | `tests/e2e/admin-portal.pw.ts` |
| `/dev/portal/mood-embed` | Mood embed iframe grows and shrinks from resize messages | `tests/e2e/admin-portal.pw.ts` |
| `/dev/portal/newsletter` | Newsletter preview supports compacted, regular, and expanded card sizing | `tests/e2e/admin-portal.pw.ts` |

## Fixture rules

- `E2E_SITE_FIXTURE=1` makes the site deterministic for Playwright.
- Public mood, comment, project, writing, preview, RSS, and static-proxy fixtures avoid external network dependencies.
- Browser-only third-party requests (e.g. GitHub contributions) are mocked in the test itself when the behavior needs explicit control.

## Out of scope

- Third-party service uptime and live data quality.
- Visual regressions or screenshot snapshot testing.
- Exhaustive internal-branch coverage across every browser-only helper.

If the public site surface changes, update this matrix and add the missing Playwright case in the same change.
