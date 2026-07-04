import type {
  AuthorArchiveResult,
  ContentProvider,
  PaginationData,
  Page,
  Post,
  RootContent,
  SearchDocument,
  TagArchiveResult,
  TagDirectoryEntry,
  TierData,
} from '../types/index';

import {
  buildGhostDataset,
  isPublicContentRecord,
  rewriteGhostBlogImageHtml,
  rewriteGhostBlogImageSrcset,
  rewriteGhostBlogImageUrl,
  type Dataset,
} from './ghost/dataset';
import { type GhostAdapterOptions } from './ghost/config';

function paginate<T>(
  items: T[],
  page: number,
  limit: number,
): { items: T[]; pagination: PaginationData } {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(Math.max(page, 1), pages);
  const start = (currentPage - 1) * limit;
  const end = start + limit;

  return {
    items: items.slice(start, end),
    pagination: {
      page: currentPage,
      pages,
      total,
      limit,
      prev: currentPage > 1 ? currentPage - 1 : null,
      next: currentPage < pages ? currentPage + 1 : null,
    },
  };
}

function getPublicTiers(tiers: TierData[]) {
  return tiers.filter((tier) => tier.active && tier.visibility === 'public');
}

function getPublicPosts(posts: Post[]) {
  return posts.filter(isPublicContentRecord);
}

function getPublicPages(pages: Page[]) {
  return pages.filter(isPublicContentRecord);
}

export interface GhostContentProvider extends ContentProvider {}

export function getGhostImagePatterns(ghostUrl: string | null | undefined) {
  if (!ghostUrl) {
    return [];
  }

  try {
    const url = new URL(ghostUrl);

    return [
      {
        protocol: url.protocol.slice(0, -1),
        hostname: url.hostname,
        pathname: '/content/images/**',
        ...(url.port ? { port: url.port } : {}),
      },
    ];
  } catch {
    return [];
  }
}

export {
  rewriteGhostBlogImageHtml,
  rewriteGhostBlogImageSrcset,
  rewriteGhostBlogImageUrl,
};

