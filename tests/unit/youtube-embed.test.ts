import { describe, expect, test } from 'bun:test';

import { renderStructuredMoodFeedMediaMarkup } from '@/features/mood/shared/feed-media';
import {
  transformPostDirectives,
  type DirectiveContext,
} from '@/features/posts/server/directives';
import {
  parseYouTubeVideoUrl,
  renderYouTubeEmbedMarkup,
} from '@/lib/embed/youtube';

const context = {
  slug: 'youtube-contract',
  locale: 'en',
  outputTarget: 'web',
} satisfies DirectiveContext;

describe('YouTube URL parsing', () => {
  test('recognizes canonical watch, short, shorts, and embed URLs', () => {
    expect([
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=12',
      'https://youtu.be/aqz-KE-bpKQ?t=12',
      'https://m.youtube.com/shorts/aqz-KE-bpKQ',
      'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?start=12',
    ].map(parseYouTubeVideoUrl)).toEqual([
      { id: 'aqz-KE-bpKQ', startSeconds: 12 },
      { id: 'aqz-KE-bpKQ', startSeconds: 12 },
      { id: 'aqz-KE-bpKQ', startSeconds: 0 },
      { id: 'aqz-KE-bpKQ', startSeconds: 12 },
    ]);
  });

  test('rejects lookalike hosts, credentials, and malformed video ids', () => {
    for (const value of [
      'https://youtube.com.evil.test/watch?v=aqz-KE-bpKQ',
      'https://youtube.com@evil.test/watch?v=aqz-KE-bpKQ',
      'https://www.youtube.com/watch?v=too-short',
      'javascript:https://youtu.be/aqz-KE-bpKQ',
    ]) {
      expect(parseYouTubeVideoUrl(value), value).toBeNull();
    }
  });
});

describe('YouTube embed markup', () => {
  test('keeps YouTube off the page until click and uses the bounded poster route', () => {
    const html = renderYouTubeEmbedMarkup({
      id: 'aqz-KE-bpKQ',
      startSeconds: 12,
      title: 'Big <Buck> & Bunny',
      channelName: 'Blender "Studio"',
      channelUrl: 'https://www.youtube.com/@BlenderOfficial',
    });

    expect(html).toContain('data-yt data-video="aqz-KE-bpKQ" data-start="12"');
    expect(html).toContain('src="/static/youtube/aqz-KE-bpKQ/maxresdefault.jpg"');
    expect(html).toContain('data-yt-poster-fallback="/static/youtube/aqz-KE-bpKQ/hqdefault.jpg"');
    expect(html).toContain('Big &lt;Buck&gt; &amp; Bunny');
    expect(html).toContain('Blender &quot;Studio&quot;');
    expect(html).toContain('data-yt-player');
    expect(html).not.toMatch(/data-yt-player[^>]+\ssrc=/u);
  });
});

describe('YouTube content integrations', () => {
  test('renders the directive as a facade on rich targets and a link elsewhere', async () => {
    for (const outputTarget of ['web', 'preview'] as const) {
      const result = await transformPostDirectives(
        '<p>[!youtube id="aqz-KE-bpKQ" start="12"]</p>',
        { ...context, outputTarget },
      );

      expect(result.html).toContain('class="yt"');
      expect(result.html).toContain('data-video="aqz-KE-bpKQ"');
      expect(result.html).not.toContain('[!youtube');
    }

    for (const outputTarget of ['rss', 'og', 'excerpt', 'agent-markdown'] as const) {
      const result = await transformPostDirectives(
        '<p>[!youtube id="aqz-KE-bpKQ" start="12"]</p>',
        { ...context, outputTarget },
      );

      expect(result.html).toBe(
        '<p><a href="https://www.youtube.com/watch?v=aqz-KE-bpKQ&amp;t=12s">Watch this video on YouTube</a></p>',
      );
    }
  });

  test('replaces only real YouTube mood previews with the shared facade', () => {
    const youtube = renderStructuredMoodFeedMediaMarkup([{
      type: 'link-preview',
      href: 'https://youtu.be/aqz-KE-bpKQ?t=12',
      title: 'Big Buck Bunny',
      siteName: 'Blender',
    }]);
    const ordinary = renderStructuredMoodFeedMediaMarkup([{
      type: 'link-preview',
      href: 'https://example.com/watch?v=aqz-KE-bpKQ',
      title: 'Ordinary link',
      siteName: 'Example',
    }]);

    expect(youtube).toContain('class="yt"');
    expect(youtube).toContain('data-start="12"');
    expect(youtube).not.toContain('bookmark-card');
    expect(ordinary).toContain('bookmark-card');
    expect(ordinary).not.toContain('data-yt');
  });
});
