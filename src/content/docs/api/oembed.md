---
title: oEmbed & Embeds
description: Embed mood posts on another site with an iframe or oEmbed, then resize or theme them with postMessage.
group: API
order: 7
---


You can embed one mood post, or the latest few, on any web page. Paste an
iframe if you control the page's HTML. If your platform supports
[oEmbed](https://oembed.com/), give it a mood URL and it builds the iframe for
you.

## Quick start

- **Paste an iframe.** Point `src` at `https://buxx.me/mood/embed` for the
  latest post, or `https://buxx.me/mood/embed?id=123` for one post. Copy the
  recommended embed from [Embed widget](#embed-widget).
- **Use oEmbed.** Give your platform a `https://buxx.me/mood` or
  `https://buxx.me/mood/{id}` URL. Both pages link to the oEmbed endpoint (see
  [HTML discovery](#html-discovery)), and the endpoint returns the iframe HTML.
- **Fit the height.** The widget sends its height to the parent page. The
  oEmbed HTML includes a listener that resizes the iframe. With a raw iframe,
  or when your platform strips scripts, add the
  [listener yourself](#parent-page-integration).

## oEmbed endpoint

```
GET /api/oembed.json?url={url}
```

Returns an oEmbed JSON response for a mood page. Its `html` field is an iframe
of the [embed widget](#embed-widget).

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | The page to embed. Must be a `/mood` or `/mood/{id}` URL on the same host. |
| `maxwidth` | number | No | Maximum width, 200–800. Default 400. |
| `maxheight` | number | No | Maximum height, 150–800. If omitted, the height is estimated from the content. |
| `theme` | string | No | `light`, `dark`, or `auto`. Default `auto`. |
| `count` | number | No | Posts to show, 1–10. Default 5. Ignored for `/mood/{id}` URLs. |
| `frame` | string | No | Card framing, `true` or `false`. Default `true`. |
| `density` | string | No | `regular` or `compact`. Default `regular`. |
| `font` | string | No | `mono` or `system`. Default `mono`. |
| `origin` | string | No | The only parent origin that receives postMessage, for example `https://example.com`. |
| `link` | string | No | Show the "View all" link, `true` or `false`. Default `true`. |

### Example request

```
GET /api/oembed.json?url=https://buxx.me/mood&maxwidth=400&maxheight=400&theme=dark
```

### Example response

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

## Embed widget

```
GET /mood/embed
```

An HTML page made to sit inside an iframe. With no parameters it shows the
latest mood post.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | No | Show this post ID. |
| `count` | number | No | Posts to show, 1–10. Default 1. |
| `theme` | string | No | `light`, `dark`, or `auto`. |
| `refresh` | number | No | Auto-refresh interval in seconds, 30–3600. Setting it disables caching. |
| `link` | string | No | Show the "View all" link, `true` or `false`. Default `true`. |
| `frame` | string | No | Card framing, `true` or `false`. Default `true`. |
| `density` | string | No | `regular` or `compact`. Default `regular`. |
| `font` | string | No | `mono` or `system`. Default `mono`. |
| `origin` | string | No | The only parent origin that receives postMessage, for example `https://example.com`. |

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

The recommended embed. It drops the iframe's outer border and keeps the card's
own styling:

```html
<iframe
  src="https://buxx.me/mood/embed"
  style="border:0;display:block;width:100%;max-width:400px"
  height="300"
  loading="lazy"
></iframe>
```

## HTML discovery

The `/mood` and `/mood/{id}` pages include an oEmbed discovery link, so an
oEmbed consumer can find the endpoint from the page URL alone:

```html
<link rel="alternate" type="application/json+oembed"
      href="https://buxx.me/api/oembed.json?url=https://buxx.me/mood"
      title="Mood Embed" />
```

## Widget features

- **Auto theme.** When `theme` is `auto`, the widget follows the viewer's
  `prefers-color-scheme`.
- **Responsive height.** The widget posts a `mood-embed-resize` message to the
  parent page so the iframe can match its height. The oEmbed HTML includes a
  listener that does the resizing.
- **Origin lock.** Set `origin` to send postMessage only to that parent origin.
- **Theme sync.** The widget listens for `mood-embed-theme` messages and
  switches to the parent's theme.
- **Auto refresh.** Set `refresh` to reload the posts every 30–3600 seconds.
  This disables caching.

## Parent page integration

If your platform strips scripts from the oEmbed `html` field, add this listener
to the parent page so the iframe height follows the content. If you set
`origin`, you can also check `event.origin` here.

```javascript
window.addEventListener('message', (event) => {
  if (event.data?.type === 'mood-embed-resize') {
    const iframe = document.querySelector('iframe');
    iframe.style.height = event.data.height + 'px';
  }
});
```

To change the widget's theme from the parent page, post a `mood-embed-theme`
message:

```javascript
const iframe = document.querySelector('iframe');
iframe.contentWindow.postMessage({
  type: 'mood-embed-theme',
  theme: 'dark' // or 'light'
}, '*');
```

## Errors and validation

The endpoint checks `url` in four stages, and each failure has its own status.
Every error includes the [CORS headers](#cors-and-caching), so a browser can
read the error body instead of seeing an opaque network failure.

| Status | Body | Cause |
| --- | --- | --- |
| `400` | `{"error":"Missing required parameter: url"}` | `url` is absent, or empty after trimming. |
| `400` | `{"error":"Invalid URL format"}` | `new URL()` cannot parse `url`. |
| `400` | `{"error":"Unsupported URL protocol"}` | `url` parses, but the scheme is not `http:` or `https:`. |
| `403` | `{"error":"URL host not allowed for embedding"}` | The host in `url` does not match the host serving the request. |
| `404` | `{"error":"URL not supported for embedding"}` | The host matches, but the path is neither `/mood` nor `/mood/{id}`. |
| `429` | `{"error":"Too Many Requests"}` | Over 120 / 60s. The limit is advertised only; see [Rate limits](/docs/api/overview#rate-limits). |

The endpoint strips a trailing slash before the path check, so `/mood/` and
`/mood` are the same request. A path deeper than two segments, such as
`/mood/123/comments`, is a `404`.

Only `url` can fail the request. The endpoint clamps `maxwidth`, `maxheight`,
and `count` into range instead of rejecting them. An unrecognized `density`,
`font`, or `theme` falls back to its default.

### Hosts with and without `www.`

Before comparing hosts, the endpoint strips a leading `www.` from both sides,
so all four combinations work:

| Endpoint host | `url` host | Result |
| --- | --- | --- |
| `buxx.me` | `buxx.me` | OK |
| `buxx.me` | `www.buxx.me` | OK |
| `www.buxx.me` | `buxx.me` | OK |
| `www.buxx.me` | `www.buxx.me` | OK |

A real oEmbed consumer often finds the endpoint on one host and sends back the
page URL from the other. This rule lets a `www.`-served page embed itself. Any
other host gets `403 URL host not allowed for embedding`.

## CORS and caching

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

`OPTIONS` returns `204` with those headers and `Cache-Control: no-store,
max-age=0`. This is one of the few API endpoints that any origin can read. The
mood JSON routes are not, and that is the main reason this endpoint exists.

Successful responses use `Cache-Control: public, max-age=0` and
`Cloudflare-CDN-Cache-Control: public, max-age=300, stale-while-revalidate=3600,
stale-if-error=3600`. `Vary: Host` keeps a separate copy per host, because URL
validation and the generated embed and provider URLs depend on the host.

Errors use the API Worker's default `no-store, max-age=0`. The private Worker's
platform cache is enabled after route and authorization checks.

A successful body also includes `"cache_age": 3600`. This oEmbed protocol field
tells consumers to keep the result for an hour. Consumers should honor it
separately from HTTP caching.
