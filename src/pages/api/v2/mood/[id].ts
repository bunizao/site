import type { APIRoute } from 'astro';
import { handleMoodDocumentApiRoute } from '@/features/mood/server/api-routes';

export const prerender = false;

export const GET: APIRoute = ({ request, locals, params }) => handleMoodDocumentApiRoute(
  { request, locals },
  { postId: params.id ?? '', source: 'archive', rateLimitPrefix: 'api:v2:mood:detail' }
);
