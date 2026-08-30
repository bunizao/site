import { describe, expect, test } from 'bun:test';

import { splitBlogProse } from '@/features/posts/server/code-blocks';

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
});
