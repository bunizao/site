---
title: SVG API
description: Server-rendered SVG endpoints designed to drop into a GitHub README without a build step.
public: true
---

Every endpoint here is a server-rendered Astro API route. They're intended for GitHub READMEs and other Markdown surfaces that only support static images. All accept a `theme` query parameter (`dark` or `light`), and most pair well with `<picture>` + `<source media="(prefers-color-scheme: ...)">` for automatic theme switching.

## Endpoints

### `GET /api/activity-panel.svg`

A stats panel with recent GitHub coding activity. All values come from query parameters — the SVG renders them verbatim. Actual data collection happens out-of-band via the `sync-recent-activity` GitHub Actions script in `bunizao/bunizao`.

| Parameter | Default | Description |
| --- | --- | --- |
| `theme` | `dark` | `dark` or `light`. |
| `days` | `7` | Activity window length (display only). |
| `projects` | `0` | Number of active projects. |
| `commits` | `0` | Total commits in the window. |
| `added` | `0` | Lines added (e.g. `+38,501`). |
| `removed` | `0` | Lines removed (e.g. `-12,388`). |
| `net` | `0` | Net delta (e.g. `+26,113`). |
| `lph` | `0` | Average lines per hour. |
| `exp`, `sig` | — | Unix expiry + HMAC signature for signed access when `ACTIVITY_PANEL_SIGNING_SECRET` is set. |

Dimensions: 330 × 142px (height computed from row count). Cache: `public, max-age=300, s-maxage=300`. Each row fades in with an 80ms stagger.

### `GET /api/status.svg`

Animated badge with a rotating status word and a pulsing green dot. The word rotates every 10s based on server time (25 in the pool).

Dimensions: 200 × 40px. Cache: `public, max-age=10, s-maxage=10`.

### `GET /api/site-badge.svg`

Compact badge that links to buxx.me, with an arrow icon.

| Parameter | Default | Description |
| --- | --- | --- |
| `theme` | `dark` | `dark`, `light`, `glass`, or `neon`. |
| `style` | `default` | `default`, `gradient`, `glass`, `neon`. |

Dimensions: 130 × 32px. Cache: `public, max-age=86400`.

### `GET /api/project.svg`

Project card with live GitHub star count, description, role badge, and tech tags. Fetches data from the GitHub GraphQL API at request time. Requires `GITHUB_TOKEN` for live counts.

| Parameter | Required | Description |
| --- | --- | --- |
| `project` | yes | Project key. |
| `theme` | no | `dark` (default) or `light`. |

Available project keys: `tutubetterrules`, `attegi`, `mirrored`, `ogis`, `always-attend`. Each maps to a `bunizao/*` repository.

Dimensions: 400 × 160px. Cache: `public, max-age=3600`.

### `GET /api/tech-stack.svg`

Continuous left-scrolling marquee of technology tags. The tag list is duplicated end-to-end for seamless looping.

Dimensions: 800 × 60px. Cache: `public, max-age=3600`.

## Embedding

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://buxx.me/api/status.svg?theme=dark">
  <source media="(prefers-color-scheme: light)" srcset="https://buxx.me/api/status.svg?theme=light">
  <img src="https://buxx.me/api/status.svg?theme=dark" alt="Status" />
</picture>
```

GitHub respects `prefers-color-scheme` switching via `<picture>`. Camo (GitHub's image proxy) honors `Cache-Control`, so a 5-minute TTL means updates propagate within ~5 minutes.

## Theme palette

| Role | Dark | Light |
| --- | --- | --- |
| Background | `#0d1117` | `#ffffff` |
| Border | `#30363d` | `#e5e5e5` |
| Text | `#fafafa` | `#171717` |
| Muted | `#525252` | `#a3a3a3` |
| Green | `#3fb950` | `#16a34a` |
| Red | `#f85149` | `#dc2626` |

`tech-stack.svg` and `site-badge.svg` use slightly darker chrome (`#0a0a0a` background, `#262626` border).

## Notes

- All endpoints are SSR. No prerendering, no static files in `public/`.
- SVGs use the shared `FONT_CODE` server stack from `src/lib/fonts.ts`, the server-side mirror of the CSS `--font-code` token.
- SVG `@keyframes` work in GitHub Markdown as of 2024 but may not render in all third-party Markdown viewers.
- `activity-panel.svg` does **not** fetch live data — values are query-driven, refreshed on a schedule by GitHub Actions.
