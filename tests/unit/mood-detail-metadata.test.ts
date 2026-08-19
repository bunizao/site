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

describe('buildMoodDetailMetadata', () => {
  test('uses the first detail image as the share image', () => {
    const post = createPost({
      previewText: 'Strawberry milk',
      bodyHtml: '<p>Strawberry milk</p>',
      media: [{
        type: 'image',
        src: 'https://image.buxx.me/mood/655/0',
        width: 800,
        height: 600,
        alt: 'Strawberry milk',
      }],
    });

    const metadata = buildMoodDetailMetadata(post, '655');

    expect(metadata.title).toBe('Mood #655 — buxx.me');
    expect(metadata.description).toBe('Strawberry milk');
    expect(metadata.image).toBe('https://image.buxx.me/mood/655/0');
    expect(metadata.imageAlt).toBe('Strawberry milk');
    expect(metadata.imageWidth).toBe(800);
    expect(metadata.imageHeight).toBe(600);
  });

  test('does not describe an existing media-only mood as missing', () => {
    const post = createPost({
      id: '664',
      bodyHtml: '',
      media: [{
        type: 'image',
        src: 'https://image.buxx.me/mood/664/0',
        alt: '',
      }],
    });

    const metadata = buildMoodDetailMetadata(post, '664');

    expect(metadata.title).toBe('Mood #664 — buxx.me');
    expect(metadata.description).toBe('Mood #664 from Lucian Bu.');
    expect(metadata.description).not.toBe('Mood not found.');
    expect(metadata.image).toBe('https://image.buxx.me/mood/664/0');
    expect(metadata.imageWidth).toBeNull();
    expect(metadata.imageHeight).toBeNull();
  });

  test('uses bookmark descriptions and the mood card for text-only posts', () => {
    const post = createPost({
      id: '3539',
      previewText: 'https://x.com/dviolettchan/status/2060659248959299645\n\n看哭了',
      bodyHtml: `
        <a href="https://x.com/dviolettchan/status/2060659248959299645">https://x.com/dviolettchan/status/2060659248959299645</a><br><br>看哭了
        <a class="bookmark-card bookmark-card--side-media" href="https://x.com/dviolettchan/status/2060659248959299645">
          <span class="bookmark-card__media bookmark-card__media--side">
            <img src="/static/https:/cdn4.telesco.pe/file/x-avatar.jpg" alt="紫云 (@dviolettchan) on X" />
          </span>
          <span class="bookmark-card__content">
            <span class="bookmark-card__title">紫云 (@dviolettchan) on X</span>
            <span class="bookmark-card__description">紫雪风老师屡次劝退 CS，总有推油觉得我是在恶意贩卖焦虑。</span>
            <span class="bookmark-card__meta">X (formerly Twitter)</span>
          </span>
        </a>
      `,
    });

    const metadata = buildMoodDetailMetadata(post, '3539');

    expect(metadata.description).toBe('紫雪风老师屡次劝退 CS，总有推油觉得我是在恶意贩卖焦虑。');
    expect(metadata.description).not.toContain('https://x.com');
    expect(metadata.image).toBe('/mood-og.png');
    expect(metadata.imageAlt).toBe('Levitating — think, write, whisper');
    expect(metadata.imageWidth).toBe(1200);
    expect(metadata.imageHeight).toBe(630);
  });

  test('keeps not found copy only for missing posts', () => {
    const metadata = buildMoodDetailMetadata(null, '999');

    expect(metadata.title).toBe('Mood not found — buxx.me');
    expect(metadata.description).toBe('Mood not found.');
    expect(metadata.image).toBeUndefined();
  });
});
