import { afterEach, describe, expect, test } from 'bun:test';

import { resetAppleMusicEmbedLookupCacheForTests } from '@/features/posts/server/apple-music';
import { renderPostContent } from '@/features/posts/server/rich-content';
import { readAuthorshipCredits } from '@/features/posts/server/directives/authors';

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

  test('hoists several long Markdown authorship notes from one Ghost code card', async () => {
    const firstNote = `Organized the transcripts and ${'expanded the bridging narration. '.repeat(8)}`;
    const secondNote = 'Translated the article from **Chinese** into English.';
    const result = await renderPostContent(
      [
        '<figure class="kg-card kg-code-card"><pre><code>',
        `[!authors ai=google/gemini-3.7-flash note="${firstNote}"]\n`,
        `[!authors ai=google/gemini-3.7-flash note="${secondNote}"]`,
        '</code></pre></figure>',
      ].join(''),
      context,
    );

    expect(result.html).not.toContain('[!authors');
    const [credit] = readAuthorshipCredits(result.meta, context.slug);
    expect(credit?.model.id).toBe('google/gemini-3.7-flash');
    expect(credit?.note).toBe(`${firstNote.trim()}, ${secondNote}`);
  });
});
