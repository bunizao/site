import { proxyApiRoute } from '@/lib/http/api-service-proxy';
import { createE2EApiFixtureResponse } from '@/lib/http/e2e-api-fixtures';
import type { APIRoute } from 'astro';

export const prerender = false;

export const ALL: APIRoute = async (context) => {
  const fixtureResponse = await createE2EApiFixtureResponse(context);
  return fixtureResponse ?? proxyApiRoute(context);
};
