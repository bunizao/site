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

/** A phone of its own, not test.use(): that would start a second worker
    and warm up again. */
const phone = (browser: Browser, baseURL: string | undefined) =>
  browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });

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

  test('B then Enter bans the writer and deletes that comment, the pane moves on, and Undo brings it back', async ({ page }) => {
    const [first, second] = await openHeldQueue(page);
    await page.keyboard.press('b');
    const dialog = page.getByRole('dialog', { name: 'Ban this writer' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'This comment', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // A ban on one person's keys goes at once; the row leaves as after d.
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(row(page, first)).toHaveCount(0);
    await expect.poll(() => openId(page)).toBe(second);
    await expect(row(page, second).locator('[data-row-button]')).toBeFocused();

    await undoOn(page, /^Banned \d+ keys? and deleted the comment$/).click();
    await expect(toasts(page).getByText('Ban lifted and the comment restored')).toBeVisible();
    await expect(row(page, first)).toBeVisible();
    await expect.poll(() => openId(page)).toBe(first);
  });

  test('Same fingerprint sweeps the device, spares a signed-in reader, and Undo puts it all back', async ({ page }) => {
    // seo-growth-hub shares its device fingerprint with two other held
    // spammers and with one published comment jonas_k wrote signed in.
    const target = '01J8QK3M7X';
    const swept = ['01J9DEMO0009BFA407', '01J9DEMO0061EC98B0'];
    const spared = '01J9DEMO000428DE5E';
    const statusOf = async (id: string) => {
      const answer = await page.request.get(`${PORTAL}/api/admin/comments?status=all&limit=200`);
      const { comments } = (await answer.json()) as { comments: Array<{ id: string; status: string }> };
      return comments.find((comment) => comment.id === id)?.status;
    };

    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, `/comments?status=held&c=${target}`);
    await expect(row(page, target)).toHaveAttribute('data-active', 'true');
    await page.keyboard.press('b');
    const dialog = page.getByRole('dialog', { name: 'Ban this writer' });
    await expect(dialog).toBeVisible();

    await page.keyboard.press('2');
    await expect(dialog.getByRole('button', { name: 'Same fingerprint', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByText(/^Deletes 4 comments and \d+ reactions? from \d+ sessions?\.$/)).toBeVisible();
    await expect(dialog.getByText(/Spares 1 published comment by signed-in readers\.$/)).toBeVisible();
    // The spared reader keeps their comment, so nothing warns about their account.
    await expect(dialog.getByText(/^Also deletes from/)).toHaveCount(0);
    await dialog.getByRole('button', { name: /^Ban \d+ keys? and delete 4$/ }).click();
    await expect(dialog).toBeHidden();

    for (const id of [target, ...swept]) await expect(row(page, id)).toHaveCount(0);
    expect(await statusOf(spared)).toBe('published');

    await undoOn(page, /^Banned \d+ keys? and deleted 4 comments/).click();
    await expect(toasts(page).getByText(/^Ban lifted and 4 comments/)).toBeVisible();
    for (const id of [target, ...swept]) await expect(row(page, id)).toBeVisible();
    expect(await statusOf(spared)).toBe('published');
  });

  test('on a phone the ban sheet fits, and every delete choice is a 44px target', async ({ browser, baseURL }) => {
    const context = await phone(browser, baseURL);
    const page = await context.newPage();
    try {
      await open(page, '/comments?status=held&c=01J8QK3M7X');
      const drawer = page.getByRole('dialog').first();
      await drawer.getByRole('button', { name: 'More actions' }).tap();
      await page.getByRole('menuitem', { name: 'Ban…' }).tap();
      const sheet = page.getByRole('dialog', { name: 'Ban this writer' });
      await expect(sheet).toBeVisible();
      await sheet.getByRole('button', { name: 'Same fingerprint', exact: true }).tap();
      await expect(sheet.getByText(/^Deletes 4 comments/)).toBeVisible();

      const choices = sheet.getByRole('group', { name: 'Delete' }).getByRole('button');
      for (const box of await choices.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()))) {
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      const fits = await sheet.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && el.scrollWidth <= el.clientWidth && document.documentElement.scrollWidth <= innerWidth;
      });
      expect(fits).toBe(true);
    } finally {
      await context.close();
    }
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

  test('on a phone, a pivot from the drawer lands on the list, and Back returns to the drawer', async ({ browser, baseURL }) => {
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
      // Léa's address wrote more than one comment, so her drawer offers the pivot.
      const lea = rows(page).filter({ hasText: 'Léa' }).first();
      await expect(lea).toBeVisible();
      const id = (await lea.getAttribute('data-row-id'))!;
      await lea.locator('[data-row-button]').tap();
      const drawer = page.getByRole('dialog', { name: 'Comment' });
      await expect(drawer).toBeVisible();

      // The drawer would cover the list the pivot opens, so it closes.
      await drawer.getByRole('link', { name: /more by this address/ }).tap();
      await expect(drawer).toBeHidden();
      await expect(page.getByRole('button', { name: 'Clear filter' })).toBeVisible();
      await expect(rows(page).first()).toBeVisible();
      expect(await openId(page)).toBeNull();

      // Back undoes the pivot and brings the drawer back; its X then closes
      // the drawer, and goes no further.
      await page.goBack();
      await expect(drawer).toBeVisible();
      await expect.poll(() => openId(page)).toBe(id);
      await expect(page.getByRole('button', { name: 'Clear filter' })).toBeHidden();
      await drawer.getByRole('button', { name: 'Close', exact: true }).tap();
      await expect(drawer).toBeHidden();
      await expect(page).toHaveURL(/\/comments\?status=held$/);
    } finally {
      await context.close();
    }
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
      // Hold still before lifting: the row is past its commit share, so this
      // is a drag, not a flick. A flick leaves Chrome flinging, and it takes
      // the next tap (on Undo) as the one that stops the fling, with no click.
      await page.waitForTimeout(150);
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
    // Started reads as a short time, like every other list.
    await expect(rows(page).first().locator('time')).toHaveText(/^\d{2}-\d{2} \d{2}:\d{2}$/);
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
  test('switches from whole-site analytics to page and click reports', async ({ page }) => {
    await open(page, '/analytics');
    await expect(page.getByText('Engaged views', { exact: true })).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'Analytics reports' });
    await tabs.getByRole('button', { name: 'Pages', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: 'Median dwell', exact: true })).toBeVisible();
    await tabs.getByRole('button', { name: 'Clicks', exact: true }).click();
    await expect(page.getByRole('cell', { name: 'desk.panel', exact: true })).toBeVisible();
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

  test('⌘K searches comments for what was typed, without a read per keystroke', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/activity');
    const searches: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/') && request.url().includes('moonpump')) searches.push(request.url());
    });
    await page.keyboard.press('ControlOrMeta+k');
    const input = page.getByRole('dialog').getByRole('combobox');
    await input.pressSequentially('moonpump');
    await expect(page.getByRole('option', { name: 'Subscribers matching “moonpump”' })).toBeVisible();
    expect(searches, 'typing only filters the palette').toEqual([]);

    await page.getByRole('option', { name: 'Comments matching “moonpump”' }).click();
    await expect(page).toHaveURL(/\/comments\?q=moonpump$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(rows(page).first()).toBeVisible();
    for (const text of await rows(page).allTextContents()) expect(text).toMatch(/moonpump/i);
  });

  test('on a phone, the tab bar reaches a screen in one tap, and More opens the rest', async ({ browser, baseURL }) => {
    const context = await phone(browser, baseURL);
    const page = await context.newPage();
    try {
      await open(page, '');
      const tabs = page.getByRole('navigation', { name: 'Tab bar' });
      // The held count is the sidebar's own query, so it costs no read.
      const comments = tabs.getByRole('link', { name: /^Comments \d+ held$/ });
      await comments.tap();
      await expect(page).toHaveURL(/\/comments$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Comments', exact: true })).toBeVisible();
      await expect(comments).toHaveAttribute('aria-current', 'page');

      await tabs.getByRole('link', { name: 'Subscribers' }).tap();
      await expect(page.getByRole('heading', { level: 1, name: 'Subscribers', exact: true })).toBeVisible();

      // A screen under a tab keeps it lit.
      await open(page, '/comments/bans');
      await expect(comments).toHaveAttribute('aria-current', 'page');

      await tabs.getByRole('button', { name: 'More' }).tap();
      const sheet = page.locator('[data-mobile="true"][data-sidebar="sidebar"]');
      await sheet.getByRole('link', { name: 'Analytics' }).tap();
      await expect(page.getByRole('heading', { level: 1, name: 'Analytics', exact: true })).toBeVisible();
      await expect(sheet).toBeHidden();
    } finally {
      await context.close();
    }
  });

  test("on a phone, a toast leaves the comment drawer's close button uncovered", async ({ browser, baseURL }) => {
    const context = await phone(browser, baseURL);
    const page = await context.newPage();
    try {
      await open(page, '/comments?status=held');
      const first = rows(page).first();
      const id = (await first.getAttribute('data-row-id'))!;
      await first.locator('[data-row-button]').tap();
      const drawer = page.getByRole('dialog');
      const close = drawer.getByRole('button', { name: 'Close', exact: true });
      await expect(close).toBeVisible();

      await drawer.getByRole('button', { name: /^Approve/ }).tap();
      const undo = undoOn(page, /^Approved/);
      await expect(undo).toBeVisible();
      // What a tap at the X's centre lands on while the toast shows.
      const tapHitsClose = await close.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const at = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return at !== null && el.contains(at);
      });
      expect(tapHitsClose).toBe(true);

      await undo.tap();
      await close.tap();
      await expect(drawer).toHaveCount(0);
      await expect(row(page, id)).toBeVisible();
    } finally {
      await context.close();
    }
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

