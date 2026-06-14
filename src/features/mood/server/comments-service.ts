import type { MoodCommentsPage } from './contracts';
import { loadMoodComments, type MoodCommentsQuery } from './api-client';
import type { MoodServerContext } from './channel-service';

export interface LoadMoodCommentsInput {
  postId: string;
  before?: string;
  useApiV2?: boolean;
}

export async function loadMoodCommentsPage(
  context: MoodServerContext,
  input: LoadMoodCommentsInput
): Promise<MoodCommentsPage> {
  const query: MoodCommentsQuery = {
    before: input.before,
    useApiV2: input.useApiV2,
  };
  return loadMoodComments(context, input.postId, query);
}
