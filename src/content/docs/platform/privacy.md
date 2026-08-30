---
title: Privacy policy
description: How the published privacy page maps onto what the site actually collects.
group: Platform
order: 7
---

The published policy lives at [`/privacy`](/privacy). This page is the other
half of it: which feature each clause is describing, and what to re-check when
one of them changes.

## How the page is built

| File | Role |
| --- | --- |
| [`src/content/pages/privacy.md`](https://github.com/bunizao/site/blob/main/src/content/pages/privacy.md) | The policy itself — the source of truth for every word |
| [`src/pages/privacy.astro`](https://github.com/bunizao/site/blob/main/src/pages/privacy.astro) | A thin route: imports `Content` and `frontmatter`, renders the body inside `Layout` with `navVariant="page"` |
| [`src/content.config.ts`](https://github.com/bunizao/site/blob/main/src/content.config.ts) | The `pages` collection schema — `title` and `description` required, `updatedAt` optional |
| [`src/lib/content-revision.ts`](https://github.com/bunizao/site/blob/main/src/lib/content-revision.ts) | Resolves the *Updated* line and its commit link from git history at build time |

Keeping the policy in Markdown means wording changes never touch layout code,
and the date is not something anyone has to remember to bump: git is the source
of truth for when the policy last changed, and the `updatedAt` frontmatter is
only the fallback for a build without history.

## What the policy has to match

Each clause maps to something the site actually runs. If one of these rows stops
being true, the policy text is wrong, not merely stale.

| Feature | What is collected | Where it goes | Third parties |
| --- | --- | --- | --- |
| Hosting | Standard request logs | Cloudflare Worker `site`, routed on `buxx.me` and `www.buxx.me` | Cloudflare |
| Edge diagnostics | Colo, protocol, TLS, TCP RTT, approximate location, network — read from `request.cf` | Reflected to the requesting visitor only, `no-store`, never stored | Cloudflare |
| Home listening card | Nothing from the visitor | `site-api /api/listening`, refreshed client-side rather than baked into the HTML | Last.fm (recent tracks), Apple (artwork, preview, links) |
| Playback analytics | One cumulative record per playback: heard time, media position, duration, play/pause/seek/complete, plus visitor and session ids shared with reading analytics | `site-api /api/v2/analytics/listening`, upserted as one row in `listening_analytics_events`, enriched server-side with IP-derived location, referrer, language, browser, OS, and device | First-party |
| YouTube embeds | A session-scoped `yes`/`no` reachability verdict. No country data | Poster and avatar bytes come through `/static/youtube/<id>/…`, so the browser contacts nothing until play | YouTube, and only after the reader presses play |
| Mood pages | Nothing from the visitor | Public Telegram-derived content through `site-api` | Telegram |
| Mood subscription | Email address, channel and delivery preferences, delivery records | `NOTIFY_DB` in `site-api`; tokens are minted and verified there | Resend (delivery) |
| Anti-abuse | A Turnstile token on subscribe and manage-request | Verified inside `site-api` before the handler runs | Cloudflare Turnstile |
| Writing and contributions | Nothing from the visitor | Ghost at build time; `site-api /api/github/contributions` at runtime | Ghost, GitHub |

No third-party analytics script is mounted anywhere — [`Layout.astro`](https://github.com/bunizao/site/blob/main/src/layouts/Layout.astro) loads none, and
the playback and reading analytics above are first-party endpoints on this
site's own API.

Two things worth being precise about, because the short version reads wrong:

- **Playback events are not anonymous.** They carry a stable visitor id, reuse
  the reading-analytics session, and are enriched with IP-derived location. The
  row is per playback, not per event, but it is still a per-visitor record.
- **Mood content reads the archive first.** `MOOD_READ_SOURCE=archive` is the
  default; the live Telegram mirror is the fallback and the source for comments
  and freshness. Both are public channel content either way.

## When to update the policy

Any change to one of these means the policy text needs re-reading, not just this
page:

- Adding or removing an analytics vendor, or changing what an existing one stores.
- Changing the listening-data providers.
- Changing subscription storage or the email delivery provider.
- Changing anti-abuse controls.
- Changing public content sources or media-proxy behavior.
- Changing what `/api/edge` exposes.
