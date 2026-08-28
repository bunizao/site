import { afterEach, describe, expect, test } from 'bun:test';

import { resetAppleMusicEmbedLookupCacheForTests } from '@/features/posts/server/apple-music';
import { renderPostContent } from '@/features/posts/server/rich-content';

const context = {
  slug: 'rich-source-cards',
  locale: 'zh',
  outputTarget: 'preview',
} as const;

afterEach(() => {
  delete process.env.E2E_SITE_FIXTURE;
  resetAppleMusicEmbedLookupCacheForTests();
});

describe('rich post content', () => {
  test('compiles registered Ghost source cards through one interface', async () => {
    process.env.E2E_SITE_FIXTURE = '1';
    const html = [
      '<pre><code>\n[!authors ai=gemini/gemini-3.7-flash note="reviewed the draft"]\n</code></pre>',
      '<pre><code>\n[!music id=1888707290]\n</code></pre>',
      '<pre><code class="language-text">[!authors ai=example/model]</code></pre>',
      '<pre><code class="language-conversation">',
      '```conversation\n@conversation tints=off\nyou: hello\nada: hi\n```',
      '</code></pre>',
    ].join('');

    const result = await renderPostContent(html, context);

    expect(result.meta.authors).toEqual([
      { ai: 'google/gemini-3.7-flash', note: 'reviewed the draft' },
    ]);
    expect(result.html).toContain('data-blog-music');
    expect(result.html).toContain('class="conv-thread"');
    expect(result.html).toContain('<code class="language-text">[!authors ai=example/model]</code>');
    expect(result.html).not.toContain('[!music id=1888707290]');
  });
});
