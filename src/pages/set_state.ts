import type { APIRoute } from 'astro';
import { setStateResponse } from '@/lib/office-compat';

export const prerender = false;

export const POST: APIRoute = (context) => setStateResponse(context);
