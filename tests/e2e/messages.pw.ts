// /message — the private note form.
//
// Everything here mocks POST /api/v2/messages. The point of these tests is the
// form's own behaviour: what it refuses to send, what it does with the three
// answers the API can give, and that a refusal leaves the draft where the
// writer can still see it. The service's risk stack is tested on its own side.
//
// Turnstile is absent under E2E_SITE_FIXTURE=1 (the page renders an empty site
// key and the client skips the widget), so nothing here has to solve one.

import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';

interface CreateAnswer {
  replyable?: boolean;
  verificationSent?: boolean;
}

async function installMessageApi(
  page: Page,
  options: { status?: number; answer?: CreateAnswer; onPost?: (body: Record<string, unknown>) => void } = {},
): Promise<void> {
  await page.route('**/api/v2/comments/dwell-token', (route: Route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ token: 'dwell-token-fixture' }),
  }));

  await page.route('**/api/v2/messages', async (route: Route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.fallback();
      return;
    }
    options.onPost?.(request.postDataJSON() as Record<string, unknown>);

    const status = options.status ?? 201;
    if (status >= 400) {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'rate limited' }),
      });
      return;
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'message-fixture',
        createdAt: new Date().toISOString(),
        replyable: options.answer?.replyable ?? false,
        verificationSent: options.answer?.verificationSent ?? false,
      }),
    });
  });
}

async function fillMessage(page: Page, fields: { name?: string; email?: string; body?: string } = {}): Promise<void> {
  const form = page.locator('[data-message-form]');
  if (fields.name !== undefined) await form.locator('#message-name').fill(fields.name);
  if (fields.email !== undefined) await form.locator('#message-email').fill(fields.email);
  if (fields.body !== undefined) await form.locator('#message-body').fill(fields.body);
}

const formView = '[data-message-form-view]';
const sentView = '[data-message-sent-view]';
const errorBox = '[data-message-error]';

test.describe('/message', () => {
  test('the blog masthead links to it', async ({ page }) => {
    await page.goto('/blog');

    const trigger = page.locator('.blog-masthead__message');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('href', '/message');

    await trigger.click();
    await expect(page).toHaveURL(/\/message$/);
    await expect(page.locator('[data-message-root]')).toBeVisible();
  });

  test('does not send an empty body, and says which field is wrong', async ({ page }) => {
    let posted = false;
    await installMessageApi(page, { onPost: () => { posted = true; } });
    await page.goto('/message');

    await fillMessage(page, { name: 'someone', body: '' });
    await page.locator('[data-message-submit]').click();

    await expect(page.locator(errorBox)).toBeVisible();
    await expect(page.locator(sentView)).toBeHidden();
    expect(posted).toBe(false);

    // A missing name is caught before the body is even looked at.
    await fillMessage(page, { name: '', body: 'A real message.' });
    await page.locator('[data-message-submit]').click();
    await expect(page.locator(errorBox)).toBeVisible();
    expect(posted).toBe(false);
  });

  test('refuses a malformed address rather than dropping it silently', async ({ page }) => {
    let posted = false;
    await installMessageApi(page, { onPost: () => { posted = true; } });
    await page.goto('/message');

    await fillMessage(page, { name: 'someone', email: 'not-an-address', body: 'A real message.' });
    await page.locator('[data-message-submit]').click();

    await expect(page.locator(errorBox)).toBeVisible();
    expect(posted).toBe(false);
  });

  test('sends without an address and says no reply is possible', async ({ page }) => {
    let sent: Record<string, unknown> | null = null;
    await installMessageApi(page, {
      answer: { replyable: false, verificationSent: false },
      onPost: (body) => { sent = body; },
    });
    await page.goto('/message');

    await fillMessage(page, { name: 'someone', body: 'Nothing to answer.' });
    await page.locator('[data-message-submit]').click();

    await expect(page.locator(sentView)).toBeVisible();
    await expect(page.locator(formView)).toBeHidden();
    await expect(page.locator('[data-message-sent-body]')).toContainText('没有留邮箱');

    expect(sent).not.toBeNull();
    // The dwell token is minted and carried; the honeypot goes out empty.
    expect(sent!.dwellToken).toBe('dwell-token-fixture');
    expect(sent!.website).toBe('');
    expect(sent!.email).toBeUndefined();
  });

  test('an unverified address gets the verification receipt, a known one gets the reply receipt', async ({ page }) => {
    await installMessageApi(page, { answer: { replyable: false, verificationSent: true } });
    await page.goto('/message');

    await fillMessage(page, { name: 'someone', email: 'you@example.com', body: 'Please write back.' });
    await page.locator('[data-message-submit]').click();
    await expect(page.locator('[data-message-sent-body]')).toContainText('确认信');

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await installMessageApi(page, { answer: { replyable: true, verificationSent: false } });
    await page.locator('[data-message-again]').click();
    await expect(page.locator(formView)).toBeVisible();

    await fillMessage(page, { name: 'someone', email: 'you@example.com', body: 'Second message.' });
    await page.locator('[data-message-submit]').click();
    await expect(page.locator('[data-message-sent-body]')).toContainText('会发到你留的邮箱');
  });

  test('a 429 keeps the draft on screen', async ({ page }) => {
    await installMessageApi(page, { status: 429 });
    await page.goto('/message');

    await fillMessage(page, { name: 'someone', body: 'Written twice too fast.' });
    await page.locator('[data-message-submit]').click();

    await expect(page.locator(errorBox)).toContainText('歇一会儿');
    await expect(page.locator(sentView)).toBeHidden();
    await expect(page.locator(formView)).toBeVisible();
    // The whole point: the words are still there to send again.
    await expect(page.locator('#message-body')).toHaveValue('Written twice too fast.');
    // And the button came back, rather than staying stuck in its busy state.
    await expect(page.locator('[data-message-submit]')).toBeEnabled();
  });

  test('what was written becomes a bubble on send, and a refusal takes it back', async ({ page }) => {
    await installMessageApi(page);
    await page.goto('/message');

    const draft = page.locator('[data-message-draft]');
    // Nothing stands in the thread while it is still only a draft.
    await fillMessage(page, { name: 'someone', body: 'Lifted out of the box.' });
    await expect(draft).toBeHidden();

    await page.locator('[data-message-submit]').click();
    await expect(page.locator(sentView)).toBeVisible();
    // The receipt reads as a reply only because what it answers is still there.
    await expect(draft).toBeVisible();
    await expect(page.locator('[data-message-draft-text]')).toHaveText('Lifted out of the box.');
    await expect(page.locator('[data-message-typing]')).toBeHidden();

    await page.locator('[data-message-again]').click();
    await expect(draft).toBeHidden();

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await installMessageApi(page, { status: 429 });
    await fillMessage(page, { name: 'someone', body: 'Too fast.' });
    await page.locator('[data-message-submit]').click();
    await expect(page.locator(errorBox)).toBeVisible();
    await expect(draft).toBeHidden();
  });

  test('the honeypot is out of reach of a keyboard and a screen reader', async ({ page }) => {
    await page.goto('/message');

    const trap = page.locator('#message-website');
    await expect(trap).toHaveAttribute('tabindex', '-1');
    await expect(page.locator('.message__trap')).toHaveAttribute('aria-hidden', 'true');
    // Clipped rather than display:none -- a bot reading the DOM should still
    // find something fillable, so assert the size, not Playwright's notion of
    // visibility.
    const box = await page.locator('.message__trap').boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(1);
  });

  test('is kept out of search results', async ({ page }) => {
    await page.goto('/message');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});
