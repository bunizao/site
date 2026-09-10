import astroWorker from '@astrojs/cloudflare/entrypoints/server';
import {
  cacheHtmlPageResponse,
  isNeverCachePath,
  readCachedHtmlPage,
  redirectCanonicalUrl,
  redirectLegacyBlogUrl,
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

async function renderHtmlPage(
  request: Request,
  env: WorkerEnv,
  context: WorkerExecutionContext,
): Promise<Response> {
  const assetResponse = await fetchStaticAsset(request, env);
  const response = assetResponse ?? (await siteWorker.fetch(request, env, context));
  return withContentPolicy(request, response);
}

async function revalidateHtmlPage(
  request: Request,
  env: WorkerEnv,
  context: WorkerExecutionContext,
): Promise<void> {
  try {
    const response = await renderHtmlPage(request, env, context);
    await cacheHtmlPageResponse(request, response);
  } catch {
    // The stale copy keeps serving; the next stale hit retries.
  }
}

// This worker owns the edge HTML cache: one read before rendering, one write
// after, deferred past the response via waitUntil. The Astro middleware only
// decorates responses (security headers, content policy) and never touches
// the cache, so a miss costs a single read and a single background write.
export default {
  async fetch(request: Request, env: WorkerEnv, context: WorkerExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const canonicalRedirect = redirectCanonicalUrl(request);
    if (canonicalRedirect) return canonicalRedirect;

    // Non-GET requests carry a body the page handler still has to read.
    // The asset probe in renderHtmlPage passes the original request to
    // ASSETS.fetch, which consumes that body even on a 404 miss, so a form
    // POST (e.g. /reader/confirm) would reach Astro body-less and throw
    // "Body has already been used". Assets and the HTML edge cache are
    // GET-only surfaces anyway -- render directly.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return siteWorker.fetch(request, env, context);
    }

    const locals = createLocals(env);
    const markdownResponse = await renderMarkdownIfRequested({
      request,
      locals,
      site: resolveSiteUrl(request, env),
    });

    if (markdownResponse) return markdownResponse;

    const legacyBlogRedirect = await redirectLegacyBlogUrl(request, locals);
    if (legacyBlogRedirect) return legacyBlogRedirect;

    if (isNeverCachePath(url.pathname)) {
      return siteWorker.fetch(request, env, context);
    }

    const cachedHtmlPage = await readCachedHtmlPage(request);
    if (cachedHtmlPage) {
      if (cachedHtmlPage.isStale) {
        context.waitUntil(revalidateHtmlPage(request, env, context));
      }
      return cachedHtmlPage.response;
    }

    const response = await renderHtmlPage(request, env, context);
    return cacheHtmlPageResponse(request, response, context);
  },
};
