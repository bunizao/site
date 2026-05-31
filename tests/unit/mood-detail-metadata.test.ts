import { describe, expect, test } from 'bun:test';
import { buildMoodDetailMetadata } from '../../src/features/mood/server/detail-metadata';
import type { Post } from '../../src/features/mood/server/telegram-source';

const createPost = (overrides: Partial<Post> = {}): Post => ({
  id: '655',
  title: '',
  type: 'text',
  datetime: '2023-06-02T14:09:23+00:00',
  tags: [],
  text: '',
  content: '',
  reactions: [],
  commentsCount: 0,
  ...overrides,
});

describe('buildMoodDetailMetadata', () => {
  test('uses the first detail image as the share image', () => {
    const post = createPost({
      text: 'Strawberry milk',
      content: `
        <div class="image-list-container image-list-odd">
          <button class="image-preview-wrap" style="--image-width:800px;--image-height:600px">
            <img src="https://image.buxx.me/mood/655/0" width="800" height="600" alt="Strawberry milk" />
          </button>
        </div>
        Strawberry milk
      `,
    });

    const metadata = buildMoodDetailMetadata(post, '655');

    expect(metadata.title).toBe('Mood #655 | Bunizao');
    expect(metadata.description).toBe('Strawberry milk');
    expect(metadata.image).toBe('https://image.buxx.me/mood/655/0');
    expect(metadata.imageAlt).toBe('Strawberry milk');
    expect(metadata.imageWidth).toBe(800);
    expect(metadata.imageHeight).toBe(600);
  });

  test('does not describe an existing media-only mood as missing', () => {
    const post = createPost({
      id: '664',
      content: `
        <div class="image-list-container image-list-odd">
          <button class="image-preview-wrap">
            <img src="https://image.buxx.me/mood/664/0" alt="" />
          </button>
        </div>
      `,
    });

    const metadata = buildMoodDetailMetadata(post, '664');

    expect(metadata.title).toBe('Mood #664 | Bunizao');
    expect(metadata.description).toBe('Mood #664 from Bunizao.');
    expect(metadata.description).not.toBe('Mood not found.');
    expect(metadata.image).toBe('https://image.buxx.me/mood/664/0');
    expect(metadata.imageWidth).toBeNull();
    expect(metadata.imageHeight).toBeNull();
  });

  test('keeps not found copy only for missing posts', () => {
    const metadata = buildMoodDetailMetadata(null, '999');

    expect(metadata.title).toBe('Mood not found | Moods');
    expect(metadata.description).toBe('Mood not found.');
    expect(metadata.image).toBeUndefined();
  });
});
