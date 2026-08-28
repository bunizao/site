import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { blog, profile } from '@/data/site';
import { buildGhostDataset } from '@/features/posts/adapter/ghost/dataset';
import { getGhostRuntimeConfig } from '@/features/posts/adapter/ghost/config';
import { mockPosts } from '@/features/posts/adapter/mock';
import {
  getAccessiblePosts,
  getListedPosts,
  getPostBySlug,
  getPublicTagDirectory,
  getTagArchive,
  groupPostsByYear,
  resetPostsProviderForTests,
} from '@/features/posts/server/content';
import { getTagLabel } from '@/features/posts/display';
import { formatPostDate } from '@/features/posts/format';
import { buildBlogRssXml } from '@/features/posts/server/rss';
import { renderMarkdownIfRequested } from '@/features/agent-markdown/server/responses';
import { GET as getLlms } from '@/pages/llms.txt';
import { GET as getPalette } from '@/pages/palette.json';
import { GET as getSitemap } from '@/pages/sitemap.xml';

const originalGhostUrl = process.env.PUBLIC_GHOST_URL;
const originalGhostKey = process.env.GHOST_CONTENT_API_KEY;
const originalLegacyGhostKey = process.env.GHOST_CONTENT_APIKEY;
const originalGhostMockContent = process.env.GHOST_MOCK_CONTENT;
const originalE2ESiteFixture = process.env.E2E_SITE_FIXTURE;
const originalNodeEnv = process.env.NODE_ENV;
const originalWorkersCi = process.env.WORKERS_CI;
const originalWorkersCiBranch = process.env.WORKERS_CI_BRANCH;

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function useMockGhostContent(): void {
  delete process.env.PUBLIC_GHOST_URL;
  delete process.env.GHOST_CONTENT_API_KEY;
  delete process.env.GHOST_CONTENT_APIKEY;
  process.env.GHOST_MOCK_CONTENT = '1';
}

beforeEach(() => {
  resetPostsProviderForTests();
});

afterEach(() => {
  restoreEnv('PUBLIC_GHOST_URL', originalGhostUrl);
  restoreEnv('GHOST_CONTENT_API_KEY', originalGhostKey);
  restoreEnv('GHOST_CONTENT_APIKEY', originalLegacyGhostKey);
  restoreEnv('GHOST_MOCK_CONTENT', originalGhostMockContent);
  restoreEnv('E2E_SITE_FIXTURE', originalE2ESiteFixture);
  restoreEnv('NODE_ENV', originalNodeEnv);
  restoreEnv('WORKERS_CI', originalWorkersCi);
  restoreEnv('WORKERS_CI_BRANCH', originalWorkersCiBranch);
  resetPostsProviderForTests();
});

