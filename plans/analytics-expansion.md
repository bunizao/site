# Analytics expansion

Provenance: 2026-10-07. The owner wants first-party analytics to cover the
whole site, not just blog articles: "尽可能扩大分析的范围。比如主页，还有现在没有的
mood". They expected D1 to run out after the expansion and asked whether to
move to PlanetScale, or to a self-owned stack that does not depend on
Cloudflare's edge services. Status: **discussion**, nothing built.

## Where analytics stands today

| Stream | Surface | Storage | Volume (2026-10-07) |
| --- | --- | --- | --- |
| Reading events (`POST /api/analytics/event`) | `/blog/[slug]` only | `blog_analytics_events` in `site-notify` | 1,164 rows since 2026-07-01, 312 visitors, ~12/day |
| Playback events (`POST /api/v2/analytics/listening`) | Player on any page | `listening_analytics_events` in `site-notify` | 57 rows since 2026-08-09 |
| Newsletter open/click pixels | Email | `newsletter_analytics_events` in `site-notify` | 75 rows |
| Cloudflare Web Analytics (RUM) | Every page, injected at the edge | Cloudflare | ~360 page loads/day (sampled estimate, includes the Lighthouse CI runner) |
| Google Tag Gateway (GA4) | Every page, injected at the edge | Google | Not measured here |

Neither edge-injected script is in the repository; the CSP in
`src/middleware.ts` only allows their hosts (see
`notes/archive/ANALYTICS-PRD.md`).

Where the traffic actually is (Cloudflare RUM, 2026-09-07 → 2026-10-06):

| Section | Page loads | Share | First-party coverage |
| --- | --- | --- | --- |
| `/mood*` | 7,720 | 72% | none |
| `/blog*` | 1,430 | 13% | articles only, not index or tags |
| `/` and `/legacy` | 1,180 | 11% | none |
| `/docs`, `/dev`, `/new`, `/message`, `/reader`, others | ~430 | 4% | none |

First-party analytics sees about one page load in eight. The surface that
carries most of the traffic, mood, is invisible to it.

## Verdict on storage

**D1 is not the bottleneck. Stay on D1. Do not move to PlanetScale.**

Write budget, with every surface tracked:

- ~360 page views/day × ~2.5 beacon upserts per view (load, each hide,
  pagehide) × ~3 rows per upsert (the row plus two indexes) ≈ **2.7k rows/day**.
- Discrete actions (subscribe, search, outbound click, media open), roughly
  another 1k/day at today's traffic.
- Total ≈ 4k of the 100k/day account allowance, about **4%**. At 10× today's
  traffic it is ~40%. unicorn, which once wrote 211k rows in a day, is down to
  ~1k/day (see `plans/d1-read-budget.md`).
- Storage: ~500 bytes per row with indexes → ~70 MB/year raw. A separate
  database gets its own 500 MB Free ceiling.

The real limit is the **read path**, and it breaks before the write budget
does:

- `summary`, `article/{slug}` and the listening summary run
  `SELECT * … WHERE opened_at >= ? LIMIT 10000` and aggregate in JavaScript.
  With mood counted, a 30-day window passes 10,000 rows within the first
  month, and the dashboard **silently truncates** every number.
- Aggregating 10k rows in the Worker is likely to exceed the Free plan's
  10 ms CPU budget, which surfaces as error 1102, not as a slow page.
- Every portal view reads the whole window again. Reads scale with
  window × views, the same shape as the comment-summary problem.

Fix: aggregate in SQL and read from daily rollups. That is phase 0 below and
it is worth doing whether or not the scope expands.

Why not PlanetScale:

- No free tier since 2024. The $5 single node (1/16 vCPU, 512 MB) is, by
  their own description, not for production; HA starts at $15/month.
- A Worker reaches it through Hyperdrive, from APAC to wherever the database
  sits: another vendor, another secret, more latency on every write.
- It solves a write-volume problem this site does not have, and leaves the
  real problem (unbounded reads) in place.

If D1 ever does run short, the next step in order:

