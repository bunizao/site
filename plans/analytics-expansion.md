# Site analytics: page dwell and clicks

Provenance: 2026-10-07. The owner wants first-party analytics on every page,
not only blog articles ("尽可能扩大分析的范围。比如主页，还有现在没有的 mood"), built
inside the Cloudflare ecosystem on the Free plan, as one detailed system
("整体化和细致化"). What to measure: how long people stay on each page and what
they click ("分析页面的停留时间，然后点了什么"). Numbers must be precise, and the
bot and agent filter must not misjudge real readers ("要尽量精确 … 误判断的风险").

Status: **implemented and under rollout verification**. The original sections below describe the planned design. [Analytics verification](analytics-verification.md) records the actual implementation, reproducible commands, measured results and remaining production gates.

Implementation corrections validated against the live Cloudflare APIs:

- Contracts were released as 0.14.0, followed by 0.15.0 to represent unavailable lifetime reader counts as `null`.
- WAE retains data for three months, not a strictly guaranteed ninety-day expiry. Owner raw reports are limited to ninety days.
- WAE can sample checkpoints inside a view. A view index does not retain the whole sequence. Applying checkpoint `_sample_interval` to an already-grouped view inflates page counts. Reports count observed distinct views and visitors, use cumulative progress maxima, and disclose incomplete sampled histories. Raw write budgets use `SUM(_sample_interval)`.
- Live WAE supports one subquery level. Queries were executed against its real SQL API; aggregate aliases and nested subqueries cannot be assumed to behave like ClickHouse.
- Daily histograms are stored without identities, so medians can be reconstructed rather than averaging daily medians. Daily writes use JSON inserts inside one D1 batch, keeping the number of subrequests bounded.
- The beacon measured 3.3 KB minified and gzipped, exceeding the original 2.5 KB target. Runtime correctness, retry preservation and UTF-8 body limits are retained.
- The old desk counted every event as a read. Backfill compares both that legacy number and the new five-second read definition; equality between those different definitions is not an acceptance criterion.
- Cutover is controlled by the actual `SITE_ANALYTICS_CUTOVER_AT` timestamp. The fourteen/thirty/ninety-day retirement clock and the seven-day observation window start only after production collection is activated.

Section 18 remains the rollout sequence; completed and pending work is recorded in the verification file.

## 1. Decisions

| # | Decision | Date |
| --- | --- | --- |
| D1 | Stay on Cloudflare, Workers **Free** plan. No Workers Paid, no outside database, no analytics SaaS. | 2026-10-07 |
| D2 | Raw events go to **Workers Analytics Engine (WAE)**. Long-term numbers go to D1 as daily rollups. | 2026-10-07 |
| D3 | Raw data, including IP, is kept **90 days**. WAE's own retention is three months, so the raw store expires by itself. Rollups hold no IP and no visitor id, and are kept indefinitely. | 2026-10-07 |
| D4 | Scope is **page views with dwell and scroll, plus clicks**. | 2026-10-07 |
| D5 | **Listening analytics is done and stays as it is**: `POST /api/v2/analytics/listening` → D1 `listening_analytics_events`. Newsletter pixels also stay. | 2026-10-07 |
| D6 | Bots and agents are excluded **only by what they declare about themselves**. No network or behaviour guessing: no ASN rule, no "suspect" class, no volume heuristics (section 6). | 2026-10-07 |
| D7 | Days are **Australia/Melbourne** calendar days (the zone the desk already uses). | 2026-10-07 |
| D8 | PostHog is deferred. Postgres (Neon, Supabase) and PlanetScale are rejected for this workload. | 2026-10-07 |

Why not Postgres: the limit was D1's Free write quota, not SQLite. The free
Postgres tiers are tighter. Neon gives 0.5 GB and 100 CU-hours a month, and
beacons arriving all day keep its compute awake (0.25 CU around the clock is
~180 CU-hours). Supabase gives 500 MB, reached through Hyperdrive (Free:
100k queries/day) with an extra network hop. PlanetScale has had no free tier
since 2024.

## 2. Scope

**In:**
- One page view per page load on every public page: visible dwell, scroll
  depth, input, entry and exit, source, device, place.
- Every click on a link or button, named.
- A few page-specific counters that dwell alone cannot express (section 10).

**Out:**
- Listening and newsletter (D5). The portal keeps their current tabs.
- Search query text, form contents, keystrokes, mouse paths, session
  replay, per-card impressions.
- Web Vitals. Cloudflare Web Analytics keeps providing them.
- `/dev/*` and `/lab/*`. These are owner and dev only, so no beacon is
  mounted there.

## 3. Architecture

```
browser (site)                               site-api (Worker, Free)
──────────────                               ─────────────────────────
src/lib/analytics/beacon.ts                  POST /api/analytics/collect
  view start / hide / pagehide  ──batch──▶     origin gate · rate limit · 8 KB cap
  click buffer                                 classify (section 6) · enrich (request.cf)
                                               ├─ VIEWS.writeDataPoint   → WAE site_views
                                               └─ CLICKS.writeDataPoint  → WAE site_clicks
                                                                    │ (90 days)
                                   hourly cron "0 * * * *" (existing)│
                                     rollup each finished Melbourne  ▼
                                     day via the WAE SQL API ──▶ D1 site-analytics (forever)
                                                                    │
/dev/portal (site) ◀── GET /api/analytics/site?report=… ◀───────────┘
                       today: WAE live · earlier: D1 rollups
```

New Cloudflare resources, all in site-api's `wrangler.jsonc`:

```jsonc
"analytics_engine_datasets": [
  { "binding": "VIEWS",  "dataset": "site_views"  },
  { "binding": "CLICKS", "dataset": "site_clicks" }
],
// added to d1_databases
{ "binding": "ANALYTICS_DB", "database_name": "site-analytics", "database_id": "<create>" }
```

- No new cron. The rollup runs inside the existing hourly `0 * * * *`
  handler.
