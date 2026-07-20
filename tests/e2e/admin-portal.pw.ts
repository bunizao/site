import { expect, test } from './fixtures';

const timestamp = '2026-06-25T08:00:00.000Z';

interface AdminRequestBody {
  audience?: {
    channels?: unknown[];
  };
}

function subscriber(overrides: Record<string, unknown> = {}) {
  return {
    email: 'reader@example.com',
    emailHash: 'hash-reader',
    status: 'active',
    channels: ['blog', 'mood'],
    deliveryMode: 'daily',
    timezone: 'UTC',
    dailyHour: 9,
    createdAt: timestamp,
    updatedAt: timestamp,
    confirmedAt: timestamp,
    ...overrides,
  };
}

test.describe('Admin portal newsletters', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('shows the analytics API boundary when site-api endpoints are absent', async ({ page }) => {
    await page.goto('/dev/portal/analytics');

    await expect(page.getByText('Analytics API not ready:')).toBeVisible();
    await expect(page.getByText('GET /api/analytics/summary')).toBeVisible();
    await expect(page.getByText('GET /api/analytics/events?limit=50')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Articles' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Raw event log' })).toBeVisible();
  });

  test('uses coss chrome across every preview surface', async ({ page }) => {
    await page.route('**/api/notify/preview?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generatedAt: timestamp,
          mode: 'daily',
          sample: 'rich',
          timezone: 'UTC',
          source: { channelTitle: 'Mood', latestPostId: '3503', digestPostIds: ['3503'] },
          subjects: { subscribe: '', welcome: '', blog: '', mood: '', digest: '', cancel: '' },
          html: { subscribe: '', welcome: '', blog: '', mood: '', digest: '', cancel: '' },
          callbackPages: {
            confirmSuccess: '',
            confirmError: '',
            unsubscribePrompt: '',
            unsubscribeSuccess: '',
            unsubscribeError: '',
          },
        }),
      });
    });

    const routes = [
      ['/dev/portal/newsletter', 'Notification templates'],
      ['/dev/portal/svg', 'SVG gallery'],
      ['/dev/portal/mascot', 'Mascot inspector'],
      ['/dev/portal/mood-embed', 'Mood embed'],
    ] as const;

    for (const [path, title] of routes) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
      await expect(page.locator('[data-slot="card"]').first()).toBeVisible();
    }

    await page.goto('/dev/portal/newsletter');
    await expect(page.getByRole('tab', { name: 'All' })).toBeVisible();
  });

  test('shows subscriber source filters and optional source counts', async ({ page }) => {
    const subscriberRequests: URL[] = [];

    await page.route('**/dev/portal/api/admin/subscribers?**', async (route) => {
      subscriberRequests.push(new URL(route.request().url()));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rows: [
            subscriber({ email: 'blog@example.com', emailHash: 'hash-blog', channels: ['blog'] }),
            subscriber({ email: 'mood@example.com', emailHash: 'hash-mood', channels: ['mood'] }),
          ],
          total: 2,
          activeCount: 2,
          pendingCount: 0,
          unsubscribedCount: 0,
          channelCounts: {
            blog: { total: 1, activeCount: 1, pendingCount: 0, unsubscribedCount: 0 },
            mood: { total: 1, activeCount: 1, pendingCount: 0, unsubscribedCount: 0 },
            privacy: { total: 0, activeCount: 0, pendingCount: 0, unsubscribedCount: 0 },
            announcement: { total: 0, activeCount: 0, pendingCount: 0, unsubscribedCount: 0 },
          },
        }),
      });
    });

    await page.goto('/dev/portal/subscribers');

    await expect(page.getByText('Newsletter subscribers')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Sources' })).toBeVisible();
    await expect(page.locator('[data-admin-source-count="blog"]')).toContainText('Blog 1');
    await expect(page.locator('[data-admin-source-count="mood"]')).toContainText('Mood 1');
    await expect(page.locator('[data-admin-row-sources="hash-blog"]')).toContainText('Blog');
    await expect(page.locator('[data-admin-row-sources="hash-mood"]')).toContainText('Mood');

    await page.getByRole('combobox', { name: 'Source filter' }).click();
    await page.getByRole('option', { name: 'Blog' }).click();

    await expect
      .poll(() => subscriberRequests.some((url) => url.searchParams.get('channel') === 'blog'))
      .toBe(true);

    await page.getByRole('button', { name: 'Add subscriber' }).click();
    await expect(page.locator('#channel-blog')).toHaveAttribute('data-state', 'checked');
    await expect(page.locator('#channel-mood')).toHaveAttribute('data-state', 'checked');
  });

  test('degrades when subscriber source counts and row channels are absent', async ({ page }) => {
    await page.route('**/dev/portal/api/admin/subscribers?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rows: [
            subscriber({
              email: 'legacy@example.com',
              emailHash: 'hash-legacy',
              channels: undefined,
            }),
          ],
          total: 1,
          activeCount: 1,
          pendingCount: 0,
          unsubscribedCount: 0,
        }),
      });
    });

    await page.goto('/dev/portal/subscribers');

    await expect(page.getByText('Source counts unavailable from backend.')).toBeVisible();
    await expect(page.locator('[data-admin-row-sources="hash-legacy"]')).toContainText('No sources');
  });

  test('sends blog welcome from subscriber detail', async ({ page }) => {
    let welcomeSends = 0;

    await page.route('**/dev/portal/api/admin/subscribers/hash-blog', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subscriber: subscriber({ email: 'blog@example.com', emailHash: 'hash-blog', channels: ['blog'] }),
          audit: [],
        }),
      });
    });
    await page.route('**/dev/portal/api/admin/subscribers/hash-blog/blog-welcome', async (route) => {
      welcomeSends += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'sent', email: 'blog@example.com', resendId: 'email_1' }),
      });
    });

    await page.goto('/dev/portal/subscribers/hash-blog');

    await expect(page.getByText('Manual sends')).toBeVisible();
    await page.getByRole('button', { name: 'Send now' }).click();

    await expect.poll(() => welcomeSends).toBe(1);
    await expect(page.getByText(/Sent /)).toBeVisible();
  });

  test('previews and starts broadcasts against blog and mood sources', async ({ page }) => {
    const previewRequests: AdminRequestBody[] = [];
    const sendRequests: AdminRequestBody[] = [];
    let listRequests = 0;

    await page.route('**/dev/portal/api/admin/broadcasts/preview', async (route) => {
      previewRequests.push(route.request().postDataJSON() as AdminRequestBody);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subject: 'Weekly update',
          html: '<html><body><p>Preview</p></body></html>',
          text: 'Preview',
          recipientCount: 3,
          channelCounts: {
            blog: 2,
            mood: 1,
          },
        }),
      });
    });

    await page.route('**/dev/portal/api/admin/broadcasts', async (route) => {
      if (route.request().method() === 'POST') {
        sendRequests.push(route.request().postDataJSON() as AdminRequestBody);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'broadcast-2',
            recipientCount: 3,
            sentCount: 0,
            failedCount: 0,
            status: 'sending',
          }),
        });
        return;
      }

      listRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          broadcasts: listRequests > 1
            ? [
                {
                  id: 'broadcast-2',
                  subject: 'Weekly update',
                  recipientCount: 3,
                  sentCount: 0,
                  failedCount: 0,
                  status: 'sending',
                  createdAt: timestamp,
                  sentAt: null,
                  audience: { status: 'active', channels: ['blog', 'mood'] },
                },
                {
                  id: 'broadcast-1',
                  subject: 'Previous update',
                  recipientCount: 2,
                  sentCount: 2,
                  failedCount: 0,
                  status: 'sent',
                  createdAt: timestamp,
                  sentAt: timestamp,
                  audience: { status: 'active', channels: ['blog', 'mood'] },
                },
              ]
            : [
                {
                  id: 'broadcast-1',
                  subject: 'Previous update',
                  recipientCount: 2,
                  sentCount: 2,
                  failedCount: 0,
                  status: 'sent',
                  createdAt: timestamp,
                  sentAt: timestamp,
                  audience: { status: 'active', channels: ['blog', 'mood'] },
                },
              ],
        }),
      });
    });

    await page.goto('/dev/portal/broadcasts');

    await expect(page.getByText('Sources: Blog, Mood')).toBeVisible();
    await expect(page.locator('#bc-channel-blog')).toHaveAttribute('data-state', 'checked');
    await expect(page.locator('#bc-channel-mood')).toHaveAttribute('data-state', 'checked');

    await page.getByLabel('Subject').fill('Weekly update');
    await page.getByLabel('Body').fill('A new post and mood entry are live.');

    await expect.poll(() => previewRequests.length).toBeGreaterThan(0);
    expect(previewRequests.at(-1)?.audience?.channels).toEqual(['blog', 'mood']);
    await expect(page.locator('[data-admin-recipient-source-count="blog"]')).toContainText('Blog 2');
    await expect(page.locator('[data-admin-recipient-source-count="mood"]')).toContainText('Mood 1');

    await page.getByRole('button', { name: 'Send broadcast' }).click();
    await expect(page.getByText(/sources Blog, Mood/)).toBeVisible();
    await page.getByRole('button', { name: 'Send now' }).click();

    await expect.poll(() => sendRequests.length).toBe(1);
    expect(sendRequests[0]?.audience?.channels).toEqual(['blog', 'mood']);
    await expect(page.getByText('Last: 0 sent · 0 failed')).toBeVisible();
    const startedBroadcast = page.getByRole('row').filter({ hasText: 'Weekly update' });
    await expect(startedBroadcast).toContainText('sending');
    await expect(startedBroadcast).toContainText('0/3');
  });
});
