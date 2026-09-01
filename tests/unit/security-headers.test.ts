import { describe, expect, mock, test } from 'bun:test';
import { getEmbedHeaders } from '@/lib/embed-response';

// The middleware pulls in astro virtual modules through its import chain;
// stub them so the pure header helpers are testable under bun.
mock.module('astro:middleware', () => ({
  defineMiddleware: (fn: unknown) => fn,
}));
mock.module('astro:content', () => ({
  getEntry: async () => null,
}));

const { createHtmlScriptCsp, withHtmlSecurityHeaders } = await import('../../src/middleware');

function htmlResponse(headers: Record<string, string> = {}): Response {
  return new Response('<!doctype html>', {
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers },
  });
}

describe('html security headers', () => {
  test('mood embeds allow only the official YouTube API and privacy-enhanced frame host', () => {
    const csp = getEmbedHeaders().get('Content-Security-Policy') ?? '';

    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://www.youtube.com");
    expect(csp).toContain("frame-src 'self' https://www.youtube-nocookie.com");
  });

  test('normal pages get frame-ancestors self, nosniff, and a referrer policy', () => {
    const response = withHtmlSecurityHeaders(
      new Request('https://buxx.me/blog/some-post'),
      htmlResponse(),
    );

    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'self'");
    expect(response.headers.get('Content-Security-Policy')).toContain('https://www.youtube.com');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  test('mood feed opts out of Cloudflare script injection', () => {
    const mood = withHtmlSecurityHeaders(
      new Request('https://buxx.me/mood'),
      htmlResponse({ 'Cache-Control': 'public, max-age=0, s-maxage=300' }),
    );
    const detail = withHtmlSecurityHeaders(
      new Request('https://buxx.me/mood/3792'),
      htmlResponse({ 'Cache-Control': 'public, max-age=0, s-maxage=60' }),
    );

    expect(mood.headers.get('Cache-Control')).toBe(
      'public, max-age=0, s-maxage=300, no-transform',
    );
    expect(detail.headers.get('Cache-Control')).not.toContain('no-transform');
  });

  test('dev portal pages get frame-ancestors none', () => {
    const response = withHtmlSecurityHeaders(
      new Request('https://buxx.me/dev/portal'),
      htmlResponse(),
    );

    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  test('dev blog preview pages get frame-ancestors self so the portal can iframe them', () => {
    const response = withHtmlSecurityHeaders(
      new Request('https://buxx.me/dev/blog/5ddc9141c35e7700383b2937'),
      htmlResponse(),
    );

    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'self'");
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  test('mood embed keeps its own frame-ancestors * CSP', () => {
    const embedCsp = "default-src 'self'; frame-ancestors *";
    const response = withHtmlSecurityHeaders(
      new Request('https://buxx.me/mood/embed?id=3641'),
      htmlResponse({ 'Content-Security-Policy': embedCsp }),
    );

    expect(response.headers.get('Content-Security-Policy')).toBe(embedCsp);
    expect(response.headers.get('Content-Security-Policy')).toContain('frame-ancestors *');
    // The additive headers still apply to the embed.
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  test('mood embed without its own CSP falls back to the base policy without frame-ancestors', () => {
    const response = withHtmlSecurityHeaders(
      new Request('https://buxx.me/mood/embed'),
      htmlResponse(),
    );

    const csp = response.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain('script-src');
    expect(csp).not.toContain('frame-ancestors');
  });

  test('non-html responses get nosniff and referrer but no CSP', () => {
    const response = withHtmlSecurityHeaders(
      new Request('https://buxx.me/api/moods'),
      new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
    );

    expect(response.headers.get('Content-Security-Policy')).toBeNull();
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  test('csp builder emits the requested frame-ancestors directive', () => {
    expect(createHtmlScriptCsp()).not.toContain('frame-ancestors');
    expect(createHtmlScriptCsp({ frameAncestors: 'self' })).toContain("frame-ancestors 'self'");
    expect(createHtmlScriptCsp({ frameAncestors: 'none' })).toContain("frame-ancestors 'none'");
  });
});