- No new rate limiter. Reuse `ANALYTICS_RATE_LIMITER`.
- The SQL API needs the `CLOUDFLARE_ANALYTICS_TOKEN` secret (Account
  Analytics Read), which the D1 budget check already expects but which is
  **still unset**. Setting it is step 0 of PR 2.

## 4. Budgets

Traffic basis: Cloudflare RUM, 2026-09-07 → 2026-10-06, about **360 page
loads/day** (`/mood*` 72%, `/blog*` 13%, `/` and `/legacy` 11%, the rest 4%).

| Resource | Free allowance | Expected use | At 10× traffic |
| --- | --- | --- | --- |
| WAE data points written | 100,000/day | ~1,100 views (≈3 sends per view) + ~550 clicks ≈ **1,700** | 17% |
| WAE read queries | 10,000/day | cron ~12 + portal ~10 per screen load, cached 60 s ≈ **<300** | <3% |
| Worker requests (site-api) | 100,000/day | ~2.5 collect requests per view ≈ **900** on top of today's 5–12k | +9% |
| Worker CPU per request | 10 ms | collect handler target **≤ 3 ms** (no D1, no fetch) | same |
| D1 rows written (account) | 100,000/day | rollups ≈ **700** | ~7% |
| D1 storage (`site-analytics`) | 500 MB per database | ≈ 40 MB/year | — |

WAE does not bill today, and Cloudflare does not document what happens past
the Free daily limit. Treat 100k as hard: the rollup records points per day
in `rollup_runs`, and the existing ops alert fires at 50k.

## 5. Identity

| Id | Storage | Lifetime | Notes |
| --- | --- | --- | --- |
| `visitor_id` | localStorage `buxx:blog-analytics:visitor-id` (existing key) | until cleared | Same key as today, so returning-visitor history and the listening join survive. UUID v4 |
| `session_id` | localStorage `buxx:analytics:session` = `{"id","last"}` | 30 min of inactivity | New key. A view starts a new session when `now - last > 30 min`. `last` is refreshed on every send. Listening keeps its own sessionStorage key |
| `view_id` | memory | one page load | UUID v4. A new id when a page returns from the back/forward cache (`pageshow` with `persisted`) |

A `view_id` is the WAE `index1` of every data point for that view, so
WAE's index-based sampling keeps or drops a view whole.

## 6. Excluding bots and agents

### What Cloudflare can give us

On the Free plan, nothing per request. The bot score, `verifiedBot`,
`signedAgent`, `verifiedBotCategory` and JA3/JA4 fields in `request.cf` all
require Enterprise Bot Management. What the Free plan has is dashboard-only:
Security Analytics (Bot Fight Mode challenges) and AI Crawl Control
(crawler requests by name). Neither can be joined to our events.

### Why we barely need it

Data only enters this pipeline when a page runs our script, sends a beacon,
and passes the origin gate. Search and AI crawlers (Googlebot, GPTBot,
ClaudeBot, Bytespider and the like) fetch HTML and do not run it, so they
never arrive.

What can arrive is a real browser driven by software. Those almost always say
so:
- headless Chrome puts `HeadlessChrome` in its user agent;
- Lighthouse and PageSpeed say `Lighthouse` / `Chrome-Lighthouse`;
- WebDriver, Playwright and Puppeteer set `navigator.webdriver = true`;
- signed agents send `Signature-Agent` (Web Bot Auth);
- user-action fetchers name themselves (`ChatGPT-User`, `Claude-User`,
  `Perplexity-User`).

### Rules

Every rule is a self-declaration, so a person cannot trip one. First match
wins.

