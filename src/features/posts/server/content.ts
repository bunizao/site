import { createGhostContentProvider } from '../adapter';
import { getGhostRuntimeConfig } from '../adapter/ghost/config';
import type { ContentProvider, Post, Tag } from '../types';

export interface PostYearGroup {
  year: string;
  posts: Post[];
}

let provider: ContentProvider | null = null;

export function getPostsProvider(): ContentProvider {
  if (!provider) {
    const runtimeConfig = getGhostRuntimeConfig();

    provider = createGhostContentProvider({
      mockContent: !runtimeConfig.isConfigured,
    });
  }

  return provider;
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
