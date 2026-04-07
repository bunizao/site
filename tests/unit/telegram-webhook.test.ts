import { describe, expect, test } from 'bun:test';
import { resolveMoodImageTargetFromHtml, selectMoodStaticImageFile } from '../../src/pages/api/telegram-webhook';

describe('resolveMoodImageTargetFromHtml', () => {
  test('maps the first media group item to index 0', () => {
    const html = `
      <div class="tgme_widget_message" data-post="tutumood/3190">
        <a class="tgme_widget_message_photo_wrap" href="https://t.me/tutumood/3190?single"></a>
        <a class="tgme_widget_message_photo_wrap" href="https://t.me/tutumood/3191?single"></a>
      </div>
    `;

    expect(resolveMoodImageTargetFromHtml(html, '3190', 'tutumood', 't.me')).toEqual({
      postId: '3190',
      imageIndex: 0,
    });
  });

  test('maps later media group items back to the root post id', () => {
    const html = `
      <div class="tgme_widget_message" data-post="tutumood/3191">
        <a class="tgme_widget_message_photo_wrap" href="https://t.me/tutumood/3190?single"></a>
        <a class="tgme_widget_message_photo_wrap" href="https://t.me/tutumood/3191?single"></a>
      </div>
    `;

    expect(resolveMoodImageTargetFromHtml(html, '3191', 'tutumood', 't.me')).toEqual({
      postId: '3190',
      imageIndex: 1,
    });
  });

  test('maps video-wrapped media group items back to the root post id', () => {
    const html = `
      <div class="tgme_widget_message" data-post="tutumood/5002">
        <a class="tgme_widget_message_video_wrap" href="https://t.me/tutumood/5001?single"></a>
        <a class="tgme_widget_message_video_wrap" href="https://t.me/tutumood/5002?single"></a>
      </div>
    `;

    expect(resolveMoodImageTargetFromHtml(html, '5002', 'tutumood', 't.me')).toEqual({
      postId: '5001',
      imageIndex: 1,
    });
  });
});

describe('selectMoodStaticImageFile', () => {
  test('prefers the largest photo when the message has photos', () => {
    const file = selectMoodStaticImageFile({
      message_id: 1,
      photo: [
        { file_id: 'small-photo', file_unique_id: 'p1', width: 320, height: 240 },
        { file_id: 'large-photo', file_unique_id: 'p2', width: 1280, height: 960 },
      ],
    });

    expect(file?.file_id).toBe('large-photo');
  });

  test('falls back to video cover when the message has no photo', () => {
    const file = selectMoodStaticImageFile({
      message_id: 2,
      video: {
        cover: [
          { file_id: 'cover-small', file_unique_id: 'c1', width: 320, height: 240 },
          { file_id: 'cover-large', file_unique_id: 'c2', width: 1280, height: 960 },
        ],
      },
    });

    expect(file?.file_id).toBe('cover-large');
  });

  test('falls back to animation or document thumbnail when no better still exists', () => {
    expect(selectMoodStaticImageFile({
      message_id: 3,
      animation: {
        thumbnail: { file_id: 'anim-thumb', file_unique_id: 'a1', width: 640, height: 360 },
      },
    })?.file_id).toBe('anim-thumb');

    expect(selectMoodStaticImageFile({
      message_id: 4,
      document: {
        thumbnail: { file_id: 'doc-thumb', file_unique_id: 'd1', width: 640, height: 360 },
      },
    })?.file_id).toBe('doc-thumb');
  });
});
