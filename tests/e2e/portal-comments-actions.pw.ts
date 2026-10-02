import type { Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { resetPortalDemo } from './portal-demo';

/* The comment screen's owner acts on site-api P2, in demo mode: reject with
   a reason, restore, bulk acts with their cap and partial results, server
   search and filters, the owner's reply, the lockdown, and how each one
   degrades on a site-api that lacks its route.

   Demo state lives in the dev server's memory and outlives a run, so the
   file resets it to the seed before and after (tests/e2e/portal-demo.ts),
   and each test still puts back what it changed through the demo API, in
   a `finally`, so the tests do not depend on their order. Run it against a
   server that is already up with E2E_REUSE_SERVER=1; the spec skips
   wherever demo mode is off. */

const PORTAL = '/dev/portal';
const API = `${PORTAL}/api/admin/comments`;
const MISSING = /needs the updated site-api/;

test.skip(Boolean(process.env.E2E_BASE_URL), 'Demo mode exists only on local astro dev.');

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
  await page.setViewportSize({ width: 1440, height: 900 });
});

/** Loads the screens these tests use once, so Vite's first compile lands
    here. Returns whether the portal is in demo mode. */
async function warmUp(browser: Browser, baseURL: string): Promise<boolean> {
  const page = await browser.newPage({ baseURL });
  try {
    await page.goto(`${PORTAL}/comments`);
    const sidebar = page.locator('[data-sidebar="sidebar"]');
    await sidebar.waitFor({ timeout: 90_000 });
    if (!(await sidebar.getByText('Demo', { exact: true }).isVisible())) return false;
    await page.goto(PORTAL);
    await page.locator('main h1').first().waitFor({ timeout: 60_000 }).catch(() => {});
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
const pane = (page: Page) => page.getByRole('complementary', { name: 'Comment detail' });
const bulkBar = (page: Page) => page.getByRole('toolbar', { name: 'Bulk actions' });
const toast = (page: Page, title: string | RegExp) =>
  page.locator('[data-slot="toast-viewport"] > *').filter({ has: page.locator('[data-slot="toast-title"]').filter({ hasText: title }) });
const lockdownLine = (page: Page) => page.locator('main [role="status"]').filter({ hasText: 'Lockdown' });
const openId = (page: Page): Promise<string | null> => page.evaluate(() => new URLSearchParams(location.search).get('c'));
const idsOf = (page: Page): Promise<string[]> => rows(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-row-id')!));

interface DemoComment {
  id: string;
  status: string;
  moderationReason: string | null;
  restorableUntil?: string | null;
}

/** One comment as the demo API has it now, or null. */
async function find(page: Page, id: string): Promise<DemoComment | null> {
  for (let offset: number | null = 0; offset !== null; ) {
    const response = await page.request.get(`${API}?status=all&limit=100&offset=${offset}`);
    const body = (await response.json()) as { comments: DemoComment[]; nextOffset: number | null };
    const hit = body.comments.find((comment) => comment.id === id);
    if (hit) return hit;
    offset = body.nextOffset;
  }
  return null;
}

/** An owner act straight on the demo API, as Telegram or another tab would. */
async function actOn(page: Page, id: string, action: string, reason?: string): Promise<void> {
  await page.request.post(`${API}/${encodeURIComponent(id)}`, { data: { action, reason } });
}

async function liftLockdown(page: Page): Promise<void> {
  await page.request.delete(`${API}/lockdown`);
}

/** Opens the held queue with its first comment in the reading pane. */
async function openHeldQueue(page: Page): Promise<string[]> {
  await open(page, '/comments?status=held');
  await expect(rows(page).first()).toBeVisible();
  const ids = await idsOf(page);
  expect(ids.length, 'the demo holds at least three comments').toBeGreaterThanOrEqual(3);
  await rows(page).first().locator('[data-row-button]').click();
  await expect.poll(() => openId(page)).toBe(ids[0]);
  return ids;
}

/** The route answered the way a site-api without it answers. */
const missingRoute = (status: 404 | 405) => ({ status, contentType: 'text/plain', body: status === 404 ? 'Not Found' : '' });

test.describe('comment acts', () => {
  test('rejects with a reason from the keyboard: S, then the reason\'s digit', async ({ page }) => {
    const [first, second] = await openHeldQueue(page);
    try {
      await page.keyboard.press('s');
      const menu = page.getByRole('menu');
      await expect(menu.getByText('Reject as')).toBeVisible();
      await page.keyboard.press('2');

      // One step: the menu closes, the row leaves Held, the next one opens.
      await expect(menu).toBeHidden();
      await expect(row(page, first)).toHaveCount(0);
      await expect.poll(() => openId(page)).toBe(second);
      await expect(toast(page, 'Rejected as promotion')).toBeVisible();
      await expect.poll(async () => (await find(page, first))?.moderationReason).toBe('promotional');
      expect((await find(page, first))?.status).toBe('rejected');
    } finally {
      // Nothing returns a rejected row to Held in one act.
      await actOn(page, first, 'approve');
      await actOn(page, first, 'hide');
    }
  });

  test('restores a deleted comment inside its window, and Undo deletes it again', async ({ page }) => {
    await open(page, '/comments?status=deleted');
    await expect(rows(page).first()).toBeVisible();
    const candidates = await Promise.all((await idsOf(page)).map((id) => find(page, id)));
    const target = candidates.find((comment) => comment?.restorableUntil && Date.parse(comment.restorableUntil) > Date.now());
    expect(target, 'the demo holds a restorable deleted comment').toBeTruthy();
    const id = target!.id;
    try {
      await row(page, id).locator('[data-row-button]').click();
      await expect(pane(page).getByText(/^Restorable until .+ · (\d+ of 30 days|\d+h) left$/)).toBeVisible();

      await pane(page).getByRole('button', { name: 'Restore' }).click();
      await expect(row(page, id)).toHaveCount(0);
      await expect.poll(async () => (await find(page, id))?.status).not.toBe('deleted');

      await toast(page, /^Restored/).getByRole('button', { name: 'Undo' }).click();
      await expect(row(page, id)).toBeVisible();
      await expect.poll(async () => (await find(page, id))?.status).toBe('deleted');
    } finally {
      if ((await find(page, id))?.status !== 'deleted') await actOn(page, id, 'delete');
    }
  });

  test('a bulk act lands a row someone moved first where site-api says, with one receipt', async ({ page }) => {
    const [first, second] = await openHeldQueue(page);
    try {
      // x ticks the open row; Shift+J ticks the next one and moves there.
      await page.keyboard.press('x');
      await page.keyboard.press('Shift+J');
      await expect(bulkBar(page)).toContainText('2 selected');

      // Someone deletes the first one meanwhile, from Telegram or another tab.
      await actOn(page, first, 'delete');
      const answered = page.waitForResponse((response) => response.url().endsWith('/comments/bulk'));
      await page.keyboard.press('Shift+A');
      const { results } = (await (await answered).json()) as { results: Array<{ id: string; result: string; status: string | null }> };
      expect(results).toContainEqual({ id: first, result: 'not_available', status: 'deleted' });

      // Deleted is not Held: it stays out of this list, and the receipt says where it went.
      const receipt = toast(page, '1 approved, 1 already elsewhere');
      await expect(receipt).toBeVisible();
      await expect(receipt).toContainText('now Deleted (1)');
      await expect(row(page, second)).toHaveCount(0);
      await expect(row(page, first)).toHaveCount(0);
      await expect(bulkBar(page)).toHaveCount(0);
    } finally {
      await actOn(page, first, 'restore');
      await actOn(page, second, 'hide');
    }
  });

  test('in All, a row someone moved first stays in place with its real status, marked and selected', async ({ page }) => {
    await open(page, '/comments');
    const held = rows(page).filter({ has: page.locator('[data-row-button][aria-label*=", Held, "]') });
    await expect(held.nth(1)).toBeVisible();
    const [first, second] = await held.evaluateAll((nodes) => nodes.slice(0, 2).map((node) => node.getAttribute('data-row-id')!));
    try {
      await row(page, first).locator('[data-row-button]').click();
      await page.keyboard.press('x');
      await row(page, second).getByRole('checkbox').click();
      await expect(bulkBar(page)).toContainText('2 selected');

      await actOn(page, first, 'delete');
      await page.keyboard.press('Shift+A');

      await expect(toast(page, '1 approved, 1 already elsewhere')).toBeVisible();
      await expect(row(page, first).locator('[data-row-button]')).toHaveAttribute('aria-label', /, Deleted, /);
      await expect(row(page, first)).toContainText('Not changed: someone moved it first');
      await expect(row(page, first).getByRole('checkbox')).toBeChecked();
      await expect(row(page, second).locator('[data-row-button]')).toHaveAttribute('aria-label', /, Published, /);
      await expect(bulkBar(page)).toContainText('1 selected');
    } finally {
      await actOn(page, first, 'restore');
      await actOn(page, second, 'hide');
    }
  });

  test('a bulk act takes the first 20 selected, and a missing bulk route changes nothing', async ({ page }) => {
    await open(page, '/comments');
    await expect(rows(page).first()).toBeVisible();
    const sent: string[][] = [];
    await page.route('**/dev/portal/api/admin/comments/bulk', async (route) => {
      sent.push((route.request().postDataJSON() as { ids: string[] }).ids);
      await route.fulfill(missingRoute(404));
    });

    // Each row button names its status: `writer, Held, 2h`.
    const deletedRows = () => rows(page).locator('[data-row-button][aria-label*=", Deleted, "]').count();
    const deletedBefore = await deletedRows();

    // x starts a selection, which brings up the select-all box.
    await rows(page).first().locator('[data-row-button]').click();
    await page.keyboard.press('x');
    await page.getByRole('checkbox', { name: 'Select all loaded' }).click();
    await expect(bulkBar(page)).toContainText('· 20 per act');
    const selected = Number((await bulkBar(page).textContent())?.match(/(\d+) selected/)?.[1]);
    expect(selected).toBeGreaterThan(20);
    const remove = bulkBar(page).getByRole('button', { name: /^Delete 20/ });
    await expect(remove).toBeVisible();

    await remove.click();
    await expect(toast(page, '20 comments were not updated')).toContainText(MISSING);
    expect(sent).toHaveLength(1);
    expect(new Set(sent[0]).size).toBe(20);
    // Every row is back as it was and still selected, so the next try is one click.
    await expect(bulkBar(page)).toContainText(`${selected} selected`);
    await expect.poll(deletedRows).toBe(deletedBefore);
  });

  test('replies as the owner from the pane: R to write, ⌘↵ to send, shown with the owner badge', async ({ page }) => {
    await open(page, '/comments?status=published');
    await expect(rows(page).first()).toBeVisible();
    await rows(page).first().locator('[data-row-button]').click();
    await expect(pane(page)).toBeVisible();

    await page.keyboard.press('r');
    const box = pane(page).getByRole('textbox', { name: /as the owner$/ });
    await expect(box).toBeFocused();
    const text = `e2e reply ${Date.now().toString(36)}`;
    await box.fill(text);
    const answered = page.waitForResponse((response) => response.url().endsWith('/reply') && response.request().method() === 'POST');
    await page.keyboard.press('ControlOrMeta+Enter');

    // In the thread at once, before site-api answers.
    const line = pane(page).locator('li').filter({ hasText: text });
    await expect(line).toBeVisible();
    await expect(line.getByText('Owner', { exact: true })).toBeVisible();
    await expect(box).toHaveValue('');

    const response = await answered;
    const reply = (await response.json()) as { comment: { id: string } };
    try {
      // The draft's replyId became the reply's id.
      const sent = response.request().postDataJSON() as { body: string; replyId: string };
      expect(sent.replyId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(reply.comment.id).toBe(sent.replyId);
      await expect(line).not.toContainText('Sending…');
      await expect(line.getByText('Owner', { exact: true })).toBeVisible();
    } finally {
      await actOn(page, reply.comment.id, 'delete');
    }
  });

  test('a reply whose answer was lost retries with the same replyId and posts once', async ({ page }) => {
    const sent: string[] = [];
    let lose = true;
    await page.route('**/dev/portal/api/admin/comments/*/reply', async (route) => {
      sent.push((route.request().postDataJSON() as { replyId: string }).replyId);
      if (!lose) return route.continue();
      lose = false;
      // site-api writes the reply, and the answer never reaches the page.
      await route.fetch();
      await route.abort('connectionreset');
    });

    await open(page, '/comments?status=published');
    await expect(rows(page).first()).toBeVisible();
    await rows(page).first().locator('[data-row-button]').click();
    await page.keyboard.press('r');
    const text = `e2e retried reply ${Date.now().toString(36)}`;
    await pane(page).getByRole('textbox', { name: /as the owner$/ }).fill(text);
    await page.keyboard.press('ControlOrMeta+Enter');

    const line = pane(page).locator('li').filter({ hasText: text });
    await expect(line).toContainText('Not sent');
    await expect(line).toContainText('Retry is safe');
    const answered = page.waitForResponse((response) => response.url().endsWith('/reply'));
    await line.getByRole('button', { name: 'Retry' }).click();
    const reply = (await (await answered).json()) as { comment: { id: string } };
    try {
      expect(sent).toHaveLength(2);
      expect(sent[1]).toBe(sent[0]);
      // The first reply came back: one row in site-api, one line in the thread.
      expect(reply.comment.id).toBe(sent[0]);
      await expect(line).not.toContainText('Not sent');
      await expect(pane(page).locator('li').filter({ hasText: text })).toHaveCount(1);
      const search = (await (await page.request.get(`${API}?status=all&q=${encodeURIComponent(text)}`)).json()) as { total: number };
      expect(search.total).toBe(1);
    } finally {
      await actOn(page, reply.comment.id, 'delete');
    }
  });

  test('a replyId collision says the earlier try published, offers no retry, and Edit sends a new id', async ({ page }) => {
    const sent: string[] = [];
    await page.route('**/dev/portal/api/admin/comments/*/reply', async (route) => {
      sent.push((route.request().postDataJSON() as { replyId: string }).replyId);
      await route.fulfill({ status: 409, json: { error: 'reply_id_collision', message: 'reply_id_collision' } });
    });

    await open(page, '/comments?status=published');
    await expect(rows(page).first()).toBeVisible();
    await rows(page).first().locator('[data-row-button]').click();
    await page.keyboard.press('r');
    const box = pane(page).getByRole('textbox', { name: /as the owner$/ });
    await box.fill('e2e colliding reply');
    await page.keyboard.press('ControlOrMeta+Enter');

    const line = pane(page).locator('li').filter({ hasText: 'e2e colliding reply' });
    await expect(line).toContainText('An earlier try of this reply was published with other text');
    await expect(line.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await line.getByRole('button', { name: 'Edit' }).click();
    await expect(line).toHaveCount(0);
    await expect(box).toHaveValue('e2e colliding reply');
    await box.focus();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect.poll(() => sent.length).toBe(2);
    expect(sent[1]).not.toBe(sent[0]);
    await pane(page).locator('li').filter({ hasText: 'e2e colliding reply' }).getByRole('button', { name: 'Discard' }).click();
  });
});

test.describe('comment search and filters', () => {
  test('searches the last 30 days on the server, and keeps search and filters in the URL', async ({ page }) => {
    await open(page, '/comments');
    await expect(rows(page).first()).toBeVisible();

    const search = page.getByRole('searchbox', { name: /^Search comment text and writer names/ });
    await search.fill('crypto');
    await expect(page).toHaveURL(/[?&]q=crypto(&|$)/);
    await expect
      .poll(async () => {
        const texts = await rows(page).allTextContents();
        return texts.length > 0 && texts.every((text) => text.toLowerCase().includes('crypto'));
      })
      .toBe(true);
    await expect(page.locator('main').getByText(/from the last 30 days/)).toBeVisible();

    // A filter is two clicks: the menu, the submenu, the value.
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.getByRole('menuitem', { name: 'Checks said' }).click();
    await page.getByRole('menuitemradio', { name: 'Spam' }).click();
    await expect(page).toHaveURL(/[?&]reason=spam(&|$)/);
    await expect(page.getByRole('button', { name: 'Filters: Spam' })).toBeVisible();

    // A reload is the same view.
    await page.reload();
    await expect(page.getByRole('searchbox', { name: /^Search comment text and writer names/ })).toHaveValue('crypto');
    await expect(page.getByRole('button', { name: 'Filters: Spam' })).toBeVisible();

    await page.getByRole('button', { name: 'Filters: Spam' }).click();
    await page.getByRole('menuitem', { name: 'Clear filters' }).click();
    await expect(page).not.toHaveURL(/[?&]reason=/);
    await page.getByRole('searchbox', { name: /^Search comment text and writer names/ }).fill('');
    await expect(page).not.toHaveURL(/[?&]q=/);
  });
});

test.describe('comment lockdown', () => {
  test('engaged from Home, shown on Comments with who and when, lifted there', async ({ page }) => {
    await liftLockdown(page);
    try {
      await open(page, '');
      const home = page.locator('main li').filter({ hasText: 'comment lockdown' });
      await expect(home).toContainText('Off');
      await home.getByRole('button', { name: 'Lock down…' }).click();
      await page.getByRole('textbox', { name: 'Note, optional' }).fill('e2e flood');
      await page.getByRole('button', { name: 'Lock down for 1 hour' }).click();
      await expect(home).toContainText('On');
      await expect(home).toContainText('On, by you: e2e flood');
      await expect(home).toContainText(/ends (\d\d-\d\d )?\d\d:\d\d, in (1h|60m|59m)/);

      await open(page, '/comments');
      await expect(lockdownLine(page)).toContainText('by you: e2e flood');
      await expect(lockdownLine(page)).toContainText(/ends (\d\d-\d\d )?\d\d:\d\d, in (1h|60m|59m)/);
      await lockdownLine(page).getByRole('button', { name: 'Lift' }).click();
      await expect(lockdownLine(page)).toHaveCount(0);
      await expect.poll(async () => (await (await page.request.get(`${API}/lockdown`)).json()).lockdown).toBeNull();
    } finally {
      await liftLockdown(page);
    }
  });
});

test.describe('a site-api without the new routes', () => {
  test('lockdown and reply say so inline, and nothing crashes', async ({ page }) => {
    await page.route('**/dev/portal/api/admin/comments/lockdown', (route) => route.fulfill(missingRoute(404)));
    await page.route('**/dev/portal/api/admin/comments/*/reply', (route) => route.fulfill(missingRoute(405)));

    await open(page, '');
    await expect(page.locator('main li').filter({ hasText: 'comment lockdown' })).toContainText(MISSING);

    await open(page, '/comments?status=published');
    await expect(rows(page).first()).toBeVisible();
    await expect(lockdownLine(page)).toHaveCount(0);
    await rows(page).first().locator('[data-row-button]').click();
    await page.keyboard.press('r');
    await pane(page).getByRole('textbox', { name: /as the owner$/ }).fill('e2e unsent reply');
    await page.keyboard.press('ControlOrMeta+Enter');
    const line = pane(page).locator('li').filter({ hasText: 'e2e unsent reply' });
    await expect(line).toContainText('Not sent');
    await expect(line).toContainText(MISSING);
    await line.getByRole('button', { name: 'Discard' }).click();
    await expect(line).toHaveCount(0);
  });

  test('a queue without P2 refuses search and new acts locally, and offers the way back', async ({ page }) => {
    // A pre-P2 site-api answers the queue without `window`.
    await page.route(/\/dev\/portal\/api\/admin\/comments\?/, async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      delete body.window;
      await route.fulfill({ response, json: body });
    });
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/admin/comments/')) writes.push(request.url());
    });

    await open(page, '/comments?status=held&q=crypto');
    await expect(page.locator('main').getByText(MISSING)).toBeVisible();
    await page.getByRole('button', { name: 'Clear search and filters' }).click();
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(rows(page).first()).toBeVisible();

    // Reject is P2 only: an older site-api would route it to a comment id.
    const [first] = await idsOf(page);
    await row(page, first).locator('[data-row-button]').click();
    await page.keyboard.press('s');
    await page.keyboard.press('1');
    await expect(toast(page, 'The comment was not updated')).toContainText(MISSING);
    await expect(row(page, first)).toBeVisible();
    expect(writes).toEqual([]);
    // A poll still in flight must not outlive the page it was rewriting.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });
});
