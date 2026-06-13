export interface ApiServiceBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface ApiEventBridgeEnv {
  API?: ApiServiceBinding;
  CRON_SECRET?: string;
  NOTIFY_CRON_SECRET?: string;
  NOTIFY_DISPATCH_SECRET?: string;
}

export interface ScheduledController {
  cron?: string;
  scheduledTime?: number;
}

export interface NotifyDispatchJob {
  postId?: string;
  deliveryModes?: string[];
}

export interface QueueBatch<T> {
  messages: Array<{
    body: T;
  }>;
}

interface ApiTaskResult {
  path: string;
  ok: boolean;
  status: number;
  body: string;
}

const API_SERVICE_ORIGIN = 'https://site-api.internal';
const scheduledNotifyPaths = ['/v1/notify/schedule', '/v1/notify/retry'] as const;

function requireApiBinding(env: ApiEventBridgeEnv): ApiServiceBinding {
  if (!env.API || typeof env.API.fetch !== 'function') {
    throw new Error('Missing required service binding: API');
  }

  return env.API;
}

function requireSecret(value: string | undefined, name: string): string {
  const secret = value?.trim() ?? '';
  if (!secret) {
    throw new Error(`Missing required configuration: ${name}`);
  }

  return secret;
}

function getCronSecret(env: ApiEventBridgeEnv): string {
  return requireSecret(env.CRON_SECRET || env.NOTIFY_CRON_SECRET, 'CRON_SECRET');
}

function getDispatchSecret(env: ApiEventBridgeEnv): string {
  return requireSecret(env.NOTIFY_DISPATCH_SECRET, 'NOTIFY_DISPATCH_SECRET');
}

async function invokeApiTask(
  api: ApiServiceBinding,
  path: string,
  secret: string,
  body: unknown,
): Promise<ApiTaskResult> {
  const response = await api.fetch(new Request(`${API_SERVICE_ORIGIN}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }));

  const responseBody = await response.text();

  return {
    path,
    ok: response.ok,
    status: response.status,
    body: responseBody,
  };
}

export async function runApiScheduledBridge(
  controller: ScheduledController,
  env: ApiEventBridgeEnv,
): Promise<void> {
  const api = requireApiBinding(env);
  const secret = getCronSecret(env);
  const results: ApiTaskResult[] = [];

  for (const path of scheduledNotifyPaths) {
    results.push(await invokeApiTask(api, path, secret, {}));
  }

  if (results.every((result) => result.ok)) {
    console.info('Forwarded scheduled notify tasks to private API:', {
      cron: controller.cron,
      scheduledTime: controller.scheduledTime,
    });
    return;
  }

  console.error('Private API scheduled notify task failed:', { results });
  throw new Error('Private API scheduled notify task failed');
}

export async function dispatchApiNotifyQueue(
  batch: QueueBatch<NotifyDispatchJob>,
  env: ApiEventBridgeEnv,
): Promise<void> {
  const api = requireApiBinding(env);
  const secret = getDispatchSecret(env);

  for (const message of batch.messages) {
    const postId = message.body?.postId?.trim() ?? '';
    if (!postId) {
      console.warn('Dropping notify queue message without postId');
      continue;
    }

    const result = await invokeApiTask(api, '/v1/notify/dispatch', secret, {
      postId,
      deliveryModes: message.body.deliveryModes,
    });

    if (!result.ok) {
      throw new Error(`Private API notify dispatch failed with ${result.status}: ${result.body.slice(0, 500)}`);
    }
  }
}
