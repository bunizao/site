import type {
  AuthorData,
  PostData,
  TagData,
} from '../../types/index';

import { mockAuthors, mockPosts, mockTags } from '../mock';
import { getGhostClient } from './client';
import {
  type GhostAdapterOptions,
  getGhostRuntimeConfig,
} from './config';

type RawObject = Record<string, unknown>;

export interface Dataset {
  tags: TagData[];
  posts: PostData[];
}

export function isPublicContentRecord(record: Pick<PostData, 'visibility' | 'access'>): boolean {
  return record.visibility === 'public' && record.access === true;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export const BLOG_IMAGE_PROXY_PREFIX = '/api/v2/images/blog/';
const GHOST_CONTENT_IMAGES_PREFIX = '/content/images/';
const GHOST_IMAGE_SIZE_PREFIX_RE = /^\/content\/images\/size\/w(\d+)\//;
const BLOG_IMAGE_SOURCE_HOSTS = new Set(['static.buxx.me']);
const HTML_IMAGE_URL_ATTR_RE =
  /\b(src|poster|srcset|data-kg-thumbnail|data-kg-custom-thumbnail)=(["'])(.*?)\2/gi;

export function rewriteGhostBlogImageUrl(
  value: string | null,
  ghostUrl: string | null,
  width?: number,
): string | null {
  if (!value || !ghostUrl) {
    return value;
  }

  try {
    const ghost = new URL(ghostUrl);
    const isRelativeContentImage = value.startsWith(GHOST_CONTENT_IMAGES_PREFIX);

    if (!isRelativeContentImage && !/^https?:\/\//i.test(value) && !value.startsWith('//')) {
      return value;
    }

    const parsed = new URL(value, ghost);

    const isBlogImageOrigin =
      parsed.origin === ghost.origin ||
      BLOG_IMAGE_SOURCE_HOSTS.has(parsed.hostname);

    if (!isBlogImageOrigin || !parsed.pathname.startsWith(GHOST_CONTENT_IMAGES_PREFIX)) {
      return value;
    }

    const sizeMatch = parsed.pathname.match(GHOST_IMAGE_SIZE_PREFIX_RE);
    const inferredWidth = width ?? (sizeMatch ? Number(sizeMatch[1]) : undefined);
    const key = parsed.pathname
      .replace(GHOST_IMAGE_SIZE_PREFIX_RE, GHOST_CONTENT_IMAGES_PREFIX)
      .replace(/^\/+/, '');
    const searchParams = new URLSearchParams(parsed.search);
    if (inferredWidth && Number.isFinite(inferredWidth)) {
      searchParams.set('w', String(inferredWidth));
    }

    const search = searchParams.toString();
    return `${BLOG_IMAGE_PROXY_PREFIX}${key}${search ? `?${search}` : ''}${parsed.hash}`;
  } catch {
    return value;
  }
}

export function rewriteGhostBlogImageSrcset(
  value: string | null,
  ghostUrl: string | null,
): string | null {
  if (!value) {
    return value;
  }

  return value
    .split(',')
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) {
        return trimmed;
      }

      const [url, ...descriptor] = trimmed.split(/\s+/);
      const widthDescriptor = descriptor.find((item) => /^\d+w$/.test(item));
      const width = widthDescriptor ? Number(widthDescriptor.slice(0, -1)) : undefined;
      return [
        rewriteGhostBlogImageUrl(url, ghostUrl, width) ?? url,
        ...descriptor,
      ].join(' ');
    })
    .join(', ');
}

