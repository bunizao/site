import astroWorker from '@astrojs/cloudflare/entrypoints/server';
import {
  cacheHtmlPageResponse,
  fetchBlogAsset,
  resolveBlogRequest,
  withBlogVariantHeaders,
  isNeverCachePath,
  readCachedHtmlPage,
  redirectCanonicalUrl,
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
    const canonicalRedirect = redirectCanonicalUrl(request);
    if (canonicalRedirect) return canonicalRedirect;

    const locals = createLocals(env);
    const markdownResponse = await renderMarkdownIfRequested({
      request,
      locals,
      site: resolveSiteUrl(request, env),
    });

    if (markdownResponse) return markdownResponse;

    const blogResolution = await resolveBlogRequest(request, locals);
    if (blogResolution?.redirect) return blogResolution.redirect;

    const cachedHtmlPage = isNeverCachePath(url.pathname)
      ? null
      : await readCachedHtmlPage(request, createLocals(env));
    if (cachedHtmlPage) {
      return blogResolution
        ? withBlogVariantHeaders(request, cachedHtmlPage, blogResolution)
        : cachedHtmlPage;
    }

    const blogAsset = await fetchBlogAsset(request, createLocals(env));
    if (blogAsset) {
      return cacheHtmlPageResponse(request, withContentPolicy(request, blogAsset), createLocals(env));
    }

    const assetResponse = isNeverCachePath(url.pathname)
      ? null
      : await fetchStaticAsset(request, env);
    if (assetResponse) {
      return cacheHtmlPageResponse(request, withContentPolicy(request, assetResponse), createLocals(env));
    }

    const response = await siteWorker.fetch(request, env, context);
    if (isNeverCachePath(url.pathname)) return response;

    return cacheHtmlPageResponse(request, withContentPolicy(request, response), createLocals(env));
  },
};
