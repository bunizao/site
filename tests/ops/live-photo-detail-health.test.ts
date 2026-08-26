import { describe, expect, test } from 'bun:test';
import { expectHttpOk } from './http-diagnostics';

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function getSiteUrl(): string {
  return readEnv('SITE_URL') || readEnv('PUBLIC_SITE_URL') || 'https://buxx.me';
}

function getLivePhotoIds(): string[] {
  const raw = readEnv('LIVE_PHOTO_DETAIL_IDS') || '3327';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function readImageSources(html: string): string[] {
  return [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));
}

describe('live photo detail health', () => {
  test('live photo detail pages render HD fallback images', async () => {
    const siteUrl = getSiteUrl().replace(/\/+$/, '');
    const ids = getLivePhotoIds();

    expect(ids.length).toBeGreaterThan(0);

    for (const id of ids) {
      const response = await fetch(`${siteUrl}/mood/${encodeURIComponent(id)}`, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Cache-Control': 'no-cache',
        },
      });

      await expectHttpOk(response, `GET ${siteUrl}/mood/${encodeURIComponent(id)}`);

      const html = await response.text();
      const expectedUrl = new URL(`/api/v2/images/mood/${encodeURIComponent(id)}/0`, siteUrl);
      const imageUrl = readImageSources(html)
        .map((src) => new URL(src, siteUrl))
        .find((url) => url.origin === expectedUrl.origin && url.pathname === expectedUrl.pathname);

      expect(imageUrl, `mood ${id} should render its HD image URL`).toBeDefined();
      expect(html).not.toContain('Open Telegram to view this live photo');
      if (!imageUrl) continue;

      const imageResponse = await fetch(imageUrl, {
        headers: { Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
        signal: AbortSignal.timeout(5_000),
      });
      await expectHttpOk(imageResponse, `GET ${imageUrl}`);
    }
  });
});
