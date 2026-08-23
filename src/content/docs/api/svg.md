---
title: SVG Endpoints
description: Server-rendered badges and cards for GitHub READMEs and anywhere else that only accepts a static image.
group: API
order: 8
badge: SSR
---


All SVG endpoints are server-side rendered Astro API routes exposed at `buxx.me`. They're designed to be embedded in GitHub READMEs and other Markdown files that only support static images.

Use `<picture>` + `<source media="(prefers-color-scheme: ...)">` to switch themes automatically based on the viewer's OS preference (supported by GitHub).

---

## `GET /api/activity-panel.svg`

A stats panel displaying recent GitHub coding activity. Intended to sit alongside the GitHub Stats card.

All values are passed as query parameters — the server renders them verbatim into the SVG. Actual data collection is handled separately by the `sync-recent-activity` GitHub Actions script.

### Parameters

| Parameter  | Type   | Default  | Description                              |
|------------|--------|----------|------------------------------------------|
| `theme`    | string | `dark`   | Color scheme: `dark` or `light`          |
| `days`     | string | `7`      | Length of the activity window (display only) |
| `projects` | string | `0`      | Number of active projects                |
| `commits`  | string | `0`      | Total commits in the window              |
| `added`    | string | `0`      | Lines added (e.g. `+38,501`)             |
| `removed`  | string | `0`      | Lines removed (e.g. `-12,388`)           |
| `net`      | string | `0`      | Net line delta (e.g. `+26,113`)          |
| `lph`      | string | `0`      | Average lines per hour (e.g. `+155`)     |
| `exp`      | string | —        | Unix expiry timestamp for signed access when auth is enabled |
| `sig`      | string | —        | HMAC signature for signed access when auth is enabled |

### Rows rendered

1. `activity scan` — `last {days} days`
2. `active projects` — `{projects}`
3. `total commits` — `{commits}`
4. `code delta` — `{added}` / `{removed}` / net `{net}` (green/red/neutral colored)
5. `avg output` — `{lph} lines/hr`

**Dimensions:** 330 × 142px (height is computed: `paddingY×2 + rows×22`)
**Cache:** `public, max-age=300, s-maxage=300` (5 minutes)
**Animation:** Each row fades in with a staggered 80ms delay
**Auth:** When `ACTIVITY_PANEL_SIGNING_SECRET` is configured, requests must include valid `exp` and `sig` values.

### Example (GitHub README)

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://buxx.me/api/activity-panel.svg?theme=dark&days=7&projects=11&commits=167&added=%2B38%2C501&removed=-12%2C388&net=%2B26%2C113&lph=%2B155">
  <source media="(prefers-color-scheme: light)" srcset="https://buxx.me/api/activity-panel.svg?theme=light&days=7&projects=11&commits=167&added=%2B38%2C501&removed=-12%2C388&net=%2B26%2C113&lph=%2B155">
  <img height="155" src="https://buxx.me/api/activity-panel.svg?theme=dark&days=7&projects=11&commits=167&added=%2B38%2C501&removed=-12%2C388&net=%2B26%2C113&lph=%2B155" alt="Recent Activity Stats" />
</picture>
```

---

## `GET /api/status.svg`

An animated badge showing a rotating status word with a pulsing green dot.

### Parameters

| Parameter | Type   | Default | Description                     |
|-----------|--------|---------|---------------------------------|
| `theme`   | string | `dark`  | Color scheme: `dark` or `light` |

**Dimensions:** 200 × 40px
**Cache:** `public, max-age=10, s-maxage=10` (10 seconds)
**Animation:** Pulsing dot; status word rotates every 10 seconds based on server time (25 words in pool)

### Example

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://buxx.me/api/status.svg?theme=dark">
  <source media="(prefers-color-scheme: light)" srcset="https://buxx.me/api/status.svg?theme=light">
  <img src="https://buxx.me/api/status.svg?theme=dark" alt="Status" />
</picture>
```

---

## `GET /api/site-badge.svg`

A compact badge linking to buxx.me, with an arrow icon.

### Parameters

| Parameter | Type   | Default   | Description                                        |
|-----------|--------|-----------|----------------------------------------------------|
| `theme`   | string | `dark`    | Color scheme: `dark`, `light`, `glass`, or `neon`  |
| `style`   | string | `default` | Visual style: `default`, `gradient`, `glass`, `neon` |

**Dimensions:** 130 × 32px
**Cache:** `public, max-age=86400` (24 hours)

### Example

```html
<a href="https://buxx.me">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://buxx.me/api/site-badge.svg?theme=dark">
    <source media="(prefers-color-scheme: light)" srcset="https://buxx.me/api/site-badge.svg?theme=light">
    <img src="https://buxx.me/api/site-badge.svg?theme=dark" alt="Visit buxx.me" height="32" />
  </picture>
</a>
```

---

## `GET /api/project.svg`

A project card with live GitHub star count, description, role badge, and technology tags. Fetches data from the GitHub GraphQL API at request time.

### Parameters

| Parameter | Type   | Default | Description                     |
|-----------|--------|---------|---------------------------------|
| `project` | string | —       | Project key (required, see below) |
| `theme`   | string | `dark`  | Color scheme: `dark` or `light` |

### Available project keys

| Key              | Repository                      |
|------------------|---------------------------------|
| `tutubetterrules`| bunizao/TutuBetterRules         |
| `attegi`         | bunizao/Attegi                  |
| `mirrored`       | bunizao/mirrored                |
| `ogis`           | bunizao/ogis                    |
| `always-attend`  | bunizao/always-attend           |

**Dimensions:** 400 × 160px
**Cache:** `public, max-age=3600` (1 hour)
**Note:** Requires `GITHUB_TOKEN` env var with repository read access for live star counts.