1. **Workers Paid, $5/month.** D1 includes 50M rows written per month and
   25B read, and the 10 ms CPU cap goes away. Zero migration, and it also
   fixes the 1102s on `/mood`.
2. **Workers Analytics Engine** for raw events (Free: 100k data points/day;
   adaptive sampling, ~90-day retention, append-only), with D1 keeping the
   rollups. Only worth it at millions of events a day; the upsert-per-view
   model would have to become one final event per view.

## "Self-owned" versus Cloudflare

The source of truth is already self-owned: a first-party beacon writing to the
site's own database. What depends on Cloudflare's edge is the two injected
scripts, and those are worth questioning:

- **Cloudflare Web Analytics**: today the only whole-site page-view count and
  the only field Web Vitals source. Once first-party covers every surface it
  becomes a duplicate. Keep it for 30 days as a cross-check, then switch it off
  or keep it for Web Vitals only (see open questions).
- **Google Tag Gateway**: the data lives in Google, GA4 anonymises IPs, and
  GTM is one of the measured page costs (perf baseline 2026-09). If nobody
  opens the GA4 console, switch it off.
- **Leaving Cloudflare entirely** (Umami, Plausible CE, or a ClickHouse box):
  no. The site runs on Workers either way, so ingest stays on Cloudflare. A
  self-hosted collector means a server to patch and keep alive, at the moment
  the VPS is being retired.

Note: `src/content/docs/platform/privacy.md` says "No page mounts a
third-party analytics script". True of the repository, false of the page a
visitor receives. Fix the wording whatever is decided.

## Scope: what to measure

Principle: one page view is one row, finalised by upsert, as the blog beacon
does today. Discrete actions are separate rows. Never per-item impressions,
mouse movement, keystrokes or session replay.

### Page views on every surface

One generic beacon in `Layout.astro`, replacing `BlogArticleBeacon`. Each page
declares its `surface` and, when it has one, an `entity_id`.

| Surface | Route | `entity_id` | Extra per view |
| --- | --- | --- | --- |
| `home` | `/`, `/legacy` | — | which desk panels were opened (writing, mood, listening, projects) |
| `mood_feed` | `/mood` | — | deepest date reached, feed pages loaded, tag filter used |
| `mood_post` | `/mood/[id]` | mood id | media opened, arrived from feed or from outside |
| `mood_embed` | `/mood/embed` | mood id | embedding host (from referrer), only a host name |
| `blog_index` | `/blog`, `/blog/tag/*`, `/blog/tags` | tag slug | which post was opened next |
| `blog_post` | `/blog/[slug]` | slug | dwell, scroll depth, completion (as today) |
| `docs` | `/docs/*` | page path | — |
| `other` | `/projects`, `/message`, `/reader`, `/subscribe`, `/new`, `/privacy` | — | — |

Common fields: dwell, scroll depth, referrer and parsed source, UTM
parameters, locale, viewport class (phone/tablet/desktop), plus everything the
server already derives (country, ASN, browser, OS, device, platform, in-app
browser).

### Actions

| Action | Where | Notes |
| --- | --- | --- |
| `outbound_click` | Everywhere | Destination host only (GitHub, Telegram, music links) |
| `search` | ⌘K palette, mood search | Result count and zero-result flag. Query text is an open question |
| `subscribe_open`, `subscribe_submit` | Mood subscribe | Confirmation already lives in `NOTIFY_DB`; join, don't duplicate |
| `comment_compose` | Blog and mood comments | Compose opened. Submission already lives in `blog_comments` |
| `media_open` | Mood photo/video viewer | — |
| `share` | Copy-link / share sheet | — |

Comments, reactions, subscriptions and newsletter events already have their
own tables. The dashboard joins them; the beacon never writes them twice.

### Server-side counts (phase 3, optional)

RSS fetches for `/mood/rss.xml` and `/blog/rss.xml`, by reader user agent, as
a subscriber estimate. One upsert per `(day, feed, reader)`. Bots are the
audience here, so the bot filter does not apply.

### Not in scope

