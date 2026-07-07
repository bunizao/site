import astroWorker from '@astrojs/cloudflare/entrypoints/server';
import {
  cacheHtmlPageResponse,
  isNeverCachePath,
  readCachedHtmlPage,
  renderMarkdownIfRequested,
  withContentPolicy,
} from '@/features/agent-markdown/server/responses';

interface WorkerEnv extends Record<string, unknown> {
  API?: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
  ASSETS?: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface AstroWorker {
  fetch(request: Request, env: WorkerEnv, context: WorkerExecutionContext): Promise<Response>;
}

const siteWorker = astroWorker as AstroWorker;

function createLocals(env: WorkerEnv): App.Locals {
  return {
    env,
    runtime: { env },
  } as App.Locals;
}

function resolveSiteUrl(request: Request, env: WorkerEnv): URL {
  const configured = env.PUBLIC_SITE_URL ?? env.SITE_URL;
  if (typeof configured === 'string' && configured.trim()) {
    return new URL(configured);
  }

  return new URL(new URL(request.url).origin);
}

async function fetchStaticAsset(request: Request, env: WorkerEnv): Promise<Response | null> {
  const response = await env.ASSETS?.fetch(request);
  if (!response || response.status === 404) return null;
  return response;
}

export default {
  async fetch(request: Request, env: WorkerEnv, context: WorkerExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const locals = createLocals(env);
    const markdownResponse = await renderMarkdownIfRequested({
      request,
      locals,
      site: resolveSiteUrl(request, env),
    });

    if (markdownResponse) return markdownResponse;

    const cachedHtmlPage = isNeverCachePath(url.pathname) ? null : await readCachedHtmlPage(request);
    if (cachedHtmlPage) return cachedHtmlPage;

    const assetResponse = isNeverCachePath(url.pathname)
      ? null
      : await fetchStaticAsset(request, env);
    if (assetResponse) {
      return cacheHtmlPageResponse(request, withContentPolicy(request, assetResponse));
    }

    const response = await siteWorker.fetch(request, env, context);
    if (isNeverCachePath(url.pathname)) return response;

    return cacheHtmlPageResponse(request, withContentPolicy(request, response));
  },
};
