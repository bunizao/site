// Archive image responsive-width helpers. The D1 archive read path emits bare
// image URLs (`/api/v2/images/mood/{id}/{n}`); the image proxy already resizes
// via `?w=`, snapping to the widths below. External/legacy URLs must pass
// through untouched so we never rewrite something the proxy can't resize.

// Matches the proxy's regular responsive widths in site-api. The proxy also
// accepts the separate 32px placeholder below; keep both policies in sync.
export const MOOD_ARCHIVE_IMAGE_WIDTHS = [320, 480, 640, 800, 1200] as const;
// Kept out of the responsive ladder: this variant only paints the tiny blurred
// placeholder behind a content image. site-api normalizes it independently.
export const MOOD_IMAGE_PLACEHOLDER_WIDTH = 32;

export type MoodImageLayout = 'landscape' | 'portrait' | 'ultra-tall';

export interface MoodImageRatio {
  css: string;
  value: number;
  exact: boolean;
}

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

function isPositiveDimension(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function resolveMoodImageLayout(
  value: unknown,
  width?: number | null,
  height?: number | null,
): MoodImageLayout | null {
  if (value === 'landscape' || value === 'portrait' || value === 'ultra-tall') {
    return value;
  }
  if (!isPositiveDimension(width) || !isPositiveDimension(height)) {
    return null;
  }

  const ratio = width / height;
  if (ratio < 0.6) return 'ultra-tall';
  if (ratio < 0.8) return 'portrait';
  return 'landscape';
}

export function getMoodImageRatio(
  width?: number | null,
  height?: number | null,
  layout?: MoodImageLayout | null,
): MoodImageRatio {
  if (isPositiveDimension(width) && isPositiveDimension(height)) {
    return {
      css: `${width} / ${height}`,
      value: width / height,
      exact: true,
    };
  }

  const resolvedLayout = resolveMoodImageLayout(layout, width, height);
  if (resolvedLayout === 'portrait') {
    return { css: '3 / 4', value: 3 / 4, exact: false };
  }
  if (resolvedLayout === 'ultra-tall') {
    return { css: '9 / 16', value: 9 / 16, exact: false };
  }

  return { css: '4 / 3', value: 4 / 3, exact: false };
}

export function getMoodImagePlaceholderSrc(url: string): string | null {
  return isArchiveImageUrl(url) ? withWidth(url, MOOD_IMAGE_PLACEHOLDER_WIDTH) : null;
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
