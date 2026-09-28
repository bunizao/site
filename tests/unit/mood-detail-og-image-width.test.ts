import { describe, expect, test } from 'bun:test';
import type { MoodContentDocument } from '@bunizao/contracts';
import { buildMoodDetailMetadata } from '../../src/features/mood/server/detail-metadata';

const createPost = (overrides: Partial<MoodContentDocument> = {}): MoodContentDocument => ({
  id: '655',
  source: 'mood',
  datetime: '2023-06-02T14:09:23+00:00',
  bodyHtml: '',
  media: [],
  reactions: [],
  commentsCount: 0,
  ...overrides,
});

describe('buildMoodDetailMetadata og:image width', () => {
  test('tags a proxy-backed image with the crawler width so it hits the built cache entry', () => {
    const post = createPost({
      media: [{
        type: 'image',
        src: 'https://buxx.me/api/v2/images/mood/655/0',
        width: 800,
        height: 600,
        alt: 'Strawberry milk',
      }],
    });

    const metadata = buildMoodDetailMetadata(post, '655');

    expect(metadata.image).toBe('https://buxx.me/api/v2/images/mood/655/0?w=1200');
  });

  test('leaves a non-proxy image URL untouched', () => {
    const post = createPost({
      media: [{
        type: 'image',
        src: 'https://cdn4.telesco.pe/file/some-legacy-photo.jpg',
        width: 800,
        height: 600,
        alt: 'Legacy photo',
      }],
    });

    const metadata = buildMoodDetailMetadata(post, '655');

    expect(metadata.image).toBe('https://cdn4.telesco.pe/file/some-legacy-photo.jpg');
  });
});
