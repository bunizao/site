import { afterEach, describe, expect, test } from 'bun:test';

import {
  enrichAppleMusicEmbeds,
  resetAppleMusicEmbedLookupCacheForTests,
} from '@/features/posts/server/apple-music';
import {
  transformPostDirectives,
  type DirectiveContext,
} from '@/features/posts/server/directives';
import { moodDirective } from '@/features/posts/server/directives/mood';
import { musicDirective } from '@/features/posts/server/directives/music';
import { poemDirective } from '@/features/posts/server/directives/poem';
import { enrichMoodEmbeds } from '@/features/posts/server/mood-embed';

const originalE2eFixture = process.env.E2E_SITE_FIXTURE;
const originalFetch = globalThis.fetch;

const context = {
  slug: 'directive-handler-contract',
  locale: 'en',
  outputTarget: 'web',
} satisfies DirectiveContext;

afterEach(() => {
  if (originalE2eFixture === undefined) {
    delete process.env.E2E_SITE_FIXTURE;
  } else {
    process.env.E2E_SITE_FIXTURE = originalE2eFixture;
  }
  globalThis.fetch = originalFetch;
  resetAppleMusicEmbedLookupCacheForTests();
});

describe('poem directive', () => {
  test('ports the explicit marker form with its legacy modifiers', async () => {
    const html = [
      '<blockquote data-source="ghost">',
      '<em>[!poem] Night Song [plain] [center]</em><br>',
      'First line<br>Second line<br><br>— Ada',
      '</blockquote>',
    ].join('');

    const output = await poemDirective.transform(html, context);

    expect(output).toEqual({
      html: [
        '<blockquote data-source="ghost" class="blog-poem blog-poem--center blog-poem--plain">',
        '<p class="blog-poem__title">Night Song</p>',
        '<p>First line<br>Second line</p>',
        '<cite class="blog-poem__attribution">— Ada</cite>',
        '</blockquote>',
      ].join(''),
      warnings: [],
    });
  });

  test('ports the trailing dash attribution form', async () => {
    const output = await poemDirective.transform(
      '<blockquote><p>The sea keeps its counsel — Ada</p></blockquote>',
      { ...context, outputTarget: 'preview' },
    );

    expect(output).toEqual({
      html: [
        '<blockquote class="blog-poem">',
        '<p>The sea keeps its counsel</p>',
        '<cite class="blog-poem__attribution">— Ada</cite>',
        '</blockquote>',
      ].join(''),
      warnings: [],
    });
  });

  test('ports hand-broken verse and leaves ordinary prose quotes unchanged', async () => {
    const html = [
      '<blockquote>First<br>Second<br>Third</blockquote>',
      '<blockquote><p>One ordinary sentence.</p></blockquote>',
    ].join('');

    const output = await poemDirective.transform(
      html,
      { ...context, outputTarget: 'rss' },
    );

    expect(output).toEqual({
      html: [
        '<blockquote class="blog-poem"><p>First<br>Second<br>Third</p></blockquote>',
        '<blockquote><p>One ordinary sentence.</p></blockquote>',
      ].join(''),
      warnings: [],
    });
  });

  test('uses semantic text markup on text-oriented targets', async () => {
    for (const outputTarget of ['og', 'excerpt', 'agent-markdown'] as const) {
      const output = await poemDirective.transform(
        '<blockquote>[!poem] Small Song [center]<br>First<br>Second</blockquote>',
        { ...context, outputTarget },
      );

      expect(output).toEqual({
        html: [
          '<blockquote>',
          '<p>Small Song</p>',
          '<p>First<br>Second</p>',
          '</blockquote>',
        ].join(''),
        warnings: [],
      });
    }
  });

  test('reports an empty explicit poem with the post slug', async () => {
    const html = '<blockquote><em>[!poem] Empty</em></blockquote>';

    const output = await poemDirective.transform(html, context);

    expect(output).toEqual({
      html,
      warnings: [
        {
          code: 'invalid-directive-content',
          directive: 'poem',
          slug: 'directive-handler-contract',
          message: 'Invalid "poem" directive in post "directive-handler-contract": poem body is empty.',
        },
      ],
    });
  });

  test('adds one real class attribute without rewriting data-class', async () => {
    const html = [
      '<blockquote data-class="legacy">First<br>Second<br>Third</blockquote>',
      '<blockquote class=quoted data-class=keep>Fourth<br>Fifth<br>Sixth</blockquote>',
    ].join('');

    const output = await poemDirective.transform(html, context);

    expect(output).toEqual({
      html: [
        '<blockquote data-class="legacy" class="blog-poem"><p>First<br>Second<br>Third</p></blockquote>',
        '<blockquote class="quoted blog-poem" data-class=keep><p>Fourth<br>Fifth<br>Sixth</p></blockquote>',
      ].join(''),
      warnings: [],
    });
    const renderedHtml = typeof output === 'string' ? output : output.html;
    expect(renderedHtml.match(/\sclass=/gu)).toHaveLength(2);
  });
});

