import { proxyApiRoute } from '@/lib/http/api-service-proxy';
import { createE2EApiFixtureResponse } from '@/lib/http/e2e-api-fixtures';

export const prerender = false;

export const ALL = async (context: Parameters<typeof proxyApiRoute>[0]) => {
  const fixtureResponse = await createE2EApiFixtureResponse(context);
  return fixtureResponse ?? proxyApiRoute(context);
};
