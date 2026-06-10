import { describe, expect, test } from 'bun:test';
import { dispatchNotifyQueue, runScheduledNotifyTasks } from '../../src/worker-tasks';

describe('Cloudflare Worker notify tasks', () => {
  test('runs schedule and retry as independent scheduled tasks', async () => {
    const requests: Request[] = [];
    const result = await runScheduledNotifyTasks(
      {
        PUBLIC_SITE_URL: 'https://buxx.me',
        CRON_SECRET: 'cron-secret',
      },
      async (request) => {
        requests.push(request);
        return new Response(request.url.endsWith('/schedule') ? 'schedule failed' : 'ok', {
          status: request.url.endsWith('/schedule') ? 500 : 200,
        });
      }
    );

    expect(result.ok).toBe(false);
    expect(result.results.map((entry) => [entry.path, entry.status, entry.ok])).toEqual([
      ['/api/notify/schedule', 500, false],
      ['/api/notify/retry', 200, true],
    ]);
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/api/notify/schedule',
      '/api/notify/retry',
    ]);
    expect(requests.map((request) => request.headers.get('Authorization'))).toEqual([
      'Bearer cron-secret',
      'Bearer cron-secret',
    ]);
  });

  test('requires a cron secret before running scheduled tasks', async () => {
    let called = false;

    try {
      await runScheduledNotifyTasks(
        { PUBLIC_SITE_URL: 'https://buxx.me' },
        async () => {
          called = true;
          return Response.json({ ok: true });
        }
      );
      throw new Error('Expected scheduled tasks to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Missing required configuration: CRON_SECRET');
    }

    expect(called).toBe(false);
  });

  test('dispatches notify queue messages to the site notify endpoint', async () => {
    const requests: Request[] = [];

    await dispatchNotifyQueue(
      {
        messages: [
          {
            body: {
              postId: '1234',
              deliveryModes: ['immediate'],
              source: 'telegram-webhook',
            },
          },
        ],
      },
      {
        PUBLIC_SITE_URL: 'https://buxx.me',
        NOTIFY_DISPATCH_SECRET: 'dispatch-secret',
      },
      async (request) => {
        requests.push(request);
        return Response.json({ ok: true });
      }
    );

    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url).pathname).toBe('/api/notify/dispatch');
    expect(requests[0].headers.get('Authorization')).toBe('Bearer dispatch-secret');
    expect(await requests[0].json()).toEqual({
      postId: '1234',
      deliveryModes: ['immediate'],
    });
  });

  test('requires a dispatch secret before consuming notify queue messages', async () => {
    try {
      await dispatchNotifyQueue(
        {
          messages: [
            {
              body: {
                postId: '1234',
                deliveryModes: ['immediate'],
              },
            },
          ],
        },
        { PUBLIC_SITE_URL: 'https://buxx.me' },
        async () => Response.json({ ok: true })
      );
      throw new Error('Expected queue dispatch to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Missing required configuration: NOTIFY_DISPATCH_SECRET');
    }
  });
});
