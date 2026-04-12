import { getPostComments } from '@/lib/telegram';
import { isE2ESiteFixtureEnabled } from '@/lib/e2e';
import type { MoodCommentsPage } from './contracts';
import { loadMoodCommentsFixture, type MoodServerContext } from './channel-service';

export interface LoadMoodCommentsInput {
  postId: string;
  before?: string;
}

export async function loadMoodCommentsPage(
  context: MoodServerContext,
  input: LoadMoodCommentsInput
): Promise<MoodCommentsPage> {
  if (isE2ESiteFixtureEnabled(context.locals)) {
    return loadMoodCommentsFixture(input.postId);
  }

  const result = await getPostComments(
    { request: context.request, locals: context.locals } as any,
    {
      postId: input.postId,
      before: input.before ?? '',
    }
  );

  return {
    comments: result.comments.map((comment) => ({
      id: comment.id,
      author: comment.author,
      authorAvatar: comment.authorAvatar,
      datetime: comment.datetime,
      content: comment.content,
      reactions: comment.reactions.map((reaction) => ({
        emoji: reaction.emoji,
        emojiId: reaction.emojiId,
        emojiImage: reaction.emojiImage,
        count: reaction.count,
        isPaid: reaction.isPaid,
      })),
    })),
    hasMore: result.hasMore,
    nextBefore: result.nextBefore || '',
  };
}
