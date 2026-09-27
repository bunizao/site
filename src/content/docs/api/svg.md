---
title: SVG Endpoints
description: Server-rendered SVG badges and cards for GitHub READMEs and anywhere that only accepts a static image.
group: API
order: 8
badge: SSR
---


These endpoints are Astro API routes that render SVG badges and cards on the
server, served at `buxx.me`. Use them in GitHub READMEs and other Markdown files
that only support static images.

To follow the viewer's OS theme, wrap the image in `<picture>` and add a
`<source media="(prefers-color-scheme: ...)">` for each theme. GitHub supports
this.

## `GET /api/activity-panel.svg`

A stats panel of recent GitHub coding activity, made to sit next to the GitHub
Stats card.

The panel does not fetch live data. Every value comes from the query string,
and the server renders it as XML-escaped text with no parsing. The
`sync-recent-activity` GitHub Actions script collects the data. The GitHub
Actions workflow in `bunizao/bunizao` computes the values and writes them into
the URL on a schedule.

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
| `exp`      | string | None     | Unix expiry timestamp, when signing is on |
| `sig`      | string | None     | HMAC signature, when signing is on       |

### Rows rendered

| Row | Value |
| --- | --- |
| `activity scan` | `last {days} days` |
| `active projects` | `{projects}` |
| `total commits` | `{commits}` |
| `code delta` | `{added}` / `{removed}` / net `{net}`, colored green, red and neutral |
| `avg output` | `{lph} lines/hr` |

- **Size:** 330 × 142px. The height is computed as `paddingY×2 + rows×22`.
- **Cache:** `public, max-age=300, s-maxage=300` (5 minutes).
- **Animation:** each row fades in, staggered by 80ms.

### Signed URLs

When `ACTIVITY_PANEL_SIGNING_SECRET` is configured, every request must include
valid `exp` and `sig` values. `sig` is the base64url HMAC-SHA256 of the public
path `/api/activity-panel.svg` plus the query sorted by key, with `exp`
included and `sig` left out.

The host is not signed, so a URL signed for `buxx.me` also verifies on
`api.buxx.me`. An `exp` in the past fails.

### Example (GitHub README)

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://buxx.me/api/activity-panel.svg?theme=dark&days=7&projects=11&commits=167&added=%2B38%2C501&removed=-12%2C388&net=%2B26%2C113&lph=%2B155">
  <source media="(prefers-color-scheme: light)" srcset="https://buxx.me/api/activity-panel.svg?theme=light&days=7&projects=11&commits=167&added=%2B38%2C501&removed=-12%2C388&net=%2B26%2C113&lph=%2B155">
  <img height="155" src="https://buxx.me/api/activity-panel.svg?theme=dark&days=7&projects=11&commits=167&added=%2B38%2C501&removed=-12%2C388&net=%2B26%2C113&lph=%2B155" alt="Recent Activity Stats" />
</picture>
```

## `GET /api/status.svg`

An animated badge: a pulsing green dot next to a rotating status word.

### Parameters

| Parameter | Type   | Default | Description                     |
|-----------|--------|---------|---------------------------------|
| `theme`   | string | `dark`  | Color scheme: `dark` or `light` |

- **Size:** 200 × 40px.
- **Cache:** `public, max-age=3600, s-maxage=86400` (1 hour in the browser).
- **Animation:** the dot pulses. All 25 status words are in the SVG, and a CSS
  animation shows each one for 10 seconds in turn, starting from the first
  word when the image loads. A renderer that ignores CSS animation shows only
  the first word.

The Cloudflare edge header (`Cloudflare-CDN-Cache-Control`) is `public, max-age=86400,
stale-while-revalidate=604800, stale-if-error=86400`. The SVG no longer depends
on the request time, so the edge can keep it for a day. The private Worker's
platform cache is enabled.

### Example

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://buxx.me/api/status.svg?theme=dark">
  <source media="(prefers-color-scheme: light)" srcset="https://buxx.me/api/status.svg?theme=light">
  <img src="https://buxx.me/api/status.svg?theme=dark" alt="Status" />
</picture>
```

## `GET /api/site-badge.svg`

A compact badge for linking to buxx.me, with an arrow icon.

### Parameters

| Parameter | Type   | Default   | Description                                        |
|-----------|--------|-----------|----------------------------------------------------|
| `theme`   | string | `dark`    | Color scheme: `dark`, `light`, `glass`, or `neon`  |
| `style`   | string | `default` | Visual style: `default`, `gradient`, `glass`, or `neon` |

- **Size:** 130 × 32px.
- **Cache:** `public, max-age=86400` (24 hours).
- **Edge cache:** the Cloudflare edge header keeps `max-age=86400` and adds
  `stale-while-revalidate=3600, stale-if-error=3600`.

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

## `GET /api/project.svg`

A project card with a live GitHub star count, description, role badge, and
technology tags. The endpoint fetches data from the GitHub GraphQL API at
request time.

### Parameters

| Parameter | Type   | Default | Description                     |
|-----------|--------|---------|---------------------------------|
| `project` | string | None    | Project key. Required; see below. |
| `theme`   | string | `dark`  | Color scheme: `dark` or `light` |

### Available project keys

| Key              | Repository                      |
|------------------|---------------------------------|
| `tutubetterrules`| bunizao/TutuBetterRules         |
| `attegi`         | bunizao/Attegi                  |
| `mirrored`       | bunizao/mirrored                |
| `ogis`           | bunizao/ogis                    |
| `always-attend`  | bunizao/always-attend           |

