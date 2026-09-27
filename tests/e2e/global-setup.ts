import { chromium, type FullConfig } from '@playwright/test';

// A cold `astro dev` compiles each route and its islands on first request, and
// Vite re-optimizes dependencies once, reloading the page mid-test. Warm the
// pages whose tests count requests, so the first test on each does not pay
// for it. Best effort: a warm-up that fails never fails the run.
const WARM_PATHS = ['/lab/comments?interactive=1&locale=en', '/message', '/reader/comments?lang=en'];

export default async function globalSetup(config: FullConfig): Promise<void> {
  // A remote deployment is already built; there is nothing to warm.
  if (process.env.E2E_BASE_URL?.trim()) return;
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;

  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL?.trim() || undefined });
  try {
    const page = await browser.newPage({ baseURL });
    // The fixture server proxies unmatched /api/* to production.
    await page.route('**/api/**', (route) => route.abort());
    for (const path of WARM_PATHS) {
      try {
        await page.goto(path);
        await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'), undefined, { timeout: 30_000 });
        // Focusing a compose box loads the lazy fingerprint module.
        const field = page.locator('.blog-compose__field').first();
        if (await field.count()) {
          await field.focus();
          await page.waitForLoadState('networkidle', { timeout: 10_000 });
        }
      } catch {
        // The test that needs this page will report a real failure.
      }
    }
  } finally {
    await browser.close();
  }
}
