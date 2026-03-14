import { defineConfig, devices } from '@playwright/test';

const host = process.env.E2E_HOST || '127.0.0.1';
const port = Number(process.env.E2E_PORT || 4321);
const baseURL = `http://${host}:${port}`;
const astroNode22Command = 'npx -y nve 22.12.0 node ./node_modules/astro/bin/astro.mjs';

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
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  outputDir: 'test-results',
  webServer: {
    command: `ASTRO_E2E_STRICT_PORT=1 E2E_SITE_FIXTURE=1 ${astroNode22Command} dev --host ${host} --port ${port}`,
    url: baseURL,
    reuseExistingServer: process.env.COVERAGE !== '1' && !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