- **Size:** 400 × 160px.
- **Cache:** `public, max-age=3600` (1 hour).
- **Edge cache:** the Cloudflare edge header is `max-age=21600` (6 hours) with
  `stale-while-revalidate=86400, stale-if-error=86400`. Each colo calls GitHub
  at most every six hours, so star counts can lag by that much.
- **Requires:** a `GITHUB_TOKEN` env var with repository read access for live
  star counts.

### Example

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://buxx.me/api/project.svg?project=tutubetterrules&theme=dark">
  <source media="(prefers-color-scheme: light)" srcset="https://buxx.me/api/project.svg?project=tutubetterrules&theme=light">
  <img src="https://buxx.me/api/project.svg?project=tutubetterrules&theme=dark" alt="TutuBetterRules" />
</picture>
```

## `GET /api/tech-stack.svg`

A horizontal marquee of technology tags that scrolls forever.

### Parameters

| Parameter | Type   | Default | Description                     |
|-----------|--------|---------|---------------------------------|
| `theme`   | string | `dark`  | Color scheme: `dark` or `light` |

- **Size:** 800 × 60px.
- **Cache:** `public, max-age=86400, s-maxage=86400` (24 hours).
- **Animation:** scrolls left continuously. The tag list is duplicated so the
  loop has no visible seam.

The SVG depends only on `theme`, so the Cloudflare edge header is
`max-age=604800` (7 days) with `stale-while-revalidate=86400,
stale-if-error=86400`. A deploy starts a fresh cache.

### Example

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://buxx.me/api/tech-stack.svg?theme=dark">
  <source media="(prefers-color-scheme: light)" srcset="https://buxx.me/api/tech-stack.svg?theme=light">
  <img src="https://buxx.me/api/tech-stack.svg?theme=dark" alt="Tech Stack" />
</picture>
```

## `GET /logo/{id}.svg`

The site's pixel-art marks, used as favicons and wherever the logo appears as
an image. These are prerendered static files, unlike the SSR badges above.
That is why they are the one SVG family served from `buxx.me` directly instead
of through `/api`.

| `id` | Mark | Served by |
| --- | --- | --- |
| `tutu` | Blue accent (`oklch(0.7 0.12 240)`), 12 × 14 grid | both Workers |
| `peek` | Red accent (`oklch(0.62 0.13 25)`), 12 × 9 grid | both Workers |
| `tutu-dev`, `peek-dev` | Same marks on a fixed amber tile (`#f59e0b`) | `site` only |

**Cache:** `public, max-age=31536000, immutable`. The content never changes,
so the files are cached for a year.

The `-dev` variants make a local dev tab easy to tell apart from production at
favicon size. Only the `site` Worker builds them, so
`api.buxx.me/logo/tutu-dev.svg` does not exist.

If you embed these anywhere other than a favicon, two details matter:

- **No `width` or `height` attributes.** The SVG has only a `viewBox`, so the
  mark scales to whatever box you put it in. In a container with no size limit
  it renders very large. Set a size on the `<img>`.
- **The non-`dev` marks follow the theme.** The foreground is a
  `var(--favicon-fg)` set by a `prefers-color-scheme` media query inside the
  SVG, which switches between `#0a0a0a` and `#fafafa`. The mark inverts with
  the viewer's OS theme without a `<picture>` element. It also disappears on a
  background that matches the viewer's theme. The `-dev` variants use fixed
  colors and do not switch.

For any other `id`, the static asset layer returns a `404`. No handler runs.

## Errors and validation

The badge endpoints barely validate their query parameters. Bad input almost
never produces a `4xx`:

| Endpoint | Bad input behavior |
| --- | --- |
| `activity-panel.svg` | Every value is rendered as escaped text. No numeric parsing, no clamping. |
| `status.svg`, `tech-stack.svg`, `project.svg` | `theme` is `light` only on an exact match. Any other value, including a typo like `Light`, means `dark`. |
| `site-badge.svg` | An unknown `theme` falls back to `dark`. An unknown `style` behaves as `default`. |
| `project.svg` | An unknown `project` is the one real error: `404` with a plain-text `Project not found` body. |

`activity-panel.svg` returns `401 Unauthorized` (plain text,
`Cache-Control: private, no-store`) when `ACTIVITY_PANEL_SIGNING_SECRET` is set
and `sig`/`exp` do not verify. When that secret is **not** set, the endpoint
skips the signature check and is open to anyone.

Every SVG response has the same locked-down headers:

```
Content-Type: image/svg+xml; charset=utf-8
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; font-src 'self';
```

There is no `Access-Control-Allow-Origin`, no `ETag`, and no `Vary`. The CSP is
what makes it safe to put caller-supplied text inside an SVG document: no
script, no external fetches, inline styles only.

`project.svg` fetches its star count from GitHub on every cache miss and
swallows every failure. An outage, a rate limit, or a missing token all produce
a card without the star count, never an error response.

## Theme colors

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

`tech-stack.svg` and `site-badge.svg` use slightly different palettes
internally (`#0a0a0a` background, `#262626` border).

## Common notes

- The `/api` endpoints are all SSR: no prerendering, no static files.
- SVGs use the shared `FONT_CODE` server font stack from `src/lib/fonts.ts`,
  the server-side mirror of the CSS `--font-code` token.
- GitHub proxies embedded images through [Camo](https://github.com/atmos/camo),
  which respects `Cache-Control` headers. With a 5-minute TTL, updates show up
  within about 5 minutes.
- SVG animations (`@keyframes`) work in GitHub's Markdown renderer as of 2024.
  Some third-party Markdown viewers may not show them.
