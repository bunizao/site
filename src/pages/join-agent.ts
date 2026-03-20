import type { APIRoute } from 'astro';
import { joinAgentResponse } from '@/lib/office-compat';

export const prerender = false;

export const POST: APIRoute = (context) => joinAgentResponse(context);
