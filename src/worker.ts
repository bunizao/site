import astroWorker from '@astrojs/cloudflare/entrypoints/server';

interface WorkerEnv {
  API?: {
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

export default {
  fetch(request: Request, env: WorkerEnv, context: WorkerExecutionContext): Promise<Response> {
    return siteWorker.fetch(request, env, context);
  },
};
