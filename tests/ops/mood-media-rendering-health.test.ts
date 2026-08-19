import { describe, expect, test } from 'bun:test';
import { getMoodFeedAnchorHref } from '@/features/mood/shared/feed-anchor';

function getSiteUrl(): string {
  return (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || 'https://buxx.me').replace(/\/+$/, '');
}

async function fetchAnchoredMoodPage(siteUrl: string, id: string): Promise<string> {
  const url = new URL(getMoodFeedAnchorHref(id), siteUrl);

  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(10_000),
  });
  expect(response.ok, `GET ${url} -> ${response.status}`).toBe(true);
  return response.text();
}

function moodBlock(html: string, id: string): string {
  const start = html.indexOf(`data-mood-id="${id}"`);
  expect(start, `mood ${id} is missing from the anchored feed`).toBeGreaterThanOrEqual(0);

  const next = html.indexOf('data-mood-id="', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

function videoTag(block: string, id: string): string {
  const video = block.match(/<video\b[^>]*>/)?.[0] ?? '';
  expect(video, `mood ${id} is missing its video element`).not.toBe('');
  return video;
}

describe('mood media rendering health', () => {
  test('June 28 videos render with their archived dimensions', async () => {
    const siteUrl = getSiteUrl();
    const [portraitHtml, landscapeHtml] = await Promise.all([
      fetchAnchoredMoodPage(siteUrl, '3608'),
      fetchAnchoredMoodPage(siteUrl, '3609'),
    ]);
    const portrait = moodBlock(portraitHtml, '3608');
    const landscape = moodBlock(landscapeHtml, '3609');

    const portraitVideo = videoTag(portrait, '3608');
    const landscapeVideo = videoTag(landscape, '3609');

    expect(portraitVideo).toContain('class="video--ultra-tall"');
    expect(portraitVideo).toContain('width="1080"');
    expect(portraitVideo).toContain('height="1920"');
    expect(landscapeVideo).toContain('width="662"');
    expect(landscapeVideo).toContain('height="326"');
  }, { timeout: 30_000 });

  test('mood 3618 renders its archived link preview image from R2', async () => {
    const siteUrl = getSiteUrl();
    const html = await fetchAnchoredMoodPage(siteUrl, '3618');
    const block = moodBlock(html, '3618');
    const thumbnail = block.match(/bookmark-card__media[^>]*><img src="([^"]+)"/)?.[1] ?? '';

    expect(thumbnail).toBe(`${siteUrl}/api/v2/images/mood/3618/link-preview`);

    const response = await fetch(new URL(thumbnail, siteUrl), {
      headers: { Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
      signal: AbortSignal.timeout(5_000),
    });
    expect(response.ok, `GET ${thumbnail} -> ${response.status}`).toBe(true);
  }, { timeout: 20_000 });
});
