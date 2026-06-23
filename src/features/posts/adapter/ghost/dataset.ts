import type {
  AuthorData,
  PageData,
  PostData,
  SiteData,
  TagData,
  TierData,
} from '../../types/index';

import { mockAuthors, mockPages, mockPosts, mockSite, mockTags, mockTiers } from '../mock';
import { getGhostClient } from './client';
import {
  type GhostAdapterOptions,
  getGhostRuntimeConfig,
} from './config';

type RawObject = Record<string, unknown>;

export interface Dataset {
  site: SiteData;
  authors: AuthorData[];
  tags: TagData[];
  tiers: TierData[];
  posts: PostData[];
  pages: PageData[];
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function readingTimeFromText(text: string): string {
  const words = text.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 220));

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

function normalizeNavigation(
  items: unknown,
  siteUrl: string | null,
): SiteData['navigation'] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const record = item as RawObject;
    const label = readString(record.label);
    const url = readString(record.url);

    if (!label || !url) {
      return [];
    }

    return [{ label, url: normalizeUrlPath(url, siteUrl) }];
  });
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
    profileImage: readString(raw.profile_image),
    coverImage: readString(raw.cover_image),
    website: readString(raw.website),
    twitter: readString(raw.twitter),
    facebook: readString(raw.facebook),
    metaTitle: readString(raw.meta_title),
    metaDescription: readString(raw.meta_description),
    canonicalUrl: readString(raw.canonical_url),
    ogImage: readString(raw.og_image),
    ogTitle: readString(raw.og_title),
    ogDescription: readString(raw.og_description),
    twitterImage: readString(raw.twitter_image),
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
    featureImage: readString(raw.feature_image),
    accentColor: readString(raw.accent_color),
    visibility: raw.visibility === 'internal' ? 'internal' : 'public',
    metaTitle: readString(raw.meta_title),
    metaDescription: readString(raw.meta_description),
    ogImage: readString(raw.og_image),
    ogTitle: readString(raw.og_title),
    ogDescription: readString(raw.og_description),
    twitterImage: readString(raw.twitter_image),
    twitterTitle: readString(raw.twitter_title),
    twitterDescription: readString(raw.twitter_description),
    canonicalUrl: readString(raw.canonical_url),
    codeInjectionHead: readString(raw.codeinjection_head),
    codeInjectionFoot: readString(raw.codeinjection_foot),
    postCount: countPosts,
  };
}

function normalizeTier(raw: RawObject): TierData | null {
  const slug = readString(raw.slug);
  const name = readString(raw.name);

  if (!slug || !name) {
    return null;
  }

  const benefits = Array.isArray(raw.benefits)
    ? raw.benefits.flatMap((item) => {
        if (typeof item === 'string' && item.trim()) {
          return [item];
        }

        if (!item || typeof item !== 'object') {
          return [];
        }

        const benefitName = readString((item as RawObject).name);
        return benefitName ? [benefitName] : [];
      })
    : [];

  return {
    id: readString(raw.id) ?? `tier-${slug}`,
    slug,
    name,
    description: readString(raw.description),
    active: readBoolean(raw.active, true),
    type: raw.type === 'paid' ? 'paid' : 'free',
    welcomePageUrl: readString(raw.welcome_page_url),
    monthlyPrice: readNumber(raw.monthly_price),
    yearlyPrice: readNumber(raw.yearly_price),
    currency: readString(raw.currency),
    benefits,
    visibility: raw.visibility === 'none' ? 'none' : 'public',
  };
}

