import { describe, expect, test } from 'bun:test';
import { getFirstImage, getInlineMediaPreview, getTextPreview } from '../../src/lib/mood-utils';

describe('getFirstImage', () => {
  test('extracts video poster when no img exists', () => {
    const content = `
      <video
        src="/static/https://cdn5.telesco.pe/file/example.mp4"
        poster="/static/https://cdn5.telesco.pe/file/example-poster.jpg"
        controls="true"
      ></video>
    `;

    expect(getFirstImage(content)).toBe('/static/https://cdn5.telesco.pe/file/example-poster.jpg');
  });
});

describe('video-only feed preview heuristic', () => {
  test('can prefer a static image for empty-text video posts', () => {
    const content = `
      <video
        src="/static/https://cdn5.telesco.pe/file/example.mp4"
        poster="/static/https://cdn5.telesco.pe/file/example-poster.jpg"
        controls="true"
      ></video>
    `;

    const mediaPreview = getInlineMediaPreview(content);
    const previewText = getTextPreview({ text: '', content });
    const firstImage = getFirstImage(content);
    const preferStaticImagePreview = mediaPreview?.type === 'video' && !previewText.trim() && Boolean(firstImage);

    expect(mediaPreview?.type).toBe('video');
    expect(previewText).toBe('');
    expect(firstImage).toBe('/static/https://cdn5.telesco.pe/file/example-poster.jpg');
    expect(preferStaticImagePreview).toBe(true);
  });
});
