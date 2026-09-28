import type { Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { resetPortalDemo } from './portal-demo';

/* The dev portal's main journeys, in demo mode: `astro dev` with no site-api,
   where the portal answers from an in-memory demo API
   (src/features/portal/server/demo-api.ts) after 140ms.

   That state lives in the dev server's memory and outlives a run, so the
   file resets it to the seed before and after (tests/e2e/portal-demo.ts).
   Within the file every test still puts back what it changes (Undo, or the
   old value) or asserts on a change relative to what it found, so the tests
   do not depend on their order. Run it against a server that is already up
   with E2E_REUSE_SERVER=1; the spec skips wherever demo mode is off. */

const PORTAL = '/dev/portal';

/** Screens a test visits. A cold dev server compiles each on first request. */
const WARM = ['/comments', '/comments/bans', '/', '/subscribers', '/broadcasts', '/analytics', '/activity'];

test.skip(Boolean(process.env.E2E_BASE_URL), 'Demo mode exists only on local astro dev.');
// Every action answers within 140ms of demo latency; a stuck click should
// fail on its own locator, not on the 120s test timeout.
test.use({ actionTimeout: 15_000 });

test.beforeAll(async ({ browser, playwright }, testInfo) => {
  await resetPortalDemo(playwright, String(testInfo.project.use.baseURL));
  const demo = await warmUp(browser, String(testInfo.project.use.baseURL));
  test.skip(!demo, 'Needs portal demo mode: astro dev without site-api.');
});

test.afterAll(async ({ playwright }, testInfo) => {
  await resetPortalDemo(playwright, String(testInfo.project.use.baseURL));
});

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Visits every screen once, so Vite's first compile (and the reload its
    dependency pass can trigger) lands here and not in a test. Returns
    whether the portal is in demo mode. */
async function warmUp(browser: Browser, baseURL: string): Promise<boolean> {
  const page = await browser.newPage({ baseURL });
  try {
    await page.goto(`${PORTAL}/comments`);
    const sidebar = page.locator('[data-sidebar="sidebar"]');
    await sidebar.waitFor({ timeout: 90_000 });
    // The sidebar says Demo when there is no site-api behind the portal.
    if (!(await sidebar.getByText('Demo', { exact: true }).isVisible())) return false;
    for (const path of WARM) {
      await page.goto(PORTAL + path);
      await page.locator('main h1').first().waitFor({ timeout: 60_000 }).catch(() => {});
    }
    await page.waitForLoadState('networkidle').catch(() => {});
    return true;
  } finally {
    await page.close();
  }
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(PORTAL + path);
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 30_000 });
}

const rows = (page: Page) => page.locator('main [data-row-id]');
const row = (page: Page, id: string) => page.locator(`main [data-row-id="${id}"]`);
const toasts = (page: Page) => page.getByRole('region', { name: 'Notifications' });

/** The Undo on the toast with this title, never one on an older toast
    that is still on its way out. */
const undoOn = (page: Page, title: string | RegExp) =>
  page
    .locator('[data-slot="toast-viewport"] > *')
    .filter({ has: page.locator('[data-slot="toast-title"]').filter({ hasText: title }) })
    .getByRole('button', { name: 'Undo' });

/** The `c` (open comment) parameter of the current URL. */
const openId = (page: Page): Promise<string | null> => page.evaluate(() => new URLSearchParams(location.search).get('c'));

/** Opens the held queue with its first comment in the reading pane. */
async function openHeldQueue(page: Page): Promise<string[]> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '/comments?status=held');
  await expect(rows(page).first()).toBeVisible();
  const ids = await rows(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-row-id')!));
  expect(ids.length, 'the demo holds at least three comments').toBeGreaterThanOrEqual(3);
  await rows(page).first().locator('[data-row-button]').click();
  await expect.poll(() => openId(page)).toBe(ids[0]);
  return ids;
}

