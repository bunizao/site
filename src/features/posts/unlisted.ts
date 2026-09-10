import { getCanonicalSlug } from './i18n';
import type { Post } from './types';

export const UNLISTED_TAG_SLUG = 'hash-unlisted';
export const UNLISTED_ROBOTS_DIRECTIVES = 'noindex, nofollow, noarchive, nosnippet';

export function isUnlistedPost(post: Pick<Post, 'tags'>): boolean {
  return post.tags.some(
    (tag) => tag.visibility === 'internal' && tag.slug === UNLISTED_TAG_SLUG,
  );
}

// A translation is as hidden as the article it translates: `#unlisted` sits on
// the original only, and a version indexed on its own would lead straight back
// to the page it hides. `posts` must include the original.
export function isUnlistedVersion(post: Pick<Post, 'slug' | 'tags'>, posts: Pick<Post, 'slug' | 'tags'>[]): boolean {
  if (isUnlistedPost(post)) return true;
  const canonical = getCanonicalSlug(post);
  if (canonical === post.slug) return false;
  const original = posts.find((candidate) => candidate.slug === canonical);
  return original ? isUnlistedPost(original) : false;
}
