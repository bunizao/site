import { describe, expect, test } from 'bun:test';
import { loadDeskListeningStats, loadDeskSubscriberCounts } from '@/features/desk/server/content';
import type { MoodServerContext } from '@/features/mood/server/channel-service';

function context(response: () => Response): MoodServerContext {
  return {
    request: new Request('https://buxx.me/new', { headers: { cookie: 'identity=private' } }),
    locals: { env: { API: { fetch: async (request: Request) => {
      expect(request.headers.has('cookie')).toBe(false);
      return response();
    } } } },
  };
}

const listening = {
  generatedAt: '2026-10-04T00:00:00.000Z',
  window: { from: '2026-09-27T00:00:00.000Z', to: '2026-10-04T00:00:00.000Z' },
  totals: { plays: 12 },
  topArtist: { name: 'Artist', plays: 5 },
};

describe('desk audience and listening snapshots', () => {
  test('loads public counts through the binding including a valid zero', async () => {
    const counts = { generatedAt: listening.generatedAt, channels: { blog: 4, mood: 0 } };
    expect(await loadDeskSubscriberCounts(context(() => Response.json(counts)))).toEqual(counts);
    expect(await loadDeskListeningStats(context(() => Response.json(listening)))).toEqual(listening);
    const empty = { ...listening, totals: { plays: 0 }, topArtist: null };
    expect(await loadDeskListeningStats(context(() => Response.json(empty)))).toEqual(empty);
  });

  test('uses the separate public snapshot routes', async () => {
    const paths: string[] = [];
    const env = { API: { fetch: async (request: Request) => {
      paths.push(new URL(request.url).pathname);
      return new Response('', { status: 503 });
    } } };
    const input = { request: new Request('https://buxx.me/new'), locals: { env } };
    await loadDeskSubscriberCounts(input);
    await loadDeskListeningStats(input);
    expect(paths).toEqual(['/api/v2/notify/stats', '/api/v2/listening/stats']);
  });

  test('missing, malformed, or failed JSON does not fail the desk', async () => {
    for (const makeResponse of [() => new Response('', { status: 503 }),
      () => Response.json(null), () => Response.json({}), () => new Response('{')]) {
      expect(await loadDeskSubscriberCounts(context(makeResponse))).toBeNull();
      expect(await loadDeskListeningStats(context(makeResponse))).toBeNull();
    }
  });

  test('rejects invalid counters and incomplete listening windows', async () => {
    expect(await loadDeskSubscriberCounts(context(() => Response.json({
      generatedAt: listening.generatedAt, channels: { blog: -1, mood: 2 },
    })))).toBeNull();
    for (const invalid of [
      { ...listening, totals: { plays: -1 } },
      { ...listening, window: { from: 'invalid', to: listening.generatedAt } },
      { ...listening, window: { from: listening.generatedAt, to: listening.generatedAt } },
      { ...listening, topArtist: { name: '', plays: 2 } },
    ]) expect(await loadDeskListeningStats(context(() => Response.json(invalid)))).toBeNull();
  });
});
