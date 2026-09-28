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
| `/dev/portal/comments` | Held queue triage from the keyboard (approve, delete with Undo, auto-advance to the next comment), a Telegram `#<id>` deep link opening that comment, banning a writer from the reading pane after its impact check, pivoting to one writer and Back | `tests/e2e/admin-portal.pw.ts` (demo mode) |
| `/dev/portal/comments` | A phone-width touch swipe deleting a held comment, and Undo | `tests/e2e/admin-portal.pw.ts` (demo mode) |
| `/dev/portal/comments/bans` | Lifting a ban, and Undo putting it back | `tests/e2e/admin-portal.pw.ts` (demo mode) |
| `/dev/portal` | Releasing mood posts held by the notify gate as one digest | `tests/e2e/admin-portal.pw.ts` (demo mode) |
| `/dev/portal/subscribers` | Changing a subscriber's delivery, read back after a reload | `tests/e2e/admin-portal.pw.ts` (demo mode) |
| `/dev/portal/broadcasts` | Composing and sending a broadcast, then its send progress to completion | `tests/e2e/admin-portal.pw.ts` (demo mode) |
| `/dev/portal/analytics` | Opening one article's analytics, and Back to the list | `tests/e2e/admin-portal.pw.ts` (demo mode) |
| `/dev/portal/*` | ⌘K jumping to a screen; a failed read, forced by the demo API, showing its error, and Try again recovering | `tests/e2e/admin-portal.pw.ts` (demo mode) |
| `/dev/portal/messages` | Inbox, Archived and Spam with their counts; E and ! filing a message and opening the next, Undo putting it back in its place; a new message read once, quietly, on open; who a reply reaches before typing; a reply sent with ⌘↵ and a refused one going back to the box; earlier messages from the same address; a site-api without the inbox or an act | `tests/e2e/portal-p6.pw.ts` (demo mode) |
| `/dev/portal/comments/bans?view=readers` | Restoring a blocked reader account with 4, J, R and Enter or with the pointer, Escape taking the question back, and an email ban that outlives the restore; a site-api without the route | `tests/e2e/portal-p6.pw.ts` (demo mode) |
| `/dev/portal/comments/modes` | Every override with what tags give and what readers get; one click changing one in place, Z and Undo reverting it, Default handing it back to its tags; setting one from a search; a pasted id that is no post; a site-api without the routes | `tests/e2e/portal-p6.pw.ts` (demo mode) |
| `/dev/portal/comments` | From the detail pane: P pinning a first comment in place of the post's pin and Z giving it back, the pin toggle unpinning with Undo, L on a reply locking its thread and the toggle unlocking, both undone, the post line's mode switch with Undo and the same state in Post modes; a reply that cannot be pinned, and a refused pin rolling back | `tests/e2e/portal-p6.pw.ts` (demo mode) |
| `/dev/portal/*` | Click-to-paint budgets at 4x CPU | `tests/e2e/portal-perf.pw.ts` (demo mode) |

`/api/*` is answered by `site-api` and tested in that repo. Locally Playwright
sees only fixtures for it, so this suite asserts no API contracts.

## Fixture Rules

- `E2E_SITE_FIXTURE=1` makes the site deterministic for Playwright.
- Playwright starts its own fixture server by default. Set `E2E_REUSE_SERVER=1` only when the existing server was started with the same fixture environment.
- `preview-smoke.pw.ts` runs only when `E2E_BASE_URL` points at a deployed preview; local runs skip it.
- The portal specs need demo mode: `astro dev` with no site-api, where the portal answers from an in-memory demo API. They skip anywhere else. That state lasts as long as the dev server, so each test undoes what it changes or asserts relative to what it found, and a reused server stays usable run after run. An act the demo has no way back from, such as reading a new message or restoring a reader, is answered in the test with `page.route` instead of reaching the demo.
- Public mood, comment, project, writing, preview, RSS, and static proxy fixtures avoid external network dependencies.
- Browser-only third-party requests, such as GitHub contributions and YouTube playback, are mocked in the test itself when the behavior needs explicit control.

## Out of Scope

- Third-party service uptime and their live data quality.
- Visual regressions or screenshot snapshot testing.
- Exhaustive internal branch coverage across every browser-only helper.

If the public site surface changes, update this matrix and add the missing Playwright case in the same change.
