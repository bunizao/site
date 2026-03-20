import type { APIRoute } from 'astro';
import { agentPushResponse } from '@/lib/office-compat';

export const prerender = false;

export const POST: APIRoute = (context) => agentPushResponse(context);
