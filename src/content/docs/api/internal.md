---
title: Internal Endpoints
description: The admin, webhook, and cron-triggered routes — what exists at each path, how it is gated, and why this page lists them instead of specifying them.
group: API
order: 11
badge: Gated
---

Everything on this page is part of the URL surface of `buxx.me`, so it belongs
in a complete route reference. None of it is a public API.

This page deliberately stops at path, purpose, and auth tier. Request fields,
response shapes, status codes, limits, and implementation details stay beside
the handlers in the private `site-api` repository.

Paths use their bare `site-api` form. The public `buxx.me` form adds `/api`; see
[Path forms](/docs/api/overview#path-forms-api-is-a-prefix-not-a-directory).

## Admin authentication

| Path | Purpose | Auth tier |
| --- | --- | --- |
| `/admin/auth/start` | Starts owner sign-in. | Public OAuth entry |
| `/admin/auth/callback` | Completes owner sign-in. | Verified OAuth callback |
| `/admin/auth/logout` | Ends the owner session. | Admin session |
| `/admin/session` | Reads the current owner identity. | Admin session |
| `/oauth/login` | Renders the sign-in landing page. | Public OAuth entry |

## Admin API

| Path | Purpose | Auth tier |
| --- | --- | --- |
| `/admin/audit` | Reads operator audit records. | Admin session |
| `/admin/ai/test` | Checks the configured AI provider. | Admin session |
| `/admin/broadcasts` | Manages newsletter broadcasts. | Admin session |
| `/admin/broadcasts/:id` | Manages one broadcast. | Admin session |
| `/admin/broadcasts/:id/progress` | Reads broadcast delivery progress. | Admin session |
| `/admin/broadcasts/preview` | Renders a broadcast preview. | Admin session |
| `/admin/comments` | Reads the comment moderation queue and its counts. | Admin session |
| `/admin/comments/:id` | Approves, hides, or deletes one comment. | Admin session |
| `/admin/subscribers` | Manages subscribers. | Admin session |
| `/admin/subscribers/:hash` | Manages one subscriber. | Admin session |
| `/admin/subscribers/:hash/blog-welcome` | Sends one blog welcome message. | Admin session |
| `/admin/mood/search` | Searches the mood archive. | Admin session |
| `/admin/mood/health` | Reads mood pipeline health. | Admin session |
| `/admin/mood/ai-config` | Manages mood AI configuration. | Admin session |
| `/admin/notify-gate` | Reads the notification dispatch gate. | Admin session |
| `/admin/notify-gate/release` | Releases queued notifications. | Admin session |
| `/v2/admin/*` | Preserves the legacy admin API path. | Admin session |

## Admin portal

| Path | Purpose | Auth tier |
| --- | --- | --- |
| `/admin` | Opens the operator dashboard. | Admin session |
| `/admin/analytics` | Opens analytics. | Admin session |
| `/admin/newsletter` | Opens newsletter operations. | Admin session |
| `/admin/mascot` | Opens mascot tools. | Admin session |
| `/admin/mood-embed` | Opens mood embed tools. | Admin session |
| `/admin/oauth` | Opens OAuth management. | Admin session |
| `/admin/svg` | Opens SVG tools. | Admin session |
| `/admin/portal/comments` | Opens the comment moderation queue. | Admin session |
| `/admin/portal/broadcasts` | Opens broadcast operations. | Admin session |
| `/admin/portal/broadcasts/:id` | Opens one broadcast. | Admin session |
| `/admin/portal/subscribers` | Opens subscriber operations. | Admin session |
| `/admin/portal/subscribers/:hash` | Opens one subscriber. | Admin session |

## Webhooks

| Path | Purpose | Auth tier |
| --- | --- | --- |
| `/webhooks/ghost` | Receives Ghost publication events. | Signed Ghost webhook |
| `/webhooks/resend` | Receives Resend delivery events (bounces, complaints) and feeds the outbound-email suppression ledger. | Svix signature |
| `/ghost/webhook` | Preserves a legacy Ghost webhook path. | Signed Ghost webhook |
| `/v2/ghost/webhook` | Preserves a legacy Ghost webhook path. | Signed Ghost webhook |
| `/webhooks/telegram` | Receives Telegram mood events. | Telegram secret token |
| `/webhooks/telegram-ops` | Receives the ops bot's updates: the flood-gate decision keyboard, the bot command surface, comment moderation actions, and pending-action confirmations. | Its own Telegram secret token, plus a Telegram user id allowlist |

`/webhooks/telegram-ops` is deliberately separate from `/webhooks/telegram`:
a different path, a different secret header value, and an operator allowlist
on top, so the bot that can act on the site is not the bot that ingests public
channel content. It is dispatched from `worker.ts` rather than a file under
`src/pages/`, which is why
[`check:docs-coverage`](/docs/development#checks)
cannot see it — a manually wired route has to be added to this table by hand.

## Scheduled notification routes

| Path | Purpose | Auth tier |
| --- | --- | --- |
| `/notify/dispatch` | Sends a notification batch. | Scheduled-job bearer |
| `/notify/schedule` | Runs scheduled digest delivery. | Scheduled-job bearer |
| `/notify/retry` | Reprocesses failed deliveries. | Scheduled-job bearer |
| `/notify/preview` | Renders notification templates for operator review. | Admin session |
