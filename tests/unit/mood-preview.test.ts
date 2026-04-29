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

  test('preserves sanitized bookmark cards only when requested', () => {
    const content = [
      '<a class="bookmark-card unsafe" href="https://example.org/article" onclick="bad()">',
      '<span class="bookmark-card__content" style="color:red">',
      '<span class="bookmark-card__title">Long title</span>',
      '<span class="bookmark-card__description">Useful description</span>',
      '<span class="bookmark-card__meta">example.org</span>',
      '</span>',
      '</a>',
    ].join('');

    expect(getTextPreviewHtml({ content })).not.toContain('bookmark-card');

    const html = getTextPreviewHtml({ content }, { preserveBookmarks: true });
    expect(html).toContain('class="bookmark-card"');
    expect(html).toContain('class="bookmark-card__title"');
    expect(html).toContain('Useful description');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('unsafe');
  });
});
