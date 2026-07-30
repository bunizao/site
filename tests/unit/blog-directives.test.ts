import { describe, expect, test } from 'bun:test';

import {
  createDirectiveTransformer,
  postDirectiveRegistry,
  transformPostDirectives,
  type BlockDirective,
  type DirectiveContext,
  type InlineDirective,
  type MetaDirective,
} from '@/features/posts/server/directives';
import { isRichDirectiveOutputTarget } from '@/features/posts/server/directives/types';

const context = {
  slug: 'directive-contract',
  locale: 'en',
  outputTarget: 'web',
} satisfies DirectiveContext;

describe('blog directive transformer', () => {
  test('defines rich output targets once for every directive handler', () => {
    expect([
      'web',
      'preview',
      'rss',
      'og',
      'excerpt',
      'agent-markdown',
    ].map((outputTarget) => isRichDirectiveOutputTarget(
      outputTarget as DirectiveContext['outputTarget'],
    ))).toEqual([true, true, false, false, false, false]);
  });

  test('exposes the unwired production registry through the stable two-argument seam', async () => {
    expect(postDirectiveRegistry.map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: 'poem', kind: 'inline' },
      { name: 'footnotes', kind: 'inline' },
      { name: 'mood', kind: 'block' },
      { name: 'music', kind: 'block' },
      { name: 'authors', kind: 'meta' },
    ]);

    const result = await transformPostDirectives('<p>Plain article.</p>', context);

    expect(result).toEqual({
      html: '<p>Plain article.</p>',
      meta: {},
      warnings: [],
    });
  });

  test('replaces a registered block directive through the document seam', async () => {
    const youtube: BlockDirective = {
      name: 'youtube',
      kind: 'block',
      parse(rawAttributes) {
        expect(rawAttributes).toBe('id=abc123');
        return { id: 'abc123' };
      },
      render(attributes, directiveContext) {
        return `<figure data-target="${directiveContext.outputTarget}">${attributes.id}</figure>`;
      },
    };
    const transform = createDirectiveTransformer([youtube]);

    const result = await transform(
      '<p>Before</p><p>[!youtube id=abc123]</p><p>After</p>',
      context,
    );

    expect(result).toEqual({
      html: '<p>Before</p><figure data-target="web">abc123</figure><p>After</p>',
      meta: {},
      warnings: [],
    });
  });

  test('strips registered meta directives and hoists every parsed value', async () => {
    const authors: MetaDirective = {
      name: 'authors',
      kind: 'meta',
      parse(rawAttributes) {
        const fixtures: Record<string, Record<string, string>> = {
          'ai="claude-opus-5" role="research"': {
            ai: 'claude-opus-5',
            role: 'research',
          },
          'ai="gpt-5" role="factcheck"': {
            ai: 'gpt-5',
            role: 'factcheck',
          },
        };
        return fixtures[rawAttributes];
      },
    };
    const transform = createDirectiveTransformer([authors]);

    const result = await transform(
      [
        '<p>[!authors ai="claude-opus-5" role="research"]</p>',
        '<p>Article body</p>',
        '<p>[!authors ai="gpt-5" role="factcheck"]</p>',
      ].join(''),
      context,
    );

    expect(result).toEqual({
      html: '<p>Article body</p>',
      meta: {
        authors: [
          { ai: 'claude-opus-5', role: 'research' },
          { ai: 'gpt-5', role: 'factcheck' },
        ],
      },
      warnings: [],
    });
  });

  test('preserves unknown directives and reports them with the post slug', async () => {
    const known: BlockDirective = {
      name: 'known',
      kind: 'block',
      parse: () => ({}),
      render: () => '<aside>Known</aside>',
    };
    const transform = createDirectiveTransformer([known]);
    const html = '<p>[!known]</p><p>Keep [!future mode="safe"] here.</p>';

    const result = await transform(html, context);

    expect(result).toEqual({
      html: '<aside>Known</aside><p>Keep [!future mode="safe"] here.</p>',
      meta: {},
      warnings: [
        {
          code: 'unknown-directive',
          directive: 'future',
          slug: 'directive-contract',
          message: 'Unknown directive "future" in post "directive-contract".',
        },
      ],
    });
  });

  test('runs an inline directive across the complete document', async () => {
    const footnotes: InlineDirective = {
      name: 'footnotes',
      kind: 'inline',
      transform(html, directiveContext) {
        expect(directiveContext.slug).toBe('directive-contract');
        return html.replace(
          '<p>Reference [^ghost].</p><p>[^ghost]: Definition.</p>',
          '<p>Reference <sup>1</sup>.</p><ol><li>Definition.</li></ol>',
        );
      },
    };
    const transform = createDirectiveTransformer([footnotes]);

    const result = await transform(
      '<p>Reference [^ghost].</p><p>[^ghost]: Definition.</p>',
      context,
    );

    expect(result).toEqual({
      html: '<p>Reference <sup>1</sup>.</p><ol><li>Definition.</li></ol>',
      meta: {},
      warnings: [],
    });
  });

  test('leaves code, pre, script, and style regions completely untouched', async () => {
    const card: BlockDirective = {
      name: 'card',
      kind: 'block',
      parse: () => ({}),
      render: () => '<aside>Card</aside>',
    };
    const replaceToken: InlineDirective = {
      name: 'replace-token',
      kind: 'inline',
      transform: (html) => html.replaceAll('TOKEN', 'changed'),
    };
    const transform = createDirectiveTransformer([card, replaceToken]);
    const protectedHtml = [
      '<code>[!future] TOKEN</code>',
      '<pre><code>[!card] TOKEN</code></pre>',
      '<script>const card = `<p>[!card]</p>`; const value = "TOKEN [!future]";</script>',
      '<style>.TOKEN::after { content: "[!future]"; }</style>',
    ].join('');

    const result = await transform(
      `<p>[!card]</p><p>TOKEN</p>${protectedHtml}`,
      context,
    );

    expect(result).toEqual({
      html: `<aside>Card</aside><p>changed</p>${protectedHtml}`,
      meta: {},
      warnings: [],
    });
  });

  test('rejects duplicate registry names before transforming a document', () => {
    const first: BlockDirective = {
      name: 'Card',
      kind: 'block',
      parse: () => ({}),
      render: () => '<aside>First</aside>',
    };
    const second: MetaDirective = {
      name: 'card',
      kind: 'meta',
      parse: () => ({}),
    };

    expect(() => createDirectiveTransformer([first, second])).toThrow(
      'Duplicate directive name "card".',
    );
  });

  test('collects warnings emitted by an inline directive', async () => {
    const footnotes: InlineDirective = {
      name: 'footnotes',
      kind: 'inline',
      transform(html, directiveContext) {
        return {
          html: html.replace('[^missing]', '<sup>1</sup>'),
          warnings: [
            {
              code: 'orphan-reference',
              directive: 'footnotes',
              message: `Missing footnote in post "${directiveContext.slug}".`,
            },
          ],
        };
      },
    };
    const transform = createDirectiveTransformer([footnotes]);

    const result = await transform('<p>Reference [^missing].</p>', context);

    expect(result).toEqual({
      html: '<p>Reference <sup>1</sup>.</p>',
      meta: {},
      warnings: [
        {
          code: 'orphan-reference',
          directive: 'footnotes',
          message: 'Missing footnote in post "directive-contract".',
        },
      ],
    });
  });
});
