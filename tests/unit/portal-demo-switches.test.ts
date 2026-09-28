import { describe, expect, test } from 'bun:test';
import { handleDemoRequest } from '../../src/features/portal/server/demo-api';

/* `?demoFail=` and `?demoDelay=` reach the demo API as these headers
   (src/features/portal/app/api.ts). Delay 0 keeps the tests off the clock. */
function call(path: string, headers: Record<string, string> = {}): Promise<Response> {
  // The route hands over the path without its query string, as [...path].ts does.
  return handleDemoRequest(
    new Request(`http://localhost/dev/portal/api/${path}?limit=1`, { headers: { 'x-portal-demo-delay': '0', ...headers } }),
    path,
  );
}

describe('portal demo switches', () => {
  test('answers normally without a failure switch', async () => {
    expect((await call('admin/comments')).status).toBe(200);
  });

  test('fails paths under the given prefix with the site-api error shape', async () => {
    const failed = await call('admin/comments', { 'x-portal-demo-fail': 'admin/comments' });
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: 'Internal Server Error' });
    // A leading slash is how people type it.
    expect((await call('admin/comments', { 'x-portal-demo-fail': '/admin/comments' })).status).toBe(500);
  });

  test('leaves other paths alone, and * fails every path', async () => {
    expect((await call('admin/comments', { 'x-portal-demo-fail': 'admin/subscribers' })).status).toBe(200);
    expect((await call('admin/comments', { 'x-portal-demo-fail': '*' })).status).toBe(500);
  });

  test('clamps a nonsense delay instead of hanging', async () => {
    const started = performance.now();
    expect((await call('admin/comments', { 'x-portal-demo-delay': '-5' })).status).toBe(200);
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe('portal demo reset', () => {
  function send(path: string, method = 'GET', body?: unknown): Promise<Response> {
    return handleDemoRequest(
      new Request(`http://localhost/dev/portal/api/${path}`, {
        method,
        headers: { 'x-portal-demo-delay': '0', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      path.split('?')[0],
    );
  }
  const counts = async () => ((await (await send('admin/comments')).json()) as { summary: { byStatus: Record<string, number> } }).summary.byStatus;
  const bans = async () => ((await (await send('admin/bans')).json()) as { bans: Array<{ keyType: string; keyValue: string }> }).bans;

  test('puts the comment queue and the ban list back to the seed', async () => {
    await send('admin/__demo/reset', 'POST');
    const seedCounts = await counts();
    const seedBans = await bans();

    const held = ((await (await send('admin/comments?status=held')).json()) as { comments: Array<{ id: string }> }).comments[0];
    expect((await send(`admin/comments/${held.id}`, 'POST', { action: 'delete' })).status).toBe(200);
    const [ban] = seedBans;
    expect((await send(`admin/bans/${ban.keyType}/${encodeURIComponent(ban.keyValue)}`, 'DELETE')).status).toBe(200);
    expect(await counts()).not.toEqual(seedCounts);
    expect(await bans()).toHaveLength(seedBans.length - 1);

    const reset = await send('admin/__demo/reset', 'POST');
    expect(reset.status).toBe(200);
    expect(await counts()).toEqual(seedCounts);
    expect((await bans()).map((row) => row.keyValue)).toEqual(seedBans.map((row) => row.keyValue));
  });

  test('answers only POST', async () => {
    expect((await send('admin/__demo/reset')).status).toBe(404);
  });
});
