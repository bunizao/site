import { describe, expect, test } from 'bun:test';

import { commentMarkdownToHtml, parseCommentMarkdown, safeHref } from '../../src/features/comments/comment-markdown';

const html = (src: string) => commentMarkdownToHtml(src);

describe('inline', () => {
  test('bold, italic and code', () => {
    expect(html('**bold** and *soft* and `code()`')).toBe(
      '<p><strong>bold</strong> and <em>soft</em> and <code>code()</code></p>',
    );
  });

  test('code wins over everything inside it', () => {
    // Someone showing what Markdown looks like is the single most likely
    // reason for a backtick to appear in a comment about this feature.
    expect(html('use `**bold**` for bold')).toBe('<p>use <code>**bold**</code> for bold</p>');
  });

  test('an underscore inside a word is a word, not emphasis', () => {
    expect(html('call read_comment_text first')).toBe('<p>call read_comment_text first</p>');
    expect(html('_this_ one is emphasis')).toBe('<p><em>this</em> one is emphasis</p>');
  });

  test('an unclosed marker is the character it is', () => {
    expect(html('2 * 3 * 4 is **12')).toBe('<p>2 * 3 * 4 is **12</p>');
    expect(html('an [unfinished link')).toBe('<p>an [unfinished link</p>');
  });

  test('a newline inside a paragraph is a line break', () => {
    // The box is a textarea. Enter means the next line, and CommonMark's
    // soft-break-is-a-space rule would silently reflow it.
    expect(html('one\ntwo')).toBe('<p>one<br>two</p>');
  });
});

describe('links', () => {
  test('written links carry the comment rel set', () => {
    expect(html('[docs](https://buxx.me/docs)')).toBe(
      '<p><a href="https://buxx.me/docs" target="_blank" rel="nofollow ugc noopener noreferrer">docs</a></p>',
    );
  });

  test('a path on this site is navigation, not an exit', () => {
    expect(html('[that post](/blog/hello)')).toBe('<p><a href="/blog/hello">that post</a></p>');
  });

  test('a bare URL links itself and gives back the sentence punctuation', () => {
    expect(html('see https://buxx.me/blog.')).toBe(
      '<p>see <a href="https://buxx.me/blog" target="_blank" rel="nofollow ugc noopener noreferrer">https://buxx.me/blog</a>.</p>',
    );
  });

  test('a closing paren is kept when the URL opened one', () => {
    const src = 'https://en.wikipedia.org/wiki/Mercury_(planet)';
    expect(html(src)).toContain(`href="${src}"`);
    expect(html(`(${src})`)).toContain(`href="${src}"`);
  });
});

describe('blocks', () => {
  test('fenced code keeps its lines and its characters', () => {
    expect(html('```\nif (a < b) {\n}\n```')).toBe('<pre><code>if (a &lt; b) {\n}</code></pre>');
  });

  test('an unclosed fence runs to the end of the comment', () => {
    expect(html('```\nstill code')).toBe('<pre><code>still code</code></pre>');
  });

  test('quotes and lists', () => {
    expect(html('> quoted\n> lines')).toBe('<blockquote>quoted<br>lines</blockquote>');
    expect(html('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
    expect(html('1. one\n2. two')).toBe('<ol><li>one</li><li>two</li></ol>');
  });

  test('a blank line separates paragraphs', () => {
    expect(html('one\n\ntwo')).toBe('<p>one</p><p>two</p>');
  });

  test('nothing in, nothing out', () => {
    expect(parseCommentMarkdown('')).toEqual([]);
    expect(html('   \n  ')).toBe('');
  });
});

describe('a comment cannot become markup', () => {
  test('HTML in the source is text', () => {
    expect(html('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(html('<img src=x onerror=alert(1)>')).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });

  test('a script URL is not a link', () => {
    // Rendered as the text it was written as: a link whose destination the
    // reader cannot see is worse than no link.
    expect(html('[click](javascript:alert(1))')).toBe('<p>[click](javascript:alert(1))</p>');
    expect(html('[click](data:text/html,<script>alert(1)</script>)')).toContain('[click](data:text/html');
    expect(html('[click](  javascript:alert(1)  )')).toBe('<p>[click](  javascript:alert(1)  )</p>');
  });

  test('safeHref refuses the usual dodges', () => {
    expect(safeHref('java\nscript:alert(1)')).toBeNull();
    expect(safeHref('JavaScript:alert(1)')).toBeNull();
    // Protocol-relative reads local and is not.
    expect(safeHref('//evil.example/x')).toBeNull();
    expect(safeHref('https://buxx.me')).toEqual({ href: 'https://buxx.me', external: true });
    expect(safeHref('/blog/x')).toEqual({ href: '/blog/x', external: false });
  });

  test('a quote in a link label cannot break out of the attribute', () => {
    expect(html('[a" onmouseover="x](https://buxx.me)')).toContain('>a&quot; onmouseover=&quot;x</a>');
  });
});
