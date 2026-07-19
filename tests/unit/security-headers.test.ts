import { describe, expect, mock, test } from 'bun:test';

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
  test('normal pages get frame-ancestors self, nosniff, and a referrer policy', () => {
    const response = withHtmlSecurityHeaders(
      new Request('https://buxx.me/blog/some-post'),
      htmlResponse(),
    );

    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'self'");
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  test('dev portal pages get frame-ancestors none', () => {
    const response = withHtmlSecurityHeaders(
      new Request('https://buxx.me/dev/portal'),
      htmlResponse(),
    );

    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
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
