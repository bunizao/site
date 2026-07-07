import { isValidCursor, readCursorQuery } from '@/lib/http/query';
import { withRateLimit } from '@/lib/http/rate-limited';
import { meta, profile } from '@/data/site';
import {
  buildMoodAgentMarkdown,
  buildMoodAgentPostPageMarkdown,
} from '@/features/mood/server/serializers';
import {
  loadMoodDocument,
  loadMoodFeed,
  moodDocumentToFeedItem,
} from '@/features/mood/server/api-client';
import {
  getAllPosts,
  getPostBySlug,
  getPublicTagDirectory,
  getTagArchive,
} from '@/features/posts/server/content';
import {
  buildPostAgentMarkdown,
  buildPostListAgentMarkdown,
  buildTagArchiveAgentMarkdown,
  buildTagDirectoryAgentMarkdown,
} from '@/features/posts/server/agent-markdown';
import type {
  MarkdownRenderer,
  MarkdownRendererContext,
  MatchedMarkdownRenderer,
} from './types';
import privacyMarkdownRaw from '@/content/pages/privacy.md?raw';

export const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';
export const MARKDOWN_TOKEN_HEADER = 'x-markdown-tokens';
export const EDGE_CACHE_HEADER = 'X-Buxx-Edge-Cache';
export const MOOD_PAGE_CACHE_HEADER = 'X-Buxx-Mood-Page-Cache';
export const MOOD_PAGE_CACHE_TTL_SECONDS = 60;

export const MOOD_PAGE_CACHE_READY_MARKERS = [
  'data-mood-initial-feed',
  'data-mood-id=',
];

export interface ContentRoutePolicy {
  cacheTtlSeconds: number;
  edgeCacheHtml: boolean;
  cacheHeaderName: string;
  isHtmlReady?: (body: string, response: Response) => boolean;
}

function normalizePathname(pathname: string): string {
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '') || '/';
}

function matchExact(expected: string) {
  return (pathname: string): Record<string, string> | null =>
    normalizePathname(pathname) === expected ? {} : null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function matchBlogPost(pathname: string): Record<string, string> | null {
  const normalized = normalizePathname(pathname);
  const match = normalized.match(/^\/blog\/([^/]+)$/);
  if (!match) return null;

  const slug = safeDecode(match[1]);
  if (slug === 'tags' || slug === 'rss.xml' || slug === 'search.json') return null;

  return { slug };
}

function matchBlogTag(pathname: string): Record<string, string> | null {
  const normalized = normalizePathname(pathname);
  const match = normalized.match(/^\/blog\/tag\/([^/]+)$/);
  return match ? { slug: safeDecode(match[1]) } : null;
}

function matchMoodPost(pathname: string): Record<string, string> | null {
  const normalized = normalizePathname(pathname);
  const match = normalized.match(/^\/mood\/([^/]+)$/);
  if (!match) return null;

  const id = safeDecode(match[1]);
  return id && isValidCursor(id) ? { id } : null;
}

function markdownResult(body: string, status = 200, headers?: HeadersInit) {
  return { body, status, headers };
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---[\s\S]*?---\s*/, '').trim();
}

function buildHomeAgentMarkdown(baseUrl: URL): string {
  return [
    '# Bunizao',
    '',
    `${profile.name} (${profile.alternateNames.join(', ')})`,
    '',
    meta.description,
    '',
    '## Links',
    '',
    `- [Blog](${new URL('/blog/', baseUrl).href})`,
    `- [Mood](${new URL('/mood', baseUrl).href})`,
    `- [Projects](${new URL('/projects', baseUrl).href})`,
    `- [Privacy](${new URL('/privacy', baseUrl).href})`,
    '',
  ].join('\n');
}

async function renderMoodFeed(context: MarkdownRendererContext) {
  const before = readCursorQuery(context.url, 'before');
  const after = readCursorQuery(context.url, 'after');
  const rateLimit = withRateLimit(
    context.request,
    { windowMs: 60_000, max: 180, prefix: 'agent-markdown:mood' },
    context.locals,
  );

  if (!rateLimit.allowed) {
    return markdownResult('Too many requests.\n', 429, rateLimit.headers);
  }

  if (!isValidCursor(before) || !isValidCursor(after)) {
    return markdownResult('Invalid cursor parameter.\n', 400, rateLimit.headers);
  }

  try {
    const feed = await loadMoodFeed(context, { before, after });
    return markdownResult(
      buildMoodAgentMarkdown(feed, context.site, { before, after }),
      200,
      rateLimit.headers,
    );
  } catch (error) {
    console.error('Failed to generate markdown mood feed:', error);
    return markdownResult('Failed to generate mood feed.\n', 500, rateLimit.headers);
  }
}

