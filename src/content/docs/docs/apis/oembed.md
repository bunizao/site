---
title: oEmbed API
description: Drop a buxx.me URL into anything that speaks oEmbed, get back a styled mood embed.
public: true
---

The oEmbed endpoint lets external platforms (and any oEmbed-aware client) embed mood posts without scraping. It follows the [oEmbed 1.0](https://oembed.com/) spec and returns rich JSON with an iframe `html` payload.

## Discovery

```
GET /api/oembed.json?url={url}
```

The `url` must be a same-host `/mood` or `/mood/{id}` URL. Response is `application/json` with the standard oEmbed `rich` envelope plus an `html` field containing the embed iframe.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | string | yes | URL to embed (same-host `/mood` or `/mood/{id}`). |
| `maxwidth` | number | no | 200–800. Default 400. |
| `maxheight` | number | no | 150–800. Estimated when omitted. |
| `theme` | string | no | `light`, `dark`, or `auto` (default). |
| `count` | number | no | 1–10. Default 5. Ignored for `/mood/{id}`. |
| `frame` | string | no | `true` (default) or `false`. |
| `density` | string | no | `regular` (default) or `compact`. |
| `font` | string | no | `mono` (default) or `system`. |
| `origin` | string | no | Allowed parent origin for `postMessage` (e.g. `https://example.com`). |
| `link` | string | no | Show "View all" link. `true` (default) or `false`. |

Example:

```
GET /api/oembed.json?url=https://buxx.me/mood&maxwidth=400&theme=dark
```

```json
{
  "type": "rich",
  "version": "1.0",
  "title": "Mood Feed",
  "provider_name": "Bunizao",
  "provider_url": "https://buxx.me",
  "width": 400,
  "height": 400,
  "html": "<iframe src=\"https://buxx.me/mood/embed?theme=dark&count=5\" ...></iframe>",
  "cache_age": 3600
}
```

## Embed widget

```
GET /mood/embed
```

The widget renders embeddable HTML for mood posts. Same parameter set as the oEmbed endpoint — `id`, `count`, `theme`, `refresh`, `link`, `frame`, `density`, `font`, `origin`. `refresh` (30–3600 seconds) auto-refreshes and disables caching.

```html
<!-- Latest mood post -->
<iframe
  src="https://buxx.me/mood/embed"
  style="border:0;display:block;width:100%;max-width:400px"
  height="300"
  loading="lazy"
></iframe>

<!-- Specific post, dark theme -->
<iframe
  src="https://buxx.me/mood/embed?id=123&theme=dark"
  style="border:0;display:block;width:100%;max-width:400px"
  height="300"
  loading="lazy"
></iframe>
```

## HTML discovery

`/mood` and `/mood/{id}` include the standard oEmbed discovery link:

```html
<link rel="alternate" type="application/json+oembed"
      href="https://buxx.me/api/oembed.json?url=https://buxx.me/mood"
      title="Mood Embed" />
```

## Behavior

- **Auto theme** — respects `prefers-color-scheme` when `theme=auto`.
- **Responsive height** — the embed posts a `mood-embed-resize` message to the parent. The default oEmbed `html` includes a listener; if your platform strips scripts, add it manually:
  ```js
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'mood-embed-resize') {
      const iframe = document.querySelector('iframe');
      iframe.style.height = event.data.height + 'px';
    }
  });
  ```
- **Origin lock** — when `origin` is set, postMessage is locked to that parent.
- **Theme sync** — the embed listens for `mood-embed-theme` messages from the parent:
  ```js
  iframe.contentWindow.postMessage({ type: 'mood-embed-theme', theme: 'dark' }, '*');
  ```
- **Auto refresh** — `refresh=N` reloads every N seconds; sets `Cache-Control: no-store`.
