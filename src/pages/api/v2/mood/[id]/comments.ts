import type { APIRoute } from 'astro';
import { handleMoodCommentsApiRoute } from '@/features/mood/server/api-routes';

export const prerender = false;

export const GET: APIRoute = ({ request, locals, params }) => handleMoodCommentsApiRoute(
  { request, locals },
  { postId: params.id ?? '', source: 'archive', rateLimitPrefix: 'api:v2:mood:comments' }
);
