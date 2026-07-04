import { proxyApiRoute } from '@/lib/http/api-service-proxy';
import { isE2ESiteFixtureEnabled } from '@/lib/e2e';
import type { APIRoute } from 'astro';

export const prerender = false;

export const ALL: APIRoute = async (context) => {
  if (isE2ESiteFixtureEnabled(context.locals)) {
    const { createE2EApiFixtureResponse } = await import('@/lib/http/e2e-api-fixtures');
    const fixtureResponse = await createE2EApiFixtureResponse(context);
    if (fixtureResponse) return fixtureResponse;
  }

  return proxyApiRoute(context);
};
