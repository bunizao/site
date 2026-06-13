import astroWorker from '@astrojs/cloudflare/entrypoints/server';
import {
  dispatchApiNotifyQueue,
  runApiScheduledBridge,
  type ApiEventBridgeEnv,
  type NotifyDispatchJob,
  type QueueBatch,
  type ScheduledController,
} from '@/lib/cloudflare/api-event-bridge';

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface AstroWorker {
  fetch(request: Request, env: ApiEventBridgeEnv, context: WorkerExecutionContext): Promise<Response>;
}

const siteWorker = astroWorker as AstroWorker;

export default {
  fetch(request: Request, env: ApiEventBridgeEnv, context: WorkerExecutionContext): Promise<Response> {
    return siteWorker.fetch(request, env, context);
  },

  scheduled(controller: ScheduledController, env: ApiEventBridgeEnv, context: WorkerExecutionContext): void {
    context.waitUntil(runApiScheduledBridge(controller, env));
  },

  async queue(batch: QueueBatch<NotifyDispatchJob>, env: ApiEventBridgeEnv): Promise<void> {
    await dispatchApiNotifyQueue(batch, env);
  },
};
