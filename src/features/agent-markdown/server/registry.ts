import {
  isValidCursor,
  readCursorQuery,
} from '@/lib/http/query';
import { withRateLimit } from '@/lib/http/rate-limited';
import { blog, meta, profile } from '@/data/site';
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
import { normalizeMoodEmbedCacheSearch } from '@/features/mood/server/embed-query';
import { isMoodFeedAnchorId } from '@/features/mood/shared/feed-anchor';
import { normalizeMoodTagSlug } from '@/features/mood/shared/tag-filter';
import { readBuiltBlogMarkdown } from './built-blog';
import {
  isUnlistedVersion,
  UNLISTED_ROBOTS_DIRECTIVES,
} from '@/features/posts/unlisted';
import privacyMarkdownRaw from '@/content/pages/privacy.md?raw';

export const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';
export const MARKDOWN_TOKEN_HEADER = 'x-markdown-tokens';
export const MARKDOWN_PATH_SUFFIX = '/index.md';
export const EDGE_CACHE_HEADER = 'X-Buxx-Edge-Cache';
export const MOOD_FEED_PAGE_CACHE_TTL_SECONDS = 300;
export const MOOD_FEED_PAGE_STALE_WHILE_REVALIDATE_SECONDS = 1800;
export const MOOD_DETAIL_PAGE_CACHE_TTL_SECONDS = 300;
export const MOOD_DETAIL_PAGE_STALE_WHILE_REVALIDATE_SECONDS = 1800;
export const MOOD_EMBED_CACHE_TTL_SECONDS = 300;
// The home page is the desk, rendered per request from live sources (the mood
// feed, snapshots), none of them per visitor.
export const HOME_PAGE_CACHE_TTL_SECONDS = 300;
export const HOME_PAGE_STALE_WHILE_REVALIDATE_SECONDS = 1800;
// Prerendered pages and build-generated Markdown only change on deploy, and
// both cache layers start cold on every deploy (Workers Cache keys by Worker
// version; the in-worker key carries the build ID). A short platform TTL would
// only buy background revalidations, so these routes hold for a day.
export const BUILD_BACKED_TTL_SECONDS = 86400;
// `Cache-Control: s-maxage` also reaches shared caches outside Cloudflare,
// which a deploy cannot invalidate. They keep a short TTL so no stale page
// outlives the previous build's carried-over `/_astro/*` files.
export const BUILD_BACKED_SHARED_CACHE_TTL_SECONDS = 300;
export const BUILT_BLOG_NOT_FOUND_TTL_SECONDS = 300;

