import type { Post } from '@/features/posts/types';
import { isUnlistedPost } from '@/features/posts/unlisted';
import { enrichBlurUp, getBlurUp } from '@/features/posts/server/blur-up';
import { getPostVersions, type PostVersion } from '@/features/posts/i18n';

export interface PostPageProps extends Record<string, unknown> {
  post: Post;
  featureBlur: Awaited<ReturnType<typeof getBlurUp>>;
  prev: Post | null;
  next: Post | null;
  /** Every language this article exists in; empty when it has no translation. */
  versions: PostVersion[];
}

// `accessiblePosts` carries the translations: a post's own tags say which
// language it is in, never which siblings exist, so the sibling list has to
// come from outside. Pass the accessible posts, not the listed ones — a
// translation is deliberately absent from the listing but must stay linkable.
export async function buildPostPageProps(
  post: Post,
  listedPosts: Post[],
  accessiblePosts: Post[] = [],
): Promise<PostPageProps> {
  const listedIndex = isUnlistedPost(post)
    ? -1
    : listedPosts.findIndex((candidate) => candidate.slug === post.slug);

  return {
    post: {
      ...post,
      html: await enrichBlurUp(post.html),
    },
    featureBlur: post.featureImage ? await getBlurUp(post.featureImage) : null,
    prev: listedIndex >= 0 ? listedPosts[listedIndex + 1] ?? null : null,
    next: listedIndex >= 0 ? listedPosts[listedIndex - 1] ?? null : null,
    versions: getPostVersions(post, accessiblePosts),
  };
}
