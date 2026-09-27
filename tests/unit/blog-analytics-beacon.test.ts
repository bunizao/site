import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// These read source rather than run it: the beacon is an `is:inline` script
// that only fires on buxx.me, so no test host can exercise it behaviourally.
function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('blog analytics beacon', () => {
  test('blog articles ship the first-party beacon and no Google tag', () => {
    const page = readSource('src/pages/blog/[...slug].astro');
    const beacon = readSource('src/features/posts/ui/BlogArticleBeacon.astro');
    const layout = readSource('src/layouts/BlogLayout.astro');

    expect(page).toContain("import BlogArticleBeacon from '@/features/posts/ui/BlogArticleBeacon.astro'");
    expect(page).toContain('<BlogArticleBeacon slug={post.slug} />');
    expect(beacon).toContain('BLOG_ANALYTICS_EVENT_ENDPOINT');
    expect(beacon).toContain("hostname === 'buxx.me'");
    for (const source of [beacon, layout]) {
      expect(source).not.toContain('gtag');
      expect(source).not.toContain('google-analytics');
      expect(source).not.toContain('googletagmanager');
      expect(source).not.toContain('googleTagGateway');
      expect(source).not.toContain('/gmetrics/');
    }
  });

  test('the beacon sends only the referrer\'s origin and path', () => {
    const beacon = readSource('src/features/posts/ui/BlogArticleBeacon.astro');

    expect(beacon).toContain('function sanitizedReferrer()');
    expect(beacon).toContain('const ref = new URL(document.referrer);');
    expect(beacon).toContain('return `${ref.origin}${ref.pathname}`;');
    expect(beacon).toContain('referrer: sanitizedReferrer(),');
    expect(beacon).not.toContain('referrer: document.referrer');
  });

  test('skips a payload identical to the previous send', () => {
    const beacon = readSource('src/features/posts/ui/BlogArticleBeacon.astro');

    expect(beacon).toContain("let lastSentKey = '';");
    expect(beacon).toContain('if (key === lastSentKey) return;');
    expect(beacon).toContain('const body = JSON.stringify(payload);');
  });
});
