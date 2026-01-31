/**
 * Helper utilities for iframe-friendly embed responses
 */

export interface EmbedResponseOptions {
  /** Cache duration in seconds (default: 300 = 5 minutes) */
  maxAge?: number;
  /** Stale-while-revalidate duration in seconds (default: 60) */
  staleWhileRevalidate?: number;
}

/**
 * Security headers for embeddable pages
 * - CSP allowing inline styles, Google Fonts, and images
 */
export function getEmbedHeaders(options: EmbedResponseOptions = {}): Headers {
  const { maxAge = 300, staleWhileRevalidate = 60 } = options;

  const headers = new Headers();

  // Content Security Policy for embed context
  // - Allow inline styles for theming
  // - Allow Google Fonts
  // - Allow images from various sources
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "media-src 'self' https:",
      "script-src 'self' 'unsafe-inline'",
      "frame-ancestors *",
    ].join('; ')
  );

  // Cache control for performance
  headers.set(
    'Cache-Control',
    `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`
  );

  return headers;
}

/**
 * CORS headers for oEmbed discovery endpoint
 */
export function getCorsHeaders(): Headers {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return headers;
}

/**
 * Merge multiple Headers objects
 */
export function mergeHeaders(...headersList: Headers[]): Headers {
  const merged = new Headers();
  for (const headers of headersList) {
    headers.forEach((value, key) => {
      merged.set(key, value);
    });
  }
  return merged;
}
