import { test, expect } from '@playwright/test';
import { resetPortalDemo } from './portal-demo';

test.beforeAll(async ({ playwright, baseURL }) =>
  resetPortalDemo(playwright, baseURL!),
);
test.afterAll(async ({ playwright, baseURL }) =>
  resetPortalDemo(playwright, baseURL!),
);
for (const width of [375, 1440])
  test(`site report tabs and owner preference at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/dev/portal/analytics');
    await expect(
      page.getByRole('heading', { name: 'Analytics', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Engaged views', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: '12s', exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `/tmp/site-analytics-portal-${width}.png`,
      fullPage: true,
    });
    const toggle = page.getByRole('checkbox', {
      name: 'Don’t count this browser',
    });
    await toggle.check();
    expect(
      await page.evaluate(() => localStorage.getItem('buxx:analytics:owner')),
    ).toBe('1');
    await page.reload();
    await expect(toggle).toBeChecked();
    const tabs = page.getByRole('navigation', { name: 'Analytics reports' });
    for (const [tab, header] of [
      ['Pages', 'Median dwell'],
      ['Clicks', 'Destination'],
      ['Sources', 'Dimension'],
      ['Audience', 'Dimension'],
      ['Quality', 'Reason'],
      ['Log', 'Visitor'],
      ['Listening', 'Track'],
      ['Newsletter', 'Campaign'],
    ] as const) {
      await tabs.getByRole('button', { name: tab, exact: true }).click();
      await expect(
        page.getByRole('columnheader', { name: header, exact: true }),
      ).toBeVisible();
    }
    await tabs.getByRole('button', { name: 'Pages', exact: true }).click();
    await page.getByLabel('Surface', { exact: true }).selectOption('mood_feed');
    await expect(
      page.getByRole('cell', { name: 'mood_feed', exact: true }),
    ).toBeVisible();
    await toggle.uncheck();
    expect(
      await page.evaluate(() => localStorage.getItem('buxx:analytics:owner')),
    ).toBeNull();
  });
test('reports show read failures without claiming zero traffic', async ({
  page,
}) => {
  await page.route('**/dev/portal/api/analytics/site?**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'analytics_report_unavailable' }),
    }),
  );
  await page.goto('/dev/portal/analytics');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByText('Engaged views', { exact: true })).toHaveCount(0);
});
