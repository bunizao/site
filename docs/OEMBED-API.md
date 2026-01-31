# oEmbed API

Embed mood posts on external platforms using the [oEmbed](https://oembed.com/) protocol.

## Endpoints

### oEmbed Discovery

```
GET /api/oembed.json?url={url}
```

Returns oEmbed JSON response for embedding mood content.

#### Parameters

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

#### Example Request

```
GET /api/oembed.json?url=https://buxx.me/mood&maxwidth=400&maxheight=400&theme=dark
```

#### Example Response

```json
{
  "type": "rich",
  "version": "1.0",
  "title": "Mood Feed",
  "provider_name": "Bunizao",
  "provider_url": "https://buxx.me",
  "width": 400,
  "height": 400,
  "html": "<iframe src=\"https://buxx.me/mood/embed?theme=dark&count=5\" width=\"400\" height=\"400\" frameborder=\"0\" ...></iframe>",
  "cache_age": 3600
}
```

### Embed Widget

```
GET /mood/embed
```

Renders an embeddable HTML widget for mood posts.

#### Parameters

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

#### Examples

```html
<!-- Latest mood post -->
<iframe src="https://buxx.me/mood/embed" width="400" height="300"></iframe>

<!-- Specific post with dark theme -->
<iframe src="https://buxx.me/mood/embed?id=123&theme=dark" width="400" height="300"></iframe>

<!-- Multiple posts -->
<iframe src="https://buxx.me/mood/embed?count=5&theme=light" width="400" height="600"></iframe>
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