export interface ContentRoutePolicy {
  cacheTtlSeconds: number;
  // Freshness for shared caches outside Cloudflare (`Cache-Control:
  // s-maxage`). Defaults to cacheTtlSeconds.
  sharedCacheTtlSeconds?: number;
  cacheStaleWhileRevalidateSeconds?: number;
  edgeCacheHtml: boolean;
  varyByLocale?: boolean;
  cacheHeaderName: string;
  normalizeHtmlCacheSearch?: (url: URL) => string | null;
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

// `/blog/<slug>` is an original, `/blog/<locale>/<slug>` one of its
// translations; the params carry the locale so the renderer can tell them apart.
function matchBlogPost(pathname: string): Record<string, string> | null {
  const normalized = normalizePathname(pathname);
  const match = normalized.match(/^\/blog\/(?:([^/]+)\/)?([^/]+)$/);
  if (!match) return null;

  const slug = safeDecode(match[2]);
  if (match[1] === undefined) {
    if (slug === 'tags' || slug === 'rss.xml') return null;
    return { slug };
  }

  const locale = safeDecode(match[1]);
  if (!isTranslationLocale(locale)) return null;

  return { slug, locale };
}

function isTranslationLocale(value: string): boolean {
  return value !== blog.locale.default && Object.hasOwn(blog.copy, value);
}

async function translationGhostSlug(
  context: MarkdownRendererContext,
  canonicalSlug: string,
  locale: string,
): Promise<string | null> {
  const { readI18nManifest } = await import('@/features/posts/server/i18n-manifest');
  const manifest = await readI18nManifest(context.locals, context.url.origin);
  return manifest?.[canonicalSlug]?.translations?.[locale] ?? null;
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

function matchDocsPage(pathname: string): Record<string, string> | null {
  const normalized = normalizePathname(pathname);
  const match = normalized.match(/^\/docs\/(.+)$/);
  if (!match || match[1] === 'search.json') return null;

  return { slug: safeDecode(match[1]) };
}

export function markdownAlternatePath(pathname: string): string {
  const normalized = normalizePathname(pathname);
  return normalized === '/' ? '/index.md' : `${normalized}${MARKDOWN_PATH_SUFFIX}`;
}

export function explicitMarkdownSourcePath(pathname: string): string | null {
  const normalized = normalizePathname(pathname);
  if (normalized === '/index.md') return '/';
  if (!normalized.endsWith(MARKDOWN_PATH_SUFFIX)) return null;

  return normalized.slice(0, -MARKDOWN_PATH_SUFFIX.length) || '/';
}

// Click-ids and campaign tags a shared link picks up on the way to a
// browser; they never change what a mood page renders, so they are
// stripped before deciding whether the URL is cacheable.
const MOOD_CACHE_IGNORED_QUERY_PARAMS = new Set([
  'fbclid',
  'gclid',
  'igshid',
  'si',
  'ref',
  'twclid',
  'mc_cid',
  'mc_eid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
]);

function hasMoodTrackingParams(url: URL): boolean {
  for (const key of MOOD_CACHE_IGNORED_QUERY_PARAMS) {
    if (url.searchParams.has(key)) return true;
  }
  return false;
}

function withoutMoodTrackingParams(url: URL): URLSearchParams {
  const params = new URLSearchParams(url.searchParams);
  for (const key of MOOD_CACHE_IGNORED_QUERY_PARAMS) params.delete(key);
  return params;
}

function normalizeMoodFeedCacheSearch(url: URL): string | null {
  if (!url.search) return '';

  const strippedTracking = hasMoodTrackingParams(url);
  const params = strippedTracking ? withoutMoodTrackingParams(url) : url.searchParams;
  const entries = Array.from(params.entries());
  if (entries.length === 0) return '';
  if (entries.length !== 1) return null;

  const [[key, value]] = entries;

  // A single valid tag filter is a cacheable page: /mood?tag=<slug>.
  if (key === 'tag') {
    const tagSlug = normalizeMoodTagSlug(value);
    return tagSlug && tagSlug === value ? `?tag=${tagSlug}` : null;
  }

  const anchorId = key === 'post' || key === 'id'
    ? value.trim()
    : value.trim() === ''
      ? key.trim()
      : '';
  if (!isMoodFeedAnchorId(anchorId)) return null;

  if (!strippedTracking) return url.search;
  return key === 'post' || key === 'id' ? `?${key}=${value}` : `?${key}`;
}

// Same tracking-param tolerance as the feed: a bare detail page carries no
// other query params, so any leftover after stripping means "not cacheable".
function normalizeMoodDetailCacheSearch(url: URL): string | null {
  if (!url.search) return '';
  return withoutMoodTrackingParams(url).size === 0 ? '' : null;
}

function markdownResult(body: string, status = 200, headers?: HeadersInit) {
  return { body, status, headers };
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---[\s\S]*?---\s*/, '').trim();
}

function buildHomeAgentMarkdown(baseUrl: URL): string {
  return [
    `# ${profile.name}`,
    '',
    `Also known as ${profile.alternateNames.join(', ')}.`,
    `Writes as ${profile.penNames.join(', ')}.`,
    '',
    meta.description,
    '',
    '## Links',
    '',
    `- [Blog](${new URL('/blog', baseUrl).href})`,
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
  );

  if (!rateLimit.allowed) {
    return markdownResult('Too many requests.\n', 429, rateLimit.headers);
  }

  if (!isValidCursor(before) || !isValidCursor(after)) {
    return markdownResult('Invalid cursor parameter.\n', 400, rateLimit.headers);
  }

  try {
    const feed = await loadMoodFeed(context, { before, after, source: 'archive' });
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
  );

  if (!rateLimit.allowed) {
    return markdownResult('Too many requests.\n', 429, rateLimit.headers);
  }

  if (!isValidCursor(id) || !id) {
    return markdownResult('Invalid mood id.\n', 400, rateLimit.headers);
  }

  try {
    const post = await loadMoodDocument(context, id, { source: 'archive' });
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

async function renderBlogIndex(context: MarkdownRendererContext) {
  const built = await readBuiltBlogMarkdown(context, { kind: 'index' });
  if (built) return markdownResult(built.body, built.status);

  const { getListedPosts } = await import('@/features/posts/server/content');
  return markdownResult(buildPostListAgentMarkdown('Blog', await getListedPosts(), context.site));
}

async function renderBlogTags(context: MarkdownRendererContext) {
  const built = await readBuiltBlogMarkdown(context, { kind: 'tags' });
  if (built) return markdownResult(built.body, built.status);

  const { getPublicTagDirectory } = await import('@/features/posts/server/content');
  return markdownResult(buildTagDirectoryAgentMarkdown(await getPublicTagDirectory(), context.site));
}

async function renderBlogTag(context: MarkdownRendererContext) {
  const slug = context.params.slug ?? '';
  const built = await readBuiltBlogMarkdown(context, { kind: 'tag', slug });
  if (built) return markdownResult(built.body, built.status);

  const { getTagArchive } = await import('@/features/posts/server/content');
  const archive = await getTagArchive(slug);
  if (!archive) return markdownResult('Blog tag not found.\n', 404);

  return markdownResult(buildTagArchiveAgentMarkdown(
    archive.tag,
    archive.posts,
    context.site,
  ));
}

async function renderBlogPost(context: MarkdownRendererContext) {
  const slug = context.params.slug ?? '';
  const locale = context.params.locale;
  const built = await readBuiltBlogMarkdown(context, { kind: 'post', slug, locale });
  if (built && built.status !== 404) return markdownResult(built.body, built.status);

  // With an assets binding, the build output holds every accessible version,
  // unlisted ones under their own prefix -- check that prefix too before
  // giving up on the build.
  if (built) {
    const unlisted = await readBuiltBlogMarkdown(context, { kind: 'post', slug, locale, unlisted: true });
    if (unlisted?.status === 200) {
      return markdownResult(unlisted.body, 200, { 'X-Robots-Tag': UNLISTED_ROBOTS_DIRECTIVES });
    }
    if (unlisted && unlisted.status !== 404) return markdownResult(unlisted.body, unlisted.status);
    // Neither prefix has this slug in the build output -- most likely a post
    // published after the last build. Fall through to a live Ghost read
    // instead of hard-404ing an endpoint the build just hasn't caught up to
    // yet.
  }

  const { getPostBySlug } = await import('@/features/posts/server/content');
  // A translation is addressed by its sibling's slug; the manifest turns that
  // back into the Ghost slug the Content API knows.
  const ghostSlug = locale ? await translationGhostSlug(context, slug, locale) : slug;
  const post = ghostSlug ? await getPostBySlug(ghostSlug, { outputTarget: 'agent-markdown' }) : null;
  if (!post) return markdownResult('Blog post not found.\n', 404);
  // An unlisted original hides its translations too; the original is fetched
  // only for a translation, and only to read its tags.
  const original = locale ? await getPostBySlug(slug, { outputTarget: 'agent-markdown' }) : null;

  return markdownResult(
    buildPostAgentMarkdown(post, context.site),
    200,
    isUnlistedVersion(post, original ? [original] : [])
      ? { 'X-Robots-Tag': UNLISTED_ROBOTS_DIRECTIVES }
      : undefined,
  );
}

async function renderDocsIndex(context: MarkdownRendererContext) {
  const { getDocsNav } = await import('@/features/docs/server/nav');
  const groups = await getDocsNav();
  const lines = [
    '# Documentation',
    '',
    'Reference for buxx.me.',
    '',
    ...groups.flatMap((group) => [
      `## ${group.label}`,
      '',
      group.blurb,
      '',
      ...group.entries.map((entry) =>
        `- [${entry.data.title}](${new URL(markdownAlternatePath(`/docs/${entry.id}`), context.site).href}): ${entry.data.description}`
      ),
      '',
    ]),
  ];

  return markdownResult(lines.join('\n'));
}

async function renderDocsPage(context: MarkdownRendererContext) {
  const slug = context.params.slug ?? '';
  const { getCollection } = await import('astro:content');
  const entries = await getCollection('docs', ({ data }) => !data.draft);
  const entry = entries.find((candidate) => candidate.id === slug);
  if (!entry) return markdownResult('Documentation page not found.\n', 404);

  return markdownResult([
    `# ${entry.data.title}`,
    '',
    entry.data.description,
    '',
    entry.body?.trim() ?? '',
    '',
  ].join('\n'));
}

const renderers: MarkdownRenderer[] = [
  {
    id: 'home',
    cacheTtlSeconds: BUILD_BACKED_TTL_SECONDS,
    sharedCacheTtlSeconds: BUILD_BACKED_SHARED_CACHE_TTL_SECONDS,
    match: matchExact('/'),
    render: (context) => markdownResult(buildHomeAgentMarkdown(context.site)),
  },
  {
    id: 'privacy',
    cacheTtlSeconds: BUILD_BACKED_TTL_SECONDS,
    sharedCacheTtlSeconds: 3600,
    match: matchExact('/privacy'),
    render: () => markdownResult(`${stripFrontmatter(privacyMarkdownRaw)}\n`),
  },
  {
    id: 'docs-index',
    cacheTtlSeconds: 3600,
    match: matchExact('/docs'),
    render: renderDocsIndex,
  },
  {
    id: 'docs-page',
    cacheTtlSeconds: 3600,
    match: matchDocsPage,
    render: renderDocsPage,
  },
  {
    id: 'blog-index',
    cacheTtlSeconds: BUILD_BACKED_TTL_SECONDS,
    sharedCacheTtlSeconds: BUILD_BACKED_SHARED_CACHE_TTL_SECONDS,
    notFoundCacheTtlSeconds: BUILT_BLOG_NOT_FOUND_TTL_SECONDS,
    match: matchExact('/blog'),
    render: renderBlogIndex,
  },
  {
    id: 'blog-tags',
    cacheTtlSeconds: BUILD_BACKED_TTL_SECONDS,
    sharedCacheTtlSeconds: BUILD_BACKED_SHARED_CACHE_TTL_SECONDS,
    notFoundCacheTtlSeconds: BUILT_BLOG_NOT_FOUND_TTL_SECONDS,
    match: matchExact('/blog/tags'),
    render: renderBlogTags,
  },
  {
    id: 'blog-tag',
    cacheTtlSeconds: BUILD_BACKED_TTL_SECONDS,
    sharedCacheTtlSeconds: BUILD_BACKED_SHARED_CACHE_TTL_SECONDS,
    notFoundCacheTtlSeconds: BUILT_BLOG_NOT_FOUND_TTL_SECONDS,
    match: matchBlogTag,
    render: renderBlogTag,
  },
  {
    id: 'blog-post',
    cacheTtlSeconds: BUILD_BACKED_TTL_SECONDS,
    sharedCacheTtlSeconds: BUILD_BACKED_SHARED_CACHE_TTL_SECONDS,
    notFoundCacheTtlSeconds: BUILT_BLOG_NOT_FOUND_TTL_SECONDS,
    match: matchBlogPost,
    render: renderBlogPost,
  },
  {
    id: 'mood-feed',
    cacheTtlSeconds: MOOD_FEED_PAGE_CACHE_TTL_SECONDS,
    match: matchExact('/mood'),
    render: renderMoodFeed,
  },
  {
    id: 'mood-post',
    cacheTtlSeconds: MOOD_DETAIL_PAGE_CACHE_TTL_SECONDS,
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

function buildBackedPolicy(options: {
  edgeCacheHtml: boolean;
  sharedCacheTtlSeconds?: number;
}): ContentRoutePolicy {
  return {
    cacheTtlSeconds: BUILD_BACKED_TTL_SECONDS,
    sharedCacheTtlSeconds: options.sharedCacheTtlSeconds ?? BUILD_BACKED_SHARED_CACHE_TTL_SECONDS,
    edgeCacheHtml: options.edgeCacheHtml,
    cacheHeaderName: EDGE_CACHE_HEADER,
  };
}

export function getContentRoutePolicy(pathname: string): ContentRoutePolicy | null {
  const normalized = normalizePathname(pathname);

  if (normalized === '/') {
    return {
      cacheTtlSeconds: HOME_PAGE_CACHE_TTL_SECONDS,
      cacheStaleWhileRevalidateSeconds: HOME_PAGE_STALE_WHILE_REVALIDATE_SECONDS,
      edgeCacheHtml: false,
      cacheHeaderName: EDGE_CACHE_HEADER,
    };
  }
  if (normalized === '/privacy') {
    return buildBackedPolicy({ edgeCacheHtml: false, sharedCacheTtlSeconds: 3600 });
  }
  if (
    normalized === '/llms.txt'
    || normalized === '/projects'
    || normalized === '/blog/rss.xml'
    || normalized === '/sitemap.xml'
  ) {
    return buildBackedPolicy({ edgeCacheHtml: false });
  }
  // The Mood feed is live, so its RSS keeps a short TTL.
  if (normalized === '/mood/rss.xml') {
    return { cacheTtlSeconds: 300, edgeCacheHtml: false, cacheHeaderName: EDGE_CACHE_HEADER };
  }
  if (normalized === '/mood') {
    return {
      cacheTtlSeconds: MOOD_FEED_PAGE_CACHE_TTL_SECONDS,
      varyByLocale: true,
      cacheStaleWhileRevalidateSeconds: MOOD_FEED_PAGE_STALE_WHILE_REVALIDATE_SECONDS,
      edgeCacheHtml: false,
      cacheHeaderName: EDGE_CACHE_HEADER,
      normalizeHtmlCacheSearch: normalizeMoodFeedCacheSearch,
    };
  }
  if (normalized === '/mood/embed') {
    return {
      cacheTtlSeconds: MOOD_EMBED_CACHE_TTL_SECONDS,
      edgeCacheHtml: true,
      cacheHeaderName: EDGE_CACHE_HEADER,
      normalizeHtmlCacheSearch: normalizeMoodEmbedCacheSearch,
    };
  }
  if (
    matchBlogPost(normalized)
    || normalized === '/blog'
    || normalized === '/blog/tags'
    || matchBlogTag(normalized)
  ) {
    return buildBackedPolicy({ edgeCacheHtml: true });
  }
  if (matchMoodPost(normalized)) {
    return {
      cacheTtlSeconds: MOOD_DETAIL_PAGE_CACHE_TTL_SECONDS,
      varyByLocale: true,
      cacheStaleWhileRevalidateSeconds: MOOD_DETAIL_PAGE_STALE_WHILE_REVALIDATE_SECONDS,
      edgeCacheHtml: false,
      cacheHeaderName: EDGE_CACHE_HEADER,
      normalizeHtmlCacheSearch: normalizeMoodDetailCacheSearch,
    };
  }

  return null;
}