function buildSiteData(
  raw: RawObject,
  fallbackUrl: string | null,
): SiteData {
  const siteUrl = readString(raw.url) ?? fallbackUrl ?? mockSite.url;

  return {
    title: readString(raw.title) ?? mockSite.title,
    description: readString(raw.description),
    url: siteUrl,
    locale: readString(raw.lang) ?? 'en',
    timezone: readString(raw.timezone),
    logo: readString(raw.logo),
    icon: readString(raw.icon),
    coverImage: readString(raw.cover_image),
    accentColor: readString(raw.accent_color),
    metaTitle: readString(raw.meta_title),
    metaDescription: readString(raw.meta_description),
    ogImage: readString(raw.og_image),
    ogTitle: readString(raw.og_title),
    ogDescription: readString(raw.og_description),
    twitterImage: readString(raw.twitter_image),
    twitterTitle: readString(raw.twitter_title),
    twitterDescription: readString(raw.twitter_description),
    twitter: readString(raw.twitter),
    facebook: readString(raw.facebook),
    membersSupportAddress: readString(raw.members_support_address),
    navigation: normalizeNavigation(raw.navigation, siteUrl),
    secondaryNavigation: normalizeNavigation(raw.secondary_navigation, siteUrl),
    codeInjectionHead: readString(raw.codeinjection_head),
    codeInjectionFoot: readString(raw.codeinjection_foot),
  };
}

function resolvePageTemplate(
  slug: string,
  customTemplate: string | null,
): PageData['template'] {
  const normalizedTemplate =
    customTemplate?.replace(/\.hbs$/i, '').split('/').pop() ?? null;

  if (
    normalizedTemplate === 'links' ||
    normalizedTemplate === 'page-links' ||
    normalizedTemplate === 'custom-links' ||
    slug === 'links'
  ) {
    return 'links';
  }

  if (
    normalizedTemplate === 'tags' ||
    normalizedTemplate === 'page-tags' ||
    normalizedTemplate === 'custom-tags' ||
    slug === 'tags'
  ) {
    return 'tags';
  }

  return 'default';
}

function normalizeContentRecord(
  raw: RawObject,
  type: 'post' | 'page',
  siteUrl: string | null,
  authors: AuthorData[],
  tags: TagData[],
): PostData | PageData | null {
  const slug = readString(raw.slug);
  const title = readString(raw.title);
  const html = readString(raw.html) ?? '';

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
  const customTemplate = readString(raw.custom_template);
  const base = {
    id: readString(raw.id) ?? `${type}-${slug}`,
    slug,
    title,
    url: normalizeUrlPath(readString(raw.url) ?? `/${slug}/`, siteUrl),
    html,
    excerpt: readString(raw.custom_excerpt) ?? readString(raw.excerpt),
    customExcerpt: readString(raw.custom_excerpt),
    featureImage: readString(raw.feature_image),
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
    commentId: readString(raw.comment_id),
    plaintext,
    readingTime: readingTimeFromText(plaintext),
    authors: normalizedAuthors,
    tags: normalizedTags,
    primaryAuthor,
    primaryTag,
    canonicalUrl: readString(raw.canonical_url),
    metaTitle: readString(raw.meta_title),
    metaDescription: readString(raw.meta_description),
    ogImage: readString(raw.og_image),
    ogTitle: readString(raw.og_title),
    ogDescription: readString(raw.og_description),
    twitterImage: readString(raw.twitter_image),
    twitterTitle: readString(raw.twitter_title),
    twitterDescription: readString(raw.twitter_description),
    codeInjectionHead: readString(raw.codeinjection_head),
    codeInjectionFoot: readString(raw.codeinjection_foot),
    customTemplate,
  };

  if (type === 'post') {
    return {
      ...base,
      type: 'post',
      commentsEnabled: Boolean(base.commentId),
      commentsHtml: null,
      emailSubject: readString(raw.email_subject),
    };
  }

  const template = resolvePageTemplate(slug, customTemplate);
  const showTitleAndFeatureImage =
    typeof raw.show_title_and_feature_image === 'boolean'
      ? raw.show_title_and_feature_image
      : template === 'default';

  return {
    ...base,
    type: 'page',
    template,
    showTitleAndFeatureImage,
  };
}

