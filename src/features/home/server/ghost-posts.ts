import type { EnvSource, RuntimeEnvLocals } from '@/lib/runtime/env';
import { readEnv } from '@/lib/runtime/env';

export interface GhostPostTag {
  id: string;
  name: string;
  slug: string;
  visibility: 'public' | 'internal';
}

export interface GhostPostMeta {
  id: string;
  title: string;
  url: string;
  published_at: string;
  tags: GhostPostTag[];
}

interface GhostPostsResponse {
  posts?: GhostPostMeta[];
}

export function readGhostUrl(
  locals: RuntimeEnvLocals | undefined,
  buildEnv?: EnvSource
): string {
  return readEnv(locals, 'GHOST_URL', buildEnv) || 'https://blog.buxx.me';
}

export async function fetchLatestGhostPosts(options: {
  locals?: RuntimeEnvLocals;
  buildEnv?: EnvSource;
  limit?: number;
} = {}): Promise<GhostPostMeta[]> {
  const ghostUrl = readGhostUrl(options.locals, options.buildEnv);
  const apiKey = readEnv(options.locals, 'GHOST_CONTENT_APIKEY', options.buildEnv);
  if (!apiKey) {
    return [];
  }

  const apiUrl = new URL('/ghost/api/v3/content/posts/', ghostUrl);
  apiUrl.searchParams.set('key', apiKey);
  apiUrl.searchParams.set('limit', String(options.limit ?? 5));
  apiUrl.searchParams.set('fields', 'id,title,url,published_at');
  apiUrl.searchParams.set('include', 'tags');
  apiUrl.searchParams.set('filter', 'visibility:public');

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      return [];
    }

    const result = await response.json() as GhostPostsResponse;
    return Array.isArray(result.posts) ? result.posts : [];
  } catch (error) {
    console.error('Failed to fetch posts:', error);
    return [];
  }
}
