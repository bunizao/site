import type {
  ContentProvider,
  TagArchiveResult,
  TagDirectoryEntry,
} from '../types/index';

import {
  buildGhostDataset,
  isPublicContentRecord,
  type Dataset,
} from './ghost/dataset';
import { type GhostAdapterOptions } from './ghost/config';
import { selectListedPosts } from '../i18n';
import { isUnlistedPost } from '../unlisted';

export function createGhostContentProvider(
  options: GhostAdapterOptions = {},
): ContentProvider {
  let datasetPromise: Promise<Dataset> | null = null;

  async function getDataset() {
    if (!datasetPromise) {
      datasetPromise = buildGhostDataset(options);
    }

    return datasetPromise;
  }

  async function getAccessiblePosts() {
    return (await getDataset()).posts.filter(isPublicContentRecord);
  }

  // Two rules, one seam. Everything that shows a list of posts — the listing,
  // tag archives, RSS, sitemap, search, prev/next — reads through here, so a
  // translation cannot leak into one of them by being wired up separately.
  async function getListedPosts() {
    const listed = (await getAccessiblePosts()).filter((post) => !isUnlistedPost(post));

    return selectListedPosts(listed);
  }

  async function getAllTags() {
    return (await getDataset()).tags.filter((tag) => tag.visibility === 'public');
  }

  async function getPostBySlug(slug: string) {
    const posts = await getAccessiblePosts();
    return posts.find((post) => post.slug === slug) ?? null;
  }

  async function getTagArchive(slug: string): Promise<TagArchiveResult | null> {
    const [tags, posts] = await Promise.all([getAllTags(), getListedPosts()]);
    const tag = tags.find((candidate) => candidate.slug === slug);

    if (!tag) {
      return null;
    }

    return {
      tag,
      posts: posts.filter((post) =>
        post.tags.some((postTag) => postTag.slug === slug),
      ),
    };
  }

  async function getTagDirectory(): Promise<TagDirectoryEntry[]> {
    const [tags, posts] = await Promise.all([getAllTags(), getListedPosts()]);

    return tags.map((tag) => {
      const tagPosts = posts.filter((post) =>
        post.tags.some((postTag) => postTag.slug === tag.slug),
      );

      return {
        ...tag,
        postCount: tagPosts.length,
        posts: tagPosts.slice(0, 10),
      };
    });
  }

  return {
    getAccessiblePosts,
    getListedPosts,
    getPostBySlug,
    getTagArchive,
    getTagDirectory,
  };
}
