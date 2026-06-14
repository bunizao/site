import astroWorker from '@astrojs/cloudflare/entrypoints/server';
import {
  dispatchApiNotifyQueue,
  type ApiQueueBridgeEnv,
  type NotifyDispatchJob,
  type QueueBatch,
} from '@/lib/cloudflare/api-queue-bridge';

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface AstroWorker {
  fetch(request: Request, env: ApiQueueBridgeEnv, context: WorkerExecutionContext): Promise<Response>;
}

const siteWorker = astroWorker as AstroWorker;

export default {
  fetch(request: Request, env: ApiQueueBridgeEnv, context: WorkerExecutionContext): Promise<Response> {
    return siteWorker.fetch(request, env, context);
  },

  async queue(batch: QueueBatch<NotifyDispatchJob>, env: ApiQueueBridgeEnv): Promise<void> {
    await dispatchApiNotifyQueue(batch, env);
  },
};
