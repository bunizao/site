import type { APIRoute } from 'astro';
import { healthResponse } from '@/lib/office-compat';

export const prerender = false;

export const GET: APIRoute = (context) => healthResponse(context);
