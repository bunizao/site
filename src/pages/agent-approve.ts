import type { APIRoute } from 'astro';
import { agentApproveResponse } from '@/lib/office-compat';

export const prerender = false;

export const POST: APIRoute = (context) => agentApproveResponse(context);
