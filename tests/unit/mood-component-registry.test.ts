import { describe, expect, test } from 'bun:test';
import { moodComponentRegistry } from '../fixtures/mood-component-registry';
import { renderStructuredMoodFeedMediaMarkup } from '../../src/features/mood/shared/feed-media';

describe('mood component registry', () => {
  test('covers the structured read parity surface', () => {
    expect(moodComponentRegistry.map((entry) => entry.kind)).toEqual([
      'gallery',
      'sticker',
      'voice',
      'video',
      'roundvideo',
      'oversized-video',
      'forwarded',
      'quote',
      'reactions',
      'comments',
      'code-block',
      'location',
      'poll',
      'link-preview',
      'document',
    ]);
  });

  test('marks only verified production samples for live parity', () => {
    const productionSamples = moodComponentRegistry
      .filter((entry) => entry.prodId && entry.prodWindowBefore)
      .map((entry) => entry.kind);

    expect(productionSamples).toEqual([
      'video',
      'oversized-video',
      'forwarded',
      'quote',
      'reactions',
      'comments',
      'link-preview',
      'document',
    ]);
  });

  for (const entry of moodComponentRegistry) {
    test(`renders ${entry.kind} from structured fixture data`, () => {
      const post = entry.fixtureFactory();
      const renderedMediaHtml = renderStructuredMoodFeedMediaMarkup(post.media);

      expect(post.mediaHtml).toBe('');
      entry.assert(post, renderedMediaHtml);
    });
  }
});
