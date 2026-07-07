import { describe, expect, test } from 'bun:test';

import {
  builtBlogMarkdownAssetPath,
  readBuiltBlogMarkdown,
} from '@/features/agent-markdown/server/built-blog';

describe('built blog agent markdown', () => {
  test('maps blog routes to generated markdown asset paths', () => {
    expect(builtBlogMarkdownAssetPath({ kind: 'index' })).toBe('/_agent-markdown/blog/index.md');
    expect(builtBlogMarkdownAssetPath({ kind: 'tags' })).toBe('/_agent-markdown/blog/tags/index.md');
    expect(builtBlogMarkdownAssetPath({ kind: 'tag', slug: 'writing' })).toBe('/_agent-markdown/blog/tag/writing.md');
    expect(builtBlogMarkdownAssetPath({ kind: 'post', slug: 'demo-effects' })).toBe('/_agent-markdown/blog/post/demo-effects.md');
  });

  test('reads generated markdown from the static assets binding', async () => {
    const requests: string[] = [];
    const result = await readBuiltBlogMarkdown(
      {
        url: new URL('https://buxx.me/blog/demo-effects/'),
        locals: {
          env: {
            ASSETS: {
              fetch(input: RequestInfo | URL) {
                requests.push(input instanceof Request ? new URL(input.url).pathname : String(input));
                return Promise.resolve(new Response('# Demo\n'));
              },
            },
          },
        },
      },
      { kind: 'post', slug: 'demo-effects' },
    );

    expect(requests).toEqual(['/_agent-markdown/blog/post/demo-effects.md']);
    expect(result).toEqual({ body: '# Demo\n', status: 200 });
  });

  test('falls back when no assets binding is available', async () => {
    const result = await readBuiltBlogMarkdown(
      {
        url: new URL('https://buxx.me/blog/'),
        locals: {},
      },
      { kind: 'index' },
    );

    expect(result).toBeNull();
  });
});
