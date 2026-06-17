import type { APIRoute } from 'astro';
import { handleMoodCommentsApiRoute } from '@/features/mood/server/api-routes';

export const prerender = false;

export const GET: APIRoute = ({ request, locals, params }) => handleMoodCommentsApiRoute(
  { request, locals },
  { postId: params.id ?? '', source: 'live', rateLimitPrefix: 'api:v1:mood:comments' }
);
