import type { APIRoute } from 'astro';
import { jsonError, jsonOk } from '@/lib/http/json-response';
import {
  createGhostAdminClient,
  GhostAdminClientError,
} from '@/features/posts/server/ghost-admin';

// A static route beats the sibling [...path].ts rest route, which only
// forwards `admin/*` paths to site-api. This one lists Ghost posts directly
// through the Ghost Admin API for the /dev/portal/blog list poll.
export const prerender = false;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const GET: APIRoute = async ({ locals }) => {
  try {
    const client = createGhostAdminClient({ locals });
    const posts = await client.listPosts();
    return jsonOk({ posts }, NO_STORE_HEADERS);
  } catch (error) {
    if (error instanceof GhostAdminClientError) {
      console.error('Ghost posts list failed.', {
        code: error.code,
        upstreamStatus: error.status ?? null,
      });

      switch (error.code) {
        case 'invalid_configuration':
          return jsonError(503, 'Ghost draft preview is unavailable.', NO_STORE_HEADERS, {
            hint: 'Set GHOST_ADMIN_API_KEY and PUBLIC_GHOST_URL to enable Ghost post previews.',
          });
        case 'timeout':
          return jsonError(504, 'Ghost Admin request timed out.', NO_STORE_HEADERS);
        default:
          return jsonError(502, 'Ghost Admin request failed.', NO_STORE_HEADERS);
      }
    }

    console.error('Ghost posts list failed.', {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return jsonError(502, 'Ghost Admin request failed.', NO_STORE_HEADERS);
  }
};
