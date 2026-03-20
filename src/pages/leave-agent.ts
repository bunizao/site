import type { APIRoute } from 'astro';
import { leaveAgentResponse } from '@/lib/office-compat';

export const prerender = false;

export const POST: APIRoute = (context) => leaveAgentResponse(context);
