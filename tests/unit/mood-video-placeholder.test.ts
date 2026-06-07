import { describe, expect, test } from 'bun:test';
import { addTooBigVideoTimestamp } from '../../src/features/mood/shared/video-placeholder';

describe('addTooBigVideoTimestamp', () => {
  test('adds a compact timestamp to too-big video placeholders', () => {
    const html = addTooBigVideoTimestamp(
      [
        '<a class="video-too-big" href="https://t.me/tutumood/3515">',
        '<span class="video-too-big__content">',
        '<span class="video-too-big__label">Media is too big</span>',
        '</span>',
        '</a>',
      ].join(''),
      '2026-05-24T16:40:21+00:00'
    );

    expect(html).toContain('class="video-too-big__timestamp"');
    expect(html).toContain('datetime="2026-05-24T16:40:21+00:00"');
    expect(html).toContain(new Date('2026-05-24T16:40:21+00:00').toTimeString().slice(0, 5));
  });

  test('does not duplicate existing placeholder timestamps', () => {
    const content = [
      '<a class="video-too-big" href="https://t.me/tutumood/3515">',
      '<time class="video-too-big__timestamp" datetime="2026-05-24T16:40:21+00:00">00:40</time>',
      '</a>',
    ].join('');
    const html = addTooBigVideoTimestamp(content, '2026-05-24T16:40:21+00:00');

    expect(html.match(/video-too-big__timestamp/g)).toHaveLength(1);
  });
});
