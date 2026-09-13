import { describe, expect, test } from 'bun:test';

import {
  normalizeDirectiveCodeBlocks,
  splitBlogProse,
} from '@/features/posts/server/code-blocks';

describe('blog code blocks', () => {
  test('promotes Ghost code cards into shared code box fragments', () => {
    const fragments = splitBlogProse([
      '<p>Before</p>',
      '<figure class="kg-card kg-code-card">',
      '<pre><code class="language-ts">const value = 1 &lt; 2;</code></pre>',
      '</figure>',
      '<p>After</p>',
    ].join(''));

    expect(fragments).toEqual([
      { kind: 'html', html: '<p>Before</p>' },
      { kind: 'code', code: 'const value = 1 < 2;', lang: 'ts' },
      { kind: 'html', html: '<p>After</p>' },
    ]);
  });

  test('promotes bare code blocks and leaves other preformatted content intact', () => {
    const fragments = splitBlogProse([
      '<pre>terminal output</pre>',
      '<pre><code class="lang-shell">bun run build</code></pre>',
    ].join(''));

    expect(fragments).toEqual([
      { kind: 'html', html: '<pre>terminal output</pre>' },
      { kind: 'code', code: 'bun run build', lang: 'shell' },
    ]);
  });

  test('promotes Mermaid code blocks into diagram fragments', () => {
    const fragments = splitBlogProse([
      '<p>Before</p>',
      '<pre><code class="language-mermaid">flowchart LR\n  A --&gt; B</code></pre>',
      '<p>After</p>',
    ].join(''));

    expect(fragments).toEqual([
      { kind: 'html', html: '<p>Before</p>' },
      { kind: 'mermaid', source: 'flowchart LR\n  A --> B' },
      { kind: 'html', html: '<p>After</p>' },
    ]);
  });

  test('normalizes several directives from one Ghost code card', () => {
    const html = [
      '<p>Before</p>',
      '<figure class="kg-card kg-code-card"><pre><code>',
      '[!authors ai=google/gemini-3.7-flash note="drafted the article"]\n',
      '[!authors ai=google/gemini-3.7-flash note="translated into **English**"]',
      '</code></pre></figure>',
      '<p>After</p>',
    ].join('');

    expect(normalizeDirectiveCodeBlocks(html, new Set(['authors']))).toBe([
      '<p>Before</p>',
      '<p>[!authors ai=google/gemini-3.7-flash note="drafted the article"]</p>',
      '<p>[!authors ai=google/gemini-3.7-flash note="translated into **English**"]</p>',
      '<p>After</p>',
    ].join(''));
  });

  test('rebuilds a poem code card into the blockquote shape poem.ts already parses', () => {
    const html = [
      '<p>Before</p>',
      '<pre><code class="language-directive">',
      '[!poem] Night Song [center]\n',
      'First line\n',
      'Second line\n',
      '\n',
      '— Ada',
      '</code></pre>',
      '<p>After</p>',
    ].join('');

    // "poem" is deliberately absent from directiveNames (it is registered as
    // an inline directive, so the generic marker-only carrier never includes
    // it) — the poem body shape is recognised on its own.
    expect(normalizeDirectiveCodeBlocks(html, new Set(['authors', 'music']))).toBe([
      '<p>Before</p>',
      '<blockquote>[!poem] Night Song [center]<br>First line<br>Second line<br><br>— Ada</blockquote>',
      '<p>After</p>',
    ].join(''));
  });

  test('leaves a directive code card with no poem marker untouched', () => {
    const html = '<pre><code class="language-directive">Just some text\nwith two lines</code></pre>';

    expect(normalizeDirectiveCodeBlocks(html, new Set(['authors']))).toBe(html);
  });
});
