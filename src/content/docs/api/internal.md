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
| `/admin/comments` | Reads the comment moderation queue and its counts, with search, filters and sorting. | Admin session |
| `/admin/comments/:id` | Approves, hides, rejects with a reason, deletes, or restores a deleted comment. | Admin session |
| `/admin/comments/:id/reply` | Publishes the owner's reply to one comment; a retried reply publishes once. | Admin session |
| `/admin/comments/bulk` | Applies one moderation action to a selection of comments. | Admin session |
| `/admin/comments/lockdown` | Reads, engages, or lifts the site-wide lockdown on anonymous comments. | Admin session |
| `/admin/comments/:id/pin` | Pins one root comment to the top of its thread, replacing the post's earlier pin, or unpins it. | Admin session |
| `/admin/comments/:id/lock` | Closes or reopens replies under one thread. | Admin session |
| `/admin/comment-modes` | Lists the posts whose comment mode the portal overrides. | Admin session |
| `/admin/comment-modes/*/*` | Reads, sets, or clears one post's comment mode override (surface, then post id). | Admin session |
| `/admin/readers/revoked` | Lists the readers whose account a ban revoked. | Admin session |
| `/admin/readers/:readerId/restore` | Gives one revoked reader their account back; key bans stay. | Admin session |
| `/admin/messages` | Reads the owner messages and their counts, by state or as the whole inbox. | Admin session |
| `/admin/messages/:id` | Reads one message with its sender's earlier messages and actor record, or files it (read, archived, spam). | Admin session |
| `/admin/messages/:id/reply` | Mails the owner's reply to one message's sender. | Admin session |
| `/admin/comments/owner-code` | Mints the single-use code that signs the portal's browser in to the comment box as the owner. | Admin session |
| `/admin/comments/insights` | Reads the grouped comment tables: networks, subnets, devices, hints, link and mail domains. | Admin session |
| `/admin/reactions` | Reads the reaction list with the actor block on each row. | Admin session |
| `/admin/reactions/insights` | Reads the grouped reaction tables. | Admin session |
| `/admin/sources/*/*` | Reads one key's profile (key type, then value): its comments, reactions and messages, the addresses and devices seen under it, its spread, its link graph. | Admin session |
| `/admin/bans` | Lists the ban list, and applies bans with an optional purge. | Admin session |
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
| `/v2/admin/*` | Preserves the legacy admin API path. | Admin session |

## Retired admin portal pages

The HTML portal `site-api` served on `admin.buxx.me` is retired. Its old page
paths (`/admin`, `/admin/analytics`, `/admin/portal/*` and the rest) now
redirect to the matching screen of the owner portal at
[`/dev/portal`](/docs/api/site-routes#dev-portal), so old bookmarks and
Telegram review links still land. The redirect needs no session; the portal
gates itself.

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

## Mood sync routes

| Path | Purpose | Auth tier |
| --- | --- | --- |
| `/v2/mood/converge/report` | The converge Durable Object reports Telegram channel differences — deletions, verifications, gaps — to the archive. | HMAC-signed with the shared mood sync secret via `X-Mood-Timestamp` / `X-Mood-Signature` |
| `/v2/mood/reconcile/due` | Legacy VPS reconciler: requests a batch of message ids to verify. Scheduled for retirement per `plans/039-mood-converge-landing.md`. | HMAC-signed with the shared mood sync secret via `X-Mood-Timestamp` / `X-Mood-Signature` |
| `/v2/mood/reconcile/report` | Legacy VPS reconciler: reports verification results back to the archive. Scheduled for retirement per `plans/039-mood-converge-landing.md`. | HMAC-signed with the shared mood sync secret via `X-Mood-Timestamp` / `X-Mood-Signature` |

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
