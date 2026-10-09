---
title: Privacy policy
description: What each feature collects, where the data goes, who else sees it, and how long it is kept.
group: Platform
order: 7
---

The published privacy policy is at [`/privacy`](/privacy). This page maps each
part of it to the feature it describes: what the feature collects, where the
data goes, which outside services see it, and how long it is kept. Read it for
the detail behind the policy, or before you change a feature that handles
visitor data.

## How the policy page is built

| File | Role |
| --- | --- |
| [`src/content/pages/privacy.md`](https://github.com/bunizao/site/blob/main/src/content/pages/privacy.md) | The policy text. Every published word comes from this file |
| [`src/pages/privacy.astro`](https://github.com/bunizao/site/blob/main/src/pages/privacy.astro) | A thin route. It imports `Content` and `frontmatter` and renders the body inside `Layout` with `navVariant="page"` |
| [`src/content.config.ts`](https://github.com/bunizao/site/blob/main/src/content.config.ts) | The `pages` collection schema: `title` and `description` required, `updatedAt` optional |
| [`src/lib/content-revision.ts`](https://github.com/bunizao/site/blob/main/src/lib/content-revision.ts) | Resolves the *Updated* line and its commit link from git history at build time |

The policy is Markdown, so a wording change never touches layout code. You
don't bump the date by hand either: git history records when the policy last
changed. The `updatedAt` frontmatter is only a fallback for a build without
history.

## What the policy has to match

Each row below is something the site runs today. If a row stops being true,
the policy text is wrong and needs fixing.

### Site features

| Feature | What is collected | Where it goes | Third parties |
| --- | --- | --- | --- |
| Site analytics | Page/view/visitor/session ids; visible dwell, scroll, input counts and named clicks; referrer and allowlisted campaign values; browser, viewport, time zone and languages. The server adds IP-derived place, network evidence and user agent | WAE `site_views` and `site_clicks`; identity-free daily and period rollups in D1 `site-analytics`. GPC browsers and non-production hosts skip sends; `/dev/*` and `/lab/*` mount no beacon | Cloudflare |
| Hosting | Standard request logs | Cloudflare Worker `site`, routed on `buxx.me` and `www.buxx.me` | Cloudflare |
| Edge diagnostics | Colo, protocol, TLS, TCP RTT, approximate location, and network, read from `request.cf` | Sent back to the requesting visitor only, with `no-store`. Never stored | Cloudflare |
| Home listening card | Nothing from the visitor | `site-api /api/listening`, fetched client-side instead of baked into the HTML | Last.fm (recent tracks), Apple (artwork, preview, links) |
| Playback analytics | One cumulative record per playback: heard time, media position, duration, play/pause/seek/complete, plus the visitor id shared with site analytics, plus a separate playback session | `site-api /api/v2/analytics/listening`, upserted as one row in `listening_analytics_events`. The server adds IP-derived location, referrer, language, browser, OS, and device | First-party |
| YouTube embeds | A session-scoped `yes`/`no` reachability verdict. No country data | Poster and avatar bytes come through `/static/youtube/<id>/…`, so the browser contacts nothing until play | YouTube, only after the reader presses play |
| Mood pages | Page dwell, scroll, named clicks and anonymous analytics identifiers; public channel content remains separate | Analytics through `/api/analytics/collect`; Telegram-derived content through `site-api` | Cloudflare, Telegram |
| Mood subscription | Email address, channel and delivery preferences, delivery records | `NOTIFY_DB` in `site-api`, which also mints and verifies the tokens | Resend (delivery) |
| Anti-abuse | A Turnstile token on subscribe, manage-link request, blog and mood comment create, reaction toggle, and owner message | Verified inside `site-api` before the handler runs | Cloudflare Turnstile |
| Writing and contributions | Nothing from the visitor | Ghost at build time, `site-api /api/github/contributions` at runtime | Ghost, GitHub |

The repository mounts no third-party analytics tag. Cloudflare Web Analytics and Google tags can also be injected at the network edge; inspecting the repository alone does not establish what a deployed response loads. First-party site and playback events go to the site's own API.

### Blog comments

| Feature | What is collected | Where it goes | Third parties |
| --- | --- | --- | --- |
| Blog comments | Display name, comment body, and an optional email address, stored in plaintext next to its hash. Every row also stores the raw IP and referrer, a hashed IP, a server-derived fingerprint hash, the user agent, country, and ASN | `NOTIFY_DB` in `site-api` (`blog_comments`, `notify_subscribers`) | Akismet (moderation), the owner's AI gateway (moderation, anonymous comments only), Resend (verification and reply mail) |
| Comment client evidence | What the browser reports about itself: platform, screen, time zone, a canvas and audio hash, font families, media queries. How the form was filled, as aggregates only: counts, timings, and one spread figure for the gaps between keystrokes. Never the key sequence and never the typed text. A random id the page keeps in IndexedDB, stored only as its HMAC and never written back to a cookie | Two JSON columns on the same row in `NOTIFY_DB`. The collecting module loads on the first focus in the compose box, never on a page view. Every part is optional: a missing or malformed object stores NULL and the write still goes through | First-party |
| Comment ban list | One row per banned key (an address hash, a session, an IP or /24 hash, a fingerprint, a device hash, an ASN, a link domain, or a mail domain), with an optional note and expiry | `blog_bans` in `NOTIFY_DB`, checked on every write path. A ban is silent: the comment is held, a heart answers normally and moves no count, or a private message is filed as spam | First-party |
| Comment quarantine and lockdown | The account or anonymous session identifier of a writer who tripped a spam signal, and a site-wide lockdown flag | `CACHE` KV in `site-api`, as expiring keys (see [How long data is kept](#how-long-data-is-kept)) | First-party |
| Comment moderation | Body, author name and email, IP, user agent, referrer, and the post permalink, on every submission. The same values again when the owner overrules a verdict | Akismet: one `comment-check` per comment, and one `submit-spam` / `submit-ham` per owner verdict on an anonymous comment | Akismet (Automattic) |
| Comment moderation, second opinion | Body, display name, and post title of an anonymous submission | The owner's AI gateway (`AI_BASE_URL`), one classification per anonymous comment | The gateway's model provider |
| Reader avatars | The email hash, sent upstream to look up a picture. The Worker fetches it, never the reader's browser, and caches it in R2 | R2, keyed by email hash | Gravatar mirrors, QQ |

When a reader claims a comment, the site stores how and when they claimed it,
separately from the authentication evidence recorded at submission, which
never changes. An email address used in two browsers does not automatically
attach the other browser's comments to the account.

Optional browser reports send no identity or text. The server does not treat
them as verified observations.

### Private messages

| Feature | What is collected | Where it goes | Third parties |
| --- | --- | --- | --- |
| Private messages | Name, message body, the address hash, and the address as typed. Every row also stores the same actor columns and client evidence as a comment, and `auth_at_write` (whether a signed-in reader sent it) | `owner_messages` in `NOTIFY_DB`. The owner reads it in the portal and in an ops-bot alert | Akismet (moderation), Resend (verification and reply mail), Telegram (owner alert) |

The hash stays for as long as the message does: a reply finds the sender
through it once they confirm the verification mail. The typed address is only
a claim about who was at the keyboard, so it is dropped after 7 days unless a
signed-in reader sent the message.

### How long data is kept

Risk signals exist to catch abuse while it happens, so the comment data that
identifies a writer has a fixed lifetime.

| Data | Kept for |
| --- | --- |
| Raw site analytics | WAE fixed three-month retention; owner raw reports are limited to ninety days |
| Site analytics rollups | Indefinitely; no IP, visitor id or session id |
| Comment risk signals | 90 days after the row was written. A cron then nulls them in place across `blog_comments`, `blog_reactions` and `owner_messages` |
| The address typed on a private message | 7 days, unless a signed-in reader sent it |
| Quarantine on a writer who tripped a spam signal | 24 hours |
| Site-wide comment lockdown flag | 1 hour |
| Ban-removal backups | 30 days |
| Reaction backups | Long enough to restore a mistaken removal, but network and device signals only within the original event's 90-day window. Cleanup and restoration both respect that limit |
| Aggregate operational counters | 90 days |

The risk signals are every actor column on a comment or reaction row: the raw
IP and referrer, the IP and /24 hashes, the server-side and client-side
fingerprint hashes, the stable device and storage-id hashes, the user agent,
city, country, ASN and its name, and both JSON blobs. After the 90 days, the
rest of the row stays: the body, the link domains, the session id, the browser
and OS family names, and the behavioural integers.

The aggregate counters hold only the hour, request kind, outcome,
authentication category, challenge count and total.

## Common misreadings

The short version of the policy can mislead on these points:

- **Playback events belong to a visitor.** They carry a stable visitor id,
  reuse the site visitor id and keep a separate playback session, and get an IP-derived location. There
  is one row per playback instead of one per event, but each row is still a
  per-visitor record.
- **Mood content reads the archive first.** Production sets
  `MOOD_READ_SOURCE=archive` in `wrangler.jsonc` (the code default is `live`).
  The live Telegram mirror is the fallback, and the source for comments and
  freshness. Both are public channel content.
- **The policy discloses reader sign-in, but the feature is dormant.**
  `/oauth/reader/:provider` in `site-api` would send the reader on a round trip
  to GitHub or Google and store the profile that comes back. Nothing on the
  site links to it, and the route answers `404` while its provider credentials
  are unset. So today no reader data reaches either provider. The policy
  already describes sign-in as optional and only on the reader's choice. When
  a sign-in button ships, add a row to the tables above, and add the GitHub and
  Google avatar CDNs to the avatar row next to Gravatar and QQ.
- **An anonymous comment still identifies its writer to the server.**
  "Anonymous" in the comments feature means *no account required*. The row
  still stores the IP, a fingerprint hash, a user agent, and, when the browser
  sent them, a device fingerprint and typing aggregates, for as long as the
  risk window lasts. Akismet sees every submission, and a language model sees
  the text of every anonymous submission through the AI gateway. What the
  feature skips is requiring or verifying an identity before a comment is
  published.

## What the published policy covers

As of 13 September 2026, the published policy covers blog comments. Its
`## Blog comments` section names:

- Akismet
- the Gravatar and QQ avatar lookups
- the Resend confirmation and reply mail
- the two cookies and their lifetimes
- the raw IP and the plaintext address the row keeps
- what the compose box asks the browser once writing starts
- the identifier held in the browser's own database
- that a refusal is silent
- the 90-day risk-signal erasure

The disclosure, retention, and rights sections have the matching clauses.

The policy also covers optional GitHub and Google sign-in for comments. It
names them under reader identity data, the *Signing in* and cookie sections,
third-party content sources, and disclosure to service providers. The feature
has no entry point yet, so those clauses describe what happens once a sign-in
button ships.

## When to update the policy

If you change any of the following, re-read the policy text as well as this
page:

- Add or remove an analytics vendor, or change what an existing one stores.
- Change the listening-data providers.
- Change subscription storage or the email delivery provider.
- Change anti-abuse controls, including which routes have a Turnstile check.
- Change what a comment stores, how long its risk signals are kept, or which
  moderation, avatar, or sign-in provider it talks to. Adding a field to the
  client evidence counts: the reader's browser collects it, so it needs
  disclosing even though it never leaves this site.
- Change public content sources or media-proxy behavior.
- Change what `/api/edge` exposes.
