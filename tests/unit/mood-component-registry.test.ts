import { describe, expect, test } from 'bun:test';
import { moodComponentRegistry } from '../fixtures/mood-component-registry';
import { renderStructuredMoodFeedMediaMarkup } from '../../src/features/mood/shared/feed-media';

describe('mood component registry', () => {
  test('covers the structured read parity surface', () => {
    expect(moodComponentRegistry.map((entry) => entry.kind)).toEqual([
      'gallery',
      'sticker',
      'voice',
      'roundvideo',
      'forwarded',
      'reactions',
      'comments',
      'code-block',
      'location',
      'poll',
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