export function createGhostContentProvider(
  options: GhostAdapterOptions = {},
): GhostContentProvider {
  let datasetPromise: Promise<Dataset> | null = null;

  async function getDataset() {
    if (!datasetPromise) {
      datasetPromise = buildGhostDataset(options);
    }

    return datasetPromise;
  }

  async function getSiteData() {
    return (await getDataset()).site;
  }

  async function getAllPosts() {
    return getPublicPosts((await getDataset()).posts);
  }

  async function getAllPages() {
    return getPublicPages((await getDataset()).pages);
  }

  async function getAllTags() {
    return (await getDataset()).tags.filter((tag) => tag.visibility === 'public');
  }

  async function getAllAuthors() {
    return (await getDataset()).authors;
  }

  async function getAllTiers() {
    return getPublicTiers((await getDataset()).tiers);
  }

  async function getHomepage(page = 1, limit = 8) {
    const posts = await getAllPosts();
    const { items, pagination } = paginate(posts, page, limit);

    return { posts: items, pagination };
  }

  async function getPostBySlug(slug: string) {
    const posts = await getAllPosts();
    return posts.find((post) => post.slug === slug) ?? null;
  }

  async function getPageBySlug(slug: string) {
    const pages = await getAllPages();
    return pages.find((page) => page.slug === slug) ?? null;
  }

  async function getRootContentBySlug(slug: string): Promise<RootContent | null> {
    const page = await getPageBySlug(slug);

    if (page) {
      return { kind: 'page', data: page };
    }

    const post = await getPostBySlug(slug);

    if (post) {
      return { kind: 'post', data: post };
    }

    return null;
  }

  async function getAdjacentPosts(slug: string) {
    const posts = await getAllPosts();
    const index = posts.findIndex((post) => post.slug === slug);

    if (index === -1) {
      return { nextPost: null, prevPost: null };
    }

    return {
      nextPost: posts[index + 1] ?? null,
      prevPost: posts[index - 1] ?? null,
    };
  }

  async function getRecentPosts(limit = 2, excludeSlug?: string) {
    const posts = await getAllPosts();

    return posts.filter((post) => post.slug !== excludeSlug).slice(0, limit);
  }

  async function getTagBySlug(slug: string) {
    const tags = await getAllTags();
    return tags.find((tag) => tag.slug === slug) ?? null;
  }

  async function getTierBySlug(slug: string) {
    const tiers = await getAllTiers();
    return tiers.find((tier) => tier.slug === slug) ?? null;
  }

  async function getAuthorBySlug(slug: string) {
    const authors = await getAllAuthors();
    return authors.find((author) => author.slug === slug) ?? null;
  }

  async function getTagArchive(
    slug: string,
    page = 1,
    limit = 8,
  ): Promise<TagArchiveResult | null> {
    const [tag, posts] = await Promise.all([getTagBySlug(slug), getAllPosts()]);

    if (!tag) {
      return null;
    }

    const filtered = posts.filter((post) =>
      post.tags.some((postTag) => postTag.slug === slug),
    );
    const { items, pagination } = paginate(filtered, page, limit);

    return {
      tag,
      archive: {
        posts: items,
        pagination,
      },
    };
  }

  async function getAuthorArchive(
    slug: string,
    page = 1,
    limit = 8,
  ): Promise<AuthorArchiveResult | null> {
    const [author, posts] = await Promise.all([
      getAuthorBySlug(slug),
      getAllPosts(),
    ]);

    if (!author) {
      return null;
    }

    const filtered = posts.filter((post) =>
      post.authors.some((postAuthor) => postAuthor.slug === slug),
    );
    const { items, pagination } = paginate(filtered, page, limit);

    return {
      author,
      archive: {
        posts: items,
        pagination,
      },
    };
  }

  async function getTagDirectory(): Promise<TagDirectoryEntry[]> {
    const [tags, posts] = await Promise.all([getAllTags(), getAllPosts()]);

    return tags.map((tag) => ({
      ...tag,
      posts: posts
        .filter((post) => post.tags.some((postTag) => postTag.slug === tag.slug))
        .slice(0, 10),
    }));
  }

  async function getSearchDocuments(): Promise<SearchDocument[]> {
    const [posts, pages] = await Promise.all([getAllPosts(), getAllPages()]);
    const pageDocuments = pages
      .filter((page) => page.template !== 'tags')
      .map((page) => ({
        title: page.title,
        url: page.url,
        excerpt: page.excerpt ?? page.plaintext.slice(0, 180),
        type: 'page' as const,
      }));

    return [
      ...posts.map((post) => ({
        title: post.title,
        url: post.url,
        excerpt: post.excerpt ?? post.plaintext.slice(0, 180),
        type: 'post' as const,
      })),
      ...pageDocuments,
    ];
  }

  return {
    getSite: getSiteData,
    getPosts: async (query) => {
      const posts = await getAllPosts();

      if (!query?.limit) {
        return posts;
      }

      return paginate(posts, query.page ?? 1, query.limit).items;
    },
    getPost: getPostBySlug,
    getPages: async (query) => {
      const pages = await getAllPages();

      if (!query?.limit) {
        return pages;
      }

      return paginate(pages, query.page ?? 1, query.limit).items;
    },
    getPage: getPageBySlug,
    getTags: getAllTags,
    getAuthors: getAllAuthors,
    getTiers: getAllTiers,
    getTierBySlug,
    getSiteData,
    getAllPosts,
    getAllPages,
    getAllTags,
    getAllAuthors,
    getHomepage,
    getPostBySlug,
    getPageBySlug,
    getRootContentBySlug,
    getAdjacentPosts,
    getRecentPosts,
    getTagBySlug,
    getAuthorBySlug,
    getTagArchive,
    getAuthorArchive,
    getTagDirectory,
    getSearchDocuments,
  };
}

export type {
  GhostAdapterOptions,
  GhostRuntimeConfig,
} from './ghost/config';
export { getGhostRuntimeConfig } from './ghost/config';
