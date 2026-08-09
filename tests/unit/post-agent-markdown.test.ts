import { describe, expect, test } from 'bun:test';

import { buildPostAgentMarkdown } from '@/features/posts/server/agent-markdown';
import type { Post } from '@/features/posts/types';

function createPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    slug: 'demo-effects',
    title: 'Astro migration effect sandbox',
    url: '/blog/demo-effects/',
    html: '<p>Read the <a href="/mood">mood feed</a>.</p><p><img src="/avatar.webp" alt="Avatar"></p>',
    excerpt: 'A post excerpt',
    customExcerpt: null,
    featureImage: null,
    featureImageAlt: null,
    featureImageCaption: null,
    publishedAt: '2026-04-09T10:30:00.000Z',
    updatedAt: '2026-04-10T10:30:00.000Z',
    featured: false,
    visibility: 'public',
    access: true,
    commentId: null,
    plaintext: 'Read the mood feed.',
    readingTime: '1 min read',
    authors: [],
    tags: [],
    primaryAuthor: null,
    primaryTag: null,
    canonicalUrl: null,
    metaTitle: null,
    metaDescription: null,
    ogImage: null,
    ogTitle: null,
    ogDescription: null,
    twitterImage: null,
    twitterTitle: null,
    twitterDescription: null,
    codeInjectionHead: null,
    codeInjectionFoot: null,
    customTemplate: null,
    type: 'post',
    commentsEnabled: false,
    commentsHtml: null,
    ...overrides,
  };
}

describe('post agent markdown', () => {
  test('serializes post metadata and body with absolute links', () => {
    const markdown = buildPostAgentMarkdown(createPost(), new URL('https://buxx.me'));

    expect(markdown).toStartWith('# Astro migration effect sandbox');
    expect(markdown).toContain('Canonical: https://buxx.me/blog/demo-effects/');
    expect(markdown).toContain('Published: April 9, 2026');
    expect(markdown).toContain('[mood feed](https://buxx.me/mood)');
    expect(markdown).toContain('![Avatar](https://buxx.me/avatar.webp)');
  });

  test('serializes inline code without backslash escaping', () => {
    const markdown = buildPostAgentMarkdown(
      createPost({
        html: '<p>Use <code>path\\`name</code> safely.</p>',
      }),
      new URL('https://buxx.me'),
    );

    expect(markdown).toContain('Use ``path\\`name`` safely.');
  });

  test('serializes Ghost bookmark cards as links without preview text', () => {
    const markdown = buildPostAgentMarkdown(
      createPost({
        html: [
          '<p>The tide brought a reply.</p>',
          '<figure class="kg-card kg-bookmark-card">',
          '<a class="kg-bookmark-container" href="/blog/poem-for-the-sea/">',
          '<div class="kg-bookmark-content">',
          '<div class="kg-bookmark-title">Poem for the Sea</div>',
          '<div class="kg-bookmark-description">An unrelated article preview that must not become body text.</div>',
          '<div class="kg-bookmark-metadata">Murray · No Man\'s Land</div>',
          '</div>',
          '<div class="kg-bookmark-thumbnail"><img src="/preview.jpg" alt=""></div>',
          '</a>',
          '</figure>',
          '<p>The current article continues.</p>',
        ].join(''),
      }),
      new URL('https://buxx.me'),
    );

    expect(markdown).toContain(
      '[Poem for the Sea](https://buxx.me/blog/poem-for-the-sea/)',
    );
    expect(markdown).not.toContain('unrelated article preview');
    expect(markdown).not.toContain("No Man's Land");
    expect(markdown).not.toContain('preview.jpg');
    expect(markdown).toContain('The current article continues.');
  });
});
