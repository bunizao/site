import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const subscriberFixture = {
  rows: [
    {
      email: 'layout@example.com',
      emailHash: 'layout000000',
      status: 'active',
      channels: ['mood'],
      deliveryMode: 'immediate',
      updatedAt: '2026-05-22T00:00:00.000Z',
    },
    {
      email: 'daily@example.com',
      emailHash: 'daily0000000',
      status: 'active',
      channels: ['mood'],
      deliveryMode: 'daily',
      timezone: 'Asia/Kuala_Lumpur',
      dailyHour: 9,
      updatedAt: '2026-05-22T00:00:00.000Z',
    },
  ],
  total: 2,
  pendingCount: 0,
  activeCount: 2,
  unsubscribedCount: 0,
};

const newsletterPreviewFixture = {
  generatedAt: '2026-05-22T00:00:00.000Z',
  mode: 'daily',
  sample: 'rich',
  timezone: 'UTC',
  source: {
    channelTitle: 'Levitating',
    latestPostId: '3505',
    digestPostIds: ['3505'],
  },
  subjects: {
    subscribe: 'Confirm your mood subscription',
    welcome: 'Welcome to mood updates',
    mood: 'New mood #3505',
    digest: 'Daily digest · 1 mood update',
    cancel: 'Mood updates canceled',
  },
  html: {
    subscribe: '<!doctype html><html><body style="margin:0;height:720px;background:#fff">Subscribe</body></html>',
    welcome: '<!doctype html><html><body style="margin:0;height:720px;background:#fff">Welcome</body></html>',
    mood: '<!doctype html><html><body style="margin:0;height:720px;background:#fff">Mood</body></html>',
    digest: '<!doctype html><html><body style="margin:0;height:720px;background:#fff">Digest</body></html>',
    cancel: '<!doctype html><html><body style="margin:0;height:720px;background:#fff">Cancel</body></html>',
  },
};

async function stubSubscribers(page: Page): Promise<void> {
  await page.route('**/api/admin/subscribers**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(subscriberFixture),
    });
  });
}

async function stubNewsletterPreview(page: Page): Promise<void> {
  await page.route('**/api/notify/preview**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(newsletterPreviewFixture),
    });
  });
}

async function readPortalContentMetrics(page: Page): Promise<{
  bodyStyle: string;
  right: number;
  width: number;
}> {
  return page.evaluate(() => {
    const content = document.querySelector('.portal-content');
    if (!(content instanceof HTMLElement)) {
      throw new Error('Portal content was not rendered.');
    }

    const rect = content.getBoundingClientRect();
    return {
      bodyStyle: document.body.getAttribute('style') ?? '',
      right: rect.right,
      width: rect.width,
    };
  });
}

async function readElementStyles(
  page: Page,
  selector: string
): Promise<{
  backgroundColor: string;
  transform: string;
}> {
  return page.locator(selector).first().evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      backgroundColor: styles.backgroundColor,
      transform: styles.transform,
    };
  });
}

async function readElementHeight(page: Page, selector: string): Promise<number> {
  return page.locator(selector).first().evaluate((element) => element.getBoundingClientRect().height);
}

