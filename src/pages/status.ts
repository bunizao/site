import type { APIRoute } from 'astro';
import { getStatusResponse } from '@/lib/office-compat';

export const prerender = false;

export const GET: APIRoute = (context) => getStatusResponse(context);