| Order | Class | Rule | Can it misjudge a person? |
| --- | --- | --- | --- |
| 0 | — (not written) | Origin is localhost/preview (the gate's local exception) | No |
| 1 | `owner` | `CF_Authorization` cookie verifies as an Access JWT for an allowed admin (reuse `readCloudflareAccessIdentity`, fed from the cookie, and only when the cookie is present), **or** the beacon sends `owner: true` from the portal toggle "Don't count this browser" (`localStorage['buxx:analytics:owner'] = '1'`) | Only the owner, by design |
| 2 | `bot` | `User-Agent` matches `bot\|spider\|crawl\|slurp\|preview\|facebookexternalhit\|whatsapp\|telegrambot\|headlesschrome\|lighthouse\|pagespeed\|ptst\|gtmetrix\|chatgpt-user\|claude-user\|perplexity-user\|bytespider` (case-insensitive) | No: no shipping browser sends these |
| 3 | `bot` | `Signature-Agent` header present | No |
| 4 | `bot` | Beacon reports `navigator.webdriver === true` | No: false in every normal browser |
| 5 | `human` | Everything else | — |

`class_reason` records which rule matched (`owner_access`, `owner_toggle`,
`ua`, `signature_agent`, `webdriver`). The UA regex lives once, in site-api
`src/features/analytics/server/traffic-class.ts`, and replaces the copy in
`src/lib/ua.ts`.

Three things keep the error visible:

1. **Nothing is deleted.** Every point carries its class, and the portal
   filters at query time. A rule found wrong is fixed by re-running the
   rollup, not by recovering lost data.
2. **Engaged views are the headline number.** A disguised script that slips
   past the rules (spoofed user agent, `webdriver` patched out) still shows
   up as a view, but it rarely holds a visible page for 10 seconds or
   produces input. The portal leads with engaged views and shows all views
   beside them.
3. **A Traffic quality panel** shows views per class and reason per day, and
   first-party human views against Cloudflare RUM page loads per surface.
   A rule that starts catching readers shows up as a jump in one row.

Network evidence (ASN, AS org, TCP RTT) is stored on every point for
inspection in the event log, never used to classify.

## 7. The client beacon

**Files**
- `src/lib/analytics/beacon.ts`: the one module. No dependencies, target
  ≤ 2.5 KB min+gz.
- `src/lib/analytics/page.ts`: reads page metadata from `<body>` data
  attributes.
- Mounted once in `src/layouts/Layout.astro` (beside `PerformanceDebugPanel`)
  and once in `src/layouts/BlogLayout.astro` (separate document), as
  `<script type="module">`.
- `src/pages/mood/embed.astro` mounts it directly: a standalone document,
  without Layout.
- Deleted: `src/features/posts/ui/BlogArticleBeacon.astro`.

**Page metadata.** A new optional `analytics` prop on both layouts renders
`data-analytics-surface`, `data-analytics-entity` and
`data-analytics-locale` on `<body>`. A page without the prop gets
`surface="other"`.

**Gates.** It runs only on hostnames `buxx.me` and `www.buxx.me`, as the blog
beacon does today. When `document.prerendering` is true, it waits for
`prerenderingchange` before starting.

**Lifecycle of one view**

| Moment | Send | Contents |
| --- | --- | --- |
| Script start | `seq 0` | View fields with `dwell_ms = 0` |
| `visibilitychange` → hidden | next `seq` | Current progress and buffered clicks |
| `pagehide` | next `seq` | Final progress and buffered clicks |
| 10 clicks buffered, or 10 s since the first buffered click while visible | next `seq` | Progress and clicks |
| `pageshow` with `persisted` | new view, `seq 0` | `nav_type = 3` |

A send is skipped when nothing changed since the last one (same rule as
today's `lastSentKey`). Transport is `navigator.sendBeacon`, with
`fetch(..., { keepalive: true })` as fallback.

**Measured values**

| Field | How |
| --- | --- |
| `dwell_ms` | Visible time only: paused on hidden, resumed on visible. Capped at 7,200,000 (2 h) |
| `scroll_depth` | Max of `scrollTop / (scrollHeight - clientHeight)` over `[data-page-scroller]` or `documentElement`. 1 when the page cannot scroll. rAF-throttled, rounded to 0.001 (the current blog logic) |
| `interactions` | Count of trusted (`isTrusted`) `pointerdown`, `keydown`, `touchstart` and `wheel` events |
| `first_input_ms` | Milliseconds from navigation start to the first of those; −1 if none |
| `hidden_count` | Number of times the tab was hidden |
| `nav_type` | `PerformanceNavigationTiming.type`: navigate 0, reload 1, back_forward 2; bfcache restore 3 |
| `is_entry` | 1 when this view started the session |
| `is_new_visitor` | 1 when the visitor id was created during this view |
| `viewport` | `innerWidth × innerHeight`, `devicePixelRatio` |
| `tz`, `langs` | `Intl.DateTimeFormat().resolvedOptions().timeZone`, `navigator.languages[0..2]` |
| `webdriver` | `navigator.webdriver === true` |
| `metric_1`, `metric_2` | Page-specific counters (section 10) |

**URL handling.** `path` is `location.pathname` only, so a query string
never leaves the browser. That matters because `/subscribe/manage` and
`/reader/*` carry tokens. The beacon reads only an allowlist of parameters
into separate fields: `utm_source`, `utm_medium`, `utm_campaign`, and `tag`
on `/mood`.

**Referrer.** `document.referrer` reduced to origin plus path. A same-origin
referrer becomes the bare path (`/blog`); the server then sets
`ref_source = internal`.

## 8. Clicks

One delegated listener, so no per-component handler code:
`document.addEventListener('click', …, { capture: true, passive: true })`,
plus `auxclick` for middle-clicked links.

1. Resolve the target:
   `event.target.closest('[data-track], a[href], button, [role="button"], summary')`.
   Skip it if it is inside `[data-track-ignore]`, or if it is a form control
   being typed into.
2. Name it:
   - `data-track="<name>"` when present. This is the precise name, added to
     every control listed in section 10.
   - Otherwise a link gets `link`, and anything else gets `button`.
3. Classify `kind`:
   - `link_internal`: same origin.
   - `link_outbound`: other origin.
   - `button`: no `href`.
   - `panel`: desk panel opens (below).
4. Record:
   - `href`: internal path or outbound `host + path`, without query.
   - `region`: the nearest `data-track-region`, else the nearest landmark
     (`header`, `nav`, `main`, `footer`, `aside`).
   - `label`: `aria-label` or trimmed text, ≤ 60 characters. Public page text
     only: never an input's value.
   - `position`: the index within the nearest `data-track-list`, or −1.
   - `t_ms`: time since the view started.

Not every opening is a click. Desk panels also open by swipe, arrow key and
hash. The beacon listens to the desk's `easel:shown` event
(`src/features/desk/client/easel.ts:687`) and records a `panel` entry named
`desk.panel`, with `href = '#<id>'` and `label` = how it opened. When a
click caused the open, the click is recorded once, as the panel entry.

Naming convention: `<area>.<thing>`, lower case, stable across redesigns,
never including content (ids go in `href`, not in the name).

## 9. Wire contract

New in `packages/contracts/src/analytics.ts` (version 0.13.0 → **0.14.0**):

```ts
export const SITE_ANALYTICS_COLLECT_ENDPOINT = '/api/analytics/collect' as const;
export const SITE_ANALYTICS_REPORT_ENDPOINT = '/api/analytics/site' as const;
export const SITE_ANALYTICS_ENGAGED_DWELL_MS = 10_000;
export const SITE_ANALYTICS_SESSION_IDLE_MS = 30 * 60_000;
// Reuse BLOG_ANALYTICS_READ_THRESHOLD_MS (5_000) and
// BLOG_ANALYTICS_COMPLETION_SCROLL_DEPTH (0.9) for blog reads.

export type SiteAnalyticsSurface =
  | 'home' | 'legacy' | 'not_found'
  | 'blog_index' | 'blog_tags' | 'blog_tag' | 'blog_post'
  | 'mood_feed' | 'mood_post' | 'mood_embed'
  | 'projects' | 'message' | 'privacy' | 'subscribe_manage' | 'reader'
  | 'docs' | 'components' | 'other';

export type SiteAnalyticsClickKind = 'link_internal' | 'link_outbound' | 'button' | 'panel';

export interface SiteAnalyticsCollectInput {
  v: 1;
  viewId: string;           // UUID v4
  visitorId: string;        // 8–64 chars
  sessionId: string;        // UUID v4
  seq: number;              // 0–255
  owner?: true;
  page: {
    surface: SiteAnalyticsSurface;
    entity: string;         // ≤ 96 chars, '' when none
    path: string;           // ≤ 256 chars, pathname only
    locale: string;         // ≤ 16 chars
    referrer: string;       // ≤ 256 chars
    utm: [string, string, string]; // source, medium, campaign; each ≤ 64
  };
  client: {
    tz: string; langs: string[]; vw: number; vh: number; dpr: number;
    navType: 0 | 1 | 2 | 3; isEntry: boolean; isNewVisitor: boolean; webdriver: boolean;
  };
  progress: {
    dwellMs: number; scrollDepth: number; interactions: number;
    firstInputMs: number; hiddenCount: number; metric1: number; metric2: number;
  };
  clicks: Array<{
    name: string;           // ≤ 64 chars
    kind: SiteAnalyticsClickKind;
    href: string;           // ≤ 256 chars
    region: string;         // ≤ 48 chars
    label: string;          // ≤ 60 chars
    position: number;       // −1 or 0–9999
    tMs: number;
  }>;                       // ≤ 20 per request
}
```

The report types (`SiteAnalyticsReport*`) are added with PR 4. Publish by tag
`contracts-v0.14.0`, then raise the pin in site-api (`package.json`,
`scripts/check-contract-package.ts`, `tests/unit/ci-workflow.test.ts`).

## 10. Per-page instrumentation

Surface and entity come from the layout prop. `metric_1` and `metric_2` are
the page-specific counters; a dash means unused (sent as 0). `data-track`
names are added to the listed elements; everything else is caught as a
generic `link` or `button`.

### `/`: desk home (`home`)

- **Page file:** `src/features/desk/Page.astro`
- **Entity:** none
- **`metric_1`:** panels opened in this view
- **`metric_2`:** distinct panels opened

| `data-track` / entry | Element | File |
| --- | --- | --- |
| `desk.panel` (panel entry) | `easel:shown`; `href` `#projects` … `#colophon`, `label` = chip, tab, swipe, key or hash | `client/easel.ts:687` |
| `desk.home` | `[data-home]`, Esc | `client/easel.ts:762` |
| `desk.project` | `a.dk-work` | `ui/Works.astro` |
| `desk.door` | `a.dk-door` (Projects, Writing, Moods, GitHub) | `ui/Door.astro` |
| `desk.post` | `a.dk-wr-row`, `data-track-list` on its list | `ui/Contents.astro` |
| `desk.mood` | mood bubble links | `ui/MoodChannel.astro` |
| `desk.subscribe_open`, `desk.subscribe_submit` | `[data-subscribe-open]`, submit button; region = channel | `ui/Subscribe.astro` |
| `desk.listen_play` | `[data-deck-start]`, `[data-listening-play]` | `client/tonearm.ts:189`, `home/ui/Listening.astro` |
| `desk.lamp` | lamp pull | `client/lamp.ts:242` |
| `desk.sound` | `[data-sound]` | `client/sound.ts:258` |
| `desk.github_field` | `[data-year-field]` | `client/year.ts:482` |
| `desk.note_send` | message submit in the letter | `ui/Letter.astro` |
| `desk.paper_row` | `a.dk-paper-row` | `ui/Badge.astro` area |

### `/legacy` (`legacy`)

- **Entity:** none
- **Metrics:** none

| `data-track` | Element | File |
| --- | --- | --- |
| `legacy.project_card` | ProjectStack card | `src/components/project-cards/ProjectStack.tsx:139` |
| `legacy.mood_preview` | HomePreview list item | `src/features/mood/ui/HomePreview.astro:1508` |
| `legacy.post` | Posts rows | `src/features/home/ui/Posts.astro` |

Also fix: `inferListeningSurface` maps `/legacy` to `other`. Map it to `home`
(listening owns that code; it is a one-line fix in the same PR).

### `/404` (`not_found`)

- **Entity:** the requested path. This records broken inbound links.
- **Metrics:** none

| `data-track` | Element |
| --- | --- |
| `nf.paint` | `[data-nf-knife]` |
| `nf.near` | `[data-nf-near]` |

### `/blog` (`blog_index`), `/blog/tags` (`blog_tags`), `/blog/tag/[slug]` (`blog_tag`)

- **Entity:** none, none, and the tag slug respectively
- **Metrics:** none

| `data-track` | Element | File |
| --- | --- | --- |
| `blog.post` | post row link, `data-track-list` on the list | `PostRow.astro` |
| `blog.earlier` | `[data-blog-earlier]` | `src/pages/blog/index.astro` |
| `blog.year` | year-rail and ledger `#yYYYY` links | `BlogYearRail.astro`, `BlogLedger.astro` |
| `blog.contact` | contact panel controls | `ContactPanel.astro` |
| `blog.sea_sound` | `[data-sillage-sound]` | `BlogSeaFooter.astro` |
| `blog.tag` | tag cards and links | `TagCard.astro` |

### `/blog/[...slug]` (`blog_post`)

- **Entity:** the Ghost slug, the same across translations; `locale` tells
  them apart, and `path` keeps `/blog/<locale>/<canonical>`.
- **`metric_1`:** the deepest heading reached (index of the last `h2`/`h3`
  whose top passed the viewport middle, 1-based)
- **`metric_2`:** total headings

| `data-track` | Element | File |
| --- | --- | --- |
| `post.toc` | TOC links, `data-track-list` | `TableOfContents.astro` |
| `post.lang` | language pill and menu items | `LanguagePill.astro` |
| `post.tag` | tag links | `TagList` |
| `post.image` | `.kg-image` lightbox open, position = image index | `src/features/posts/client/prose.ts:620` |
| `post.music_play` | `[data-blog-music-play]` | `prose.ts:376` |
| `post.youtube_play` | `[data-yt-frame]` | `src/lib/embed/youtube-controller.ts:275` |
| `post.reaction` | reaction button | `src/features/comments/ui/ReactionBar.tsx:218` |
| `post.subscribe_open`, `post.subscribe_submit` | `[data-subscribe-toggle]`, submit | `src/features/notify/subscribe-panel.ts:234/:301` |
| `post.share_copy`, `post.share_native` | `[data-share-copy]`, `[data-share-native]` | `ShareRow.astro` |
| `post.comment_submit` | `[data-compose-submit]` | `comments-controller.ts:690` |
| `post.comment_like`, `post.comment_reply`, `post.comment_more` | like, reply, load more | `comments-controller.ts:1499/:1481/:615` |
| `post.adjacent` | prev, next, all posts (`label`) | `AdjacentNav.astro` |
| `post.totop` | `.blog-totop` | `BackToTop.astro` |

Reads and completion for the desk and the portal: `dwell_ms ≥ 5,000` and
`scroll_depth ≥ 0.9`, the existing constants.

### `/mood` (`mood_feed`)

- **Entity:** the `tag` filter, or '' when none
- **`metric_1`:** feed pages loaded after the first (`loadMore` and
  `loadNewer` successes)
- **`metric_2`:** the deepest day reached, as whole days between today and
  the oldest day group that entered the viewport (in the reader's time zone,
  matching the feed's grouping)

| `data-track` | Element | File |
| --- | --- | --- |
| `mood.open` | `.mood-item--clickable` click/Enter; `href` `/mood/<id>`; position = index in feed | `src/features/mood/client/feed-renderer.ts:775` |
| `mood.quote` | `.mood-item-quote` jump | `feed-renderer.ts` |
| `mood.load_more` | `[data-load-more]` button (scroll-triggered loads only count in `metric_1`) | `feed-controller.ts:1235` |
| `mood.retry` | the three retry buttons | `feed-controller.ts` |
| `mood.wheel` | timeline wheel. One entry per gesture end, `label` = drag, key, swipe or top; position = days jumped | `src/features/mood/client/timeline-wheel.ts:63/:939/:971/:1075` |
| `mood.nav_top` | `[data-mood-nav-top]` | `MoodNavbar.astro:178` |
| `mood.subscribe_open`, `mood.subscribe_submit` | `[data-subscribe-toggle="mood"]`, submit | `subscribe-panel.ts` |
| `mood.update_refresh` | `[data-mood-update-refresh]` | `feed-update-watcher.ts:504` |
| `mood.comments_peek` | comments popover, recorded when the fetch starts | `feed-comments-popover.ts:428` |
| `mood.link_card` | bookmark card anchors | `src/features/mood/shared/feed-media.ts:242` |
| `mood.tag_clear` | "All moods" link | `FeedShell.astro:263` |

### `/mood/[id]` (`mood_post`)

- **Entity:** the mood id
- **`metric_1`:** lightbox slides viewed
- **`metric_2`:** comments loaded

| `data-track` | Element | File |
| --- | --- | --- |
| `mood_post.back` | `[data-back-button]` | `src/pages/mood/[id].astro:183` |
| `mood_post.tag` | `a.mood-post-tag` | `DetailArticle.astro` |
| `mood_post.image` | gallery slide, position = slide index | `src/features/mood/client/lightbox.ts:179` |
| `mood_post.comment_submit` | compose submit | `detail-compose.ts:455` |
| `mood_post.comment_more` | load more | `detail-comments-controller.ts:806` |
| `mood_post.youtube_play`, `mood_post.listen_play` | embeds | `[id].astro:207/:212` |

### `/mood/embed` (`mood_embed`)

- **Entity:** the mood id
- **Metrics:** none
- **Referrer:** it is the page that embeds the frame, so `ref_host` reads
  "which sites embed my moods".

| `data-track` | Element |
| --- | --- |
| `embed.open` | `.embed-avatar`, `.embed-name`, `.embed-date`, `.embed-more` (`label`) |

Storage in a third-party iframe is partitioned, so embed visitors get
their own visitor ids. The portal therefore reports embed views
separately and never adds them to site visitors.

### Other pages

| Route | Surface | Entity | Tracked |
| --- | --- | --- | --- |
| `/projects` | `projects` | — | `projects.card` (per-project outbound), `projects.github` |
| `/message` | `message` | — | `message.send` (submit `:218`), `message.again` |
| `/privacy` | `privacy` | — | links only |
| `/subscribe/manage` | `subscribe_manage` | — | `manage.request_link`, `manage.save`, `manage.unsubscribe`, `manage.delete` (`ManagePreferences.tsx:602/:1043/:1092`) |
| `/reader/*` | `reader` | `confirm`, `mute` or `comments` | `reader.pref` (`[data-pref]` change counts as a click) |
| `/docs/*` | `docs` | the doc slug (`locked` for the 401 screen) | `docs.search`, `docs.copy_code`, `docs.copy_page`, `docs.toc`, `docs.group` |
| `/components/*` | `components` | the component slug | `components.install_tab`, `components.copy` |

### Site chrome, on every page

| `data-track` | Element | File |
| --- | --- | --- |
| `nav.link` | `[data-nav-link]` | `Layout.astro:1012` |
| `nav.menu` | `[data-menu-trigger]` | `Layout.astro:934` |
| `theme.open`, `theme.pick` | `[data-theme-toggle]`; `[data-theme-option]` with `label` = light, dark or system; the blog cycler | `Layout.astro:787/:798`, `BlogLayout.astro:~444` |
| `palette.open` | `[data-command-open]`, ⌘K (`label` = button or key) | `CommandPalette.astro:935/:945` |
| `palette.pick` | `activate()` row; `label` = row type (nav, post, mood, copy_email, subscribe, theme, ai, external); `href` = destination | `CommandPalette.astro:743` |

The palette's query text is not recorded (section 2).

## 11. Ingest: `POST /api/analytics/collect` (site-api)

File: `src/pages/analytics/collect.ts`. Logic lives in
`src/features/analytics/server/site-collect.ts`, behind two functions,
`recordView()` and `recordClicks()`.

1. **Origin gate:** the existing `precheck` from `blog-analytics.ts`.
   Non-production origins → `204`, nothing written.
2. **Rate limit:** `ANALYTICS_RATE_LIMITER`, key `ip:colo`. Over the limit →
   `429`.
3. **Body:** ≤ 8,192 bytes (`413`). Valid JSON matching the contract
   (`400 invalid_body`). `clicks.length ≤ 20`. Strings are clamped to their
   caps, never rejected for length.
4. **Classify** (section 6), then **enrich** from `request.cf` and headers:
   country, region, city, ASN, AS org, colo, TCP RTT, IP, user agent,
   parsed browser, OS, device and in-app platform. The parser is the
   existing `parseUa`.
5. **Server-side dwell cap:** none at ingest. It is applied at query time
   (section 13).
6. **Write:** one `VIEWS.writeDataPoint`, plus one `CLICKS.writeDataPoint`
   per click. These calls are synchronous and need no `waitUntil`.
7. **Respond:** `204`, no body.

CPU budget: no D1, no fetch, and the RS256 verify only when a
`CF_Authorization` cookie is present. Measure with
`wrangler tail --format json` in staging; p99 must stay under 5 ms.

## 12. WAE column maps

These positions are frozen once data exists. Add new fields only in the free
slots; never repurpose a slot.

**`site_views`**: `index1` = `view_id`

| Slot | Field | Slot | Field |
| --- | --- | --- | --- |
| blob1 | `class` | double1 | `seq` |
| blob2 | `class_reason` | double2 | `dwell_ms` |
| blob3 | `surface` | double3 | `scroll_depth` |
| blob4 | `entity` | double4 | `interactions` |
| blob5 | `path` | double5 | `first_input_ms` |
| blob6 | `locale` | double6 | `hidden_count` |
| blob7 | `visitor_id` | double7 | `click_count` (clicks in this send) |
| blob8 | `session_id` | double8 | `nav_type` |
| blob9 | `referrer` | double9 | `is_entry` |
| blob10 | `ref_source` (direct, internal, search, social, telegram, email, external) | double10 | `is_new_visitor` |
| blob11 | `ref_host` | double11 | `vw` |
| blob12 | `utm` (`source\|medium\|campaign`) | double12 | `vh` |
| blob13 | `country` | double13 | `dpr` |
| blob14 | `region\|city` | double14 | `metric_1` |
| blob15 | `asn\|as_org\|colo` | double15 | `metric_2` |
| blob16 | `ip` | double16 | `tcp_rtt_ms` |
| blob17 | `ua` (≤ 400 chars) | double17–20 | free |
| blob18 | `browser\|version\|os\|version` | | |
| blob19 | `device\|platform` | | |
| blob20 | `tz\|langs` | | |

**`site_clicks`**: `index1` = `view_id`

| Slot | Field | Slot | Field |
| --- | --- | --- | --- |
| blob1 | `class` | double1 | `t_ms` |
| blob2 | `surface` | double2 | `position` |
| blob3 | `entity` | double3 | `seq` of the carrying send |
| blob4 | `path` | | |
| blob5 | `name` | | |
| blob6 | `kind` | | |
| blob7 | `href` | | |
| blob8 | `region` | | |
| blob9 | `label` | | |
| blob10 | `visitor_id` | | |
| blob11 | `session_id` | | |
| blob12 | `country` | | |
| blob13 | `device` | | |
| blob14–20 | free | | |

Retries can duplicate a click. A click is deduplicated on
`(index1, double3, double1, blob5)`.

## 13. Metric definitions

Every count uses `SUM(_sample_interval)`, never `COUNT()`, as the WAE docs
require. A view's values are taken per `index1`.

| Metric | Definition |
| --- | --- |
| View | One `view_id` whose highest-severity class is `human` (order: owner, bot, human) |
| Dwell | `max(dwell_ms)`, capped at `(max(timestamp) − min(timestamp)) + 120 s` for that view, so a client cannot claim more time than the server saw pass |
| Scroll depth | `max(scroll_depth)` |
| Engaged view | `max(interactions) ≥ 1` **or** dwell ≥ 10,000 ms |
| Visitor | Distinct `visitor_id` in the range |
| New visitor | Visitor with any view where `is_new_visitor = 1` |
| Session | Distinct `session_id` |
| Entry page | View with `is_entry = 1` |
| Exit page | Last view (by first timestamp) of each session |
| Bounce | Session with exactly one view, and that view not engaged |
| Blog read | `blog_post` view with dwell ≥ 5,000 ms |
| Blog completion | `blog_post` view with scroll depth ≥ 0.9 |
| Click-through | Clicks with a given `name` ÷ views of that surface |
| Median dwell | `quantileExactWeighted(0.5)(dwell, _sample_interval)` over views. **The portal shows medians, not means**, because one forgotten open tab skews a mean for days |

## 14. Rollups: D1 `site-analytics`

Migration `scripts/sql/analytics/0001_rollups.sql`. All tables are
`WITHOUT ROWID` with the primary key as their only index, so each row costs
one write.

```sql
CREATE TABLE pv_daily (
  day TEXT NOT NULL, surface TEXT NOT NULL, entity TEXT NOT NULL,   -- entity '' = surface total
  views INTEGER NOT NULL, engaged INTEGER NOT NULL, visitors INTEGER NOT NULL,
  new_visitors INTEGER NOT NULL, entries INTEGER NOT NULL, exits INTEGER NOT NULL,
  bounces INTEGER NOT NULL, dwell_ms_sum INTEGER NOT NULL, dwell_ms_p50 INTEGER NOT NULL,
  scroll_sum REAL NOT NULL, reads INTEGER NOT NULL, completed INTEGER NOT NULL,
  clicks INTEGER NOT NULL, metric1_sum REAL NOT NULL, metric2_sum REAL NOT NULL,
  PRIMARY KEY (day, surface, entity)
) WITHOUT ROWID;

CREATE TABLE pv_dim_daily (
  day TEXT NOT NULL, surface TEXT NOT NULL,   -- surface '*' = whole site
  dim TEXT NOT NULL, key TEXT NOT NULL,
  views INTEGER NOT NULL, visitors INTEGER NOT NULL, engaged INTEGER NOT NULL,
  dwell_ms_sum INTEGER NOT NULL,
  PRIMARY KEY (day, surface, dim, key)
) WITHOUT ROWID;

CREATE TABLE click_daily (
  day TEXT NOT NULL, surface TEXT NOT NULL, entity TEXT NOT NULL,
  name TEXT NOT NULL, href TEXT NOT NULL,
  clicks INTEGER NOT NULL, visitors INTEGER NOT NULL,
  PRIMARY KEY (day, surface, entity, name, href)
) WITHOUT ROWID;

CREATE TABLE traffic_daily (
  day TEXT NOT NULL, surface TEXT NOT NULL, class TEXT NOT NULL, reason TEXT NOT NULL,
  views INTEGER NOT NULL, visitors INTEGER NOT NULL,
  PRIMARY KEY (day, surface, class, reason)
) WITHOUT ROWID;

CREATE TABLE period_visitors (
  period TEXT NOT NULL,          -- 'YYYY-MM' or 'YYYY-Www'
  surface TEXT NOT NULL,         -- '*' = whole site
  visitors INTEGER NOT NULL, engaged_visitors INTEGER NOT NULL,
  PRIMARY KEY (period, surface)
) WITHOUT ROWID;

CREATE TABLE rollup_runs (
  day TEXT PRIMARY KEY, status TEXT NOT NULL,   -- 'done' | 'failed'
  view_points INTEGER NOT NULL, click_points INTEGER NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT
) WITHOUT ROWID;
```

**Dimensions in `pv_dim_daily`**
- Surface `*`, top 50 keys each, the rest folded into `(other)`:
  `ref_source`, `ref_host`, `utm_source`, `utm_campaign`, `country`,
  `region`, `browser`, `os`, `device`, `platform`, `lang`, `locale`,
  `viewport` (bucketed: <480, 480–767, 768–1023, 1024–1439, ≥1440),
  `nav_type`, `visitor_type` (new or returning), `hour` (Melbourne 0–23),
  `entry_surface`.
- Each other surface, top 20 keys each: `ref_source`, `ref_host`,
  `country`, `device`.

`click_daily` keeps every `(name, href)` pair with at least one human click,
capped at 200 rows per `(day, surface)`; the rest go to `(other)`.
`pv_daily` and `click_daily` hold human views and clicks only.
`traffic_daily` holds every class.

Expected rows per day: `pv_daily` ~80, `pv_dim_daily` ~450, `click_daily`
~150, `traffic_daily` ~20, for a total of about **700**.

**Cron** (inside the existing hourly handler, site-api
`src/features/analytics/server/site-rollup.ts`):
1. Compute today's date in `Australia/Melbourne`. Candidate days are the
   three days before today.
2. Skip any day whose `rollup_runs.status = 'done'`. Process at most one day
   per run, and only after 01:00 Melbourne, which leaves margin for late
   `pagehide` sends.
3. Convert the day's local bounds to UTC with `Intl` (daylight-saving safe:
   the window is 23, 24 or 25 h), and query WAE with
   `timestamp >= … AND timestamp < …`.
4. Run about 8 SQL API queries (views per view, dims, clicks, traffic), then
   replace the day in one D1 `batch` (`DELETE … WHERE day = ?` +
   `INSERT`s), so a rerun is idempotent.
5. On the first run of a month or ISO week, fill `period_visitors` for the
   finished period from WAE (within its 90 days).
6. Write `rollup_runs`. A failure stores `failed` and is retried by the
   next hourly run. The existing ops alert fires after three failures for
   the same day.

Manual rerun: `GET /api/admin/analytics/rollup?day=YYYY-MM-DD`, behind the
admin session and documented in `endpoints.internal.md`. Use it when a
classification fix needs to be reflected in past days that are still inside
the 90-day window.

## 15. Reports and the portal

One Access-gated read route:
`GET /api/analytics/site?report=<name>&from=YYYY-MM-DD&to=YYYY-MM-DD[&surface=][&entity=]`.
Access-only, like the existing reads (section "Read analytics" in
`docs/api/analytics.md`).

| `report` | Content | Source |
| --- | --- | --- |
| `overview` | Views, engaged, visitors, median dwell, bounce rate per day; surface split | D1, plus WAE for today |
| `pages` | Every surface and entity: views, engaged %, median dwell, scroll, reads, completion, clicks per view, `metric_1` and `metric_2` averages | D1, plus WAE for today |
| `clicks` | For one surface or entity: each `name` and `href`, clicks, visitors, click-through, median `t_ms` | D1 (`click_daily`); `t_ms` from WAE |
| `sources` | `ref_source`, `ref_host`, UTM, entry surfaces | D1 |
| `audience` | Country, region, device, browser, OS, platform, language, viewport, hour, new or returning | D1 |
| `quality` | Views by class and reason per day; first-party human views against Cloudflare RUM page loads per surface | D1, plus the GraphQL `rumPageloadEventsAdaptiveGroups` |
| `log` | Raw views, newest first, 50 per page, filterable by class and surface, each with its clicks | WAE (≤ 90 days) |
| `visitor` | One visitor's views and clicks in order | WAE (≤ 90 days) |

**Unique visitors over a range:**
- one day comes from `pv_daily`;
- a whole calendar month or ISO week comes from `period_visitors`;
- any other range of up to 90 days is a live WAE `COUNT(DISTINCT)`;
- a longer range shows the sum of monthly visitors, labelled as such.

**Cache:** results are held 60 s in isolate memory, keyed by query (the
`read-cache.ts` pattern). The portal spends at most about 10 WAE queries per
screen load.

**Portal** (`src/features/portal/analytics/`): new tabs Site, Pages, Clicks,
Sources, Audience, Quality and Log beside the existing Listening and
Newsletter tabs. The current blog-only tab is removed once Pages covers it.
Following the portal rules on feel and density: rows are 44–52 px with at
most two text styles per line, and the log may stay dense.

## 16. Migrating the blog reading stream

1. **Backfill.** A one-off script, `scripts/analytics/backfill-blog.ts` in
   site-api, reads `blog_analytics_events` (site-notify) and writes
   `pv_daily` rows (`surface = 'blog_post'`, entity = slug) and their
   `pv_dim_daily` rows for every Melbourne day before cutover. Apply the
   same metric definitions; legacy rows have no `interactions`, so engaged
   there means dwell ≥ 10 s only.
2. **Desk reads.** The desk's "Read N times since …" switches to
   `SUM(reads)` and `MIN(day)` from `pv_daily` where
   `surface = 'blog_post'`. Verify the total matches the old figure within
   the backfill day before switching.
3. **Endpoint.** `POST /api/analytics/event` keeps writing D1 for 14 days
   after the site deploy (cached HTML still carries the old beacon). It then
   answers `204` without writing, and is deleted with its docs at 30 days.
   The old read routes `summary`, `events` and `article/{slug}` are deleted
   when the Pages tab ships.
4. **Retention.** At cutover, null `ip`, `city`, `region`, `ua` and
   `as_org` in `blog_analytics_events` for rows older than 90 days. Drop the
   table 90 days after cutover, once the backfill is verified.

## 17. Privacy and docs (same PRs as the code)

- **`src/content/pages/privacy.md`** (the published policy): page and
  click analytics on every page; what is collected (section 7 fields, the
  IP-derived location, the user agent); 90-day raw retention; aggregated
  numbers kept indefinitely; no query strings or form contents.
- **`src/content/docs/platform/privacy.md`:**
  - replace the "Mood pages: nothing from the visitor" row;
  - add a "Site analytics" row;
  - fix "No page mounts a third-party analytics script", which is true of
    the repository but not of the edge-injected Cloudflare and Google tags;
  - add the 90-day line to "How long data is kept".
- **`src/content/docs/api/analytics.md`:**
  - document `collect` (gate, limits, contract, `204`) and the classes;
  - document the `site` report route;
  - remove the "daily share" wording (no such cap exists in site-api's
    `origin/main`);
  - later, remove the retired routes.
- **`src/content/docs/api/endpoints.internal.md`:** the admin rollup rerun
  route.
- **`src/content/docs/architecture.md`:** bindings, the dataset names and
  `site-analytics`.
- Run `SITE_API_REPO=../site-api bun run check:docs-coverage`.

## 18. Rollout

| PR | Repo | Contents | Done when |
| --- | --- | --- | --- |
| 1 | site | Contracts 0.14.0 (section 9); tag `contracts-v0.14.0` | Package published; packument shows 0.14.0 |
| 2 | site-api | Set `CLOUDFLARE_ANALYTICS_TOKEN`; create `site-analytics` and apply 0001; WAE bindings; `collect` route + classifier + tests; raise the contracts pin | `curl` with a buxx.me Origin gets `204`; the point is visible through the SQL API with the right class; p99 CPU < 5 ms |
| 3 | site | `beacon.ts`, layout `analytics` prop, `data-track` attributes (section 10), delete `BlogArticleBeacon`, privacy and API docs, `/legacy` listening surface fix | E2E green; on production, every surface shows views within an hour; the owner's own visit lands as `owner` |
| 4 | site-api + site | Rollup cron, admin rerun route, `site` report route, backfill script; portal tabs | Yesterday's `rollup_runs` is `done`; backfilled blog reads match the old desk total |
| 5 | site-api + site | Retire `/api/analytics/event` (day 14: no-op; day 30: delete) and the old read routes; legacy table retention (section 16) | Docs coverage passes with the routes gone |

Merging to main deploys within about 40 s. In every PR, migrations and
secrets go before the merge.

**Acceptance after 7 days of PR 3:**
- per surface, first-party human views ÷ Cloudflare RUM page loads stays
  between 0.7 and 1.3 every day;
- `bot` stays under 10% of views;
- no `human` view in the log carries a user agent that names a tool.

## 19. Tests

**site-api, `bun test`:**
- Classifier table: each rule, its reason, and the order.
- Owner via cookie: valid, expired, and wrong-audience JWT.
- Contract validation and clamping: oversize strings, more than 20 clicks,
  bad UUIDs.
- The writer maps fields to the frozen slots (a fake `writeDataPoint`
  records calls).
- Melbourne day bounds across both DST transitions (23 h and 25 h days).
- Rollup idempotency: the same day twice gives the same rows.
- Top-N folding into `(other)`.

**site, `bun run test:unit`:**
- Beacon dwell pause and resume under fake timers.
- Session rollover at 30 min.
- `seq` and skip-unchanged.
- Click resolution: `data-track` beats a generic link; ignored regions;
  `position` from `data-track-list`; query stripped from `href`.
- `pageshow` with `persisted` makes a new view.
- The non-production hostname gate.

**site, Playwright (`test:e2e:site`):**
- Route `/api/analytics/collect` with `page.route` and assert payloads on
  `/`, `/mood`, `/mood/<id>`, `/blog`, `/blog/<slug>`, `/docs` and `/404`.
- Open a desk panel by click and by hash; click a feed item; check
  `pagehide` carries the buffered clicks.
- At 320, 375 and 1440 px.

## 20. Open questions

1. **Google Tag Gateway.** It is 181 KB gzipped and about 90% of `/blog`
   script time (perf baseline 2026-09). Does anyone read GA4? If not,
   switch it off in the dashboard.
2. **Global Privacy Control.** Should the beacon skip sending when
   `navigator.globalPrivacyControl` is true? Recommendation: yes. It
   costs a few percent of views and the policy can say so plainly.

## 21. Gaps found while planning

- The desk tonearm (`src/features/desk/client/tonearm.ts:204/:245`) seeks
  without calling `recordSeek()`, so desk listening under-counts seeks.
  This is a listening fix, outside this plan.
- `/legacy` listening reports `surface: 'other'` (fixed in PR 3, section 10).
- Mood comment writes send no comment telemetry, unlike blog comments
  (`/api/v2/comments/telemetry`). They are outside this plan; clicks on them
  are covered here.
