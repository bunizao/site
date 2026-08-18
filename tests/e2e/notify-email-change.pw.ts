import { expect, test } from './fixtures';

const manageView = {
  email: 'current@example.test',
  status: 'active',
  channels: ['mood', 'blog'],
  deliveryMode: 'immediate',
  timezone: 'Australia/Melbourne',
  dailyHour: 9,
};

test.describe('email change preferences', () => {
  test('keeps the current address until the confirmation request succeeds', async ({ page }) => {
    let requestBody: Record<string, unknown> | null = null;

    await page.route('**/api/notify/manage?token=manage-token', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(manageView) });
    });
    await page.route('**/api/notify/manage/email?token=manage-token', async (route) => {
      requestBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'change_email_sent' }),
      });
    });

    await page.goto('/subscribe/manage?token=manage-token');
    await expect(page.getByText('current@example.test')).toBeVisible();
    await page.getByRole('button', { name: 'Change email' }).click();
    await page.getByLabel('New email address').fill('new@example.test');
    await page.getByRole('button', { name: 'Send confirmation' }).click();

    await expect(page.getByText(/If eligible, we'll send a confirmation to new@example\.test/)).toBeVisible();
    await expect(page.getByText('current@example.test')).toBeVisible();
    expect(requestBody).toEqual({ newEmail: 'new@example.test' });
  });

  test('shows a rate-limit error without changing the visible subscription', async ({ page }) => {
    await page.route('**/api/notify/manage?token=rate-limit-token', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(manageView) });
    });
    await page.route('**/api/notify/manage/email?token=rate-limit-token', async (route) => {
      await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Too Many Requests' }) });
    });

    await page.goto('/subscribe/manage?token=rate-limit-token');
    await page.getByRole('button', { name: 'Change email' }).click();
    await page.getByLabel('New email address').fill('new@example.test');
    await page.getByRole('button', { name: 'Send confirmation' }).click();

    await expect(page.getByRole('alert')).toHaveText('Too many attempts. Try again shortly.');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('current@example.test')).toBeVisible();
  });
});

test.describe('email change confirmation', () => {
  test('commits through the public API path and lands on the new subscription', async ({ page }) => {
    let consumed = false;
    let confirmationPosts = 0;
    let submittedPath = '';
    let submittedBody = '';

    await page.route('**/api/notify/change-email?token=confirm-token', async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: consumed
            ? '<!doctype html><title>Confirmed</title><p>This confirmation link has already been used. No further change was made.</p>'
            : `<!doctype html>
              <title>Confirm your new email address</title>
              <h1>Confirm your new email address.</h1>
              <p>Nothing changes until you press the button below.</p>
              <form method="post">
                <input type="hidden" name="token" value="confirm-token">
                <button type="submit">Confirm new email address</button>
              </form>`,
        });
        return;
      }

      confirmationPosts += 1;
      submittedPath = new URL(request.url()).pathname;
      submittedBody = request.postData() ?? '';
      consumed = true;
      await route.fulfill({
        status: 303,
        headers: {
          Location: '/subscribe/manage?token=new-manage-token&changed=1',
        },
      });
    });
    await page.route('**/api/notify/manage?token=new-manage-token', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...manageView, email: 'new@example.test' }),
      });
    });

    await page.goto('/api/notify/change-email?token=confirm-token');
    await expect(page.getByText('Nothing changes until you press the button below.')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm new email address' }).click();

    await expect(page).toHaveURL(/\/subscribe\/manage\?token=new-manage-token&changed=1$/);
    await expect(page.getByText('new@example.test')).toBeVisible();
    await expect(page.getByText('Address updated.')).toBeVisible();
    expect(confirmationPosts).toBe(1);
    expect(submittedPath).toBe('/api/notify/change-email');
    expect(new URLSearchParams(submittedBody).get('token')).toBe('confirm-token');

    await page.goto('/api/notify/change-email?token=confirm-token');
    await expect(page.getByText('This confirmation link has already been used.')).toBeVisible();
    expect(confirmationPosts).toBe(1);
  });
});
