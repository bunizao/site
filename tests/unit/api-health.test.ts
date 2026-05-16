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

function createHealthRequest(deep = false): Request {
  const url = deep
    ? 'https://buxx.me/api/health?deep=1'
    : 'https://buxx.me/api/health';

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
      'notify-templates',
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
      request: createHealthRequest(true),
      locals: {},
      deep: true,
    });

    expect(report.mode).toBe('deep');
    expect(report.status).toBe('degraded');
    expect(report.checks.some((check) => check.id === 'mood-image-worker')).toBe(true);
    expect(report.checks.some((check) => check.id === 'telegram-webhook')).toBe(true);
    expect(report.checks.find((check) => check.id === 'telegram-webhook')?.status).toBe('skipped');
  });

  test('route returns 200 unless a critical check is down', async () => {
    const response = await getApiHealth({
      request: createHealthRequest(),
      locals: {},
    } as any);
    const payload = await response.json() as { status?: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe('degraded');
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
  });
});
