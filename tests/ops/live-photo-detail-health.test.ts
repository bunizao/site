import { describe, expect, test } from 'bun:test';

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

      expect(response.ok).toBe(true);

      const html = await response.text();
      expect(html).toContain(`https://buxx.me/api/v2/images/mood/${id}/0`);
      expect(html).not.toContain('Open Telegram to view this live photo');
    }
  });
});