- Per-post impressions in the mood feed (one write per card seen).
- Cross-device identity. `visitor_id` stays an anonymous per-browser id.
- Anything that reuses the comment fingerprinting signals. Those exist for
  abuse defence and stay there.

## Migration plan

Each phase ships on its own. Merging to main deploys, so migrations land
first.

### Phase 0 — fix the read path (site-api, no scope change)

1. Replace `SELECT * … LIMIT 10000` + JS aggregation with SQL `GROUP BY`
   queries for totals, per-slug, per-day, platform, country and referrer.
2. Add `analytics_daily` (`day, surface, entity_id, dimension, value` →
   `views, visitors, reads, completed, dwell_ms`) filled by a daily cron from
   yesterday's raw rows. The portal reads rollups for any window over 2 days
   and raw rows only for today and the event log.
3. Meter the analytics routes with the existing `d1-meter` and record the
   before/after rows read per portal view.

### Phase 1 — a dedicated database and a generic table

1. Create D1 `site-analytics` (binding `ANALYTICS_DB`, APAC), so analytics
   never shares a file with comments and subscribers.
2. Table `page_views`: today's `blog_analytics_events` columns plus `surface`,
   `path`, `entity_id`, `utm_*`, `viewport`, `extra` (small JSON for
   per-surface fields). Table `analytics_actions` (append-only). Move
   `listening_analytics_events` and `analytics_daily` here too.
3. One-off copy of blog rows into `page_views` with `surface = 'blog_post'`.
   `since` for the desk read count keeps pointing at the first blog row.
4. Contracts: new `PageViewInput` and `AnalyticsActionInput` in
   `packages/contracts`, published by tag, pin raised in site-api.

### Phase 2 — the generic beacon (site)

1. `POST /api/analytics/view` and `POST /api/analytics/action` in site-api,
   behind the same origin gate, bot filter, rate limit and 4 KB cap.
2. One beacon module loaded from `Layout.astro`; pages pass `surface` and
   `entity_id` through `data-` attributes. Same `visitorId` / `sessionId`
   storage keys as today, so the listening stream keeps joining.
3. Blog switches to the new beacon. `POST /api/analytics/event` keeps
   answering for two weeks (old cached HTML), then is removed.
4. Same PR: update `docs/api/analytics.md`, the privacy map (`privacy.md`: the
   "Mood pages: nothing from the visitor" row becomes false) and the published
   policy in `src/content/pages/privacy.md`; run `check:docs-coverage` with
   `SITE_API_REPO=../site-api`.

### Phase 3 — actions, mood-specific fields, RSS counts

Ship the action list above, then the RSS counter if wanted.

### Phase 4 — dashboard

Portal analytics gets a surface switcher (Overview / Mood / Blog / Home), a
funnel strip (view → subscribe open → submit → confirmed), and a
first-party versus Cloudflare RUM comparison line for the 30-day overlap.

### Phase 5 — decide the edge scripts

After 30 days of overlap, compare daily page views per surface with Cloudflare
RUM. If they agree within the expected gap (bots, CI runner, blocked
beacons), switch off what the open questions settle.

## Retention

Raw `page_views` rows keep the IP forever today, and the expansion multiplies
that by eight. Proposal: null `ip`, `city`, `ua` and `as_org` after 90 days
(the comment risk-signal window), keep the rest of the row 13 months, keep
`analytics_daily` indefinitely. The published policy needs the same numbers.

## Open questions for the owner

1. Retention: is 90 days for IP-level fields and 13 months for raw rows right?
2. Search: store the query text, a hash, or only result counts?
3. Google Tag Gateway: is anyone reading GA4? If not, switch it off.
4. Cloudflare Web Analytics after the overlap: off, or kept for Web Vitals?
   The alternative is first-party Web Vitals, sampled at ~10%.
5. Honour Global Privacy Control / DNT by not sending the beacon?
6. Is Workers Paid ($5/month) acceptable as the escape hatch, before any
   other database is considered?
7. `docs/api/analytics.md` says a `204` can mean "the site already wrote its
   daily share of reading events", but `origin/main` of site-api has no such
   cap. Verify against the deployed version and fix the doc or the code.
