import { describe, expect, test } from 'bun:test';
import { getTextPreviewHtml } from '../../src/features/mood/shared/utils';

describe('getTextPreviewHtml', () => {
  test('preserves safe rich text tags in mood previews', () => {
    const html = getTextPreviewHtml({
      content: '<blockquote><strong>Bold quote</strong><br><code>answer</code></blockquote>',
    });

    expect(html).toContain('<blockquote>');
    expect(html).toContain('<strong>Bold quote</strong>');
    expect(html).toContain('<code>answer</code>');
  });
});
