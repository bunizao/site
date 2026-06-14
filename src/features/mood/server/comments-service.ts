import type { MoodCommentsPage } from './contracts';
import { loadMoodComments, type MoodCommentsQuery } from './api-client';
import type { MoodServerContext } from './channel-service';

export interface LoadMoodCommentsInput {
  postId: string;
  before?: string;
}

export async function loadMoodCommentsPage(
  context: MoodServerContext,
  input: LoadMoodCommentsInput
): Promise<MoodCommentsPage> {
  const query: MoodCommentsQuery = {
    before: input.before,
  };
  return loadMoodComments(context, input.postId, query);
}
