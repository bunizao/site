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

  test('renders the same poem from the blockquote marker and the directive code card', async () => {
    const blockquoteForm = [
      '<blockquote>[!poem] Ferry Lights<br>',
      'The lanterns swing,<br>slow gold against the dark.<br><br>',
      'We wait for morning,<br>for bread and quiet talk.<br><br>',
      '— Wendell</blockquote>',
    ].join('');
    const codeCardForm = [
      '<pre><code class="language-directive">[!poem] Ferry Lights\n',
      'The lanterns swing,\nslow gold against the dark.\n\n',
      'We wait for morning,\nfor bread and quiet talk.\n\n',
      '— Wendell</code></pre>',
    ].join('');

    const [fromBlockquote, fromCodeCard] = await Promise.all([
      renderPostContent(blockquoteForm, context),
      renderPostContent(codeCardForm, context),
    ]);

    expect(fromCodeCard.html).toBe(fromBlockquote.html);
    expect(fromCodeCard.warnings).toEqual([]);
    expect(fromBlockquote.warnings).toEqual([]);
    expect(fromBlockquote.html).toContain('class="blog-poem__title"');
    expect(fromBlockquote.html).toContain('class="blog-poem__attribution"');
  });
});