async function renderMoodPost(context: MarkdownRendererContext) {
  const id = (context.params.id ?? '').trim();
  const rateLimit = withRateLimit(
    context.request,
    { windowMs: 60_000, max: 180, prefix: 'agent-markdown:mood-post' },
    context.locals,
  );

  if (!rateLimit.allowed) {
    return markdownResult('Too many requests.\n', 429, rateLimit.headers);
  }

  if (!isValidCursor(id) || !id) {
    return markdownResult('Invalid mood id.\n', 400, rateLimit.headers);
  }

  try {
    const post = await loadMoodDocument(context, id);
    if (!post) {
      return markdownResult('Mood post not found.\n', 404, rateLimit.headers);
    }

    return markdownResult(
      buildMoodAgentPostPageMarkdown(moodDocumentToFeedItem(post), context.site),
      200,
      rateLimit.headers,
    );
  } catch (error) {
    console.error('Failed to generate markdown mood post:', error);
    return markdownResult('Failed to generate mood post.\n', 500, rateLimit.headers);
  }
}

const renderers: MarkdownRenderer[] = [
  {
    id: 'home',
    cacheTtlSeconds: 300,
    match: matchExact('/'),
    render: (context) => markdownResult(buildHomeAgentMarkdown(context.site)),
  },
  {
    id: 'privacy',
    cacheTtlSeconds: 3600,
    match: matchExact('/privacy'),
    render: () => markdownResult(`${stripFrontmatter(privacyMarkdownRaw)}\n`),
  },
  {
    id: 'blog-index',
    cacheTtlSeconds: 120,
    match: matchExact('/blog'),
    render: async (context) => markdownResult(buildPostListAgentMarkdown('Blog', await getAllPosts(), context.site)),
  },
  {
    id: 'blog-tags',
    cacheTtlSeconds: 120,
    match: matchExact('/blog/tags'),
    render: async (context) => markdownResult(buildTagDirectoryAgentMarkdown(await getPublicTagDirectory(), context.site)),
  },
  {
    id: 'blog-tag',
    cacheTtlSeconds: 120,
    match: matchBlogTag,
    render: async (context) => {
      const archive = await getTagArchive(context.params.slug ?? '');
      if (!archive) return markdownResult('Blog tag not found.\n', 404);

      return markdownResult(buildTagArchiveAgentMarkdown(
        archive.tag,
        archive.archive.posts,
        context.site,
      ));
    },
  },
  {
    id: 'blog-post',
    cacheTtlSeconds: 300,
    match: matchBlogPost,
    render: async (context) => {
      const post = await getPostBySlug(context.params.slug ?? '');
      if (!post) return markdownResult('Blog post not found.\n', 404);

      return markdownResult(buildPostAgentMarkdown(post, context.site));
    },
  },
  {
    id: 'mood-feed',
    cacheTtlSeconds: MOOD_PAGE_CACHE_TTL_SECONDS,
    match: matchExact('/mood'),
    render: renderMoodFeed,
  },
  {
    id: 'mood-post',
    cacheTtlSeconds: MOOD_PAGE_CACHE_TTL_SECONDS,
    match: matchMoodPost,
    render: renderMoodPost,
  },
];

export function getMarkdownRenderer(pathname: string): MatchedMarkdownRenderer | null {
  for (const renderer of renderers) {
    const params = renderer.match(pathname);
    if (params) return { renderer, params };
  }

  return null;
}

export function hasMarkdownRenderer(pathname: string): boolean {
  return Boolean(getMarkdownRenderer(pathname));
}

export function getContentRoutePolicy(pathname: string): ContentRoutePolicy | null {
  const normalized = normalizePathname(pathname);

  if (normalized === '/') {
    return { cacheTtlSeconds: 300, edgeCacheHtml: false, cacheHeaderName: EDGE_CACHE_HEADER };
  }
  if (normalized === '/privacy') {
    return { cacheTtlSeconds: 3600, edgeCacheHtml: false, cacheHeaderName: EDGE_CACHE_HEADER };
  }
  if (normalized === '/llms.txt') {
    return { cacheTtlSeconds: 300, edgeCacheHtml: false, cacheHeaderName: EDGE_CACHE_HEADER };
  }
  if (normalized === '/projects') {
    return { cacheTtlSeconds: 300, edgeCacheHtml: false, cacheHeaderName: EDGE_CACHE_HEADER };
  }
  if (normalized === '/blog/rss.xml' || normalized === '/mood/rss.xml' || normalized === '/sitemap.xml') {
    return { cacheTtlSeconds: 300, edgeCacheHtml: false, cacheHeaderName: EDGE_CACHE_HEADER };
  }
  if (normalized === '/mood') {
    return {
      cacheTtlSeconds: MOOD_PAGE_CACHE_TTL_SECONDS,
      edgeCacheHtml: true,
      cacheHeaderName: MOOD_PAGE_CACHE_HEADER,
      isHtmlReady: (body) => MOOD_PAGE_CACHE_READY_MARKERS.every((marker) => body.includes(marker)),
    };
  }
  if (matchBlogPost(normalized)) {
    return { cacheTtlSeconds: 300, edgeCacheHtml: true, cacheHeaderName: EDGE_CACHE_HEADER };
  }
  if (normalized === '/blog' || normalized === '/blog/tags' || matchBlogTag(normalized)) {
    return { cacheTtlSeconds: 120, edgeCacheHtml: true, cacheHeaderName: EDGE_CACHE_HEADER };
  }
  if (matchMoodPost(normalized)) {
    return { cacheTtlSeconds: MOOD_PAGE_CACHE_TTL_SECONDS, edgeCacheHtml: false, cacheHeaderName: EDGE_CACHE_HEADER };
  }

  return null;
}
