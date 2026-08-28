import { describe, expect, test } from 'bun:test';
import { docsHtmlToText } from '../../src/features/docs/server/search-text';

describe('docs search text', () => {
  test('strips markup and decodes supported entities once', () => {
    const html = '<p>A&nbsp;&amp;&nbsp;B &lt; C &quot;quoted&quot;</p>';

    expect(docsHtmlToText(html)).toBe('A & B < C "quoted"');
  });

  test('does not turn double-escaped markup into active text', () => {
    const html = '<p>&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;</p>';

    expect(docsHtmlToText(html)).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('removes script and style contents', () => {
    const html = '<style>.secret { color: red; }</style><p>Visible</p><script>alert(1)</script>';

    expect(docsHtmlToText(html)).toBe('Visible');
  });
});
