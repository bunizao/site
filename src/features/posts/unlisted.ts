import type { Post } from './types';

export const UNLISTED_TAG_SLUG = 'hash-unlisted';
export const UNLISTED_ROBOTS_DIRECTIVES = 'noindex, nofollow, noarchive, nosnippet';

export function isUnlistedPost(post: Pick<Post, 'tags'>): boolean {
  return post.tags.some(
    (tag) => tag.visibility === 'internal' && tag.slug === UNLISTED_TAG_SLUG,
  );
}
