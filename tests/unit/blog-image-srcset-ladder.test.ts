import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { enrichBlurUp } from '@/features/posts/server/blur-up';

// The blog image proxy (site-api telegram-image-proxy.ts) resizes to
// 320/480/640/800/1200 and caps there. A srcset candidate between or above
// those rungs downloads the next rung's bytes under a URL of its own.
const PROXY_RUNGS = new Set([320, 480, 640, 800, 1200]);

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function srcsetWidths(html: string): number[] {
  const srcset = html.match(/\bsrcset="([^"]*)"/)?.[1] ?? '';
  return srcset.split(',').map((candidate) => Number(candidate.trim().split(/\s+/)[1]?.replace('w', '')));
}

describe('blog image srcset ladder', () => {
  test('content images only advertise widths the proxy serves', async () => {
    globalThis.fetch = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    const html = await enrichBlurUp('<img class="kg-image" src="/api/v2/images/blog/content/images/2026/06/ladder.jpg">');

    const widths = srcsetWidths(html);
    expect(widths).toEqual([640, 800, 1200]);
    expect(widths.every((width) => PROXY_RUNGS.has(width))).toBe(true);
    expect(html).toContain('src="/api/v2/images/blog/content/images/2026/06/ladder.jpg?w=1200"');
  });

  test('content images never ask the proxy to upscale past the intrinsic width', async () => {
    globalThis.fetch = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    const html = await enrichBlurUp('<img class="kg-image" width="1000" src="/api/v2/images/blog/content/images/2026/06/narrow.jpg">');

    expect(srcsetWidths(html)).toEqual([640, 800]);
    expect(html).toContain('narrow.jpg?w=800"');
  });

  test('proxy feature images use the proxy ladder', () => {
    const page = readFileSync(new URL('../../src/pages/blog/[...slug].astro', import.meta.url), 'utf8');
    const ladder = page.match(/const blogProxyImageWidths = \[([^\]]*)\]/)?.[1] ?? '';

    const widths = ladder.split(',').map((value) => Number(value.trim()));
    expect(widths).toEqual([640, 800, 1200]);
    expect(widths.every((width) => PROXY_RUNGS.has(width))).toBe(true);
  });
});
