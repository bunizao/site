import { describe, expect, test } from 'bun:test';
import {
  dispatchApiNotifyQueue,
  type ApiQueueBridgeEnv,
} from '@/lib/cloudflare/api-queue-bridge';

function createEnv(responseStatus = 200): ApiQueueBridgeEnv & { requests: Request[] } {
  const requests: Request[] = [];

  return {
    NOTIFY_DISPATCH_SECRET: 'dispatch-secret',
    requests,
    API: {
      async fetch(input) {
        const request = input instanceof Request ? input : new Request(input);
        requests.push(request);
        return new Response(JSON.stringify({ ok: responseStatus < 400 }), { status: responseStatus });
      },
    },
  };
}

describe('api queue bridge', () => {
  test('forwards queue dispatch jobs to the private API service binding', async () => {
    const env = createEnv();

    await dispatchApiNotifyQueue({
      messages: [
        { body: { postId: ' 123 ', deliveryModes: ['daily'] } },
        { body: { postId: '' } },
      ],
    }, env);

    expect(env.requests).toHaveLength(1);
    expect(new URL(env.requests[0]!.url).pathname).toBe('/v2/notify/dispatch');
    expect(env.requests[0]!.headers.get('Authorization')).toBe('Bearer dispatch-secret');
    expect(await env.requests[0]!.json()).toEqual({
      postId: '123',
      deliveryModes: ['daily'],
    });
  });

  test('fails loudly when the private API binding is unavailable', async () => {
    try {
      await dispatchApiNotifyQueue({ messages: [] }, { NOTIFY_DISPATCH_SECRET: 'dispatch-secret' });
      throw new Error('Expected queue bridge to fail');
    } catch (error) {
      expect((error as Error).message).toBe('Missing required service binding: API');
    }
  });

  test('fails queue dispatch when the private API rejects the job', async () => {
    const env = createEnv(503);

    try {
      await dispatchApiNotifyQueue({
        messages: [{ body: { postId: '123' } }],
      }, env);
      throw new Error('Expected queue bridge to fail');
    } catch (error) {
      expect((error as Error).message).toContain('Private API notify dispatch failed with 503');
    }
  });
});
