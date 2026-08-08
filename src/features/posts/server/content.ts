import { blog } from '@/data/site';

import { createGhostContentProvider } from '../adapter';
import { getGhostRuntimeConfig } from '../adapter/ghost/config';
import { findStandaloneDirectiveMarkers } from './directives/syntax';
import type {
  DirectiveOutputTarget,
  DirectiveWarning,
} from './directives';
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

export interface PostContentOptions {
  outputTarget?: DirectiveOutputTarget;
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

async function preparePosts(
  posts: Post[],
  options: PostContentOptions,
): Promise<Post[]> {
  const sanitizedPosts = posts.map(sanitizePostDerivedText);
  const { outputTarget } = options;
  if (!outputTarget) {
    return [...sanitizedPosts].sort(comparePostsByPublishedDateDesc);
  }

  const transformed = await Promise.all(
    sanitizedPosts.map((post) => transformPostContent(post, outputTarget)),
  );

  return transformed.sort(comparePostsByPublishedDateDesc);
}

export async function getListedPosts(options: PostContentOptions = {}): Promise<Post[]> {
  return preparePosts(await getPostsProvider().getListedPosts(), options);
}

export async function getAccessiblePosts(options: PostContentOptions = {}): Promise<Post[]> {
  return preparePosts(await getPostsProvider().getAccessiblePosts(), options);
}

export async function getPostBySlug(
  slug: string,
  options: PostContentOptions = {},
): Promise<Post | null> {
  const rawPost = await getPostsProvider().getPostBySlug(slug);
  const post = rawPost ? sanitizePostDerivedText(rawPost) : null;
  if (!post || !options.outputTarget) return post;
  return transformPostContent(post, options.outputTarget);
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

async function transformPostContent(
  post: Post,
  outputTarget: DirectiveOutputTarget,
): Promise<Post> {
  const { transformPostDirectives } = await import('./directives');
  const result = await transformPostDirectives(post.html, {
    slug: post.slug,
    locale: blog.locale.blog,
    outputTarget,
  });

  reportDirectiveWarnings(result.warnings);

  return {
    ...post,
    html: result.html,
    directiveMeta: result.meta,
  };
}

function sanitizePostDerivedText(post: Post): Post {
  const carriers = findStandaloneDirectiveMarkers(post.html, 'authors');
  if (carriers.length === 0) return post;

  return {
    ...post,
    markdown: stripStandaloneCarriers(post.markdown, carriers) ?? null,
    excerpt: stripStandaloneCarriers(post.excerpt, carriers) ?? null,
    customExcerpt: stripStandaloneCarriers(post.customExcerpt, carriers) ?? null,
    plaintext: stripStandaloneCarriers(post.plaintext, carriers) ?? '',
  };
}

function stripStandaloneCarriers(
  value: string | null | undefined,
  carriers: readonly string[],
): string | null | undefined {
  if (!value) return value;

  const lines = value.split('\n');
  const removed = new Set<number>();
  let fence: '`' | '~' | null = null;

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/u);
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as '`' | '~';
      fence = fence === marker ? null : fence ?? marker;
      continue;
    }

    if (!fence && carriers.includes(trimmed)) {
      removed.add(index);
      if (index > 0 && !lines[index - 1].trim()) {
        removed.add(index - 1);
      } else if (index + 1 < lines.length && !lines[index + 1].trim()) {
        removed.add(index + 1);
      }
    }
  }

  let result = lines.filter((_, index) => !removed.has(index)).join('\n');

  for (const carrier of carriers) {
    const start = result.trimStart();
    if (start.startsWith(carrier) && /^\s*(?:$|\s)/u.test(start.slice(carrier.length))) {
      result = start.slice(carrier.length).trimStart();
    }

    const end = result.trimEnd();
    if (end.endsWith(carrier)) {
      const prefix = end.slice(0, -carrier.length);
      if (!prefix || /\s$/u.test(prefix)) {
        result = prefix.trimEnd();
      }
    }
  }

  return result;
}

function reportDirectiveWarnings(warnings: readonly DirectiveWarning[]): void {
  for (const warning of warnings) {
    console.warn(`[blog-directive:${warning.code}] ${warning.message}`);
  }
}
