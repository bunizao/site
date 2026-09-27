import { describe, expect, mock, test } from 'bun:test';

// The middleware pulls in astro virtual modules through its import chain;
// stub them so the request handler runs under bun.
mock.module('astro:middleware', () => ({
  defineMiddleware: (fn: unknown) => fn,
}));
mock.module('astro:content', () => ({
  getEntry: async () => null,
}));

const { onRequest } = await import('../../src/middleware');

type Handler = (context: unknown, next: () => Promise<Response>) => Promise<Response>;

async function requestDevPath(
  url: string,
  options: { env?: Record<string, string>; headers?: Record<string, string> } = {},
) {
  const locals: Record<string, unknown> = { env: options.env ?? {} };
  let rendered = 0;
  const next = async () => {
    rendered += 1;
    return new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } });
  };
  const request = new Request(url, { headers: options.headers });
  const response = await (onRequest as unknown as Handler)(
    { request, url: new URL(url), locals },
    next,
  );
  return { response, rendered, locals };
}

describe('dev route gate', () => {
  test.each(['/dev', '/dev/portal', '/dev/portal/analytics', '/dev/blog/draft-id'])(
    'rejects %s without an admin session with 401 no-store',
    async (path) => {
      const { response, rendered } = await requestDevPath(`https://buxx.me${path}`);

      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(rendered).toBe(0);
    },
  );

  test('renders a localhost /dev page with the dev bypass and records the session', async () => {
    const { response, rendered, locals } = await requestDevPath('http://localhost:4321/dev/portal', {
      env: { ADMIN_DEV_BYPASS: '1', ADMIN_DEV_LOGIN: 'local-admin' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(rendered).toBe(1);
    expect(locals.adminSession).toEqual({ login: 'local-admin' });
  });

  test('rejects the dev bypass when a tunnel forwards the request as localhost', async () => {
    const { response, rendered } = await requestDevPath('http://localhost:4321/dev/portal', {
      env: { ADMIN_DEV_BYPASS: '1' },
      headers: { 'cf-connecting-ip': '198.51.100.7' },
    });

    expect(response.status).toBe(401);
    expect(rendered).toBe(0);
  });
});
