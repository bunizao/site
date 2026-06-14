export interface ApiServiceBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface ApiQueueBridgeEnv {
  API?: ApiServiceBinding;
  NOTIFY_DISPATCH_SECRET?: string;
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

const API_SERVICE_ORIGIN = 'https://site-api.internal';

function requireApiBinding(env: ApiQueueBridgeEnv): ApiServiceBinding {
  if (!env.API || typeof env.API.fetch !== 'function') {
    throw new Error('Missing required service binding: API');
  }

  return env.API;
}

function requireDispatchSecret(env: ApiQueueBridgeEnv): string {
  const secret = env.NOTIFY_DISPATCH_SECRET?.trim() ?? '';
  if (!secret) {
    throw new Error('Missing required configuration: NOTIFY_DISPATCH_SECRET');
  }

  return secret;
}

export async function dispatchApiNotifyQueue(
  batch: QueueBatch<NotifyDispatchJob>,
  env: ApiQueueBridgeEnv,
): Promise<void> {
  const api = requireApiBinding(env);
  const secret = requireDispatchSecret(env);

  for (const message of batch.messages) {
    const postId = message.body?.postId?.trim() ?? '';
    if (!postId) {
      console.warn('Dropping notify queue message without postId');
      continue;
    }

    const response = await api.fetch(new Request(`${API_SERVICE_ORIGIN}/v1/notify/dispatch`, {
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
      const body = await response.text();
      throw new Error(`Private API notify dispatch failed with ${response.status}: ${body.slice(0, 500)}`);
    }
  }
}
