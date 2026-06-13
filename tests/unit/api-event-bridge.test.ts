import { describe, expect, test } from 'bun:test';
import {
  dispatchApiNotifyQueue,
  runApiScheduledBridge,
  type ApiEventBridgeEnv,
} from '@/lib/cloudflare/api-event-bridge';

function createEnv(responseStatus = 200): ApiEventBridgeEnv & { requests: Request[] } {
  const requests: Request[] = [];

  return {
    CRON_SECRET: 'cron-secret',
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

describe('api event bridge', () => {
  test('forwards scheduled tasks to the private API service binding', async () => {
    const env = createEnv();

    await runApiScheduledBridge({ cron: '*/15 * * * *', scheduledTime: 123 }, env);

    expect(env.requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/v1/notify/schedule',
      '/v1/notify/retry',
    ]);
    expect(env.requests.every((request) => request.headers.get('Authorization') === 'Bearer cron-secret')).toBe(true);
  });

  test('forwards queue dispatch jobs to the private API service binding', async () => {
    const env = createEnv();

    await dispatchApiNotifyQueue({
      messages: [
        { body: { postId: ' 123 ', deliveryModes: ['daily'] } },
        { body: { postId: '' } },
      ],
    }, env);

    expect(env.requests).toHaveLength(1);
    expect(new URL(env.requests[0]!.url).pathname).toBe('/v1/notify/dispatch');
    expect(env.requests[0]!.headers.get('Authorization')).toBe('Bearer dispatch-secret');
    expect(await env.requests[0]!.json()).toEqual({
      postId: '123',
      deliveryModes: ['daily'],
    });
  });

  test('fails loudly when the private API binding is unavailable', async () => {
    try {
      await runApiScheduledBridge({}, { CRON_SECRET: 'cron-secret' });
      throw new Error('Expected scheduled bridge to fail');
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
