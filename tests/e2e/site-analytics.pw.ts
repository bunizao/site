import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import type { SiteAnalyticsCollectInput } from '@bunizao/contracts/analytics';

const ROUTES = [
  ['/', 'home'],
  ['/legacy', 'legacy'],
  ['/mood', 'mood_feed'],
  ['/mood?tag=%23LiFe', 'mood_feed'],
  ['/mood?tag=*', 'mood_feed'],
  ['/mood/1001', 'mood_post'],
  ['/mood/embed?id=1001', 'mood_embed'],
  ['/blog', 'blog_index'],
  ['/blog/demo-effects', 'blog_post'],
  ['/blog/en/quiet-architecture', 'blog_post'],
  ['/blog/tags', 'blog_tags'],
  ['/blog/tag/systems', 'blog_tag'],
  ['/docs', 'docs'],
  ['/404', 'not_found'],
  ['/missing-analytics-page', 'not_found'],
  ['/projects', 'projects'],
  ['/privacy', 'privacy'],
] as const;
async function proxyProduction(
  page: import('@playwright/test').Page,
  baseURL: string,
): Promise<{
  payloads: SiteAnalyticsCollectInput[];
  finish: () => Promise<void>;
}> {
  const payloads: SiteAnalyticsCollectInput[] = [];
  let pending = 0;
  const validationOrigin = process.env.ANALYTICS_VALIDATION_ORIGIN;
  if (validationOrigin) {
    if (
      validationOrigin !==
      'https://site-api-analytics-validation.bunizao.workers.dev'
    )
      throw new Error('Use the isolated analytics validation Worker');
    await page.addInitScript(() =>
      localStorage.setItem('buxx:analytics:owner', '1'),
    );
  }
  await page.route('https://buxx.me/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/analytics/collect') {
      pending++;
      const payload = route.request().postDataJSON();
      try {
        if (validationOrigin) {
          const response = await route.fetch({
            url: `${validationOrigin}/api/analytics/collect`,
            headers: {
              ...route.request().headers(),
              origin: 'https://buxx.me',
            },
          });
          expect(response.status()).toBe(204);
        }
        await route.fulfill({ status: 204 });
        payloads.push(payload);
      } finally {
        pending--;
      }
      return;
    }
    const response = await route.fetch({
      url: `${baseURL}${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
  return {
    payloads,
    finish: async () => {
      await page.goto('about:blank');
      await page.waitForTimeout(100);
      await expect.poll(() => pending).toBe(0);
    },
  };
}
for (const width of [320, 375, 1440])
  test(`all public surfaces emit isolated production-origin beacons at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { payloads, finish } = await proxyProduction(page, baseURL!);
    for (const [path, surface] of ROUTES) {
      const before = payloads.length;
      await page.goto(`https://buxx.me${path}`);
      await expect
        .poll(() =>
          payloads
            .slice(before)
            .some((p) => p.seq === 0 && p.page.surface === surface),
        )
        .toBe(true);
      const first = payloads
        .slice(before)
        .find((p) => p.seq === 0 && p.page.surface === surface)!;
      expect(first.page.path).toBe(path.split('?')[0]);
      expect(first.client.vw).toBe(width);
      if (path === '/mood?tag=%23LiFe') expect(first.page.entity).toBe('life');
      if (path === '/mood?tag=*') expect(first.page.entity).toBe('');
      if (surface === 'not_found') expect(first.page.entity).toBe(path);
      expect(first.progress.dwellMs).toBeLessThan(1000);
      expect(first.viewId).toMatch(/^[0-9a-f-]{36}$/);
      if (surface === 'blog_post')
        expect(first.page.entity).toBe(
          path.includes('quiet-architecture')
            ? 'quiet-architecture'
            : 'demo-effects',
        );
    }
    if (process.env.ANALYTICS_VALIDATION_ORIGIN) {
      await finish();
      writeFileSync(
        '/tmp/site-analytics-live-browser-receipt.json',
        JSON.stringify(
          payloads.map((p) => ({
            viewId: p.viewId,
            path: p.page.path,
            surface: p.page.surface,
            entity: p.page.entity,
            locale: p.page.locale,
            owner: p.owner,
            webdriver: p.client.webdriver,
          })),
        ),
      );
    }
  });
test('desk panels by click and hash become one named event; pagehide flushes buffered clicks', async ({
  page,
  baseURL,
}) => {
  const { payloads } = await proxyProduction(page, baseURL!);
  await page.goto('https://buxx.me/');
  await expect.poll(() => payloads.length).toBeGreaterThan(0);
  await page.locator('[data-open="projects"]').first().click();
  await expect(page.locator('[data-panel="projects"]')).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide')),
  );
  await expect
    .poll(
      () =>
        payloads
          .flatMap((p) => p.clicks)
          .filter((c) => c.name === 'desk.panel' && c.href === '#projects')
          .length,
    )
    .toBe(1);
  expect(
    payloads.flatMap((p) => p.clicks).find((c) => c.name === 'desk.panel')!
      .label,
  ).toBe('chip');
  await page.goto('https://buxx.me/privacy');
  await page.goto('https://buxx.me/#writing');
  await expect(page.locator('[data-panel="writing"]')).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide')),
  );
  await expect
    .poll(() =>
      payloads
        .flatMap((p) => p.clicks)
        .some(
          (c) =>
            c.name === 'desk.panel' &&
            c.href === '#writing' &&
            c.label === 'hash',
        ),
    )
    .toBe(true);
});
test('localhost stays silent and Global Privacy Control suppresses production beacons', async ({
  page,
  baseURL,
}) => {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/analytics/collect')) seen.push(request.url());
  });
  await page.goto(`${baseURL}/blog/demo-effects`);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide')),
  );
  expect(seen).toEqual([]);
  const { payloads } = await proxyProduction(page, baseURL!);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      get: () => true,
    }),
  );
  await page.goto('https://buxx.me/blog/demo-effects');
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide')),
  );
  expect(payloads).toEqual([]);
});
