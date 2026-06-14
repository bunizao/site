import { defineMiddleware } from 'astro:middleware';
import {
  createApiServiceRequest,
  getApiServiceBinding,
} from '@/lib/http/api-service-proxy';
import type { RuntimeEnvLocals } from '@/lib/runtime/env';
import { getDocsVisibilityFromContent } from '@/features/docs/server/content';
import { isDocsPath } from '@/features/docs/server/visibility';

const OAUTH_LOGIN_PATH = '/oauth/login';

async function hasPrivateAdminSession(request: Request, locals: RuntimeEnvLocals | undefined): Promise<boolean> {
  const api = await getApiServiceBinding(locals);
  if (!api) return false;

  const url = new URL(request.url);
  url.pathname = '/v2/admin/session';
  url.search = '';

  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie) {
    headers.set('cookie', cookie);
  }

  const response = await api.fetch(createApiServiceRequest(new Request(url, {
    method: 'GET',
    headers,
  })));
  return response.status === 204;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;
  const docsVisibility = isDocsPath(pathname) ? await getDocsVisibilityFromContent(pathname) : 'missing';

  if (docsVisibility !== 'protected') {
    return next();
  }

  if (await hasPrivateAdminSession(context.request, context.locals)) {
    return next();
  }

  const nextPath = encodeURIComponent(pathname + url.search);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${OAUTH_LOGIN_PATH}?next=${nextPath}`,
    },
  });
});
