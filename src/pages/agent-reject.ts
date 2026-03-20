import type { APIRoute } from 'astro';
import { agentRejectResponse } from '@/lib/office-compat';

export const prerender = false;

export const POST: APIRoute = (context) => agentRejectResponse(context);
