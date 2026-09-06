---
title: Telegram pipeline
description: "How a Telegram post becomes a mood: ingestion, HD images, and the archive mirror."
group: Platform
order: 1
---

This document describes the private Telegram ingestion pipeline for mood posts, HD images, and email notifications.

## Scope

The Telegram pipeline affects:

- `POST https://api.buxx.me/webhooks/telegram`
- `https://buxx.me/api/v2/images/*`
- immediate email notify dispatch
- public mood pages that still consume Telegram content during this migration wave

## Current flow

```mermaid
flowchart TD
  A["Telegram channel post"] --> B["Telegram calls https://api.buxx.me/webhooks/telegram"]
  B --> C["Validate X-Telegram-Bot-Api-Secret-Token"]
  C --> D["Resolve postId/imageIndex"]
  D --> E["Fetch Telegram media bytes"]
  E --> F["site-api writes originals and variants to R2"]
  F --> G["Public reads use private image routes"]
  B --> H["site-api enqueues notify dispatch job"]
  H --> I["Queue consumer calls /v2/notify/dispatch"]
  I --> J["Resend sends immediate notify emails"]
```

## The comment bridge

A second, independent flow shares the same ops bot: a web reader's mood
comment, bridged into the post's Telegram discussion group, and the read
path that overlays the group's own scrape with the site's copy of what it
sent. Gated by `MOOD_COMMENTS_ENABLED` — see
[Comments platform](/docs/platform/comments) for the kill switch and the
Phase 0 setup — and detailed end to end in
[Comments API § Mood surface](/docs/api/comments#mood-surface-the-telegram-bridge).

```mermaid
flowchart TD
  A["Reader posts on /mood/[id]"] --> B["POST /v2/comments surface: mood"]
  B --> C["Risk stack: Turnstile, honeypot, dwell, Akismet, rate limits"]
  C -->|published| D["Row stored, comment visible on the site immediately"]
  D --> E["ops bot sendMessage into the discussion group, reply_parameters -> discussion_message_id"]
  E -->|success| F["telegram_message_id stored on the row"]
  E -->|failure| G["Hourly cron retries for 24h"]
  C -->|held| H["Row stored, visible only to its writer"]
  H -->|owner approves| E

  I["Group member replies or reacts in Telegram"] --> J["t.me embed scrape (existing)"]
  F -.-> K["listComments: scrape + overlay"]
  J --> K
  K --> L["#c-token match -> re-attribute to the web author, origin: web"]
  K --> M["No match yet -> append the pending row instead"]
```

## Who does what

| `site-api` (private) | Public `site` |
| --- | --- |
| Validate the Telegram webhook secret | Render mood feed and detail pages |
| Parse `channel_post` and resolve media-group image indexing | Consume `/api/moods` and `/api/comments` |
| Ingest mood images into R2 | Use `PUBLIC_HD_IMAGE_URL` for primary image URLs |
| Enqueue durable immediate notify dispatch jobs | Preserve the `/static/…` Telegram CDN fallback |
| Dispatch notification email through `/v2/notify/dispatch` | — |
| Run the risk stack, bridge `published` mood comments (and `held` ones once approved) into the discussion group, overlay the scrape on read | Render the mood compose box only when `discussionLinked`, POST `/v2/comments` with `surface: 'mood'` |

## Key URLs

| URL | Role |
| --- | --- |
| `https://api.buxx.me/webhooks/telegram` | Webhook ingress. Private. |
| `https://buxx.me/api/v2/images/*` | Public image reads, served from R2 |
| `https://api.buxx.me/v2/notify/dispatch` | Queue consumer target for immediate notify |
| `https://buxx.me/api/*` | Routed directly to `site-api` in production |

## Failure modes

| What breaks | What happens |
| --- | --- |
| Webhook not configured | New posts never enter private ingest: R2 objects do not update and immediate notification dispatch never runs. |
| Image ingest fails | Public mood pages fall back to the stored Telegram CDN URLs when `site-api` returns them. **Email cannot fall back** — a link is fixed at delivery. |
| Notify queue handoff fails | The webhook returns a retryable failure so Telegram redelivers the update. |
