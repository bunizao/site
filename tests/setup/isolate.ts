// Preloaded by `bun run test:unit` before every unit test file. The ops suite
// (tests/ops) probes production on purpose and does not load it.
//
// Tests must never reach real services with real credentials. A shell that
// exported .env.local once sent a live Telegram ops message from a unit test,
// because runtime config falls back to process.env and fetch mocks passed
// unknown hosts through to the network. This file closes both holes.

const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|API_?KEY|PRIVATE_KEY|APIKEY|CHAT_ID|USER_IDS)/;
const SERVICE_PREFIX = /^(TELEGRAM|RESEND|NOTIFY|COMMENTS|GHOST|LASTFM|MUSICKIT|AKISMET|TURNSTILE|CLOUDFLARE|CF|AI|GITHUB|GOOGLE|ADMIN|CRON|MOOD|PUBLIC)_/;
// Non-secret app config that .env.local also sets; tests pin their own values.
const APP_CONFIG = new Set(['CHANNEL', 'LOCALE', 'TIMEZONE', 'SITE_URL', 'API_BASE_URL', 'API_DEV_ORIGIN']);

for (const name of Object.keys(process.env)) {
  if (SECRET_NAME.test(name) || SERVICE_PREFIX.test(name) || APP_CONFIG.has(name)) {
    delete process.env[name];
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const loopbackFetch = globalThis.fetch;

export class UnmockedNetworkError extends Error {
  constructor(url: string) {
    super(`Unmocked network request in test: ${url}. Mock globalThis.fetch for this host.`);
    this.name = 'UnmockedNetworkError';
  }
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  if (LOOPBACK_HOSTS.has(new URL(url).hostname)) {
    return loopbackFetch(input, init);
  }
  throw new UnmockedNetworkError(url);
}) as typeof fetch;
