# Blog Analytics Engine

Status: **proposed** (2026-06-27) · Owner: bunizao

First-party reading analytics for `/blog/[slug]`. Self-hosted on Cloudflare D1, no
third-party script for the source of truth. Optional GA4-via-Zaraz as a secondary
dashboard only.

## Decision

- **D1 is the engine, not Analytics Engine.** Blog traffic is low-volume. AE's design
  (adaptive sampling, ~90-day retention, no native dashboard, query-only via SQL API)
  is all cost and no benefit at this scale. D1 gives exact numbers, unlimited retention,
  a dashboard we fully control, and we already run D1 in `site-api`.
- **One row per page view**, finalized incrementally via UPSERT on `event_id`. Granular
  enough to answer "IP X, browser Y, opened article Z at time T, read N seconds, ref R".
- **Server derives identity signals** (IP, geo, ASN, UA, language). The client only sends
  what the server cannot know: dwell time, scroll depth, slug, anonymous visitor/session id.
- **Ingest + storage + admin read API live in `site-api`** (private worker, owns D1 and the
  public/private boundary). The beacon script lives in `site`. The dashboard page lives in
  `site` under `/dev/portal/analytics`, behind the existing Cloudflare Access gate.

## Goals

- Per-view raw record: who (IP/geo/UA/platform), what (slug), when (timestamp), how long
  (focused dwell seconds), how far (scroll depth), where from (referrer + parsed source).
- Platform attribution that distinguishes in-app browsers (WeChat, Weibo, QQ) from real
  browsers (Safari, Chrome, Firefox, Edge) and OS/device class.
- Aggregates: total views, unique visitors, average reading time, per-visitor average,
  completion rate, plus breakdowns by article / platform / geo / referrer / day.
- All of it visible in the `/dev/portal` admin, queryable in dev, owned by us.

## Non-Goals

- Real-time streaming dashboards. Hourly/daily freshness is fine.
- Cross-site or cross-device user identity. `visitor_id` is an anonymous per-browser id.
- Replacing GA4 for marketing/acquisition reporting. GA4 (via Zaraz) is an optional add-on,
  never the source of truth.
- Tracking anything outside `/blog/*` in phase one.

## Data Model

One table in the existing `MOOD_DB`/notify D1 (decision below in Open Questions — likely a
new dedicated migration on the notify DB). Raw, append-then-update, one row per view.

```sql
CREATE TABLE IF NOT EXISTS blog_events (
  event_id     TEXT PRIMARY KEY,            -- client-generated UUID per page view
  slug         TEXT NOT NULL,               -- article identifier
  visitor_id   TEXT NOT NULL,               -- anonymous, localStorage, per-browser
  session_id   TEXT,                        -- anonymous, sessionStorage, per-tab session
  opened_at    TEXT NOT NULL,               -- ISO, server receive time of first beacon
  dwell_ms     INTEGER NOT NULL DEFAULT 0,  -- accumulated FOCUSED time, not wall-clock
  scroll_depth REAL    NOT NULL DEFAULT 0,  -- 0..1, max reached
  completed    INTEGER NOT NULL DEFAULT 0,  -- 1 if scroll_depth crossed completion threshold

  -- server-derived identity (client never supplies these)
  ip           TEXT,                        -- CF-Connecting-IP (PII, see Retention)
  country      TEXT,                        -- request.cf.country
  region       TEXT,                        -- request.cf.region
  city         TEXT,                        -- request.cf.city
  asn          INTEGER,                     -- request.cf.asn
  as_org       TEXT,                        -- request.cf.asOrganization
  colo         TEXT,                        -- request.cf.colo (edge PoP)
  ua           TEXT,                        -- raw User-Agent header
  browser      TEXT,                        -- parsed: safari/chrome/firefox/edge/wechat/...
  os           TEXT,                        -- parsed: ios/android/macos/windows/linux
  device_type  TEXT,                        -- mobile/tablet/desktop
  platform     TEXT,                        -- normalized channel for grouping (see Parsing)
  lang         TEXT,                        -- Accept-Language primary tag

  -- referrer (client supplies document.referrer; server also sees Referer)
  referrer     TEXT,                        -- raw referrer URL or null
  ref_source   TEXT,                        -- parsed: direct/telegram/search/twitter/internal/external

  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS blog_events_slug_idx    ON blog_events (slug);
CREATE INDEX IF NOT EXISTS blog_events_opened_idx  ON blog_events (opened_at DESC);
CREATE INDEX IF NOT EXISTS blog_events_visitor_idx ON blog_events (visitor_id);
CREATE INDEX IF NOT EXISTS blog_events_platform_idx ON blog_events (platform);
```

Optional phase-two rollup so raw rows can be pruned without losing history:

```sql
CREATE TABLE IF NOT EXISTS blog_daily_stats (
  day          TEXT NOT NULL,   -- YYYY-MM-DD (UTC)
  slug         TEXT NOT NULL,
  views        INTEGER NOT NULL DEFAULT 0,
  uniques      INTEGER NOT NULL DEFAULT 0,
  reads        INTEGER NOT NULL DEFAULT 0,   -- views with dwell >= read threshold
  dwell_ms_sum INTEGER NOT NULL DEFAULT 0,
  completes    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, slug)
);
```

## Event Lifecycle (Client)

A small inline script in the blog article layout. No dependency.

1. On load: generate `event_id` (UUID). Read/create `visitor_id` from `localStorage` and
   `session_id` from `sessionStorage`. Record `start`.
2. Measure **focused** dwell only, via the Page Visibility API: accumulate elapsed time
   while `document.visibilityState === 'visible'`; pause on `hidden`. This excludes
   background tabs and idle-after-switch time. Track max scroll depth on scroll.
3. Send a beacon (`navigator.sendBeacon`, POST JSON) at:
   - **load** — `dwell_ms: 0`. Guarantees the open is recorded even on an instant bounce.
   - **`visibilitychange` -> hidden** and **`pagehide`** — current accumulated dwell + max
     scroll. `visibilitychange->hidden` is the reliable mobile signal; `pagehide` covers
     desktop unload. Both carry the same `event_id`, so the server UPSERTs.
4. Server keeps `max(dwell_ms)` and `max(scroll_depth)` per `event_id`, so resends never
   shrink a value and the final state is whatever the longest-lived beacon reported.

Write volume: ~2-3 beacons per view. At 1,000 views/day that is ~3,000 writes/day against
the D1 free ceiling of 100,000 writes/day. Non-issue.

## Ingest Endpoint (Server, `site-api`)

`POST /api/analytics/event` — public, unauthenticated (anyone can beacon), so it is
validation-hardened rather than auth-gated.

Body (client-controlled, untrusted): `{ eventId, slug, visitorId, sessionId, dwellMs,
scrollDepth, completed, referrer }`.

Server-derived (authoritative):

- `ip` = `CF-Connecting-IP` header.
- geo/network = `request.cf`: `country`, `region`, `city`, `asn`, `asOrganization`, `colo`.
- `ua` = `User-Agent` header -> parsed into `browser`/`os`/`device_type`/`platform`.
- `lang` = first tag of `Accept-Language`.
- `opened_at` = server receive time (ISO).

Hardening:

- **Origin check**: reject unless `Origin`/`Referer` is `buxx.me`.
- **Bot filter**: drop UAs matching `bot|spider|crawl|slurp|preview|facebookexternalhit`,
  and requests with no `visitor_id`.
- **Field validation**: clamp `dwellMs` to `[0, 2h]`, `scrollDepth` to `[0,1]`; cap `slug`
  length; require `eventId` to be a UUID; ignore any client-sent identity fields.
- **Body size cap**; reject oversized payloads.
- **Light per-IP rate limit** (KV counter or accept-and-validate). Low stakes for a blog.

Write: `INSERT ... ON CONFLICT(event_id) DO UPDATE SET dwell_ms = max(...), scroll_depth =
max(...), completed = max(...), updated_at = now`.

## UA / Platform Parsing

Server-side, stored normalized so grouping is cheap. Classification order (first match wins):

| Check | `platform` |
| --- | --- |
| `bot\|spider\|crawl\|slurp\|preview` | filtered (not stored) |
| `MicroMessenger` | `wechat` (`wechat_mini` if `miniProgram`) |
| `Weibo` | `weibo` |
| `QQ/` or `MQQBrowser` | `qq` |
| `DingTalk` | `dingtalk` |
| `Edg` | `edge` |
| `CriOS` or (`Chrome` and not `Edg`) | `chrome` |
| `FxiOS` or `Firefox` | `firefox` |
| `Safari` (fallback, none of the above) | `safari` |
| else | `other` |

- `os`: `iPhone\|iPad\|iPod`->ios, `Android`->android, `Mac OS X`->macos, `Windows`->windows, else linux/other.
- `device_type`: `Mobile`->mobile, `iPad\|Tablet`->tablet, else desktop.
- **Why both `browser` and `platform`**: on iOS everything is WebKit, so "is this WeChat's
  in-app browser or real Safari" is answerable only by the `MicroMessenger` token. `platform`
  is the normalized channel for reporting; `ua` is kept raw for forensic re-parsing.

`ref_source` from referrer host: empty->`direct`, `t.me`->`telegram`, `google.\|bing.\|
duckduckgo.`->`search`, `twitter.\|x.com`->`twitter`, own domain->`internal`, else
`external` (host retained in `referrer`). Note: in-app browsers often strip the referrer, so
platform attribution leans on UA while `ref_source` leans on referrer — both are stored.

## Metrics & Aggregations

Definitions (so the dashboard numbers are unambiguous):

- **View / 打开**: any row. `COUNT(*)`.
- **Read / 阅读**: rows with `dwell_ms >= READ_THRESHOLD` (default 5s). Separates real reads
  from instant bounces.
