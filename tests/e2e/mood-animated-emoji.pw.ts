import { gzipSync } from 'node:zlib';
import { expect, test } from './fixtures';

const GOOD_EMOJI_ID = '7000000000000000001';
const FAILED_EMOJI_ID = '7000000000000000002';
const tinyGif = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
  'base64',
);
const animationData = gzipSync(JSON.stringify({
  v: '5.7.4',
  fr: 30,
  ip: 0,
  op: 60,
  w: 20,
  h: 20,
  nm: 'E2E emoji',
  ddd: 0,
  assets: [],
  layers: [],
}));

test('defers animated emoji work and preserves static fallbacks on failure', async ({ page }) => {
  let goodMetadataRequests = 0;
  let failedMetadataRequests = 0;

  await page.addInitScript(({ goodEmojiId, failedEmojiId }) => {
    document.addEventListener('DOMContentLoaded', () => {
      const spacer = document.createElement('div');
      spacer.style.height = '2400px';

      const good = document.createElement('span');
      good.id = 'e2e-emoji-good';
      good.className = 'tg-emoji';
      good.dataset.emojiId = goodEmojiId;
      good.textContent = '🙂';

      const failed = document.createElement('span');
      failed.id = 'e2e-emoji-failed';
      failed.className = 'tg-emoji';
      failed.dataset.emojiId = failedEmojiId;
      failed.textContent = '🙃';

      document.body.append(spacer, good, failed);
    }, { once: true });
  }, { goodEmojiId: GOOD_EMOJI_ID, failedEmojiId: FAILED_EMOJI_ID });

  await page.route(`**/static/https:/t.me/i/emoji/${GOOD_EMOJI_ID}.json`, async (route) => {
    goodMetadataRequests += 1;
    if (goodMetadataRequests === 1) {
      await route.fulfill({ status: 502, body: 'temporary failure' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ emoji: 'https://cdn4.telegram-cdn.org/e2e-emoji.tgs' }),
    });
  });

  await page.route(`**/static/https:/t.me/i/emoji/${FAILED_EMOJI_ID}.json`, async (route) => {
    failedMetadataRequests += 1;
    await route.fulfill({ status: 502, body: 'temporary failure' });
  });

  await page.route('**/static/https://cdn4.telegram-cdn.org/e2e-emoji.tgs', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      body: animationData,
    });
  });

  await page.route('**/static/https:/t.me/i/emoji/*.webp', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/gif', body: tinyGif });
  });

  await page.goto('/mood/990001', { waitUntil: 'domcontentloaded' });

  const good = page.locator('#e2e-emoji-good');
  const failed = page.locator('#e2e-emoji-failed');
  await expect(good.locator('.tg-emoji-fallback')).toHaveCount(1);
  await expect(failed.locator('.tg-emoji-fallback')).toHaveCount(1);
  await page.waitForTimeout(500);
  expect(goodMetadataRequests).toBe(0);
  expect(failedMetadataRequests).toBe(0);

  await good.scrollIntoViewIfNeeded();

  await expect.poll(() => goodMetadataRequests).toBe(2);
  await expect(good).toHaveAttribute('data-emoji-animated', 'true');
  await expect(good.locator('.tg-emoji-anim svg')).toHaveCount(1);
  await expect(good.locator('.tg-emoji-fallback')).toHaveCount(0);

  await expect.poll(() => failedMetadataRequests).toBe(2);
  await expect(failed).toHaveAttribute('data-emoji-animated', 'false');
  await expect(failed.locator('.tg-emoji-fallback')).toHaveCount(1);
});
