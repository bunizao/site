import type { APIRoute } from 'astro';
import { getAgentsResponse } from '@/lib/office-compat';

export const prerender = false;

export const GET: APIRoute = (context) => getAgentsResponse(context);
