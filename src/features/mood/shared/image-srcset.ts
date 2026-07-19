// Archive image responsive-width helpers. The D1 archive read path emits bare
// image URLs (`/api/v2/images/mood/{id}/{n}`); the image proxy already resizes
// via `?w=`, snapping to the widths below. External/legacy URLs must pass
// through untouched so we never rewrite something the proxy can't resize.

// Matches the proxy's `resolveResizeWidth` snap list in site-api
// (telegram-image-proxy.ts). Keep in sync if the proxy changes.
export const MOOD_ARCHIVE_IMAGE_WIDTHS = [320, 480, 640, 800, 1200] as const;

// The public proxy path is `/api/v2/images/...`; `/v2/images` is the private
// Worker mount (MOOD_IMAGE_PROXY_BASE_PATH in @bunizao/contracts/routes —
// inlined here to keep this module dependency-free for browser test builds).
// Match both so absolute buxx.me URLs and relative public URLs are recognized.
const ARCHIVE_IMAGE_PATH_MARKERS = [
  '/api/v2/images/',
  '/v2/images/',
];

export interface ArchiveSrcSet {
  src: string;
  srcset?: string;
  sizes?: string;
}

function getUrlPathname(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed, 'https://local.invalid').pathname;
  } catch {
    return trimmed;
  }
}

export function isArchiveImageUrl(url: string): boolean {
  const pathname = getUrlPathname(url);
  if (!pathname) return false;
  return ARCHIVE_IMAGE_PATH_MARKERS.some((marker) => pathname.includes(marker));
}

// Add/replace the `w` query param, preserving any existing params and keeping
// relative URLs relative.
export function withWidth(url: string, width: number): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  const isAbsolute = /^(https?:)?\/\//i.test(trimmed);
  try {
    const parsed = new URL(trimmed, 'https://local.invalid');
    parsed.searchParams.set('w', String(width));
    if (isAbsolute) return parsed.toString();
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return trimmed;
  }
}

// Feed thumbnails span the mood column (max 680px, 720px at ≥1024px). This
// `sizes` value is derived from `.mood-stream` in src/pages/mood.astro.
export const MOOD_FEED_IMAGE_SIZES = '(max-width: 720px) 100vw, 680px';

export function buildArchiveSrcSet(
  url: string,
  options: { widths?: readonly number[]; sizes?: string } = {},
): ArchiveSrcSet {
  const trimmed = url.trim();
  if (!trimmed || !isArchiveImageUrl(trimmed)) {
    return { src: trimmed };
  }

  const widths = options.widths ?? MOOD_ARCHIVE_IMAGE_WIDTHS;
  const srcset = widths.map((width) => `${withWidth(trimmed, width)} ${width}w`).join(', ');

  return {
    src: trimmed,
    srcset,
    sizes: options.sizes ?? MOOD_FEED_IMAGE_SIZES,
  };
}
