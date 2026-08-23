---
title: oEmbed & Embeds
description: Embed mood posts on any page — the oEmbed protocol, the raw iframe widget, and the postMessage contract.
group: API
order: 7
---


Embed mood posts on external platforms using the [oEmbed](https://oembed.com/) protocol.

## oEmbed Discovery

```
GET /api/oembed.json?url={url}
```

Returns oEmbed JSON response for embedding mood content.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to embed (must be a same-host `/mood` or `/mood/{id}` URL) |
| `maxwidth` | number | No | Maximum width (200-800, default: 400) |
| `maxheight` | number | No | Maximum height (150-800). When omitted, height is estimated based on content. |
| `theme` | string | No | Theme: `light`, `dark`, or `auto` (default: `auto`) |
| `count` | number | No | Number of posts to show (1-10, default: 5). Ignored for `/mood/{id}` URLs. |
| `frame` | string | No | Card framing: `true` or `false` (default: `true`). |
| `density` | string | No | Density: `regular` or `compact` (default: `regular`). |
| `font` | string | No | Font: `mono` or `system` (default: `mono`). |
| `origin` | string | No | Allowed parent origin for postMessage (e.g. `https://example.com`). |
| `link` | string | No | Show "View all" link (`true`/`false`, default: `true`). |

### Example Request

```
GET /api/oembed.json?url=https://buxx.me/mood&maxwidth=400&maxheight=400&theme=dark
```

### Example Response

```json
{
  "type": "rich",
  "version": "1.0",
  "title": "Mood Feed",
  "provider_name": "buxx.me",
  "provider_url": "https://buxx.me",
  "width": 400,
  "height": 400,
  "html": "<iframe src=\"https://buxx.me/mood/embed?theme=dark&count=5\" width=\"400\" height=\"400\" frameborder=\"0\" ...></iframe>",
  "cache_age": 3600
}
```

## Embed Widget

```
GET /mood/embed
```

Renders an embeddable HTML widget for mood posts.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | No | Specific post ID to display |
| `count` | number | No | Number of posts (1-10, default: 1) |
| `theme` | string | No | Theme: `light`, `dark`, or `auto` |
| `refresh` | number | No | Auto-refresh interval in seconds (30-3600). Disables caching when set. |
| `link` | string | No | Show "View all" link (`true`/`false`, default: `true`) |
| `frame` | string | No | Card framing: `true` or `false` (default: `true`). |
| `density` | string | No | Density: `regular` or `compact` (default: `regular`). |
| `font` | string | No | Font: `mono` or `system` (default: `mono`). |
| `origin` | string | No | Allowed parent origin for postMessage (e.g. `https://example.com`). |

### Examples

```html
<!-- Latest mood post -->
<iframe
  src="https://buxx.me/mood/embed"
  style="border:0;display:block;width:100%;max-width:400px"
  height="300"
  loading="lazy"
></iframe>

<!-- Specific post with dark theme -->
<iframe
  src="https://buxx.me/mood/embed?id=123&theme=dark"
  style="border:0;display:block;width:100%;max-width:400px"
  height="300"
  loading="lazy"
></iframe>

<!-- Multiple posts -->
<iframe
  src="https://buxx.me/mood/embed?count=5&theme=light"
  style="border:0;display:block;width:100%;max-width:400px"
  height="600"
  loading="lazy"
></iframe>
```

Recommended embed (no ugly outer frame, keeps inner card styling):

```html
<iframe
  src="https://buxx.me/mood/embed"
  style="border:0;display:block;width:100%;max-width:400px"
  height="300"
  loading="lazy"
></iframe>
```

## HTML Discovery

Pages at `/mood` and `/mood/{id}` include oEmbed discovery links:

```html
<link rel="alternate" type="application/json+oembed"
      href="https://buxx.me/api/oembed.json?url=https://buxx.me/mood"
      title="Mood Embed" />
```

## Features

- **Auto Theme**: Respects `prefers-color-scheme` when theme is `auto`
- **Responsive Height**: Posts `mood-embed-resize` message to parent for dynamic iframe sizing (oEmbed HTML includes a listener to resize the iframe)
- **Origin Lock**: Optionally restricts postMessage to a specific parent origin via the `origin` parameter
- **Theme Sync**: Listens for `mood-embed-theme` messages to sync theme with parent
- **Auto Refresh**: Optional periodic refresh for live updates (30-3600 seconds, disables caching)

## Parent Page Integration

If your platform strips scripts from the oEmbed `html` field, add the listener manually on the parent page to enable dynamic height adjustment (and optionally validate `event.origin` if you set `origin`):

```javascript
window.addEventListener('message', (event) => {
  if (event.data?.type === 'mood-embed-resize') {
    const iframe = document.querySelector('iframe');
    iframe.style.height = event.data.height + 'px';
  }
});
```

To sync theme with embed:

```javascript
const iframe = document.querySelector('iframe');
iframe.contentWindow.postMessage({
  type: 'mood-embed-theme',
  theme: 'dark' // or 'light'
}, '*');
```

## Errors and validation

The `url` parameter is checked in four stages, and each failure has its own
status. All of them carry the CORS headers below, so a browser can read the
error body rather than seeing an opaque network failure.

| Status | Body | Cause |
| --- | --- | --- |
| `400` | `{"error":"Missing required parameter: url"}` | `url` absent or empty after trimming. |
| `400` | `{"error":"Invalid URL format"}` | `url` is not parseable by `new URL()`. |
| `400` | `{"error":"Unsupported URL protocol"}` | Parsed fine, but the scheme is not `http:` or `https:`. |
| `403` | `{"error":"URL host not allowed for embedding"}` | The host in `url` does not match the host serving the request. |
| `404` | `{"error":"URL not supported for embedding"}` | Host matched, but the path is neither `/mood` nor `/mood/{id}`. |
| `429` | `{"error":"Too Many Requests"}` | Over 120 / 60s. Advertised only — see [Rate limits](/docs/api/overview#rate-limits). |

A trailing slash is stripped before the path check, so `/mood/` and `/mood`
are the same request. Anything deeper than two segments — `/mood/123/comments`
— is a `404`.

Every other parameter is permissive: `maxwidth`, `maxheight`, and `count` are
clamped into range rather than rejected, and an unrecognized `density`, `font`,
or `theme` silently falls back to its default. Only `url` can fail the request.

### The `www.` host check is broken

The host comparison intends to treat `www.buxx.me` and `buxx.me` as the same
origin. It does not:

```js
const normalizeHost = (value) => value.replace(/^www\\./i, '').toLowerCase();
```

In a regex literal, `\\.` is an escaped backslash followed by "any character" —
so this matches a literal `www\` plus one more character, which no hostname
contains. The `www.` prefix is never stripped, and the function only
lowercases.

The practical effect: a request to `https://buxx.me/api/oembed.json` carrying
`url=https://www.buxx.me/mood` compares `www.buxx.me` against `buxx.me`, and
gets `403 URL host not allowed for embedding`. That is the exact shape of a
real oEmbed consumer's request — discover the endpoint from one host, hand back
the page URL from another — so a `www.`-served page cannot embed itself.

**Until this is fixed, pass the `url` on the same host you called the endpoint
on.** Both work in isolation; only the mismatch fails.

## CORS and caching

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

`OPTIONS` returns `204` with those headers and nothing else. This is one of
the few endpoints on the API that is genuinely cross-origin readable — the
mood JSON routes are not, which is the main reason this endpoint exists.

There is **no `Cache-Control` header** on any oEmbed response, success or
error. The successful body carries `"cache_age": 3600`, which is an oEmbed
protocol field advising the consumer to hold the result for an hour; it is a
hint to the client, not an HTTP directive, and nothing on the Cloudflare edge
acts on it. If you are polling this endpoint, honor `cache_age` yourself.
