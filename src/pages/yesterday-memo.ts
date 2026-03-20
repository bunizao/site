import type { APIRoute } from 'astro';
import { getMemoResponse } from '@/lib/office-compat';

export const prerender = false;

export const GET: APIRoute = (context) => getMemoResponse(context);
