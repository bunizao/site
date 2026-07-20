import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('blog analytics beacon', () => {
  test('is wired into blog article pages', () => {
    const source = readFileSync(new URL('../../src/pages/blog/[slug].astro', import.meta.url), 'utf8');

    expect(source).toContain("import BlogArticleBeacon from '@/features/posts/ui/BlogArticleBeacon.astro'");
    expect(source).toContain('<BlogArticleBeacon slug={post.slug} />');
  });

  test('keeps the client script first-party and lifecycle based', () => {
    const source = readFileSync(new URL('../../src/features/posts/ui/BlogArticleBeacon.astro', import.meta.url), 'utf8');

    expect(source).toContain('BLOG_ANALYTICS_EVENT_ENDPOINT');
    expect(source).toContain('isPublicAnalyticsHost');
    expect(source).toContain("hostname === 'buxx.me'");
    expect(source).toContain('navigator.sendBeacon');
    expect(source).toContain("credentials: 'same-origin'");
    expect(source).toContain('visibilitychange');
    expect(source).toContain('pagehide');
    expect(source).toContain('localStorage');
    expect(source).toContain('sessionStorage');
    expect(source).toContain('dwellMs');
    expect(source).toContain('scrollDepth');
    expect(source).not.toContain('gtag');
    expect(source).not.toContain('google-analytics');
  });

  test('sanitizes referrers before sending analytics payload', () => {
    const source = readFileSync(new URL('../../src/features/posts/ui/BlogArticleBeacon.astro', import.meta.url), 'utf8');

    expect(source).toContain('function sanitizedReferrer()');
    expect(source).toContain('if (!document.referrer) return null;');
    expect(source).toContain('const ref = new URL(document.referrer);');
    expect(source).toContain('return `${ref.origin}${ref.pathname}`;');
    expect(source).toContain('catch {');
    expect(source).toContain('referrer: sanitizedReferrer(),');
    expect(source).not.toContain('referrer: document.referrer');
  });

  test('does not add a duplicate Google Tag Gateway loader', () => {
    const source = readFileSync(new URL('../../src/layouts/BlogLayout.astro', import.meta.url), 'utf8');

    expect(source).not.toContain('/gmetrics/');
    expect(source).not.toContain('googletagmanager');
    expect(source).not.toContain('googleTagGateway');
    expect(source).not.toContain('gtag(');
    expect(source).not.toMatch(/<script[^>]+src=["']\/gmetrics\/["']/);
  });

});
