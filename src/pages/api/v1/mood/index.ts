import type { APIRoute } from 'astro';
import { handleMoodFeedApiRoute } from '@/features/mood/server/api-routes';

export const prerender = false;

export const GET: APIRoute = ({ request, locals }) => handleMoodFeedApiRoute(
  { request, locals },
  { source: 'live', rateLimitPrefix: 'api:v1:mood' }
);
