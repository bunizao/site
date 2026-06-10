import astroWorker from '@astrojs/cloudflare/entrypoints/server';
import {
  dispatchNotifyQueue,
  runScheduledNotifyTasks,
  type NotifyDispatchJob,
  type QueueBatch,
  type WorkerTaskEnv,
} from './worker-tasks';

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface AstroWorker {
  fetch(request: Request, env: WorkerTaskEnv, context: WorkerExecutionContext): Promise<Response>;
}

interface ScheduledController {
  cron?: string;
  scheduledTime?: number;
}

const siteWorker = astroWorker as AstroWorker;

async function fetchSite(
  request: Request,
  env: WorkerTaskEnv,
  context: WorkerExecutionContext
): Promise<Response> {
  return siteWorker.fetch(request, env, context);
}

async function runScheduled(
  controller: ScheduledController,
  env: WorkerTaskEnv,
  context: WorkerExecutionContext
): Promise<void> {
  const result = await runScheduledNotifyTasks(env, (request) => fetchSite(request, env, context));

  if (result.ok) {
    console.info('Scheduled notify tasks completed:', {
      cron: controller.cron,
      scheduledTime: controller.scheduledTime,
      totalMs: result.totalMs,
    });
    return;
  }

  console.error('Scheduled notify tasks failed:', {
    cron: controller.cron,
    scheduledTime: controller.scheduledTime,
    results: result.results,
  });
  throw new Error('Scheduled notify tasks failed');
}

export default {
  fetch(request: Request, env: WorkerTaskEnv, context: WorkerExecutionContext): Promise<Response> {
    return fetchSite(request, env, context);
  },

  scheduled(controller: ScheduledController, env: WorkerTaskEnv, context: WorkerExecutionContext): void {
    context.waitUntil(runScheduled(controller, env, context));
  },

  async queue(
    batch: QueueBatch<NotifyDispatchJob>,
    env: WorkerTaskEnv,
    context: WorkerExecutionContext
  ): Promise<void> {
    await dispatchNotifyQueue(batch, env, (request) => fetchSite(request, env, context));
  },
};