test.describe('comments', () => {
  test('triages held comments from the keyboard: approve, delete, undo, auto-advance', async ({ page }) => {
    const [first, second] = await openHeldQueue(page);

    // Approve: the row leaves Held and the next one opens in its place.
    await page.keyboard.press('a');
    await expect(row(page, first)).toHaveCount(0);
    await expect.poll(() => openId(page)).toBe(second);
    await expect(row(page, second)).toHaveAttribute('data-active', 'true');

    // z undoes the last act, and the selection comes back with the row.
    await page.keyboard.press('z');
    await expect(row(page, first)).toBeVisible();
    await expect.poll(() => openId(page)).toBe(first);

    // Delete advances the same way; the toast's Undo restores it.
    await page.keyboard.press('d');
    await expect(row(page, first)).toHaveCount(0);
    await expect.poll(() => openId(page)).toBe(second);
    await undoOn(page, /^Deleted$/).click();
    await expect(row(page, first)).toBeVisible();
    await expect.poll(() => openId(page)).toBe(first);

    // j walks on, opening as it goes.
    await page.keyboard.press('j');
    await expect.poll(() => openId(page)).toBe(second);
  });

  test('opens the comment a Telegram deep link names', async ({ page }) => {
    const ids = await openHeldQueue(page);
    const target = ids[Math.min(ids.length - 1, 4)];

    // The bot links to `/dev/portal/comments#<id>`.
    await page.goto(`${PORTAL}/comments#${target}`);
    await expect.poll(() => openId(page)).toBe(target);
    await expect(row(page, target)).toHaveAttribute('data-active', 'true');
    await expect(row(page, target).locator('[data-row-button]')).toBeFocused();
  });

  test('bans a writer from the reading pane after checking the impact, then undoes it', async ({ page }) => {
    await openHeldQueue(page);
    await page.keyboard.press('b');
    const dialog = page.getByRole('dialog', { name: 'Ban this writer' });
    await expect(dialog).toBeVisible();

    // The impact check answers before anything is written.
    await expect(dialog.getByText(/^Matches \d+ comments? \(/)).toBeVisible();
    await dialog.getByRole('button', { name: /^Ban \d+ keys?$/ }).click();
    await expect(dialog).toBeHidden();

    await undoOn(page, /^Banned \d+ keys?$/).click();
    await expect(toasts(page).getByText('Ban lifted')).toBeVisible();
  });

  test('pivots to everything from one writer, and Back returns to the inbox', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/comments?status=held');
    await expect(rows(page).first()).toBeVisible();
    const before = await page.evaluate(() => location.pathname + location.search);
    const pivot = () => page.evaluate(() => new URLSearchParams(location.search).has('key'));

    // A row links each of its writer's keys; the first is the name.
    await rows(page).first().locator('a[title^="All comments with"]').first().click();
    await expect(page.getByRole('button', { name: 'Clear filter' })).toBeVisible();
    await expect.poll(pivot).toBe(true);
    await expect(rows(page).first()).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('button', { name: 'Clear filter' })).toBeHidden();
    await expect.poll(() => page.evaluate(() => location.pathname + location.search)).toBe(before);
    await expect(rows(page).first()).toBeVisible();
  });

  test('on a phone, a left swipe deletes a held comment and Undo brings it back', async ({ browser, baseURL }) => {
    // Its own context, not test.use(): that would start a second worker and warm up again.
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await open(page, '/comments?status=held');
      const first = rows(page).first();
      await expect(first).toBeVisible();
      const id = (await first.getAttribute('data-row-id'))!;
      const box = (await first.boundingBox())!;

      // A real touch drag through CDP, in steps a frame apart, so the row sees
      // a finger moving and not a jump.
      const cdp = await context.newCDPSession(page);
      const y = box.y + box.height / 2;
      const from = box.x + box.width * 0.85;
      const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      await touch('touchStart', from);
      for (let step = 1; step <= 10; step += 1) {
        await touch('touchMove', from - step * box.width * 0.07);
        await page.waitForTimeout(16);
      }
      await touch('touchEnd', from - box.width * 0.7);

      await expect(row(page, id)).toHaveCount(0);
      await undoOn(page, /^Deleted$/).tap();
      await expect(row(page, id)).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test.describe('bans', () => {
  test('lifts a ban and puts it back with Undo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/comments/bans');
    const liftButton = page.getByRole('button', { name: /^Lift the ban on / });
    const banRow = page.getByRole('table', { name: 'Active bans' }).getByRole('row').filter({ has: liftButton }).first();
    const lift = banRow.getByRole('button', { name: /^Lift the ban on / });
    await expect(lift).toBeVisible();
    const label = (await lift.getAttribute('aria-label'))!;
    // The button names the full value; the row and the toast print a hash
    // short ("session e05b86cf"), so the toast is found by what the row shows.
    const link = banRow.getByRole('link').first();
    const value = (await link.getAttribute('title'))!;
    const type = label.replace('Lift the ban on ', '').replace(` ${value}`, '');
    const shown = (await link.textContent())!;

    await lift.click();
    await expect(page.getByRole('button', { name: label })).toHaveCount(0);
    await undoOn(page, `Lifted the ban on ${type} ${shown}`).click();
    await expect(page.getByRole('button', { name: label })).toBeVisible();
  });
});

test.describe('home', () => {
  test('releases the notify gate as one digest', async ({ page }) => {
    /* The demo gate stays open for five minutes after a release, then holds
       the next burst. Until this test releases it, report it held whatever
       an earlier run left, so every run sees the same Home. */
    let released = false;
    await page.route(`**${PORTAL}/api/admin/notify-gate`, async (route) => {
      const response = await route.fetch();
      const gate = await response.json();
      if (released || gate.state === 'held') return route.fulfill({ response, json: gate });
      const heldSince = new Date(Date.now() - 45 * 60_000).toISOString();
      return route.fulfill({ response, json: { ...gate, state: 'held', heldSince, heldPostIds: ['9001', '9002', '9003'] } });
    });
    await page.route(`**${PORTAL}/api/admin/notify-gate/release`, (route) => {
      released = true;
      return route.continue();
    });

    await open(page, '');
    const line = page.getByRole('listitem').filter({ hasText: /mood posts? held by the notify gate/ });
    await expect(line).toBeVisible();
    await line.getByRole('button', { name: 'Send digest' }).click();

    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText(/Send \d+ held posts? as one digest\?/);
    await confirm.getByRole('button', { name: 'Send digest' }).click();

    await expect(line).toBeHidden();
    await expect(toasts(page).getByText('Digest sent')).toBeVisible();
    await expect(toasts(page).getByText(/[\d,]+ emails? sent\./)).toBeVisible();
    // Home refetches the gate on its own; a fetch still in flight must not outlive the test.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });
});

test.describe('audience', () => {
  test("changes a subscriber's delivery, then changes it back", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/subscribers');
    await rows(page).first().locator('[data-row-button]').click();
    const pane = page.locator('article[aria-labelledby^="sub-"]');
    await expect(pane).toBeVisible();

    const delivery = pane.getByRole('group', { name: 'Delivery' });
    const original = (await delivery.getByRole('button', { pressed: true }).getAttribute('aria-label'))
      ?? (await delivery.getByRole('button', { pressed: true }).innerText());
    const choices = await delivery.getByRole('button').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? node.textContent!.trim()));
    const next = choices.find((choice) => choice !== original)!;

    await delivery.getByRole('button', { name: next, exact: true }).click();
    await expect(delivery.getByRole('button', { name: next, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(pane.getByRole('definition').filter({ hasText: new RegExp(`^${next}`) })).toBeVisible();

    // A reload reads it back from the demo API, not the optimistic cache.
    await page.reload();
    await expect(page.locator('article[aria-labelledby^="sub-"]').getByRole('group', { name: 'Delivery' }).getByRole('button', { name: next, exact: true })).toHaveAttribute('aria-pressed', 'true');

    await page.locator('article[aria-labelledby^="sub-"]').getByRole('group', { name: 'Delivery' }).getByRole('button', { name: original, exact: true }).click();
    await expect(page.locator('article[aria-labelledby^="sub-"]').getByRole('group', { name: 'Delivery' }).getByRole('button', { name: original, exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('composes a broadcast, sends it, and follows its progress', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/broadcasts');
    await page.keyboard.press('n');
    const composer = page.getByRole('dialog', { name: 'New broadcast' });
    await expect(composer).toBeVisible();
    await expect(page).toHaveURL(/\/broadcasts\/new$/);

    // Escape closes an empty composer, back to the list.
    await page.keyboard.press('Escape');
    await expect(composer).toBeHidden();
    await expect(page).toHaveURL(/\/broadcasts$/);
    await page.keyboard.press('n');
    await expect(composer).toBeVisible();

    const subject = `E2E broadcast ${Date.now()}`;
    const message = 'A **short** note from the portal suite.';
    await composer.getByRole('textbox', { name: 'Subject' }).fill(subject);
    await composer.getByRole('textbox', { name: /^Message/ }).fill(message);

    // With text in it, Escape still closes at once and asks nothing: the
    // draft is kept on this device, and n brings it back.
    await page.keyboard.press('Escape');
    await expect(composer).toBeHidden();
    await page.keyboard.press('n');
    await expect(composer.getByRole('textbox', { name: 'Subject' })).toHaveValue(subject);
    await expect(composer.getByRole('textbox', { name: /^Message/ })).toHaveValue(message);

    // The smallest channel alone, so the demo job finishes in a few seconds.
    const channels = composer.getByRole('group', { name: 'Channels' });
    await channels.getByRole('button', { name: /^Privacy/ }).click();
    for (const name of [/^Blog/, /^Mood/, /^Announcements/]) {
      const button = channels.getByRole('button', { name });
      if ((await button.getAttribute('aria-pressed')) === 'true') await button.click();
    }
    await expect(composer.getByRole('region', { name: 'Preview' }).locator('iframe')).toBeVisible();

    await composer.getByRole('button', { name: /^Send…/ }).click();
    const send = composer.getByRole('button', { name: /^Send to [\d,]+$/ });
    await expect(send).toBeEnabled();
    // Escape backs out of the confirm first; the composer stays open.
    await page.keyboard.press('Escape');
    await expect(send).toBeHidden();
    await expect(composer).toBeVisible();
    await composer.getByRole('button', { name: /^Send…/ }).click();
    await expect(send).toBeEnabled();
    await send.click();

    // The composer hands over to the new broadcast, which sends as we watch.
    await expect(composer).toBeHidden();
    await expect(page).toHaveURL(/\/broadcasts\/[^/?]+/);
    // Scoped to its pane: the list shows a bar for every broadcast still sending.
    const pane = page.getByRole('article', { name: subject });
    await expect(pane).toBeVisible();
    const progress = pane.getByRole('progressbar', { name: 'Send progress' });
    await expect(progress).toBeVisible();
    await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow')), { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(pane.getByText(/^Every one of [\d,]+ recipients? was sent the email\.$/)).toBeVisible({ timeout: 30_000 });
    await expect(progress).toHaveCount(0);
  });
});

test.describe('analytics', () => {
  test("opens an article's analytics, and Back returns to the list", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/analytics');
    const articles = page.getByRole('region', { name: 'Articles' });
    const first = articles.getByRole('link').first();
    const href = (await first.getAttribute('href'))!;
    const slug = href.split('/').pop()!;
    // The row names the post by its Ghost title, not its slug.
    const name = first.locator('span').first();
    await expect(name).not.toHaveText(slug);
    const title = (await name.textContent())!;

    await first.click();
    const panel = page.getByRole('complementary', { name: 'Article analytics' });
    await expect(panel.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(panel.getByText(`${slug} · Last 30 days`)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/analytics/${slug}$`));

    await page.goBack();
    await expect(panel).toBeHidden();
    await expect(page).toHaveURL(/\/analytics$/);
    await expect(articles.getByRole('link').first()).toBeFocused();
  });
});

test.describe('shell', () => {
  test('⌘K jumps to a screen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/activity');
    await page.keyboard.press('ControlOrMeta+k');
    const input = page.getByRole('dialog').getByRole('combobox');
    await expect(input).toBeFocused();
    await input.fill('Bans');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Bans', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/comments\/bans$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a failed read says so, and Try again recovers', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Every activity read answers 500 until the switch is cleared.
    await page.goto(`${PORTAL}/activity?demoFail=admin/activity`);
    const alert = page.getByRole('alert').filter({ hasText: 'Could not load the activity log.' });
    await expect(alert).toBeVisible({ timeout: 20_000 });

    // An empty value clears the switch on the next request (app/api.ts).
    await page.evaluate(() => history.replaceState(history.state, '', `${location.pathname}?demoFail=`));
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(alert).toBeHidden();
    await expect(page.locator('main time').first()).toBeVisible();
  });
});

