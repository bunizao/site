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

  test('will not send without an address', async ({ page }) => {
    let posted = 0;
    await installMessageApi(page, { onPost: () => { posted += 1; } });
    await page.goto('/message');

    await fillMessage(page, { name: 'someone', email: '', body: 'Nothing to answer.' });
    await page.locator('[data-message-submit]').click();

    await expect(page.locator(errorBox)).toContainText('Leave an email');
    await expect(page.locator(sentView)).toBeHidden();
    expect(posted).toBe(0);
  });

  test('carries the address, the dwell token and an empty honeypot', async ({ page }) => {
    let sent: Record<string, unknown> | null = null;
    await installMessageApi(page, {
      answer: { replyable: false, verificationSent: true },
      onPost: (body) => { sent = body; },
    });
    await page.goto('/message');

    await fillMessage(page, { name: 'someone', email: 'you@example.com', body: 'Please read this.' });
    await page.locator('[data-message-submit]').click();

    await expect(page.locator(sentView)).toBeVisible();
    await expect(page.locator(formView)).toBeHidden();

    expect(sent).not.toBeNull();
    expect(sent!.email).toBe('you@example.com');
    expect(sent!.dwellToken).toBe('dwell-token-fixture');
    expect(sent!.website).toBe('');
  });

  test('an unverified address gets the verification receipt, a known one gets the reply receipt', async ({ page }) => {
    await installMessageApi(page, { answer: { replyable: false, verificationSent: true } });
    await page.goto('/message');

    await fillMessage(page, { name: 'someone', email: 'you@example.com', body: 'Please write back.' });
    await page.locator('[data-message-submit]').click();
    await expect(page.locator('[data-message-sent-body]')).toContainText('Sent a confirmation');

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await installMessageApi(page, { answer: { replyable: true, verificationSent: false } });
    await page.locator('[data-message-again]').click();
    await expect(page.locator(formView)).toBeVisible();

    await fillMessage(page, { name: 'someone', email: 'you@example.com', body: 'Second message.' });
    await page.locator('[data-message-submit]').click();
    await expect(page.locator('[data-message-sent-body]')).toContainText('mail the address you left');
  });

  test('a 429 keeps the draft on screen', async ({ page }) => {
    await installMessageApi(page, { status: 429 });
    await page.goto('/message');

    await fillMessage(page, { name: 'someone', email: 'you@example.com', body: 'Written twice too fast.' });
    await page.locator('[data-message-submit]').click();

    await expect(page.locator(errorBox)).toContainText('give it a few minutes');
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
    await fillMessage(page, { name: 'someone', email: 'you@example.com', body: 'Lifted out of the box.' });
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
    await fillMessage(page, { name: 'someone', email: 'you@example.com', body: 'Too fast.' });
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

  // maxlength makes the field stop taking characters without a word, so the
  // count is the whole of the feedback. It stays out of the way until the end.
  test('the count keeps quiet until the field is nearly full', async ({ page }) => {
    await page.goto('/message');

    const body = page.locator('#message-body');
    const count = page.locator('[data-message-count]');
    await expect(body).toHaveAttribute('maxlength', '4000');
    await expect(count).toBeHidden();

    await body.fill('x'.repeat(3599));
    await expect(count).toBeHidden();

    await body.fill('x'.repeat(3650));
    await expect(count).toHaveText('3650/4000');
    await expect(count).not.toHaveAttribute('data-full', '');

    await body.fill('x'.repeat(4000));
    await expect(count).toHaveText('4000/4000');
    await expect(count).toHaveAttribute('data-full', '');

    // Back under the line the count goes away, and it must not come back
    // still wearing the state it left in.
    await body.fill('x'.repeat(10));
    await expect(count).toBeHidden();
    await expect(count).not.toHaveAttribute('data-full', '');
  });

  // The dots carry two delays at once: when their bubble starts, and where
  // each dot sits in the wave. Expressed as two animation-delay rules the
  // more specific one silently wins and the wave flattens into a pulse --
  // a defect nothing else here would catch, since the markup is unchanged.
  test('the typing dots travel rather than blink in unison', async ({ page }) => {
    // networkidle, because a cold dev server reloads once while optimizing
    // and a plain evaluate loses its execution context to that navigation.
    await page.goto('/message', { waitUntil: 'networkidle' });

    const delays = (selector: string) =>
      page.locator(selector).evaluateAll((dots) => dots.map((dot) => getComputedStyle(dot).animationDelay));

    const opening = await delays('[data-slot="line-1"] span');
    expect(opening).toHaveLength(3);
    expect(new Set(opening).size).toBe(3);

    // The bubble that follows a real send has no slot to wait for.
    const live = await delays('[data-message-typing] span');
    expect(live).toEqual(['0s', '0.14s', '0.28s']);
  });
});