export function rewriteGhostBlogImageHtml(html: string, ghostUrl: string | null): string {
  if (!ghostUrl || !html.includes('content/images')) {
    return html;
  }

  return html.replace(
    HTML_IMAGE_URL_ATTR_RE,
    (match, name: string, quote: string, value: string) => {
      const nextValue = name.toLowerCase() === 'srcset'
        ? rewriteGhostBlogImageSrcset(value, ghostUrl)
        : rewriteGhostBlogImageUrl(value, ghostUrl);

      return nextValue === value ? match : `${name}=${quote}${nextValue}${quote}`;
    },
  );
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// CJK scripts have no inter-word spaces, so whitespace splitting collapses a
// whole Chinese article to a handful of "words" and pins it at "1 min read".
// Count CJK characters directly (~350/min) and the remaining Latin runs by
// whitespace word (~220/min), then sum the two estimates.
const CJK_RE = /[㐀-鿿豈-﫿぀-ヿ가-힯]/g;

function readingTimeFromText(text: string): string {
  const cjkChars = (text.match(CJK_RE) || []).length;
  const words = text.replace(CJK_RE, ' ').split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(cjkChars / 350 + words / 220));

  return minutes === 1 ? '1 min read' : `${minutes} min read`;
}

function normalizeUrlPath(url: string, siteUrl: string | null): string {
  if (!siteUrl) {
    return url;
  }

  try {
    const parsed = new URL(url, siteUrl);
    const site = new URL(siteUrl);

    if (parsed.origin === site.origin) {
      return parsed.pathname || '/';
    }
  } catch {
    return url;
  }

  return url;
}

function normalizeAuthor(
  raw: RawObject,
  siteUrl: string | null,
  postCount = 0,
): AuthorData | null {
  const slug = readString(raw.slug);
  const name = readString(raw.name);

  if (!slug || !name) {
    return null;
  }

  return {
    id: readString(raw.id) ?? `author-${slug}`,
    slug,
    name,
    url: normalizeUrlPath(
      readString(raw.url) ?? `/author/${slug}/`,
      siteUrl,
    ),
    bio: readString(raw.bio),
    location: readString(raw.location),
    profileImage: rewriteGhostBlogImageUrl(readString(raw.profile_image), siteUrl),
    coverImage: rewriteGhostBlogImageUrl(readString(raw.cover_image), siteUrl),
    website: readString(raw.website),
    twitter: readString(raw.twitter),
    facebook: readString(raw.facebook),
    metaTitle: readString(raw.meta_title),
    metaDescription: readString(raw.meta_description),
    canonicalUrl: readString(raw.canonical_url),
    ogImage: rewriteGhostBlogImageUrl(readString(raw.og_image), siteUrl),
    ogTitle: readString(raw.og_title),
    ogDescription: readString(raw.og_description),
    twitterImage: rewriteGhostBlogImageUrl(readString(raw.twitter_image), siteUrl),
    twitterTitle: readString(raw.twitter_title),
    twitterDescription: readString(raw.twitter_description),
    postCount,
  };
}

function normalizeTag(
  raw: RawObject,
  siteUrl: string | null,
  postCount = 0,
): TagData | null {
  const slug = readString(raw.slug);
  const name = readString(raw.name);

  if (!slug || !name) {
    return null;
  }

  const countObject =
    raw.count && typeof raw.count === 'object' ? (raw.count as RawObject) : null;
  const countPosts =
    countObject && countObject.posts && typeof countObject.posts === 'number'
      ? countObject.posts
      : postCount;

  return {
    id: readString(raw.id) ?? `tag-${slug}`,
    slug,
    name,
    url: normalizeUrlPath(
      readString(raw.url) ?? `/tag/${slug}/`,
      siteUrl,
    ),
    description: readString(raw.description),
    featureImage: rewriteGhostBlogImageUrl(readString(raw.feature_image), siteUrl),
    accentColor: readString(raw.accent_color),
    visibility: raw.visibility === 'internal' ? 'internal' : 'public',
    metaTitle: readString(raw.meta_title),
    metaDescription: readString(raw.meta_description),
    ogImage: rewriteGhostBlogImageUrl(readString(raw.og_image), siteUrl),
    ogTitle: readString(raw.og_title),
    ogDescription: readString(raw.og_description),
    twitterImage: rewriteGhostBlogImageUrl(readString(raw.twitter_image), siteUrl),
    twitterTitle: readString(raw.twitter_title),
    twitterDescription: readString(raw.twitter_description),
    canonicalUrl: readString(raw.canonical_url),
    codeInjectionHead: readString(raw.codeinjection_head),
    codeInjectionFoot: readString(raw.codeinjection_foot),
    postCount: countPosts,
  };
}

