import { describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
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

function parseCsp(value: string): Map<string, Set<string>> {
  return new Map(value.split(';').map((directive) => {
    const [name = '', ...sources] = directive.trim().split(/\s+/);
    return [name, new Set(sources)];
  }));
}

function htmlResponse(headers: Record<string, string> = {}): Response {
  return new Response('<!doctype html>', {
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers },
  });
}

describe('non-canonical hosts', () => {
  test('marks every response from a copy of the site as noindex', () => {
    const tunnel = withHtmlSecurityHeaders(
      new Request('https://dev-preview.buxx.me/blog'),
      htmlResponse(),
    );
    expect(tunnel.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');

    const preview = withHtmlSecurityHeaders(
      new Request('https://abc123-site.bunizao.workers.dev/mood/rss.xml'),
      new Response('<rss/>', { headers: { 'Content-Type': 'application/xml' } }),
    );
    expect(preview.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  test('leaves production and local hosts alone', () => {
    expect(
      withHtmlSecurityHeaders(new Request('https://buxx.me/blog'), htmlResponse()).headers.get('X-Robots-Tag'),
    ).toBeNull();
    expect(
      withHtmlSecurityHeaders(new Request('http://localhost:4321/blog'), htmlResponse()).headers.get('X-Robots-Tag'),
    ).toBeNull();
  });

  test('never weakens a stricter robots header already on the response', () => {
    const response = withHtmlSecurityHeaders(
      new Request('https://dev-preview.buxx.me/blog/secret'),
      htmlResponse({ 'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet' }),
    );
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive, nosnippet');
  });
});

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

describe('static-asset CSP', () => {
  // Prerendered pages get their CSP from public/_headers, Worker-rendered
  // pages from the middleware. A source allowed in one but not the other
  // breaks a script on half the site.
  test('Worker HTML and static-asset CSP allow the same script sources', () => {
    const worker = parseCsp(
      withHtmlSecurityHeaders(new Request('https://buxx.me/'), htmlResponse())
        .headers.get('Content-Security-Policy') ?? '',
    );
    const headersFile = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
    const rules = [...headersFile.matchAll(/^(\S+)\n\s+Content-Security-Policy: (.+)$/gm)]
      .map(([, path, csp]) => ({ path, csp: parseCsp(csp ?? '') }));

    expect(rules.map((rule) => rule.path)).toContain('https://buxx.me/');
    for (const { path, csp } of rules) {
      const scriptSources = [...(csp.get('script-src') ?? [])];
      // The blog omits the Apple Music player, so its list may be narrower,
      // but a static page must never allow a source the Worker does not.
      expect({ path, extra: scriptSources.filter((source) => !worker.get('script-src')?.has(source)) })
        .toEqual({ path, extra: [] });
      expect(csp.get('base-uri')).toEqual(worker.get('base-uri'));
      expect(csp.get('object-src')).toEqual(worker.get('object-src'));
    }
    const home = rules.find((rule) => rule.path === 'https://buxx.me/');
    expect(home?.csp.get('script-src')).toEqual(worker.get('script-src'));
  });
});
