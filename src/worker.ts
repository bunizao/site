import astroWorker from '@astrojs/cloudflare/entrypoints/server';

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface AstroWorker {
  fetch(request: Request, env: unknown, context: WorkerExecutionContext): Promise<Response>;
}

const siteWorker = astroWorker as AstroWorker;

export default {
  fetch(request: Request, env: unknown, context: WorkerExecutionContext): Promise<Response> {
    return siteWorker.fetch(request, env, context);
  },
};