describe('mood directive', () => {
  test('delegates rich output to the existing mood embed renderer', async () => {
    const attributes = moodDirective.parse('id=2556 theme=dark density=compact');
    const output = await moodDirective.render(attributes, context);

    expect(output).toBe(
      enrichMoodEmbeds('<p>[mood:2556 theme=dark density=compact]</p>'),
    );
  });

  test('degrades to an accessible canonical link outside web and preview', async () => {
    const attributes = moodDirective.parse('id=2556');

    for (const outputTarget of ['rss', 'og', 'excerpt', 'agent-markdown'] as const) {
      const output = await moodDirective.render(attributes, { ...context, outputTarget });

      expect(output).toBe(
        '<p><a href="https://buxx.me/mood/2556">View mood post 2556</a></p>',
      );
    }
  });
});

describe('music directive', () => {
  test('delegates rich output to the existing Apple Music renderer', async () => {
    process.env.E2E_SITE_FIXTURE = '1';
    const attributes = musicDirective.parse('id=1888707290');
    const output = await musicDirective.render(attributes, {
      ...context,
      outputTarget: 'preview',
    });

    resetAppleMusicEmbedLookupCacheForTests();
    const legacyOutput = await enrichAppleMusicEmbeds(
      '<iframe src="https://embed.music.apple.com/us/song/1888707290?i=1888707290"></iframe>',
    );

    expect(output).toBe(legacyOutput);
    expect(output).toContain('data-blog-music');
  });

  test('resolves link-only output with one metadata request and no URL fragment', async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = Object.assign(async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      requestedUrls.push(url.href);
      if (url.hostname === 'itunes.apple.com') {
        return Response.json({
          results: [{
            trackName: 'Hash & Song',
            artistName: 'Sample Artist',
            trackViewUrl: 'https://music.apple.com/us/song/hash-song/1888707290?uo=4#player',
          }],
        });
      }
      return new Response(null, { status: 404 });
    }, { preconnect: originalFetch.preconnect }) as typeof fetch;
    const attributes = musicDirective.parse('id=1888707290');

    const output = await musicDirective.render(attributes, {
      ...context,
      outputTarget: 'rss',
    });

    expect(output).toBe(
      '<p><a href="https://music.apple.com/us/song/hash-song/1888707290?uo=4">Listen to Hash &amp; Song on Apple Music</a></p>',
    );
    expect(requestedUrls).toEqual([
      'https://itunes.apple.com/lookup?id=1888707290',
    ]);
  });

  test('keeps a static source link when Apple metadata is unavailable', async () => {
    globalThis.fetch = Object.assign(
      async () => new Response(null, { status: 503 }),
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;
    const attributes = musicDirective.parse('id=1888707290');

    const output = await musicDirective.render(attributes, {
      ...context,
      outputTarget: 'rss',
    });

    expect(output).toBe(
      '<p><a href="https://music.apple.com/us/song/1888707290?i=1888707290">Listen on Apple Music</a></p>',
    );
    expect(output).not.toContain('<iframe');
    expect(output).not.toContain('embed.music.apple.com');
    expect(output).not.toContain('#');
  });
});

