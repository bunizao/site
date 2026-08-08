import type { Post } from '@/features/posts/types';
import { isUnlistedPost } from '@/features/posts/unlisted';
import { enrichBlurUp, getBlurUp } from '@/features/posts/server/blur-up';

export interface PostPageProps extends Record<string, unknown> {
  post: Post;
  featureBlur: Awaited<ReturnType<typeof getBlurUp>>;
  prev: Post | null;
  next: Post | null;
}

export async function buildPostPageProps(
  post: Post,
  listedPosts: Post[],
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
  };
}