describe('posts content provider', () => {
  test('returns sorted mock posts when Ghost is unconfigured', async () => {
    useMockGhostContent();

    const posts = await getListedPosts();

    expect(posts.length).toBeGreaterThan(0);
    expect(posts.map((post) => post.slug).slice(0, 3)).toEqual([
      'demo-effects',
      'quiet-architecture',
      'notes-from-the-links-lab',
    ]);
  });

  test('excludes non-public mock posts from public provider output', async () => {
    useMockGhostContent();

    const posts = await getListedPosts();

    expect(posts.every((post) => post.visibility === 'public' && post.access)).toBe(true);
    expect(posts.map((post) => post.slug)).not.toContain('members-only-notes');
  });

  test('keeps internal unlisted posts accessible only by their direct slug', async () => {
    useMockGhostContent();

    const [listedPosts, accessiblePosts, directPost] = await Promise.all([
      getListedPosts(),
      getAccessiblePosts(),
      getPostBySlug('private-link-demo'),
    ]);

    expect(listedPosts.map((post) => post.slug)).not.toContain('private-link-demo');
    expect(accessiblePosts.map((post) => post.slug)).toContain('private-link-demo');
    expect(directPost?.title).toBe('Direct link only fixture');
    expect(listedPosts.map((post) => post.slug)).toContain('notes-from-the-links-lab');
  });

  test('removes unlisted posts from tag directories, counts, and archives', async () => {
    useMockGhostContent();

    const [directory, archive] = await Promise.all([
      getPublicTagDirectory(),
      getTagArchive('systems'),
    ]);
    const systems = directory.find((tag) => tag.slug === 'systems');

    expect(systems?.posts.map((post) => post.slug)).not.toContain('private-link-demo');
    expect(systems?.postCount).toBe(systems?.posts.length);
    expect(archive?.archive.posts.map((post) => post.slug)).not.toContain('private-link-demo');
  });

  test('hoists post directive metadata through the content boundary', async () => {
    useMockGhostContent();
    const record = mockPosts.find((post) => post.slug === 'demo-effects');
    expect(record).toBeDefined();
    if (!record) return;

    const originalContent = {
      html: record.html,
      markdown: record.markdown,
      excerpt: record.excerpt,
      customExcerpt: record.customExcerpt,
      plaintext: record.plaintext,
    };
    const carrier =
      '[!authors ai="anthropic/claude-opus-4-6" note="reviewed the final structure"]';
    record.html = [
      '<p>Article body.</p>',
      `<pre><code>\n${carrier}\n</code></pre>`,
    ].join('');
    record.markdown = [
      'Article body.  ',
      '',
      '```text',
      carrier,
      '  preserved  spacing',
      '```',
      '',
      carrier,
    ].join('\n');
    record.excerpt = `Article summary. ${carrier}`;
    record.customExcerpt = `${carrier} Custom summary.`;
    record.plaintext = `Article body.\n\n${carrier}`;
    resetPostsProviderForTests();

    try {
      const rawPost = await getPostBySlug(record.slug);
      const post = await getPostBySlug(record.slug, { outputTarget: 'web' });

      expect(rawPost?.html).toContain(carrier);
      expect(rawPost?.directiveMeta).toBeUndefined();
      expect(rawPost?.excerpt).toBe('Article summary.');
      expect(rawPost?.customExcerpt).toBe('Custom summary.');
      expect(post?.html).toBe('<p>Article body.</p>');
      expect(post?.markdown).toBe([
        'Article body.  ',
        '',
        '```text',
        carrier,
        '  preserved  spacing',
        '```',
      ].join('\n'));
      expect(post?.excerpt).toBe('Article summary.');
      expect(post?.customExcerpt).toBe('Custom summary.');
      expect(post?.plaintext).toBe('Article body.');
      expect(post?.directiveMeta).toEqual({
        authors: [{
          ai: 'anthropic/claude-opus-4-6',
          note: 'reviewed the final structure',
        }],
      });
    } finally {
      Object.assign(record, originalContent);
      resetPostsProviderForTests();
    }
  });

  test('fails production builds instead of silently shipping mock posts without Ghost config', async () => {
    delete process.env.PUBLIC_GHOST_URL;
    delete process.env.GHOST_CONTENT_API_KEY;
    delete process.env.GHOST_CONTENT_APIKEY;
    delete process.env.GHOST_MOCK_CONTENT;
    process.env.NODE_ENV = 'production';

    try {
      await buildGhostDataset();
      throw new Error('Expected Ghost dataset loading to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('Ghost adapter is not configured');
    }
  });

  test('keeps arbitrary Cloudflare Workers builds strict without explicit mock content', async () => {
    delete process.env.PUBLIC_GHOST_URL;
    delete process.env.GHOST_CONTENT_API_KEY;
    delete process.env.GHOST_CONTENT_APIKEY;
    delete process.env.GHOST_MOCK_CONTENT;
    process.env.NODE_ENV = 'production';
    process.env.WORKERS_CI = '1';
    process.env.WORKERS_CI_BRANCH = 'plan-new-blog-era';

    const config = getGhostRuntimeConfig();

    expect(config.mockContent).toBe(false);
    expect(config.forceMockContent).toBe(false);
    try {
      await buildGhostDataset();
      throw new Error('Expected Ghost config validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('Ghost adapter is not configured');
    }
  });

  test('lets the E2E fixture force mock content over local Ghost config', async () => {
    process.env.PUBLIC_GHOST_URL = 'https://blog.buxx.me';
    process.env.GHOST_CONTENT_API_KEY = 'test-key';
    process.env.GHOST_MOCK_CONTENT = '0';
    process.env.E2E_SITE_FIXTURE = '1';

    const config = getGhostRuntimeConfig();
    const dataset = await buildGhostDataset();

    expect(config.isConfigured).toBe(true);
    expect(config.mockContent).toBe(true);
    expect(config.forceMockContent).toBe(true);
    expect(dataset.posts.map((post) => post.slug)).toContain('demo-effects');
    expect(dataset.posts.map((post) => post.slug)).toContain('private-link-demo');
    expect(dataset.posts.map((post) => post.slug)).not.toContain('members-only-notes');
  });

  test('keeps GHOST_MOCK_CONTENT as a fallback instead of a force flag', () => {
    process.env.PUBLIC_GHOST_URL = 'https://blog.buxx.me';
    process.env.GHOST_CONTENT_API_KEY = 'test-key';
    process.env.GHOST_MOCK_CONTENT = '1';
    delete process.env.E2E_SITE_FIXTURE;

    const config = getGhostRuntimeConfig();

    expect(config.isConfigured).toBe(true);
    expect(config.mockContent).toBe(true);
    expect(config.forceMockContent).toBe(false);
  });

  test('keeps production Cloudflare Workers builds strict without Ghost config', async () => {
    delete process.env.PUBLIC_GHOST_URL;
    delete process.env.GHOST_CONTENT_API_KEY;
    delete process.env.GHOST_CONTENT_APIKEY;
    delete process.env.GHOST_MOCK_CONTENT;
    process.env.NODE_ENV = 'production';
    process.env.WORKERS_CI = '1';
    process.env.WORKERS_CI_BRANCH = 'main';

    const config = getGhostRuntimeConfig();

    expect(config.mockContent).toBe(false);
    try {
      await buildGhostDataset();
      throw new Error('Expected Ghost config validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('Ghost adapter is not configured');
    }
  });

  test('accepts the legacy Ghost content API key alias during migration', () => {
    process.env.PUBLIC_GHOST_URL = 'https://blog.buxx.me';
    delete process.env.GHOST_CONTENT_API_KEY;
    process.env.GHOST_CONTENT_APIKEY = 'legacy-key';

    const config = getGhostRuntimeConfig();

    expect(config.isConfigured).toBe(true);
    expect(config.key).toBe('legacy-key');
  });

  test('groups posts by published year in list order', async () => {
    useMockGhostContent();

    const posts = await getListedPosts();
    const groups = groupPostsByYear([
      { ...posts[0], publishedAt: '2026-04-09T10:30:00.000Z' },
      { ...posts[1], publishedAt: '2025-12-31T23:30:00.000Z' },
      { ...posts[2], publishedAt: '2025-01-01T00:00:00.000Z' },
    ]);

    expect(groups.map((group) => group.year)).toEqual(['2026', '2025']);
    expect(groups[1].posts.map((post) => post.slug)).toEqual([
      'quiet-architecture',
      'notes-from-the-links-lab',
    ]);
  });

  test('uses English publication and tag labels for the home doorway', async () => {
    useMockGhostContent();

    const [post] = await getListedPosts();
    const tag = post.tags.find((item) => item.visibility === 'public');

    expect(tag).toBeDefined();
    if (!tag) return;

    expect(blog.locale.home).toBe('en');
    expect(blog.locale.blog).toBe('zh');
    expect(blog.copy.en.name).toBe('Sillage');
    expect(blog.copy.zh.name).toBe('無人之境');
    expect(getTagLabel(tag, 'en')).toBe('Systems');
    expect(getTagLabel(tag, 'zh')).toBe(tag.name);
    expect(post.title).toBe('Astro migration effect sandbox');
  });
});

describe('blog subscription feed', () => {
  test('uses the self-hosted RSS endpoint in public UI data', () => {
    expect(blog.feed).toBe('/blog/rss.xml');
    expect(profile.links.find((link) => link.name === 'Blog')?.url).toBe('https://buxx.me/blog');
  });

  test('serializes blog RSS with canonical buxx.me URLs', async () => {
    useMockGhostContent();

    const posts = await getListedPosts();
    const xml = buildBlogRssXml(posts);

    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<title>無人之境</title>');
    expect(xml).toContain('<atom:link href="https://buxx.me/blog/rss.xml"');
    expect(xml).toContain('<link>https://buxx.me/blog</link>');
    expect(xml).toContain('https://buxx.me/blog/demo-effects');
    expect(xml).not.toContain('members-only-notes');
    expect(xml).not.toContain('private-link-demo');
    expect(xml).not.toContain('blog.buxx.me/rss');
  });

  test('keeps unlisted posts out of palette, llms, and runtime Markdown indexes', async () => {
    useMockGhostContent();

    const [paletteResponse, llmsResponse, markdownResponse] = await Promise.all([
      getPalette({} as any),
      getLlms({ site: new URL('https://buxx.me') } as any),
      renderMarkdownIfRequested({
        request: new Request('https://buxx.me/blog/', {
          headers: { Accept: 'text/markdown' },
        }),
        locals: {},
        site: new URL('https://buxx.me'),
      }),
    ]);
    const palette = await paletteResponse.text();
    const llms = await llmsResponse.text();
    const markdown = await markdownResponse?.text();

    expect(palette).not.toContain('private-link-demo');
    expect(llms).not.toContain('private-link-demo');
    expect(markdown).not.toContain('private-link-demo');
  });

  test('serves direct unlisted Markdown with crawler exclusion headers', async () => {
    useMockGhostContent();

    const response = await renderMarkdownIfRequested({
      request: new Request('https://buxx.me/blog/private-link-demo/', {
        headers: { Accept: 'text/markdown' },
      }),
      locals: {
        env: {
          ASSETS: {
            fetch: async () => new Response(null, { status: 404 }),
          },
        },
      },
      site: new URL('https://buxx.me'),
    });

    expect(response?.status).toBe(200);
    expect(response?.headers.get('X-Robots-Tag')).toBe(
      'noindex, nofollow, noarchive, nosnippet',
    );
    expect(await response?.text()).toContain('# Direct link only fixture');
  });

  test('includes blog routes in the sitemap', async () => {
    useMockGhostContent();

    const response = await getSitemap({
      request: new Request('https://buxx.me/sitemap.xml'),
      locals: {},
      params: {},
    } as any);
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain('<loc>https://buxx.me/blog</loc>');
    expect(xml).toContain('<loc>https://buxx.me/blog/demo-effects</loc>');
    expect(xml).toContain('<loc>https://buxx.me/blog/tag/systems</loc>');
    expect(xml).not.toContain('members-only-notes');
    expect(xml).not.toContain('private-link-demo');
  });
});

describe('formatPostDate', () => {
  test('renders a chl.ee-style long date in UTC', () => {
    expect(formatPostDate('2026-06-16T09:00:00.000Z')).toBe('June 16, 2026');
  });
});
