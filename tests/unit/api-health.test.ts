import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runApiHealth } from '../../src/features/health/checks';
import { GET as getApiHealth } from '../../src/pages/api/health';

const savedEnv = new Map<string, string | undefined>();
const testEnvKeys = [
  'E2E_SITE_FIXTURE',
  'LASTFM_API_KEY',
  'LASTFM_USER',
  'LASTFM_USERNAME',
  'TELEGRAM_BOT_TOKEN',
];

function saveEnv(): void {
  for (const key of testEnvKeys) {
    savedEnv.set(key, process.env[key]);
  }
}

function restoreEnv(): void {
  for (const [key, value] of savedEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  savedEnv.clear();
}

function createHealthRequest(options: { deep?: boolean; diagnostic?: boolean } = {}): Request {
  const url = new URL('https://buxx.me/api/health');
  if (options.diagnostic) url.searchParams.set('diagnostic', '1');
  if (options.deep) url.searchParams.set('deep', '1');

  return new Request(url);
}

describe('api health', () => {
  beforeEach(() => {
    saveEnv();
    process.env.E2E_SITE_FIXTURE = '1';
    delete process.env.LASTFM_API_KEY;
    delete process.env.LASTFM_USER;
    delete process.env.LASTFM_USERNAME;
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  afterEach(() => {
    restoreEnv();
  });

  test('reports default health with critical mood feed status', async () => {
    const report = await runApiHealth({
      request: createHealthRequest(),
      locals: {},
      deep: false,
    });

    expect(report.mode).toBe('default');
    expect(report.status).toBe('degraded');
    expect(report.checks.map((check) => check.id)).toEqual([
      'mood-feed',
      'listening',
      'comments',
    ]);

    const moodFeed = report.checks.find((check) => check.id === 'mood-feed');
    expect(moodFeed?.critical).toBe(true);
    expect(moodFeed?.status).toBe('ok');
    expect(moodFeed?.metadata?.latestId).toBe('990001');

    const listening = report.checks.find((check) => check.id === 'listening');
    expect(listening?.status).toBe('degraded');
  });

  test('adds deep external probes without making skipped probes fail the report', async () => {
    const report = await runApiHealth({
      request: createHealthRequest({ deep: true }),
      locals: {},
      deep: true,
    });

    expect(report.mode).toBe('deep');
    expect(report.status).toBe('degraded');
    expect(report.checks.some((check) => check.id === 'mood-image-worker')).toBe(true);
    expect(report.checks.some((check) => check.id === 'telegram-webhook')).toBe(false);
  });

  test('route returns a lightweight compatibility response by default', async () => {
    const api = {
      fetch: async (request: Request) => {
        expect(request.url).toBe('https://site-api.internal/v2/health');
        return new Response(JSON.stringify({
          status: 'ok',
          mode: 'private-api',
        }), {
          status: 200,
          headers: {
            'Cache-Control': 'public, max-age=30',
            ETag: '"health"',
            'Content-Type': 'application/json',
          },
        });
      },
    };
    const response = await getApiHealth({
      request: createHealthRequest(),
      locals: { env: { API: api } },
    } as any);
    const payload = await response.json() as { status?: string; mode?: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(payload.mode).toBe('private-api');
    expect(response.headers.get('cache-control')).toBe('public, max-age=30');
    expect(response.headers.get('etag')).toBe('"health"');
  });

  test('route falls back to local ping when service binding is unavailable', async () => {
    const response = await getApiHealth({
      request: createHealthRequest(),
      locals: { env: {} },
    } as any);
    const payload = await response.json() as {
      status?: string;
      mode?: string;
      diagnostic?: string;
    };

    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(payload.mode).toBe('ping');
    expect(payload.diagnostic).toBe('/api/health?diagnostic=1');
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
  });

  test('route runs aggregated checks only in diagnostic mode', async () => {
    const api = {
      fetch: async (request: Request) => {
        expect(request.url).toBe('https://site-api.internal/v2/health?diagnostic=1');
        return new Response(JSON.stringify({
          status: 'degraded',
          mode: 'default',
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      },
    };
    const response = await getApiHealth({
      request: createHealthRequest({ diagnostic: true }),
      locals: { env: { API: api } },
    } as any);
    const payload = await response.json() as { status?: string; mode?: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe('degraded');
    expect(payload.mode).toBe('default');
  });
});