- **Unique visitors**: `COUNT(DISTINCT visitor_id)`.
- **Average reading time**: `AVG(dwell_ms)` over reads (configurable: all views vs reads).
- **Per-visitor average**: total dwell / distinct visitors, i.e. how long an individual
  person reads on average across their visits.
- **Completion rate**: `AVG(completed)` or `AVG(scroll_depth)`.
- **Median dwell**: SQLite has no builtin; compute in JS from a bounded result set, or
  approximate via percentile bucketing.

Dashboard queries:

- Overview cards: total views, total reads, unique visitors, avg reading time, per-visitor avg.
- Per-article table: slug, views, uniques, reads, avg dwell, completion, top platform.
- Breakdowns: `GROUP BY platform` / `country` / `ref_source`.
- Time series: `GROUP BY date(opened_at)`.
- **Raw event log** (the granular requirement): latest N rows rendered as
  "`{ip}` · `{platform}/{os}` · opened `{slug}` at `{opened_at}` · read `{dwell}`s ·
  ref `{ref_source}`". This is the literal "user X on browser Y opened article Z" view.

## Surfaces & Repo Split

| Piece | Repo | Path |
| --- | --- | --- |
| Migration `0004_blog_events.sql` | `site-api` | `migrations/` |
| Ingest route `POST /api/analytics/event` | `site-api` | worker routes |
| Admin read API `GET /api/analytics/summary`, `/api/analytics/events` | `site-api` | worker routes, **Access-gated** |
| Beacon script | `site` | blog article layout (`src/features/posts/ui` or inline in `/blog/[slug]`) |
| Dashboard page | `site` | `src/pages/dev/portal/analytics.astro` |

- Ingest is public + hardened. **Admin read endpoints must verify the Cloudflare Access JWT**
  (reuse the existing `CLOUDFLARE_ACCESS_*` admin auth in `site-api`) — they expose IPs and
  must never be public.
- The dashboard is served from `buxx.me` for the Access cookie origin, consistent with the
  existing `/dev/portal` pages.

## Privacy & Retention

- `ip` and `ua` are PII. `PRIVACY-POLICY.md` must disclose first-party reading analytics
  (what is collected, why, retention).
- **Anonymization cron** (phase two): after a configurable window (e.g. 90 days), null `ip`
  and `ua` while keeping `country`/`asn`/`platform`. Aggregates survive; identifiers do not.
- `visitor_id` is a random anonymous token, per-browser, not linked to any account. No
  cross-site tracking, no cookies beyond first-party storage.
- Consider honoring DNT / a lightweight opt-out if disclosed.

## Cost

D1 free tier: 100k writes/day, 5M reads/day, 5GB storage. At ~3k writes/day and KB-scale
rows, the engine sits at ~1-3% of free limits with years of runway. Per-row billing is real
but irrelevant at this scale.

## GA4 via Zaraz (Optional, Secondary)

If the polished Google console is wanted: inject GA4 through **Zaraz** (Cloudflare's edge
tag loader), not a raw `gtag` `<script>`. Zaraz loads GA4 server-side through the edge —
better performance, partial ad-block resilience, built-in consent tooling. GA4 stays a
secondary view: it anonymizes IP, is ad-blocked (~30-40% loss), and its data lives in
Google, not the dev portal. Never the source of truth.

Production intentionally uses Cloudflare Google Tag Gateway automatic tag insertion
for `/gmetrics/` alongside Cloudflare Web Analytics. The CSP allows the exact
first-party gateway path and Cloudflare Insights script host. The repository must
not add its own loader while control-plane injection is active because that would
double-load the tag.

## Rollout

1. **Phase 1 — core engine.** Migration + ingest endpoint + UA/ref parsing + beacon script.
   Verify rows land with correct geo/platform on real devices (Safari, WeChat in-app, desktop).
2. **Phase 2 — dashboard.** Access-gated admin read API + `/dev/portal/analytics` page with
   overview cards, per-article table, breakdowns, and the raw event log.
3. **Phase 3 — hardening.** Anonymization cron, optional `blog_daily_stats` rollup, privacy
   policy update.
4. **Phase 4 — optional.** GA4 via Zaraz if a marketing-grade dashboard is wanted.

## Open Questions

- **Which D1?** Reuse `site-notify` (admin/portal data already there) or `site-mood`, or a
  new `site-analytics` database. Leaning `site-notify` since the portal already binds it.
- **Read threshold** for "阅读" vs "打开": default 5s — confirm.
- **Average reading time basis**: over reads (excludes bounces) or over all views? Leaning reads.
- **IP retention window** before anonymization: 90 days? Or keep raw indefinitely on a
  single-author private portal?
- **Bounce open beacon**: keep the load-time `dwell:0` beacon (accurate open counts, +1 write
  per view) or drop it and accept losing instant-bounce records? Leaning keep.
