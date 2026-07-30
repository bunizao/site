import { describe, expect, test } from 'bun:test';

import {
  transformPostDirectives,
  type DirectiveContext,
} from '@/features/posts/server/directives';

const context = {
  slug: 'footnote-contract',
  locale: 'en',
  outputTarget: 'web',
} satisfies DirectiveContext;

describe('blog footnotes directive', () => {
  test('numbers labels by first reference and links repeated references uniquely', async () => {
    const result = await transformPostDirectives([
      '<p>Later first[^later], then first[^first], then later again[^later].</p>',
      '<p>[^first]: <em>First definition</em>.</p>',
      '<p>[^later]: Later definition.</p>',
    ].join(''), context);

    expect(result).toEqual({
      html: [
        '<p>Later first<sup class="blog-fn-ref" id="fnref-1"><a href="#fn-1">1</a></sup>, ',
        'then first<sup class="blog-fn-ref" id="fnref-2"><a href="#fn-2">2</a></sup>, ',
        'then later again<sup class="blog-fn-ref" id="fnref-1b"><a href="#fn-1">1</a></sup>.</p>',
        '<section class="blog-footnotes"><ol>',
        '<li id="fn-1">Later definition. <a class="blog-fn-back" href="#fnref-1">↩</a></li>',
        '<li id="fn-2"><em>First definition</em>. <a class="blog-fn-back" href="#fnref-2">↩</a></li>',
        '</ol></section>',
      ].join(''),
      meta: {},
      warnings: [],
    });
  });

  test('leaves regex character classes and definitions inside protected code untouched', async () => {
    const protectedHtml = [
      '<pre class="language-js"><code>const value = /[^x]/;</code></pre>',
      '<code>[^inline]: not a definition</code>',
    ].join('');
    const result = await transformPostDirectives([
      protectedHtml,
      '<p>Visible reference[^visible].</p>',
      '<p>[^visible]: Visible definition.</p>',
    ].join(''), context);

    expect(result.html.startsWith(protectedHtml)).toBe(true);
    expect(result.html).toContain('<li id="fn-1">Visible definition.');
    expect(result.warnings).toEqual([]);
  });

  test('warns with the slug for orphan references and definitions', async () => {
    const result = await transformPostDirectives(
      '<p>Missing[^missing].</p><p>[^unused]: Unused definition.</p>',
      context,
    );

    expect(result).toEqual({
      html: '<p>Missing<sup class="blog-fn-ref" id="fnref-1">1</sup>.</p>',
      meta: {},
      warnings: [
        {
          code: 'orphan-reference',
          directive: 'footnotes',
          slug: 'footnote-contract',
          message: 'Missing footnote definition "missing" in post "footnote-contract".',
        },
        {
          code: 'orphan-definition',
          directive: 'footnotes',
          slug: 'footnote-contract',
          message: 'Unused footnote definition "unused" in post "footnote-contract".',
        },
      ],
    });
  });

  test('uses canonical post links outside page HTML without dangling fragments', async () => {
    for (const outputTarget of ['rss', 'agent-markdown'] as const) {
      const result = await transformPostDirectives(
        '<p>External reference[^external].</p><p>[^external]: External definition.</p>',
        { ...context, outputTarget },
      );

      expect(result.html).toContain(
        'href="https://buxx.me/blog/footnote-contract/#fn-1"',
      );
      expect(result.html).toContain(
        'href="https://buxx.me/blog/footnote-contract/#fnref-1"',
      );
      expect(result.html).not.toContain('href="#');
    }
  });

  test('inlines plain definition text in excerpt and OG output', async () => {
    const html = [
      '<p>Short reference[^short].</p>',
      '<p>[^short]: Read <a href="https://example.com/source">the source</a>.</p>',
    ].join('');

    for (const outputTarget of ['excerpt', 'og'] as const) {
      const result = await transformPostDirectives(html, { ...context, outputTarget });

      expect(result).toEqual({
        html: '<p>Short reference (Read the source.).</p>',
        meta: {},
        warnings: [],
      });
    }
  });

  test('preserves definition body HTML in the single post-wide section', async () => {
    const result = await transformPostDirectives([
      '<p>Reference[^rich].</p>',
      '<p>Middle paragraph.</p>',
      '<p>[^rich]: <a href="https://example.com">Linked</a> and <strong>bold</strong>.</p>',
    ].join(''), context);

    expect(result.html).toEndWith([
      '<section class="blog-footnotes"><ol>',
      '<li id="fn-1"><a href="https://example.com">Linked</a> and <strong>bold</strong>. ',
      '<a class="blog-fn-back" href="#fnref-1">↩</a></li>',
      '</ol></section>',
    ].join(''));
    expect(result.html.match(/class="blog-footnotes"/gu)).toHaveLength(1);
  });
});
