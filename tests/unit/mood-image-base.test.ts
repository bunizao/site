import { describe, expect, test } from 'bun:test';
import { normalizeMoodImageBase, normalizeMoodImageUrl } from '../../src/features/mood/server/image-base';

describe('mood image base', () => {
  test('maps the retired image host to the public image API', () => {
    expect(normalizeMoodImageBase('https://image.buxx.me/')).toBe('https://buxx.me/api/v2/images');
  });

  test('keeps configured API paths intact', () => {
    expect(normalizeMoodImageBase('https://buxx.me/api/v2/images/')).toBe('https://buxx.me/api/v2/images');
  });

  test('maps retired image URLs to the public image API', () => {
    expect(normalizeMoodImageUrl('https://image.buxx.me/channel/avatar')).toBe(
      'https://buxx.me/api/v2/images/channel/avatar',
    );
  });
});