function normalizePost(
  raw: RawObject,
  siteUrl: string | null,
  authors: AuthorData[],
  tags: TagData[],
): PostData | null {
  const slug = readString(raw.slug);
  const title = readString(raw.title);
  const html = rewriteGhostBlogImageHtml(readString(raw.html) ?? '', siteUrl);

  if (!slug || !title) {
    return null;
  }

  const recordAuthors = Array.isArray(raw.authors) ? raw.authors : [];
  const recordTags = Array.isArray(raw.tags) ? raw.tags : [];
  const authorMap = new Map(authors.map((author) => [author.slug, author]));
  const tagMap = new Map(tags.map((tag) => [tag.slug, tag]));

  const normalizedAuthors = recordAuthors.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const author = authorMap.get(readString((item as RawObject).slug) ?? '');
    return author ? [author] : [];
  });

  const normalizedTags = recordTags.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const tag = tagMap.get(readString((item as RawObject).slug) ?? '');
    return tag ? [tag] : [];
  });

  const plaintext = readString(raw.plaintext) ?? stripHtml(html);
  const primaryAuthor = normalizedAuthors[0] ?? null;
  const primaryTag =
    normalizedTags.find((tag) => tag.visibility === 'public') ??
    normalizedTags[0] ??
    null;
  const visibility = readString(raw.visibility) ?? 'public';
  const access = readBoolean(raw.access, true);
  const commentId = readString(raw.comment_id);

  return {
    id: readString(raw.id) ?? `post-${slug}`,
    slug,
    title,
    url: normalizeUrlPath(readString(raw.url) ?? `/${slug}/`, siteUrl),
    html,
    markdown: readString(raw.markdown),
    excerpt: readString(raw.custom_excerpt) ?? readString(raw.excerpt),
    customExcerpt: readString(raw.custom_excerpt),
    featureImage: rewriteGhostBlogImageUrl(readString(raw.feature_image), siteUrl),
    featureImageAlt: readString(raw.feature_image_alt),
    featureImageCaption: readString(raw.feature_image_caption),
    publishedAt:
      readString(raw.published_at) ?? new Date().toISOString(),
    updatedAt:
      readString(raw.updated_at) ??
      readString(raw.published_at) ??
      new Date().toISOString(),
    featured: readBoolean(raw.featured),
    visibility,
    access,
    commentId,
    plaintext,
    readingTime: readingTimeFromText(plaintext),
    authors: normalizedAuthors,
    tags: normalizedTags,
    primaryAuthor,
    primaryTag,
    canonicalUrl: readString(raw.canonical_url),
    metaTitle: readString(raw.meta_title),
    metaDescription: readString(raw.meta_description),
    ogImage: rewriteGhostBlogImageUrl(readString(raw.og_image), siteUrl),
    ogTitle: readString(raw.og_title),
    ogDescription: readString(raw.og_description),
    twitterImage: rewriteGhostBlogImageUrl(readString(raw.twitter_image), siteUrl),
    twitterTitle: readString(raw.twitter_title),
    twitterDescription: readString(raw.twitter_description),
    codeInjectionHead: readString(raw.codeinjection_head),
    codeInjectionFoot: readString(raw.codeinjection_foot),
    customTemplate: readString(raw.custom_template),
    type: 'post',
    commentsEnabled: Boolean(commentId),
    commentsHtml: null,
    emailSubject: readString(raw.email_subject),
  };
}

function countPostsByTag(records: typeof mockPosts) {
  const counts = new Map<string, number>();

  records.forEach((record) => {
    record.tagSlugs.forEach((slug) => {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    });
  });

  return counts;
}

