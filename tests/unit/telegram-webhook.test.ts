import { describe, expect, test } from 'bun:test';
import { resolveMoodImageTargetFromHtml } from '../../src/pages/api/telegram-webhook';

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
});
