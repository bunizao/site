import type { ApiServiceBinding } from '@/lib/http/api-service-proxy';

export interface WorkerTaskEnv {
  API?: ApiServiceBinding;
  PUBLIC_SITE_URL?: string;
  SITE_URL?: string;
  NOTIFY_BASE_URL?: string;
  CRON_SECRET?: string;
  NOTIFY_CRON_SECRET?: string;
  NOTIFY_DISPATCH_SECRET?: string;
  NOTIFY_DISPATCH_URL?: string;
}

export interface WorkerTaskResult {
  path: string;
  ok: boolean;
  status: number;
  body: string;
  durationMs: number;
}

export interface WorkerTaskRunResult {
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  ok: boolean;
  results: WorkerTaskResult[];
}

export interface NotifyDispatchJob {
  postId?: string;
  deliveryModes?: string[];
  source?: string;
}

export interface QueueBatch<T> {
  messages: Array<{
    body: T;
  }>;
}

type WorkerTaskFetch = (request: Request) => Promise<Response>;

const SCHEDULED_NOTIFY_PATHS = ['/api/notify/schedule', '/api/notify/retry'] as const;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

function getSiteOrigin(env: WorkerTaskEnv): string {
  return trimTrailingSlash(
    env.NOTIFY_BASE_URL?.trim()
    || env.PUBLIC_SITE_URL?.trim()
    || env.SITE_URL?.trim()
    || 'https://buxx.me'
  );
}

function buildInternalUrl(env: WorkerTaskEnv, path: string): string {
  return `${getSiteOrigin(env)}${path}`;
}

function getCronSecret(env: WorkerTaskEnv): string {
  return env.CRON_SECRET?.trim() || env.NOTIFY_CRON_SECRET?.trim() || '';
}

function getDispatchSecret(env: WorkerTaskEnv): string {
  return env.NOTIFY_DISPATCH_SECRET?.trim() || '';
}

function requireWorkerTaskValue(value: string, name: string): string {
  if (!value) {
    throw new Error(`Missing required configuration: ${name}`);
  }
  return value;
}

async function invokeTask(
  env: WorkerTaskEnv,
  path: string,
  fetcher: WorkerTaskFetch,
  secret: string
): Promise<WorkerTaskResult> {
  const started = Date.now();

  try {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (secret) {
      headers.set('Authorization', `Bearer ${secret}`);
    }

    const response = await fetcher(new Request(buildInternalUrl(env, path), {
      method: 'POST',
      headers,
      body: '{}',
    }));
    const body = await response.text();

    return {
      path,
      ok: response.ok,
      status: response.status,
      body,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      path,
      ok: false,
      status: 0,
      body: error instanceof Error ? error.message : 'Unknown worker task error',
      durationMs: Date.now() - started,
    };
  }
}

export async function runScheduledNotifyTasks(
  env: WorkerTaskEnv,
  fetcher: WorkerTaskFetch = fetch
): Promise<WorkerTaskRunResult> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const secret = requireWorkerTaskValue(getCronSecret(env), 'CRON_SECRET');
  const results: WorkerTaskResult[] = [];

  for (const path of SCHEDULED_NOTIFY_PATHS) {
    results.push(await invokeTask(env, path, fetcher, secret));
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    totalMs: Date.now() - started,
    ok: results.every((result) => result.ok),
    results,
  };
}

export async function dispatchNotifyQueue(
  batch: QueueBatch<NotifyDispatchJob>,
  env: WorkerTaskEnv,
  fetcher: WorkerTaskFetch = fetch
): Promise<void> {
  const secret = requireWorkerTaskValue(getDispatchSecret(env), 'NOTIFY_DISPATCH_SECRET');

  for (const message of batch.messages) {
    const postId = message.body?.postId?.trim() ?? '';
    if (!postId) {
      console.warn('Dropping notify queue message without postId');
      continue;
    }

    const response = await fetcher(new Request(buildInternalUrl(env, '/api/notify/dispatch'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        postId,
        deliveryModes: message.body.deliveryModes,
      }),
    }));

    if (!response.ok) {
      const body = (await response.text()).slice(0, 500);
      throw new Error(`Notify queue dispatch failed with ${response.status}: ${body}`);
    }
  }
}