describe('production directive registry', () => {
  test('keeps every published mood embed form in the rich production pass', async () => {
    const html = [
      '<p>[mood:2556 theme=dark density=compact]</p>',
      '<figure class="kg-bookmark-card"><a href="https://buxx.me/mood/2557">Mood</a></figure>',
      '<iframe src="/mood/embed?id=2558&amp;theme=light&amp;density=compact"></iframe>',
    ].join('');
    const expectedHtml = enrichMoodEmbeds(html);

    for (const outputTarget of ['web', 'preview'] as const) {
      const output = await transformPostDirectives(html, { ...context, outputTarget });

      expect(output).toEqual({ html: expectedHtml, meta: {}, warnings: [] });
      expect(output.html.match(/class="js-mood-embed"/gu)).toHaveLength(3);
    }
  });

  test('keeps Ghost Apple Music cards in the rich production pass', async () => {
    process.env.E2E_SITE_FIXTURE = '1';
    const html = [
      '<figure class="kg-card kg-embed-card">',
      '<iframe src="https://embed.music.apple.com/us/song/1888707290?i=1888707290"></iframe>',
      '</figure>',
    ].join('');
    const expectedHtml = await enrichAppleMusicEmbeds(html);
    resetAppleMusicEmbedLookupCacheForTests();

    const output = await transformPostDirectives(html, {
      ...context,
      outputTarget: 'preview',
    });

    expect(output).toEqual({ html: expectedHtml, meta: {}, warnings: [] });
    expect(output.html).toContain('data-blog-music');
    expect(output.html).not.toContain('<iframe');
  });

  test('strips invalid callouts and emits slug-bearing structured warnings', async () => {
    const html = [
      '<p>[!mood id="&lt;img src=x onerror=alert(1)&gt;"]</p>',
      '<p>[!music id=1888707290 autoplay=true]</p>',
    ].join('');

    const output = await transformPostDirectives(html, context);

    expect(output.html).toBe('');
    expect(output.warnings).toEqual([
      {
        code: 'invalid-directive-attributes',
        directive: 'mood',
        slug: 'directive-handler-contract',
        message: 'Invalid "mood" directive in post "directive-handler-contract": attribute "id" must be a positive integer.',
      },
      {
        code: 'invalid-directive-attributes',
        directive: 'music',
        slug: 'directive-handler-contract',
        message: 'Invalid "music" directive in post "directive-handler-contract": unsupported attribute "autoplay".',
      },
    ]);
    expect(output.html).not.toContain('onerror');
  });

  test('does not let a quoted closing bracket escape an invalid callout', async () => {
    const html = '<p>[!mood id="1]"><img src=x onerror=alert(1)>]</p>';

    const output = await transformPostDirectives(html, context);

    expect(output.html).toBe('');
    expect(output.warnings).toEqual([
      {
        code: 'invalid-directive-attributes',
        directive: 'mood',
        slug: 'directive-handler-contract',
        message: 'Invalid "mood" directive in post "directive-handler-contract": attributes must use key=value syntax.',
      },
    ]);
  });

  test('preserves protected regions byte-for-byte while promoting poems', async () => {
    const untouchedGhostHtml = [
      `<figure class='kg-bookmark-card' data-layout = "wide">`,
      `<a href='https://example.test/a?x=1&amp;y=2'>Unchanged</a>`,
      '</figure>',
    ].join('');
    const protectedHtml = [
      '<code data-raw="a  b">[!poem] Code<br><br>— Ada</code>',
      '<pre class="language-html"><code>&lt;p&gt;[!mood id=1]&lt;/p&gt;</code>\n</pre>',
      '<script type="application/json">{"directive":"[!music id=1]"}</script>',
      '<style>.x::after { content: "[!poem]"; }</style>',
    ].join('');
    const html = [
      untouchedGhostHtml,
      '<blockquote>First<br>Second<br>Third</blockquote>',
      protectedHtml,
    ].join('');

    const output = await transformPostDirectives(html, context);

    expect(output.html).toBe(
      `${untouchedGhostHtml}<blockquote class="blog-poem"><p>First<br>Second<br>Third</p></blockquote>${protectedHtml}`,
    );
    expect(output.warnings).toEqual([]);
  });

  test('keeps preformatted blockquotes outside implicit verse detection', async () => {
    const html = [
      '<blockquote data-kind="sample">',
      '<pre data-spacing="keep  this"><code>First\nSecond</code></pre>',
      '<br><br>Explanation',
      '</blockquote>',
    ].join('');

    const output = await transformPostDirectives(html, context);

    expect(output).toEqual({ html, meta: {}, warnings: [] });
  });

  test('preserves a protected sibling when attribution promotes its blockquote', async () => {
    const protectedHtml = '<pre data-spacing="keep  this"><code>First\nSecond</code></pre>';
    const html = `<blockquote>${protectedHtml}<p>A line — Ada</p></blockquote>`;

    const output = await transformPostDirectives(html, context);

    expect(output).toEqual({
      html: [
        '<blockquote class="blog-poem">',
        protectedHtml,
        '<p>A line</p>',
        '<cite class="blog-poem__attribution">— Ada</cite>',
        '</blockquote>',
      ].join(''),
      meta: {},
      warnings: [],
    });
    expect(output.html.match(/<pre\b/gu)).toHaveLength(1);
  });

  test('uses only the outer qualifying range when poem blockquotes are nested', async () => {
    const html = [
      '<blockquote data-level="outer">',
      '<p>Outer line — Ada</p>',
      '<blockquote data-level="inner"><p>Inner line — Bob</p></blockquote>',
      '</blockquote>',
      '<p data-adjacent>After</p>',
    ].join('');

    const output = await transformPostDirectives(html, context);

    expect(output).toEqual({
      html: [
        '<blockquote data-level="outer" class="blog-poem">',
        '<p>Outer line — Ada</p>',
        '<p>Inner line</p>',
        '<cite class="blog-poem__attribution">— Bob</cite>',
        '</blockquote>',
        '<p data-adjacent>After</p>',
      ].join(''),
      meta: {},
      warnings: [],
    });
    expect(output.html.match(/data-adjacent/gu)).toHaveLength(1);
  });
});
