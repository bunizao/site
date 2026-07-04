import { describe, expect, test } from 'bun:test';

import {
  rewriteGhostBlogImageHtml,
  rewriteGhostBlogImageSrcset,
  rewriteGhostBlogImageUrl,
} from '@/features/posts/adapter/provider';

const ghostUrl = 'https://blog.buxx.me';

describe('blog Ghost image rewriting', () => {
  test('rewrites Ghost content image URLs to the site-api blog image path', () => {
    expect(
      rewriteGhostBlogImageUrl(
        'https://blog.buxx.me/content/images/2026/06/post.jpg',
        ghostUrl,
      ),
    ).toBe('/api/v2/images/blog/content/images/2026/06/post.jpg');

    expect(
      rewriteGhostBlogImageUrl(
        '/content/images/2026/06/post.jpg?v=1',
        ghostUrl,
      ),
    ).toBe('/api/v2/images/blog/content/images/2026/06/post.jpg?v=1');

    expect(
      rewriteGhostBlogImageUrl(
        'https://static.buxx.me/content/images/2026/05/cover.jpg',
        ghostUrl,
      ),
    ).toBe('/api/v2/images/blog/content/images/2026/05/cover.jpg');
  });

  test('preserves non-Ghost, mock, and local image URLs', () => {
    expect(
      rewriteGhostBlogImageUrl(
        'https://images.example.test/content/images/2026/06/post.jpg',
        ghostUrl,
      ),
    ).toBe('https://images.example.test/content/images/2026/06/post.jpg');

    expect(rewriteGhostBlogImageUrl('/mock/post-cover.svg', ghostUrl))
      .toBe('/mock/post-cover.svg');
    expect(rewriteGhostBlogImageUrl('/avatar.webp', ghostUrl)).toBe('/avatar.webp');
  });

  test('rewrites Ghost srcset candidates without losing width hints', () => {
    const srcset = [
      'https://blog.buxx.me/content/images/size/w600/2026/06/post.jpg 600w',
      'https://blog.buxx.me/content/images/size/w1200/2026/06/post.jpg 1200w',
    ].join(', ');

    expect(rewriteGhostBlogImageSrcset(srcset, ghostUrl)).toBe([
      '/api/v2/images/blog/content/images/2026/06/post.jpg?w=600 600w',
      '/api/v2/images/blog/content/images/2026/06/post.jpg?w=1200 1200w',
    ].join(', '));
  });

  test('rewrites img and video image attributes inside Ghost HTML', () => {
    const html = `
      <img class="kg-image" src="https://blog.buxx.me/content/images/2026/06/post.jpg" srcset="https://blog.buxx.me/content/images/size/w600/2026/06/post.jpg 600w, https://cdn.example.test/post.jpg 1200w">
      <video poster="https://blog.buxx.me/content/images/2026/06/poster.jpg" data-kg-thumbnail="https://blog.buxx.me/content/images/2026/06/thumb.jpg"></video>
      <img src="/mock/local.svg">
    `;

    const rewritten = rewriteGhostBlogImageHtml(html, ghostUrl);

    expect(rewritten).toContain('src="/api/v2/images/blog/content/images/2026/06/post.jpg"');
    expect(rewritten).toContain('/api/v2/images/blog/content/images/2026/06/post.jpg?w=600 600w');
    expect(rewritten).toContain('https://cdn.example.test/post.jpg 1200w');
    expect(rewritten).toContain('poster="/api/v2/images/blog/content/images/2026/06/poster.jpg"');
    expect(rewritten).toContain('data-kg-thumbnail="/api/v2/images/blog/content/images/2026/06/thumb.jpg"');
    expect(rewritten).toContain('src="/mock/local.svg"');
  });
});
