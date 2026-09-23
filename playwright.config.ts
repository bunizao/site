import { defineConfig, devices } from '@playwright/test';

const host = process.env.E2E_HOST || '127.0.0.1';
const port = Number(process.env.E2E_PORT || 4321);
const remoteBaseURL = process.env.E2E_BASE_URL?.trim();
const baseURL = remoteBaseURL || `http://${host}:${port}`;
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL?.trim() || undefined;
const shouldUseWebServer = !remoteBaseURL;
const shouldReuseWebServer = process.env.E2E_REUSE_SERVER === '1';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.pw.ts',
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS || 1),
  retries: process.env.CI ? 2 : 0,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL,
    // /mood and /mood/[id] negotiate their language off Accept-Language, and
    // the specs assert English strings. Pin it rather than inherit whatever
    // the browser build defaults to.
    locale: 'en-US',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  outputDir: 'test-results',
  webServer: shouldUseWebServer
    ? {
        command: `node_modules/.bin/astro dev --host ${host} --port ${port}`,
        env: {
          ...process.env,
          ADMIN_DEV_BYPASS: '1',
          ASTRO_DEV_BACKGROUND: '0',
          ASTRO_E2E_STRICT_PORT: '1',
          CHANNEL: 'e2e',
          E2E_SITE_FIXTURE: '1',
        },
        url: baseURL,
        reuseExistingServer: shouldReuseWebServer,
        timeout: 120_000,
      }
    : undefined,
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: browserChannel,
      },
    },
  ],
});