export function buildMockDataset(): Dataset {
  const publicMockPosts = mockPosts.filter(isPublicContentRecord);
  const tagCounts = countPostsByTag(publicMockPosts);
  const tags = mockTags.map((tag) => ({
    ...tag,
    postCount: tagCounts.get(tag.slug) ?? 0,
  }));
  const authorMap = new Map(mockAuthors.map((author) => [author.slug, author]));
  const tagMap = new Map(tags.map((tag) => [tag.slug, tag]));
  const posts = publicMockPosts.map((record) => ({
    ...record,
    authors: record.authorSlugs.flatMap((slug) => {
      const author = authorMap.get(slug);
      return author ? [author] : [];
    }),
    tags: record.tagSlugs.flatMap((slug) => {
      const tag = tagMap.get(slug);
      return tag ? [tag] : [];
    }),
    primaryAuthor: record.primaryAuthorSlug
      ? authorMap.get(record.primaryAuthorSlug) ?? null
      : null,
    primaryTag: record.primaryTagSlug
      ? tagMap.get(record.primaryTagSlug) ?? null
      : null,
  }));

  return { tags, posts };
}

async function loadGhostDataset(
  options: GhostAdapterOptions = {},
): Promise<Dataset> {
  const runtimeConfig = getGhostRuntimeConfig(options);
  const client = getGhostClient(options);

  if (!client) {
    throw new Error(
      'Ghost adapter is not configured. Set PUBLIC_GHOST_URL and GHOST_CONTENT_API_KEY, or enable mockContent.',
    );
  }

  const [settings, rawPosts, rawTags, rawAuthors] = await Promise.all([
    client.settings.browse(),
    client.posts.browse({
      include: 'authors,tags',
      formats: ['html', 'plaintext'],
      limit: 'all',
      order: 'published_at desc',
      visibility: 'public',
    }),
    client.tags.browse({
      limit: 'all',
      include: 'count.posts',
      order: 'created_at desc',
      visibility: 'all',
    }),
    client.authors.browse({
      limit: 'all',
      include: 'count.posts',
      order: 'name asc',
    }),
  ]);

  const siteUrl = readString((settings as RawObject).url) ?? runtimeConfig.url;

  const normalizedAuthors = rawAuthors.flatMap((item) => {
    const author = normalizeAuthor(item as RawObject, siteUrl, 0);
    return author ? [author] : [];
  });
  const normalizedTags = rawTags.flatMap((item) => {
    const tag = normalizeTag(item as RawObject, siteUrl, 0);
    return tag ? [tag] : [];
  });

  const posts = rawPosts.flatMap((item) => {
    const post = normalizePost(
      item as RawObject,
      siteUrl,
      normalizedAuthors,
      normalizedTags,
    );

    return post && isPublicContentRecord(post) ? [post] : [];
  });

  const postCountsByTag = new Map<string, number>();

  posts.forEach((post) => {
    post.tags.forEach((tag) => {
      postCountsByTag.set(tag.slug, (postCountsByTag.get(tag.slug) ?? 0) + 1);
    });
  });

  const tags = normalizedTags.map((tag) => ({
    ...tag,
    postCount: postCountsByTag.get(tag.slug) ?? tag.postCount,
  }));

  return { tags, posts };
}

export async function buildGhostDataset(
  options: GhostAdapterOptions = {},
): Promise<Dataset> {
  const runtimeConfig = getGhostRuntimeConfig(options);

  if (runtimeConfig.forceMockContent) {
    return buildMockDataset();
  }

  if (runtimeConfig.mockContent) {
    try {
      return await loadGhostDataset(options);
    } catch {
      return buildMockDataset();
    }
  }

  try {
    return await loadGhostDataset(options);
  } catch (error) {
    if (!import.meta.env.DEV) {
      throw error;
    }

    console.warn('Failed to load Ghost content; using mock posts for dev.');
    return buildMockDataset();
  }
}