function countPostsByAuthor(records: typeof mockPosts) {
  const counts = new Map<string, number>();

  records.forEach((record) => {
    record.authorSlugs.forEach((slug) => {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    });
  });

  return counts;
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
  const authorCounts = countPostsByAuthor(mockPosts);
  const tagCounts = countPostsByTag(mockPosts);
  const authors = mockAuthors.map((author) => ({
    ...author,
    postCount: authorCounts.get(author.slug) ?? 0,
  }));
  const tags = mockTags.map((tag) => ({
    ...tag,
    postCount: tagCounts.get(tag.slug) ?? 0,
  }));
  const authorMap = new Map(authors.map((author) => [author.slug, author]));
  const tagMap = new Map(tags.map((tag) => [tag.slug, tag]));
  const posts = mockPosts.map((record) => ({
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
  const pages = mockPages.map((record) => ({
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

  return {
    site: mockSite,
    authors,
    tags,
    tiers: mockTiers,
    posts,
    pages,
  };
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

  const [settings, rawPosts, rawPages, rawTags, rawAuthors, rawTiers] = await Promise.all([
    client.settings.browse(),
    client.posts.browse({
      include: 'authors,tags',
      formats: ['html', 'plaintext'],
      limit: 'all',
      order: 'published_at desc',
      visibility: 'all',
    }),
    client.pages.browse({
      include: 'authors,tags',
      formats: ['html', 'plaintext'],
      limit: 'all',
      order: 'published_at desc',
      visibility: 'all',
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
    client.tiers.browse({
      limit: 'all',
      include: 'monthly_price,yearly_price,benefits',
      order: 'sort_order asc',
    }),
  ]);

  const siteUrl =
    readString((settings as RawObject).url) ??
    runtimeConfig.url ??
    mockSite.url;

  const normalizedAuthors = rawAuthors.flatMap((item) => {
    const author = normalizeAuthor(item as RawObject, siteUrl, 0);
    return author ? [author] : [];
  });
  const normalizedTags = rawTags.flatMap((item) => {
    const tag = normalizeTag(item as RawObject, siteUrl, 0);
    return tag ? [tag] : [];
  });
  const normalizedTiers = rawTiers.flatMap((item) => {
    const tier = normalizeTier(item as RawObject);
    return tier ? [tier] : [];
  });

  const posts = rawPosts.flatMap((item) => {
    const record = normalizeContentRecord(
      item as RawObject,
      'post',
      siteUrl,
      normalizedAuthors,
      normalizedTags,
    );

    return record && record.type === 'post' ? [record] : [];
  });

  const postCountsByAuthor = new Map<string, number>();
  const postCountsByTag = new Map<string, number>();

  posts.forEach((post) => {
    post.authors.forEach((author) => {
      postCountsByAuthor.set(
        author.slug,
        (postCountsByAuthor.get(author.slug) ?? 0) + 1,
      );
    });
    post.tags.forEach((tag) => {
      postCountsByTag.set(tag.slug, (postCountsByTag.get(tag.slug) ?? 0) + 1);
    });
  });

  const authors = normalizedAuthors.map((author) => ({
    ...author,
    postCount: postCountsByAuthor.get(author.slug) ?? author.postCount,
  }));
  const tags = normalizedTags.map((tag) => ({
    ...tag,
    postCount: postCountsByTag.get(tag.slug) ?? tag.postCount,
  }));

  const pages = rawPages.flatMap((item) => {
    const record = normalizeContentRecord(
      item as RawObject,
      'page',
      siteUrl,
      authors,
      tags,
    );

    return record && record.type === 'page' ? [record] : [];
  });

  return {
    site: buildSiteData(
      settings as RawObject,
      siteUrl,
    ),
    authors,
    tags,
    tiers: normalizedTiers,
    posts,
    pages,
  };
}

export async function buildGhostDataset(
  options: GhostAdapterOptions = {},
): Promise<Dataset> {
  if (options.mockContent) {
    try {
      return await loadGhostDataset(options);
    } catch {
      return buildMockDataset();
    }
  }

  return loadGhostDataset(options);
}