test.describe('Admin portal polish', () => {
  test('opens subscriber row menus without squeezing the page', async ({ page }) => {
    await stubSubscribers(page);
    await page.goto('/dev/portal/subscribers');
    await expect(page.getByText('layout@example.com')).toBeVisible();

    const before = await readPortalContentMetrics(page);
    const row = page.locator('tbody tr').filter({ hasText: 'layout@example.com' });
    await expect(row).toHaveCount(1);

    await row.getByRole('button').click();
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();

    const after = await readPortalContentMetrics(page);
    expect(after.width).toBe(before.width);
    expect(after.right).toBe(before.right);
    expect(after.bodyStyle).not.toContain('pointer-events: none');
  });

  test('keeps passive portal cards and table rows still on hover', async ({ page }) => {
    await page.goto('/dev/portal');

    const overviewCardSelector = '.portal-page .rounded-lg.border-border';
    await expect(page.locator(overviewCardSelector).first()).toBeVisible();
    await page.locator(overviewCardSelector).first().hover();

    const cardStyles = await readElementStyles(page, overviewCardSelector);
    expect(cardStyles.transform).toBe('none');

    await stubSubscribers(page);
    await page.goto('/dev/portal/subscribers');
    await expect(page.getByText('layout@example.com')).toBeVisible();

    const rowSelector = 'tbody tr:has-text("layout@example.com")';
    const rowBefore = await readElementStyles(page, rowSelector);
    await page.locator(rowSelector).hover();
    const rowAfter = await readElementStyles(page, rowSelector);

    expect(rowAfter.backgroundColor).toBe(rowBefore.backgroundColor);
    expect(rowAfter.transform).toBe('none');
  });

  test('resizes the mood embed preview down after content shrinks', async ({ page }) => {
    await page.goto('/dev/portal/mood-embed');

    const iframeSelector = '.moodp-iframe';
    await expect(page.locator(iframeSelector)).toBeVisible();

    await page.evaluate(() => {
      const iframe = document.querySelector('.moodp-iframe');
      if (!(iframe instanceof HTMLIFrameElement) || !iframe.contentWindow) {
        throw new Error('Mood embed iframe was not rendered.');
      }

      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'mood-embed-resize', height: 900 },
        source: iframe.contentWindow,
      }));
    });
    await expect
      .poll(() => readElementHeight(page, iframeSelector))
      .toBeGreaterThan(800);

    await page.evaluate(() => {
      const iframe = document.querySelector('.moodp-iframe');
      if (!(iframe instanceof HTMLIFrameElement) || !iframe.contentWindow) {
        throw new Error('Mood embed iframe was not rendered.');
      }

      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'mood-embed-resize', height: 420 },
        source: iframe.contentWindow,
      }));
    });
    await expect
      .poll(() => readElementHeight(page, iframeSelector))
      .toBeLessThan(500);

    const origin = new URL(page.url()).origin;
    await page.setContent(`
      <!doctype html>
      <html>
        <body style="margin:0">
          <iframe
            id="oversized-embed"
            src="/mood/embed?count=1&origin=${encodeURIComponent(origin)}"
            style="width:640px;height:900px;border:0;display:block"
          ></iframe>
          <script>
            window.embedHeights = [];
            window.addEventListener('message', (event) => {
              const iframe = document.getElementById('oversized-embed');
              if (event.source !== iframe.contentWindow) return;
              if (!event.data || event.data.type !== 'mood-embed-resize') return;
              window.embedHeights.push(event.data.height);
            });
          </script>
        </body>
      </html>
    `);

    await expect
      .poll(
        () => page.evaluate(() => {
          const heights = (window as typeof window & { embedHeights?: number[] }).embedHeights ?? [];
          return heights.at(-1) ?? 0;
        }),
        { timeout: 30_000 }
      )
      .toBeGreaterThan(0);

    const reportedHeight = await page.evaluate(() => {
      const heights = (window as typeof window & { embedHeights?: number[] }).embedHeights ?? [];
      return heights.at(-1) ?? 0;
    });
    expect(reportedHeight).toBeLessThan(900);
  });

  test('offers compacted and expanded newsletter card sizing', async ({ page }) => {
    await stubNewsletterPreview(page);
    await page.goto('/dev/portal/newsletter');

    const frameSelector = '[data-template="subscribe"] .notify-card__frame';
    await expect(page.locator(frameSelector)).toBeVisible();

    const regularHeight = await readElementHeight(page, frameSelector);
    await page.getByRole('button', { name: 'Expanded' }).click();
    await expect
      .poll(() => readElementHeight(page, frameSelector))
      .toBeGreaterThan(regularHeight + 120);

    await page.getByRole('button', { name: 'Compacted' }).click();
    await expect
      .poll(() => readElementHeight(page, frameSelector))
      .toBeLessThan(regularHeight - 80);
  });
});
