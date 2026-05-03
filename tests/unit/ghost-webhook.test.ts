import { afterEach, describe, expect, mock, test } from 'bun:test';

import {
  POST,
  readGhostWebhookEvent,
  readGhostWebhookToken,
  shouldTriggerGhostDeploy,
} from '../../src/pages/api/ghost-webhook';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createContext(request: Request, env: Record<string, string> = {}) {
  return {
    request,
    locals: {
      runtime: {
        env,
      },
    },
  } as Parameters<typeof POST>[0];
}

describe('ghost webhook helpers', () => {
  test('reads the token from the query string first', () => {
    const request = new Request('https://buxx.me/api/ghost-webhook?token=query-secret', {
      headers: {
        authorization: 'Bearer header-secret',
        'x-webhook-token': 'fallback-secret',
      },
    });

    expect(readGhostWebhookToken(request)).toBe('query-secret');
  });

  test('filters events when Ghost includes the event name', () => {
    expect(readGhostWebhookEvent({ event: 'post.published' })).toBe('post.published');
    expect(shouldTriggerGhostDeploy({ event: 'post.published' })).toBe(true);
    expect(shouldTriggerGhostDeploy({ event: 'post.published.edited' })).toBe(true);
    expect(shouldTriggerGhostDeploy({ event: 'site.changed' })).toBe(false);
  });
});

describe('POST /api/ghost-webhook', () => {
  test('triggers the deploy hook for allowed events', async () => {
    const fetchMock = mock(async () => new Response('ok', { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const request = new Request('https://buxx.me/api/ghost-webhook?token=shared-secret', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event: 'post.published',
        post: {
          current: {
            id: '42',
            slug: 'hello-world',
            title: 'Hello World',
            url: 'https://blog.buxx.me/hello-world/',
          },
        },
      }),
    });

    const response = await POST(createContext(request, {
      GHOST_DEPLOY_HOOK_URL: 'https://api.vercel.com/v1/integrations/deploy/prj_xxx/hook_xxx',
      GHOST_WEBHOOK_TOKEN: 'shared-secret',
    }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      ok: true,
      triggered: true,
      event: 'post.published',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('ignores events outside the publish flow', async () => {
    const fetchMock = mock(async () => new Response('ok', { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const request = new Request('https://buxx.me/api/ghost-webhook?token=shared-secret', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event: 'site.changed',
      }),
    });

    const response = await POST(createContext(request, {
      GHOST_DEPLOY_HOOK_URL: 'https://api.vercel.com/v1/integrations/deploy/prj_xxx/hook_xxx',
      GHOST_WEBHOOK_TOKEN: 'shared-secret',
    }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      ok: true,
      triggered: false,
      ignored: true,
      event: 'site.changed',
    });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test('rejects invalid webhook tokens', async () => {
    const request = new Request('https://buxx.me/api/ghost-webhook?token=wrong-secret', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event: 'post.published',
      }),
    });

    const response = await POST(createContext(request, {
      GHOST_DEPLOY_HOOK_URL: 'https://api.vercel.com/v1/integrations/deploy/prj_xxx/hook_xxx',
      GHOST_WEBHOOK_TOKEN: 'shared-secret',
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'Unauthorized',
    });
  });
});
