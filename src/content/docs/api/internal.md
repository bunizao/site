---
title: Internal Endpoints
description: The admin, webhook, and cron-triggered routes, with each path's purpose and how it is gated.
group: API
order: 11
badge: Gated
---

These routes are part of the `buxx.me` URL space, so the route reference lists
them. None of them is a public API.

This page covers only each route's path, purpose, and auth tier. Request
fields, response shapes, status codes, limits, and implementation details live
next to the handlers in the private `site-api` repository.

Paths are shown in their bare `site-api` form. On `buxx.me`, add `/api` in
front; see [Path forms](/docs/api/overview#path-forms).

*Admin session* means a signed owner session cookie from GitHub OAuth or a
verified Cloudflare Access JWT. See [Auth](/docs/platform/auth).

Legacy alias rows below only redirect to the current path. They check no auth
themselves; the current path does.

## Admin authentication

| Path | Purpose | Auth tier |
| --- | --- | --- |
| `/admin/auth/start` | Starts owner sign-in. | Public OAuth entry |
| `/admin/auth/callback` | Completes owner sign-in. | Verified OAuth callback |
| `/admin/auth/logout` | Ends the owner session. | Public, same-origin requests only |
| `/admin/session` | Reads the current owner identity. | Admin session |
| `/oauth/login` | Redirects to the public site's `/oauth/login`, keeping the query. | Public OAuth entry |

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
| `/admin/comments/owner-code` | Mints the single-use code that signs the portal's browser in to the comment box as the owner. | Admin session |
| `/admin/comments/insights` | Reads the grouped comment tables: networks, subnets, devices, hints, link and mail domains. | Admin session |
| `/admin/reactions` | Reads the reaction list with the actor block on each row. | Admin session |
| `/admin/reactions/insights` | Reads the grouped reaction tables. | Admin session |
| `/admin/sources/*/*` | Reads one key's profile (key type, then value): its rows, its spread, its link graph. | Admin session |
| `/admin/bans` | Lists bans, and applies new bans with an optional purge. | Admin session |
| `/admin/bans/preview` | Previews distinct affected accounts, sessions and content before a ban. | Admin session |
| `/admin/bans/operations` | Lists recent purge operations and their recovery state. | Admin session |
| `/admin/bans/operations/:id/restore` | Restores eligible content from one purge while leaving bans unchanged. | Admin session |
| `/admin/bans/*/*` | Lifts one ban (key type, then value). | Admin session |
| `/admin/activity` | Reads the append-only comment and reaction activity log. | Admin session |
| `/admin/subscribers` | Manages subscribers. | Admin session |
| `/admin/subscribers/:hash` | Manages one subscriber. | Admin session |
| `/admin/subscribers/:hash/blog-welcome` | Sends one blog welcome message. | Admin session |
| `/admin/mood/search` | Searches the mood archive. | Admin session |
| `/admin/mood/health` | Reads mood pipeline health. | Admin session |
| `/admin/mood/ai-config` | Manages mood AI configuration. | Admin session |
| `/admin/notify-gate` | Reads the notification dispatch gate. | Admin session |
| `/admin/notify-gate/release` | Releases queued notifications. | Admin session |
| `/v2/admin/*` | Legacy alias. Redirects to `/admin/*`. | None (redirect only) |

## Admin portal

`site-api` serves these pages on `admin.buxx.me` only. Other hosts redirect
there. The owner portal on the public site is `/dev/portal`, served by the
`site` Worker (see [Site routes](/docs/api/site-routes#dev-portal)).

| Path | Purpose | Auth tier |
| --- | --- | --- |
| `/admin` | Opens the operator dashboard. | Admin session |
| `/admin/analytics` | Opens analytics. | Admin session |
| `/admin/newsletter` | Opens newsletter operations. | Admin session |
| `/admin/mascot` | Opens mascot tools. | Admin session |
| `/admin/mood-embed` | Opens mood embed tools. | Admin session |
| `/admin/oauth` | Opens OAuth management. | Admin session |
| `/admin/svg` | Opens SVG tools. | Admin session |
| `/admin/portal/broadcasts` | Opens broadcast operations. | Admin session |
| `/admin/portal/broadcasts/:id` | Opens one broadcast. | Admin session |
| `/admin/portal/subscribers` | Opens subscriber operations. | Admin session |
| `/admin/portal/subscribers/:hash` | Opens one subscriber. | Admin session |

## Webhooks

| Path | Purpose | Auth tier |
| --- | --- | --- |
| `/webhooks/ghost` | Receives Ghost publication events. | Signed Ghost webhook |
| `/webhooks/resend` | Receives Resend delivery events (bounces, complaints) and feeds the outbound-email suppression ledger. | Svix signature |
| `/ghost/webhook` | Legacy alias. Redirects to `/webhooks/ghost`. | None (redirect only) |
| `/v2/ghost/webhook` | Legacy alias. Redirects to `/webhooks/ghost`. | None (redirect only) |
| `/webhooks/telegram` | Receives Telegram mood events. | Telegram secret token |
| `/webhooks/telegram-ops` | Receives the ops bot's updates: the flood-gate decision keyboard, the bot command surface, comment moderation actions, and pending-action confirmations. | Its own Telegram secret token, plus a Telegram user id allowlist |

`/webhooks/telegram-ops` is kept apart from `/webhooks/telegram`. It uses a
different path, a different secret header value, and an operator allowlist on
top, so the bot that can act on the site is not the bot that ingests public
channel content.

`worker.ts` dispatches this route directly instead of through a file under
`src/pages/`, so [`check:docs-coverage`](/docs/development#checks) cannot see
it. Add a manually wired route like this one to this table by hand.

## Mood sync routes

| Path | Purpose | Auth tier |
| --- | --- | --- |
| `/v2/mood/converge/report` | The converge Durable Object reports Telegram channel differences (deletions, verifications, gaps) to the archive. | HMAC-signed with the shared mood sync secret via `X-Mood-Timestamp` / `X-Mood-Signature` |

The VPS mood-reconcile prober (`/v2/mood/reconcile/due`, `/v2/mood/reconcile/report`)
and the mood-media-sync route paired with it are retired. mood-converge, above,
replaced both.

## Instagram refresh route

| Path | Purpose | Auth tier |
| --- | --- | --- |
| `/v2/instagram/refresh` | The Instagram refresh job reports a profile read, or the failures of its tries; `site-api` validates and stores it. | HMAC-signed with `INSTAGRAM_INGEST_SECRET` via `X-Instagram-Timestamp` / `X-Instagram-Signature` |

## Scheduled notification routes

| Path | Purpose | Auth tier |
| --- | --- | --- |
| `/notify/dispatch` | Sends a notification batch. | Scheduled-job bearer |
| `/notify/schedule` | Runs scheduled digest delivery. | Scheduled-job bearer |
| `/notify/retry` | Reprocesses failed deliveries. | Scheduled-job bearer |
| `/notify/preview` | Renders notification templates for operator review. | Admin session |
