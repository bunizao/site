import { describe, expect, test } from 'bun:test';
import { describeFcpPath, type FcpResource } from '@/lib/performance-debug-panel';

const resource = (overrides: Partial<FcpResource> & Pick<FcpResource, 'name'>): FcpResource => ({
  initiatorType: 'link',
  startTime: 100,
  responseEnd: 200,
  transferSize: 2048,
  encodedBodySize: 2048,
  ...overrides,
});

const nav = { responseStart: 40, responseEnd: 90 };

describe('describeFcpPath', () => {
  test('names the blocker that arrived last and the render time after it', () => {
    const line = describeFcpPath(400, nav, [
      resource({ name: 'https://buxx.me/_astro/globals.abc.css', renderBlockingStatus: 'blocking', responseEnd: 320 }),
      resource({ name: 'https://buxx.me/_astro/index.def.css', renderBlockingStatus: 'blocking', responseEnd: 250 }),
      resource({ name: 'https://buxx.me/_astro/page.js', initiatorType: 'script', renderBlockingStatus: 'non-blocking', responseEnd: 390 }),
    ]);

    expect(line).toBe('ttfb=40 doc=90 css=2/4KB font-preloads=0/0KB last=globals.abc.css@320 render=80ms');
  });

  test('counts a font preload that arrived before FCP as the gate', () => {
    const line = describeFcpPath(500, nav, [
      resource({ name: 'https://buxx.me/_astro/globals.abc.css', renderBlockingStatus: 'blocking', responseEnd: 300 }),
      resource({ name: 'https://buxx.me/fonts/inter-variable.woff2', renderBlockingStatus: 'non-blocking', responseEnd: 420, transferSize: 49152 }),
    ]);

    expect(line).toContain('font-preloads=1/48KB');
    expect(line).toContain('last=inter-variable.woff2@420 render=80ms');
    expect(line).not.toContain('pending=');
  });

  test('reports a font preload still in flight at FCP as pending', () => {
    const line = describeFcpPath(360, nav, [
      resource({ name: 'https://buxx.me/_astro/globals.abc.css', renderBlockingStatus: 'blocking', responseEnd: 250 }),
      resource({ name: 'https://buxx.me/fonts/inter-variable.woff2', responseEnd: 2000 }),
    ]);

    expect(line).toContain('last=globals.abc.css@250 render=110ms');
    expect(line).toEndWith('pending=inter-variable.woff2');
  });

  test('falls back to link-initiated stylesheets where renderBlockingStatus is missing', () => {
    const line = describeFcpPath(300, nav, [
      resource({ name: 'https://buxx.me/_astro/globals.abc.css?v=1', responseEnd: 210 }),
      resource({ name: 'https://buxx.me/fonts/geist-mono-latin.woff2', initiatorType: 'css', responseEnd: 220 }),
    ]);

    expect(line).toContain('css=1/2KB font-preloads=0/0KB last=globals.abc.css@210');
  });

  test('measures render from TTFB when nothing blocked the paint', () => {
    expect(describeFcpPath(150, nav, [])).toBe('ttfb=40 doc=90 css=0/0KB font-preloads=0/0KB last=none render=110ms');
  });
});
