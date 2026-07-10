import { describe, expect, test } from 'bun:test';

import {
  getMoodGallery,
  renderMoodContentWithGalleries,
  replaceMoodGalleryWithPlaceholders,
} from '../../src/features/mood/shared/gallery';

const multiImageContent = [
  '<p>Before gallery</p>',
  '<div class="image-list-container image-list-odd">',
  '  <button class="image-preview-button image-preview-wrap image-preview-wrap--portrait" style="--image-width:720px;--image-height:960px">',
  '    <img src="https://image.example.test/mood/1/0" data-fallback-src="/static/https://cdn.example.test/0.jpg" alt="" width="720" height="960" />',
  '  </button>',
  '  <button class="image-preview-button modal"><img class="modal-img" src="https://image.example.test/mood/1/0" alt="" /></button>',
  '  <button class="image-preview-button image-preview-wrap" style="--image-width:1200px;--image-height:900px">',
  '    <img src="https://image.example.test/mood/1/1" data-fallback-src="/static/https://cdn.example.test/1.jpg" alt="" width="1200" height="900" />',
  '  </button>',
  '  <button class="image-preview-button modal"><img class="modal-img" src="https://image.example.test/mood/1/1" alt="" /></button>',
  '  <button class="image-preview-button image-preview-wrap image-preview-wrap--ultra-tall" style="--image-width:540px;--image-height:1200px">',
  '    <img src="https://image.example.test/mood/1/2" data-fallback-src="/static/https://cdn.example.test/2.jpg" alt="" width="540" height="1200" />',
  '  </button>',
  '</div>',
  '<p>After gallery</p>',
].join('');

const singleImageContent = [
  '<p>Single image post</p>',
  '<button class="image-preview-button image-preview-wrap image-preview-wrap--portrait" style="--image-width:720px;--image-height:960px">',
  '  <img src="https://image.example.test/mood/1/0" data-fallback-src="/static/https://cdn.example.test/0.jpg" alt="" width="720" height="960" />',
  '</button>',
  '<button class="image-preview-button modal"><img class="modal-img" src="https://image.example.test/mood/1/0" alt="" /></button>',
].join('');

describe('mood gallery extraction', () => {
  test('extracts all non-modal images from an image list container', () => {
    const gallery = getMoodGallery(multiImageContent);

    expect(gallery).not.toBeNull();
    expect(gallery?.count).toBe(3);
    expect(gallery?.items[0]).toEqual({
      src: 'https://image.example.test/mood/1/0',
      fallbackSrc: '/static/https://cdn.example.test/0.jpg',
      width: 720,
      height: 960,
      layout: 'portrait',
      alt: '',
    });
    expect(gallery?.items[2]?.layout).toBe('ultra-tall');
  });

  test('reads Telegram photo aspect ratio from the child placeholder', () => {
    const gallery = getMoodGallery([
      '<a class="tgme_widget_message_photo_wrap" href="https://t.me/tutumood/3579" style="width:800px;background-image:url(\'https://cdn5.telesco.pe/file/photo.jpg\')">',
      '  <div class="tgme_widget_message_photo" style="padding-top:20.625%"></div>',
      '</a>',
    ].join(''));

    expect(gallery?.items[0]).toMatchObject({
      src: 'https://cdn5.telesco.pe/file/photo.jpg',
      width: 800,
      height: 165,
      layout: 'landscape',
    });
  });

  test('replaces gallery blocks with placeholders before rendering', () => {
    const result = replaceMoodGalleryWithPlaceholders(multiImageContent);

    expect(result.placeholders).toHaveLength(1);
    expect(result.contentHtml).toContain('data-mood-gallery-placeholder="0"');
    expect(result.contentHtml).not.toContain('image-list-container');
  });

  test('renders shared detail gallery markup in-place', () => {
    const html = renderMoodContentWithGalleries(multiImageContent);

    expect(html).toContain('Before gallery');
    expect(html).toContain('After gallery');
    expect(html).toContain('data-mood-gallery');
    expect(html).toContain('mood-gallery--detail');
    expect(html).toContain('data-deferred-src="https://image.example.test/mood/1/2"');
    expect(html).not.toContain('data-deferred-srcset');
    expect(html).not.toContain('?w=');
    expect(html).not.toContain('image-list-container');
    expect(html).not.toContain('modal-img');
  });

  test('leaves single-image markup untouched', () => {
    const html = renderMoodContentWithGalleries(singleImageContent);

    expect(html).toContain('image-preview-wrap');
    expect(html).not.toContain('data-mood-gallery');
    expect(html).toContain('modal-img');
  });
});
