import { createGhostContentProvider } from '../adapter';
import { getGhostRuntimeConfig } from '../adapter/ghost/config';
import type {
  ContentProvider,
  Post,
  Tag,
  TagArchiveResult,
  TagDirectoryEntry,
} from '../types';

export interface PostYearGroup {
  year: string;
  posts: Post[];
}

let provider: ContentProvider | null = null;

export function getPostsProvider(): ContentProvider {
  if (!provider) {
    const runtimeConfig = getGhostRuntimeConfig();

    provider = createGhostContentProvider({
      mockContent: runtimeConfig.mockContent,
      forceMockContent: runtimeConfig.forceMockContent,
    });
  }

  return provider;
}

export function resetPostsProviderForTests(): void {
  provider = null;
}

export async function getAllPosts(): Promise<Post[]> {
  const posts = await getPostsProvider().getAllPosts();

  return [...posts].sort(comparePostsByPublishedDateDesc);
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  return getPostsProvider().getPostBySlug(slug);
}

export async function getAllPublicTags(): Promise<Tag[]> {
  return getPostsProvider().getAllTags();
}

// Tag directory limited to public tags that actually carry posts. Internal tags
// (#not-by-ai, #no-toc) and empty tags never get an archive route, so they must
// not surface in the directory or homepage rail either.
export async function getPublicTagDirectory(): Promise<TagDirectoryEntry[]> {
  const directory = await getPostsProvider().getTagDirectory();

  return directory
    .filter((tag) => tag.visibility === 'public' && tag.posts.length > 0)
    .sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name));
}

export async function getTagArchive(slug: string): Promise<TagArchiveResult | null> {
  const result = await getPostsProvider().getTagArchive(slug, 1, 9999);

  if (!result || result.tag.visibility !== 'public') {
    return null;
  }

  return result;
}

export function groupPostsByYear(posts: Post[]): PostYearGroup[] {
  const groups = new Map<string, Post[]>();

  for (const post of posts) {
    const year = getPublishedYear(post);
    const group = groups.get(year);

    if (group) {
      group.push(post);
    } else {
      groups.set(year, [post]);
    }
  }

  return Array.from(groups, ([year, yearPosts]) => ({
    year,
    posts: yearPosts,
  }));
}

function comparePostsByPublishedDateDesc(a: Post, b: Post): number {
  return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
}

function getPublishedYear(post: Post): string {
  const year = new Date(post.publishedAt).getUTCFullYear();

  return Number.isFinite(year) ? String(year) : 'Unknown';
}
