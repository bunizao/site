import { afterEach, describe, expect, test } from 'bun:test';
import {
  GET as getFooter,
  getCloudflareColo,
  getBetterStackFooterState,
  normalizeBetterStackAggregateState,
} from '../../src/pages/api/footer';

const originalFetch = globalThis.fetch;

function createFooterRequest(): Request {
  return new Request('https://buxx.me/api/footer');
}

function mockFetch(payload: unknown): void {
  globalThis.fetch = (async () => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as unknown as typeof fetch;
}

describe('api footer', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('normalizes Better Stack aggregate states for the footer contract', () => {
    expect(normalizeBetterStackAggregateState('operational')).toBe('operational');
    expect(normalizeBetterStackAggregateState('degraded')).toBe('degraded');
    expect(normalizeBetterStackAggregateState('downtime')).toBe('down');
    expect(normalizeBetterStackAggregateState('maintenance')).toBe('maintenance');
    expect(normalizeBetterStackAggregateState('not_monitored')).toBe('unknown');
    expect(normalizeBetterStackAggregateState(null)).toBe('unknown');
  });

  test('returns Better Stack status page aggregate state', async () => {
    mockFetch({
      data: {
        attributes: {
          aggregate_state: 'downtime',
          updated_at: '2026-05-26T09:15:05.416Z',
        },
      },
    });

    const response = await getFooter({
      request: createFooterRequest(),
      locals: {},
    } as any);
    const payload = await response.json() as {
      status?: string;
      provider?: string;
      updatedAt?: string;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage=30');
    expect(payload).toEqual({
      status: 'down',
      provider: 'betterstack',
      updatedAt: '2026-05-26T09:15:05.416Z',
    });
  });

  test('returns Cloudflare colo metadata without Vercel headers', async () => {
    mockFetch({
      data: {
        attributes: {
          aggregate_state: 'operational',
          updated_at: '2026-05-26T09:15:05.416Z',
        },
      },
    });
    const request = Object.assign(createFooterRequest(), {
      cf: { colo: 'sin' },
    });

    const response = await getFooter({
      request,
      locals: {},
    } as any);

    expect(getCloudflareColo(request)).toBe('SIN');
    expect(response.headers.get('x-cloudflare-colo')).toBe('SIN');
    expect(response.headers.get('x-vercel-id')).toBeNull();
  });

  test('parses Better Stack JSON even when the upstream content type is text/html', () => {
    const payload = JSON.stringify({
      data: {
        attributes: {
          aggregate_state: 'operational',
          updated_at: '2026-05-26T09:15:05.416Z',
        },
      },
    });

    expect(getBetterStackFooterState(payload)).toEqual({
      status: 'operational',
      updatedAt: '2026-05-26T09:15:05.416Z',
    });
  });
});