### Example

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://buxx.me/api/project.svg?project=tutubetterrules&theme=dark">
  <source media="(prefers-color-scheme: light)" srcset="https://buxx.me/api/project.svg?project=tutubetterrules&theme=light">
  <img src="https://buxx.me/api/project.svg?project=tutubetterrules&theme=dark" alt="TutuBetterRules" />
</picture>
```

---

## `GET /api/tech-stack.svg`

An infinite-scrolling horizontal marquee of technology tags.

### Parameters

| Parameter | Type   | Default | Description                     |
|-----------|--------|---------|---------------------------------|
| `theme`   | string | `dark`  | Color scheme: `dark` or `light` |

**Dimensions:** 800 × 60px
**Cache:** `public, max-age=3600` (1 hour)
**Animation:** Continuous left scroll; the tag list is duplicated to ensure seamless looping

### Example

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://buxx.me/api/tech-stack.svg?theme=dark">
  <source media="(prefers-color-scheme: light)" srcset="https://buxx.me/api/tech-stack.svg?theme=light">
  <img src="https://buxx.me/api/tech-stack.svg?theme=dark" alt="Tech Stack" />
</picture>
```

---

## `GET /logo/{id}.svg`

The site's pixel-art marks, used as favicons and wherever the logo appears as
an image. Prerendered static files, not SSR like the badges above — which is
why they are the one SVG family served from `buxx.me` directly rather than
through `/api`.

| `id` | Mark | Served by |
| --- | --- | --- |
| `tutu` | Blue accent (`oklch(0.7 0.12 240)`), 12 × 14 grid | both Workers |
| `peek` | Red accent (`oklch(0.62 0.13 25)`), 12 × 9 grid | both Workers |
| `tutu-dev`, `peek-dev` | Same marks on a fixed amber tile (`#f59e0b`) | `site` only |

**Cache:** `public, max-age=31536000, immutable` — they are content-stable and
cached for a year.

The `-dev` variants exist so a local dev tab is visually distinguishable from
production at favicon size. They are only built by the `site` Worker;
`api.buxx.me/logo/tutu-dev.svg` does not exist.

Two details matter if you embed these anywhere other than a favicon:

- **No `width` or `height` attributes.** Only a `viewBox`, so the mark scales to
  whatever box you put it in and will happily render enormous inside a
  container with no constraint. Set a size on the `<img>`.
- **The non-`dev` marks are theme-reactive.** The foreground is a
  `var(--favicon-fg)` driven by a `prefers-color-scheme` media query inside the
  SVG, flipping between `#0a0a0a` and `#fafafa`. That means they invert with the
  viewer's OS theme with no `<picture>` element needed — but also that they will
  disappear against a background matching the viewer's theme. The `-dev`
  variants are fixed-color and do not do this.

Any other `id` is a `404` from the static asset layer, not from a handler.

---

## Errors and validation

None of the badge endpoints validate their query parameters in the way you
might expect. Bad input almost never produces a `4xx`:

| Endpoint | Bad input behavior |
| --- | --- |
| `activity-panel.svg` | Every value is rendered verbatim. No numeric parsing, no clamping. |
| `status.svg`, `tech-stack.svg`, `project.svg` | `theme` is `light` only on an exact match; every other value, including a typo like `Light`, silently means `dark`. |
| `site-badge.svg` | Unknown `theme` falls back to `dark`; unknown `style` behaves as `default`. |
| `project.svg` | Unknown `project` is the one real error: `404` with a plain-text `Project not found` body. |

`activity-panel.svg` returns `401 Unauthorized` (plain text,
`Cache-Control: private, no-store`) when `ACTIVITY_PANEL_SIGNING_SECRET` is set
and `sig`/`exp` do not verify. When that secret is **not** set the signature
check is skipped entirely and the endpoint is open — which is the deployed
state unless the secret has been configured.

Every SVG response carries a locked-down header set:

```
Content-Type: image/svg+xml; charset=utf-8
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; font-src 'self';
```

No `Access-Control-Allow-Origin`, no `ETag`, no `Vary`. The CSP is what makes
it safe to serve caller-influenced text inside an SVG document: no script, no
external fetches, inline styles only.

`project.svg` fetches its star count from GitHub on every cache miss and
swallows every failure — an outage, a rate limit, or a missing token all
produce a card with the star count simply absent, never an error response.

## Theme Colors

### Dark

| Role       | Color     |
|------------|-----------|
| Background | `#0d1117` |
| Border     | `#30363d` |
| Text       | `#fafafa` |
| Label/muted| `#525252` |
| Green      | `#3fb950` |
| Red        | `#f85149` |

### Light

| Role       | Color     |
|------------|-----------|
| Background | `#ffffff` |
| Border     | `#e5e5e5` |
| Text       | `#171717` |
| Label/muted| `#a3a3a3` |
| Green      | `#16a34a` |
| Red        | `#dc2626` |

> Note: `tech-stack.svg` and `site-badge.svg` use slightly different palettes internally (`#0a0a0a` bg, `#262626` border).

---

## Common Notes

- All endpoints are SSR — no prerendering, no static files.
- SVGs use the shared `FONT_CODE` server stack from `src/lib/fonts.ts`, the server-side mirror of the CSS `--font-code` token.
- GitHub proxies embedded images through [Camo](https://github.com/atmos/camo), which respects `Cache-Control` headers. A 5-minute TTL means updates propagate within ~5 minutes.
- SVG animations (`@keyframes`) work in GitHub's Markdown renderer as of 2024, but may not display in some third-party Markdown viewers.
- The `activity-panel.svg` endpoint does **not** fetch live data — all values come from query parameters. The GitHub Actions workflow in `bunizao/bunizao` is responsible for computing and injecting the correct values on a schedule.
