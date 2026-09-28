import type { Browser, Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';
import { resetPortalDemo } from './portal-demo';

/* The P6 screens in demo mode: the owner's message inbox, the reader
   accounts a ban blocked (Bans → Readers), per-post comment modes, and the
   comment pane's pin, lock and mode controls.

   Demo state lives in the dev server's memory and outlives a run, so the
   file resets it to the seed before and after (tests/e2e/portal-demo.ts).
   Within the file each test puts back what it changed through the demo API,
   in a `finally`, and acts that cannot be put back are answered by
   `page.route` instead: opening a new message reads it for good, and a
   restored reader has no way back. Run it against a server that is already
   up with E2E_REUSE_SERVER=1; the spec skips wherever demo mode is off. */

const PORTAL = '/dev/portal';
const API = `${PORTAL}/api/admin`;
/* "The inbox needs …", "Post modes need …". */
const MISSING = /needs? the updated site-api/;
const CACHE_NOTE = 'Changes reach cookie-less readers within about 90s.';

test.skip(Boolean(process.env.E2E_BASE_URL), 'Demo mode exists only on local astro dev.');

test.beforeAll(async ({ browser, playwright }, testInfo) => {
  await resetPortalDemo(playwright, String(testInfo.project.use.baseURL));
  const demo = await warmUp(browser, String(testInfo.project.use.baseURL));
  test.skip(!demo, 'Needs portal demo mode: astro dev without site-api.');
});

test.afterAll(async ({ playwright }, testInfo) => {
  await resetPortalDemo(playwright, String(testInfo.project.use.baseURL));
});

let pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(() => {
  expect(pageErrors, 'uncaught errors in the page').toEqual([]);
});

/** Loads the screens these tests use once, so Vite's first compile lands
    here. Returns whether the portal is in demo mode. */
async function warmUp(browser: Browser, baseURL: string): Promise<boolean> {
  const page = await browser.newPage({ baseURL });
  try {
    await page.goto(`${PORTAL}/messages`);
    const sidebar = page.locator('[data-sidebar="sidebar"]');
    await sidebar.waitFor({ timeout: 90_000 });
    if (!(await sidebar.getByText('Demo', { exact: true }).isVisible())) return false;
    for (const path of ['/messages', '/comments/bans?view=readers', '/comments/modes', '/comments?status=all']) {
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

const toast = (page: Page, title: string | RegExp) =>
  page.locator('[data-slot="toast-viewport"] > *').filter({ has: page.locator('[data-slot="toast-title"]').filter({ hasText: title }) });
/** A state tab (Inbox, Active…) by its label: a pressed-state button titled "Label (key)". */
const tab = (page: Page, name: string) => page.locator(`button[aria-pressed][title^="${name} ("]`);
const pathname = (page: Page): Promise<string> => page.evaluate(() => location.pathname);
/** The route answered the way a site-api without it answers. */
const missingRoute = (status: 404 | 405) => ({ status, contentType: 'text/plain', body: status === 404 ? 'Not Found' : '' });
/** Routes one exact API path, so a query string or a longer path is not caught. */
const apiPath = (path: string) => (url: URL) => url.pathname === `${API}/${path}`;

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

interface DemoMessage {
  id: string;
  state: string;
  displayName: string;
  emailHash: string | null;
  repliedAt: string | null;
}

interface MessageList {
  messages: DemoMessage[];
  counts: Record<string, number>;
}

const rows = (page: Page) => page.locator('main [data-row-id]');
const row = (page: Page, id: string) => page.locator(`main [data-row-id="${id}"]`);
const pane = (page: Page) => page.getByRole('complementary', { name: 'Message detail' });
const idsOf = (page: Page): Promise<string[]> => rows(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-row-id')!));
/** The open message, from `?m=`. */
const openId = (page: Page): Promise<string | null> => page.evaluate(() => new URLSearchParams(location.search).get('m'));
const inboxCount = (counts: Record<string, number>) => counts.new + counts.read + counts.replied;

async function messageList(page: Page): Promise<MessageList> {
  return (await page.request.get(`${API}/messages?limit=100`)).json() as Promise<MessageList>;
}

/** A demo message that fits, never a new one unless asked: opening a new
    message reads it for good. */
async function findMessage(page: Page, fits: (message: DemoMessage) => boolean): Promise<DemoMessage> {
  const hit = (await messageList(page)).messages.find(fits);
  expect(hit, 'the demo holds such a message').toBeTruthy();
  return hit!;
}

async function stateOf(page: Page, id: string): Promise<string> {
  const body = (await (await page.request.get(`${API}/messages/${id}`)).json()) as { message: DemoMessage };
  return body.message.state;
}

/** The pane's Sender section, and one of its rows by label. */
const senderSection = (page: Page) => pane(page).locator('section').filter({ has: page.getByRole('heading', { name: 'Sender', exact: true }) });
const senderRow = (page: Page, label: string) =>
  senderSection(page).locator('dl > div').filter({ has: page.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }) });
/** What a pivot key also reached: its addresses, devices and messages. */
const pivotProfile = (page: Page) => page.locator('dl[aria-label="Also under this key"]');
const profileLine = (page: Page, label: string) =>
  pivotProfile(page).locator('div').filter({ has: page.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }) });

/** Answers the `read` a new message sends when opened, so it stays new. */
async function keepNew(page: Page, message: DemoMessage): Promise<void> {
  await page.route(apiPath(`messages/${message.id}`), (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ json: { message: { ...message, state: 'read' }, changed: true } })
      : route.fallback(),
  );
}

/** Files a message back into the tray it started in. */
async function putBack(page: Page, message: DemoMessage): Promise<void> {
  const now = await stateOf(page, message.id);
  if (now === message.state) return;
  const post = (action: string) => page.request.post(`${API}/messages/${message.id}`, { data: { action } });
  if (now === 'archived') await post('unarchive');
  if (now === 'spam') await post('unspam');
  if (message.state === 'archived') await post('archive');
  if (message.state === 'spam') await post('spam');
}

test.describe('messages', () => {
  test('trays show their counts, and 1 to 3 switch them with Back returning', async ({ page }) => {
    const { counts } = await messageList(page);
    await open(page, '/messages');
    await expect(tab(page, 'Inbox')).toHaveAttribute('aria-pressed', 'true');
    await expect(tab(page, 'Inbox')).toHaveText(new RegExp(`^Inbox\\s*${inboxCount(counts)}$`));
    await expect(tab(page, 'Archived')).toHaveText(new RegExp(`^Archived\\s*${counts.archived}$`));
    await expect(tab(page, 'Spam')).toHaveText(new RegExp(`^Spam\\s*${counts.spam}$`));
    await expect(rows(page)).toHaveCount(inboxCount(counts));

    await page.keyboard.press('2');
    await expect(page).toHaveURL(/\/messages\?view=archived$/);
    await expect(rows(page)).toHaveCount(counts.archived);
    await expect(rows(page).filter({ hasNotText: 'Archived' })).toHaveCount(0);

    await page.keyboard.press('3');
    await expect(page).toHaveURL(/\/messages\?view=spam$/);
    await expect(rows(page)).toHaveCount(counts.spam);

    await page.goBack();
    await expect(tab(page, 'Archived')).toHaveAttribute('aria-pressed', 'true');
    await page.goBack();
    await expect(tab(page, 'Inbox')).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(inboxCount(counts));
  });

  test('E archives the open message and opens the next; Z puts it back in its place', async ({ page }) => {
    const sam = await findMessage(page, (message) => message.displayName === 'Sam Carter' && message.state === 'read');
    const { counts } = await messageList(page);
    try {
      await open(page, '/messages');
      await expect(row(page, sam.id)).toBeVisible();
      const before = await idsOf(page);
      const next = before[before.indexOf(sam.id) + 1];

      await row(page, sam.id).locator('[data-row-button]').click();
      await expect(pane(page).getByRole('heading', { name: 'Sam Carter' })).toBeVisible();
      await page.keyboard.press('e');

      // One step: the row leaves, the next message opens, the tray counts move.
      await expect(row(page, sam.id)).toHaveCount(0);
      expect(await openId(page)).toBe(next);
      await expect(row(page, next)).toHaveAttribute('data-active', 'true');
      await expect(toast(page, 'Archived')).toBeVisible();
      await expect(tab(page, 'Archived')).toHaveText(new RegExp(`^Archived\\s*${counts.archived + 1}$`));
      await expect.poll(() => stateOf(page, sam.id)).toBe('archived');

      await page.keyboard.press('z');
      await expect(row(page, sam.id)).toBeVisible();
      expect(await idsOf(page)).toEqual(before);
      await expect.poll(() => stateOf(page, sam.id)).toBe('read');
    } finally {
      await putBack(page, sam);
    }
  });

  test('! files spam from the Inbox, and Not spam in the Spam tray moves it back', async ({ page }) => {
    const tomasz = await findMessage(page, (message) => message.displayName === 'tomasz' && message.state === 'read');
    try {
      await open(page, '/messages');
      await row(page, tomasz.id).locator('[data-row-button]').click();
      await page.keyboard.press('!');
      await expect(row(page, tomasz.id)).toHaveCount(0);
      await expect(toast(page, 'Marked as spam')).toBeVisible();
      await expect.poll(() => stateOf(page, tomasz.id)).toBe('spam');

      await page.keyboard.press('3');
      await row(page, tomasz.id).locator('[data-row-button]').click();
      await pane(page).getByRole('button', { name: /Not spam/ }).click();
      await expect(row(page, tomasz.id)).toHaveCount(0);
      await expect(toast(page, 'Moved to Inbox, not spam')).toBeVisible();
      await expect.poll(() => stateOf(page, tomasz.id)).toBe('read');
    } finally {
      await putBack(page, tomasz);
    }
  });

  test('opening a new message reads it at once, quietly, and only once', async ({ page }) => {
    // A read message shown as new until its `read` goes out, which is
    // answered here: a real read cannot be undone.
    const target = await findMessage(page, (message) => message.displayName === '南风' && message.state === 'read');
    const { counts } = await messageList(page);
    const reads: string[] = [];
    let read = false;
    await page.route(apiPath('messages'), async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as MessageList;
      if (!read) {
        for (const message of body.messages) if (message.id === target.id) message.state = 'new';
        body.counts.new += 1;
        body.counts.read -= 1;
      }
      await route.fulfill({ response, json: body });
    });
    await page.route(apiPath(`messages/${target.id}`), async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      reads.push((route.request().postDataJSON() as { action: string }).action);
      read = true;
      await route.fulfill({ json: { message: { ...target, state: 'read' }, changed: true } });
    });

    await open(page, '/messages');
    const button = row(page, target.id).locator('[data-row-button]');
    await expect(button).toHaveAttribute('aria-label', 'Unread message from 南风, New');
    await expect(page.locator('main').getByText(`${counts.new + 1} unread`, { exact: true })).toBeVisible();

    await button.click();
    await expect(button).toHaveAttribute('aria-label', 'Message from 南风, Read');
    if (counts.new > 0) await expect(page.locator('main').getByText(`${counts.new} unread`, { exact: true })).toBeVisible();
    else await expect(page.locator('main').getByText(/ unread$/)).toHaveCount(0);
    await expect.poll(() => reads).toEqual(['read']);
    await expect(page.locator('[data-slot="toast-viewport"] > *')).toHaveCount(0);

    // Walking off and back does not read it again.
    await page.keyboard.press('j');
    await page.keyboard.press('k');
    await expect(row(page, target.id)).toHaveAttribute('data-active', 'true');
    await page.waitForTimeout(300);
    expect(reads).toEqual(['read']);
  });

  test('the pane says who a reply reaches before anything is typed', async ({ page }) => {
    const cases: Array<{ name: string; line: string | RegExp; blocked: boolean }> = [
      { name: 'Mira', line: 'A reply goes by email to mira.k@example.de', blocked: false },
      { name: '小林', line: 'Their address was never confirmed, or their reader was revoked. A reply cannot be sent until they confirm it.', blocked: true },
      { name: 'A reader', line: 'They left no address, so a reply cannot reach them.', blocked: true },
      { name: 'Priya', line: 'Their address bounced or reported mail as spam, so mail to it is blocked.', blocked: true },
    ];
    for (const { name, line, blocked } of cases) {
      const message = await findMessage(page, (entry) => entry.displayName === name && entry.state !== 'new');
      await open(page, `/messages?m=${message.id}`);
      await expect(pane(page).getByRole('heading', { name })).toBeVisible();
      await expect(pane(page).getByText(line)).toBeVisible();
      const composer = pane(page).getByRole('textbox', { name: `Reply to ${name} by email` });
      if (blocked) {
        await expect(composer).toBeDisabled();
        await expect(composer).toHaveAttribute('placeholder', 'A reply cannot reach this sender');
      } else {
        await expect(composer).toBeEnabled();
      }
      if (!message.emailHash) await expect(pane(page).getByText('No address, so nothing to match earlier messages on.')).toBeVisible();
    }
  });

  test('R and ⌘↵ send a reply that says where it went; a refused one says why and goes back to the box', async ({ page }) => {
    // Léa's answered message: another reply keeps it Replied and only moves
    // its reply time, so there is nothing to put back.
    const lea = await findMessage(page, (message) => message.displayName === 'Léa' && message.state === 'replied');
    await open(page, `/messages?m=${lea.id}`);
    await expect(pane(page).getByText('A reply goes by email to lea.m@example.fr')).toBeVisible();

    const composer = pane(page).getByRole('textbox', { name: 'Reply to Léa by email' });
    await page.keyboard.press('r');
    await expect(composer).toBeFocused();
    await page.keyboard.insertText('Some did, at first. e2e reply.');
    await page.keyboard.press('ControlOrMeta+Enter');
    const sent = pane(page).getByRole('list', { name: 'Your replies' });
    await expect(sent).toContainText('Sent to l***@example.fr');
    await expect(composer).toHaveValue('');

    // The address stops working between opening and sending.
    await page.route(apiPath(`messages/${lea.id}/reply`), (route: Route) =>
      route.fulfill({ status: 409, json: { error: 'unverified', message: 'unverified' } }),
    );
    await composer.fill('A second try.');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(sent).toContainText('Not sent');
    await expect(sent).toContainText('Their address was never confirmed, or their reader was revoked.');
    await sent.getByRole('button', { name: 'Edit' }).click();
    await expect(composer).toHaveValue('A second try.');
    await expect(composer).toBeFocused();
    await expect(sent).not.toContainText('Not sent');
  });

  test('an earlier message from the same address opens in the pane, from any tray', async ({ page }) => {
    const lea = await findMessage(page, (message) => message.displayName === 'Léa' && message.state === 'replied');
    await open(page, `/messages?m=${lea.id}`);
    const earlier = pane(page).getByRole('list', { name: 'Earlier from this address' });
    await expect(earlier.getByRole('button')).not.toHaveCount(0);
    const archived = earlier.getByRole('button').filter({ hasText: 'Archived' }).first();
    await archived.click();

    // The archived one is not an Inbox row, and still opens in place.
    await expect.poll(() => openId(page)).not.toBe(lea.id);
    await expect(pane(page).getByRole('heading', { name: 'Léa' })).toBeVisible();
    await expect(pane(page).getByRole('button', { name: /Move to Inbox/ })).toBeVisible();
    await expect(tab(page, 'Inbox')).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Escape');
    await expect(pane(page)).toHaveCount(0);
    expect(await pathname(page)).toBe(`${PORTAL}/messages`);
    expect(await openId(page)).toBeNull();
  });

  test('the Sender section shows each key and what shares it, and the device pivot lists her addresses', async ({ page }) => {
    const mira = await findMessage(page, (message) => message.displayName === 'Mira' && message.state === 'read');
    await open(page, `/messages?m=${mira.id}`);
    await expect(pane(page).getByText('Signed-in reader', { exact: true })).toBeVisible();
    await expect(senderRow(page, 'Signed-in address')).toContainText('mira.k@example.de');
    await expect(senderRow(page, 'Device')).toContainText('Firefox 131 on macOS');
    await expect(senderRow(page, 'Network')).toContainText('AS3320 Deutsche Telekom');

    // Her comments come from the same device: one link, both kinds counted.
    const device = senderRow(page, 'Device fingerprint').getByRole('link', { name: /^\d+ comments? · 3 messages$/ });
    await device.click();
    await expect(page).toHaveURL(/\/comments\?status=all&key=client_fp&value=/);
    await expect(profileLine(page, 'Addresses')).toContainText('mira.k@example.de');
    await expect(profileLine(page, 'Addresses')).toContainText('mira@posteo.de');
    await expect(profileLine(page, 'Addresses').getByText(/^signed in · 3 messages$/)).toBeVisible();
    await expect(profileLine(page, 'Messages').getByRole('link')).toHaveCount(3);
    await expect(profileLine(page, 'Devices')).toHaveCount(0);
  });

  test('a sender who typed a reader’s address is labelled typed, and never as that reader', async ({ page }) => {
    const typed = await findMessage(page, (message) => message.displayName === 'Mira K.');
    await keepNew(page, typed);
    await open(page, `/messages?m=${typed.id}`);
    await expect(pane(page).getByText('Typed a reader’s address', { exact: true })).toBeVisible();
    await expect(pane(page).getByText('Signed-in reader', { exact: true })).toHaveCount(0);
    await expect(senderRow(page, 'Signed-in address')).toHaveCount(0);
    const address = senderRow(page, 'Typed address');
    await expect(address).toContainText('mira.k@example.de');
    // The address is Mira's, and her three messages share it; the device is not.
    await expect(address.getByRole('link', { name: '4 messages' })).toBeVisible();
    await expect(senderRow(page, 'Device')).toContainText('Chrome 129 on Windows');
    await expect(senderRow(page, 'Device fingerprint')).toContainText('only this');
  });

  test('a pivot on an address lists the devices that typed it, and a device that typed it is not the reader', async ({ page }) => {
    const typed = await findMessage(page, (message) => message.displayName === 'Mira K.');
    await keepNew(page, typed);
    await open(page, `/comments?status=all&key=email&value=${typed.emailHash}`);
    await expect(page.locator('main code').filter({ hasText: 'mira.k@example.de' })).toBeVisible();
    await expect(profileLine(page, 'Messages').getByText(/^4: /)).toBeVisible();
    await expect(profileLine(page, 'Devices').getByRole('link')).toHaveText(['Firefox 131 on macOS', 'Chrome 129 on Windows']);

    await profileLine(page, 'Devices').getByRole('link', { name: 'Chrome 129 on Windows' }).click();
    await expect(page).toHaveURL(/\/comments\?status=all&key=client_fp&value=/);
    await expect(profileLine(page, 'Addresses').getByRole('link', { name: 'mira.k@example.de' })).toBeVisible();
    await expect(profileLine(page, 'Addresses').getByText('typed · 1 message', { exact: true })).toBeVisible();

    await profileLine(page, 'Messages').getByRole('link', { name: /^Mira K\.: / }).click();
    await expect(pane(page).getByRole('heading', { name: 'Mira K.' })).toBeVisible();
    expect(await openId(page)).toBe(typed.id);
  });

  test('B bans the sender and files the message as spam, and Undo lifts both', async ({ page }) => {
    const jie = await findMessage(page, (message) => message.displayName === '阿杰' && message.state === 'replied');
    const addressBanned = async () => {
      const { bans } = (await (await page.request.get(`${API}/bans`)).json()) as { bans: Array<{ keyValue: string }> };
      return bans.some((ban) => ban.keyValue === jie.emailHash);
    };
    try {
      await open(page, `/messages?m=${jie.id}`);
      // B needs the sender, which comes with the detail.
      await expect(senderSection(page)).toBeVisible();
      await page.keyboard.press('b');
      const dialog = page.getByRole('dialog', { name: 'Ban this sender' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(/^Files this message as spam\./)).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'This comment', exact: true })).toHaveCount(0);

      await page.keyboard.press('Enter');
      await expect(dialog).toBeHidden();
      await expect(row(page, jie.id)).toHaveCount(0);
      await expect.poll(() => stateOf(page, jie.id)).toBe('spam');
      expect(await addressBanned()).toBe(true);

      await toast(page, /^Banned \d+ keys? and filed the message as spam$/).getByRole('button', { name: 'Undo' }).click();
      await expect(toast(page, 'Ban lifted and the message taken out of spam')).toBeVisible();
      await expect.poll(() => stateOf(page, jie.id)).toBe('replied');
      await expect.poll(addressBanned).toBe(false);
      await expect(row(page, jie.id)).toBeVisible();
    } finally {
      await putBack(page, jie);
    }
  });

  test('a link names a message and lands in the tray that holds it', async ({ page }) => {
    // Telegram links `?m=<id>` alone; the pane opens in whichever tray holds it.
    const inbox = await findMessage(page, (message) => message.state === 'read');
    await open(page, `/messages?m=${inbox.id}`);
    await expect(pane(page).getByRole('heading', { name: inbox.displayName })).toBeVisible();
    await expect(row(page, inbox.id)).toHaveAttribute('data-active', 'true');
    await expect(tab(page, 'Inbox')).toHaveAttribute('aria-pressed', 'true');

    const archived = await findMessage(page, (message) => message.state === 'archived');
    await open(page, `/messages?m=${archived.id}`);
    await expect(tab(page, 'Archived')).toHaveAttribute('aria-pressed', 'true');
    await expect(row(page, archived.id)).toHaveAttribute('data-active', 'true');
    await expect(pane(page).getByRole('heading', { name: archived.displayName })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/messages\\?view=archived&m=${archived.id}$`));

    // Closing drops `m` and keeps the tray.
    await page.keyboard.press('Escape');
    await expect(pane(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/messages\?view=archived$/);

    // The older forms, `/messages/<id>` and `#<id>`, become `?m=`.
    await open(page, `/messages/${archived.id}`);
    await expect(page).toHaveURL(new RegExp(`/messages\\?view=archived&m=${archived.id}$`));
    await open(page, `/messages#${inbox.id}`);
    await expect(page).toHaveURL(new RegExp(`/messages\\?m=${inbox.id}$`));
    await expect(pane(page).getByRole('heading', { name: inbox.displayName })).toBeVisible();

    // A message that is in no tray says so, in place of a pane.
    await open(page, '/messages?m=01J9MSG9999NOSUCHMESSAGE00');
    const note = page.getByRole('status').filter({ hasText: 'There is no message with that id.' });
    await expect(note).toBeVisible();
    await expect(pane(page)).toHaveCount(0);
    await note.getByRole('button', { name: 'Close' }).click();
    await expect(page).toHaveURL(/\/messages$/);
  });

  test('each tray asks site-api for its own state, Inbox for state=inbox, and the other two warm', async ({ page }) => {
    const states: Array<string | null> = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === `${API}/messages`) states.push(url.searchParams.get('state'));
    });
    const { counts } = await messageList(page);
    await open(page, '/messages');
    await expect(rows(page)).toHaveCount(inboxCount(counts));
    expect(states[0]).toBe('inbox');
    // Once idle, Archived and Spam are read ahead, so switching paints from cache.
    await expect.poll(() => [...new Set(states)].sort()).toEqual(['archived', 'inbox', 'spam']);

    await page.keyboard.press('2');
    await expect(rows(page)).toHaveCount(counts.archived);
    await expect(rows(page).filter({ hasNotText: 'Archived' })).toHaveCount(0);
    expect(states).not.toContain(null);
  });

  test('a site-api from before state=inbox says so in the Inbox, and the other trays still work', async ({ page }) => {
    await page.route(
      (url) => url.pathname === `${API}/messages` && url.searchParams.get('state') === 'inbox',
      (route) => route.fulfill({ status: 400, json: { error: 'invalid_state', message: 'invalid_state' } }),
    );
    const { counts } = await messageList(page);
    await open(page, '/messages');
    await expect(page.getByRole('status').filter({ hasText: MISSING })).toBeVisible();
    await page.keyboard.press('3');
    await expect(rows(page)).toHaveCount(counts.spam);
  });

  test('a site-api without the inbox says so in place of the list', async ({ page }) => {
    await page.route((url) => url.pathname.startsWith(`${API}/messages`), (route) => route.fulfill(missingRoute(404)));
    await open(page, '/messages');
    await expect(page.getByRole('status').filter({ hasText: MISSING })).toBeVisible();
    await expect(tab(page, 'Inbox')).toHaveText(/^Inbox$/);
  });

  test('a filing act the site-api lacks puts the row back and says why', async ({ page }) => {
    const sam = await findMessage(page, (message) => message.displayName === 'Sam Carter' && message.state === 'read');
    await page.route(apiPath(`messages/${sam.id}`), (route) =>
      route.request().method() === 'POST' ? route.fulfill(missingRoute(405)) : route.fallback(),
    );
    await open(page, '/messages');
    const before = await idsOf(page);
    await row(page, sam.id).locator('[data-row-button]').click();
    await page.keyboard.press('e');

    const failed = toast(page, 'Archived did not go through');
    await expect(failed).toBeVisible();
    await expect(failed).toContainText(MISSING);
    await expect(row(page, sam.id)).toBeVisible();
    expect(await idsOf(page)).toEqual(before);
    expect(await stateOf(page, sam.id)).toBe('read');
  });
});

/* ------------------------------------------------------------------ */
/* Revoked readers                                                     */
/* ------------------------------------------------------------------ */

interface DemoReader {
  readerId: string;
  emailHash: string;
  email: string;
  displayName: string | null;
}

interface DemoBan {
  keyType: string;
  keyValue: string;
  expiresAt: string | null;
}

const readerRow = (page: Page, readerId: string) => page.locator(`[id="reader-${readerId}"]`);
const readerIds = (page: Page): Promise<string[]> =>
  page.locator('[data-readers] [role="row"][id^="reader-"]').evaluateAll((nodes) => nodes.map((node) => node.id.slice('reader-'.length)));

async function revokedReaders(page: Page): Promise<DemoReader[]> {
  const body = (await (await page.request.get(`${API}/readers/revoked`)).json()) as { readers: DemoReader[] };
  return body.readers;
}

/** Answers every restore without touching the demo: a restored reader has
    no way back to revoked. Returns the reader ids restored, in order. */
async function answerRestores(page: Page): Promise<string[]> {
  const restored: string[] = [];
  await page.route((url) => /\/api\/admin\/readers\/[^/]+\/restore$/.test(url.pathname), async (route) => {
    const readerId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2)!);
    restored.push(readerId);
    await route.fulfill({ json: { readerId, restoredAt: new Date().toISOString() } });
  });
  return restored;
}

test.describe('revoked readers', () => {
  test('4, J, R and Enter restore a reader; the row stays, marked, in its place', async ({ page }) => {
    const readers = await revokedReaders(page);
    expect(readers.length, 'the demo holds revoked readers').toBeGreaterThan(1);
    const restored = await answerRestores(page);

    await open(page, '/comments/bans');
    await page.keyboard.press('4');
    await expect(page).toHaveURL(/view=readers/);
    await expect(tab(page, 'Readers')).toHaveText(new RegExp(`^Readers\\s*${readers.length}$`));
    const before = await readerIds(page);
    expect(before).toEqual(readers.map((reader) => reader.readerId));

    const first = readers[0];
    const name = first.displayName ?? 'No name';
    await page.keyboard.press('j');
    await expect(readerRow(page, first.readerId)).toHaveAttribute('data-active', 'true');
    await page.keyboard.press('r');
    await expect(page.getByRole('button', { name: `Confirm: restore ${name}` })).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(readerRow(page, first.readerId)).toContainText('Restored');
    await expect(toast(page, `Restored ${first.displayName ?? first.email}`)).toBeVisible();
    expect(restored).toEqual([first.readerId]);
    expect(await readerIds(page)).toEqual(before);
  });

  test('Restore asks once in the row; Escape takes the question back', async ({ page }) => {
    const readers = await revokedReaders(page);
    const last = readers.at(-1)!;
    const name = last.displayName ?? 'No name';
    const restored = await answerRestores(page);

    await open(page, '/comments/bans?view=readers');
    const target = readerRow(page, last.readerId);
    await target.getByRole('button', { name: 'Restore…' }).click();
    await expect(target.getByRole('button', { name: `Confirm: restore ${name}` })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(target.getByRole('button', { name: 'Restore…' })).toBeVisible();
    expect(restored).toEqual([]);

    await target.getByRole('button', { name: 'Restore…' }).click();
    await target.getByRole('button', { name: `Confirm: restore ${name}` }).click();
    await expect(target).toContainText('Restored');
    expect(restored).toEqual([last.readerId]);
  });

  test('an email ban that outlives the restore shows on its row, with its own Lift', async ({ page }) => {
    const readers = await revokedReaders(page);
    const bans = ((await (await page.request.get(`${API}/bans`)).json()) as { bans: DemoBan[] }).bans;
    const now = Date.now();
    const banned = new Set(
      bans.filter((ban) => ban.keyType === 'email' && (!ban.expiresAt || Date.parse(ban.expiresAt) > now)).map((ban) => ban.keyValue),
    );
    const flagged = readers.find((reader) => banned.has(reader.emailHash));
    const clear = readers.find((reader) => !banned.has(reader.emailHash));
    expect(flagged && clear, 'the demo holds a reader with an email ban and one without').toBeTruthy();

    await open(page, '/comments/bans?view=readers');
    const name = flagged!.displayName ?? 'No name';
    await expect(readerRow(page, flagged!.readerId)).toContainText('Email ban');
    await expect(readerRow(page, flagged!.readerId).getByRole('button', { name: `Lift the email ban on ${name}` })).toBeVisible();
    await expect(readerRow(page, clear!.readerId)).toContainText('No email ban');
  });

  test('a site-api without the readers route says so in the tab, and the rest of Bans works', async ({ page }) => {
    await page.route(apiPath('readers/revoked'), (route) => route.fulfill(missingRoute(404)));
    await open(page, '/comments/bans?view=readers');
    await expect(page.getByRole('status').filter({ hasText: MISSING })).toBeVisible();
    await expect(tab(page, 'Readers')).toHaveText(/^Readers$/);
    await page.keyboard.press('1');
    await expect(tab(page, 'Active')).toHaveAttribute('aria-pressed', 'true');
  });
});

/* ------------------------------------------------------------------ */
/* Per-post comment modes                                              */
/* ------------------------------------------------------------------ */

interface DemoModeState {
  surface: string;
  postId: string;
  override: string | null;
  tagMode: string | null;
  effectiveMode: string | null;
  updatedAt: string | null;
  title: string | null;
  slug: string | null;
}

const MODE_LABELS: Record<string, string> = { open: 'Open', readonly: 'Read-only', off: 'Off' };
/** Cells carry phone-only labels ("Tags give ") that CSS hides on a wide list. */
const INNER = { useInnerText: true };
const modeRow = (page: Page, state: Pick<DemoModeState, 'surface' | 'postId'>) => page.locator(`[data-mode-row="${state.surface}:${state.postId}"]`);
const radio = (page: Page, state: DemoModeState, label: string) => modeRow(page, state).getByRole('radio', { name: label, exact: true });
/** Cells: post, where, tags give, override, readers get, changed. */
const readersGet = (page: Page, state: DemoModeState) => modeRow(page, state).getByRole('cell').nth(4);
const modeIds = (page: Page): Promise<string[]> => page.locator('[data-mode-row]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-mode-row')!));

async function modeList(page: Page): Promise<DemoModeState[]> {
  return ((await (await page.request.get(`${API}/comment-modes`)).json()) as { modes: DemoModeState[] }).modes;
}

async function overrideOf(page: Page, surface: string, postId: string): Promise<string | null> {
  const body = (await (await page.request.get(`${API}/comment-modes/${surface}/${postId}`)).json()) as { mode: DemoModeState };
  return body.mode.override;
}

async function setOverride(page: Page, surface: string, postId: string, mode: string | null): Promise<void> {
  const path = `${API}/comment-modes/${surface}/${postId}`;
  if (mode) await page.request.put(path, { data: { mode } });
  else await page.request.delete(path);
}

test.describe('post modes', () => {
  test('lists every override, newest first, with what tags give and what readers get', async ({ page }) => {
    const modes = await modeList(page);
    expect(modes.length, 'the demo holds overrides').toBeGreaterThan(0);
    await open(page, '/comments/modes');
    await expect(page.getByText(CACHE_NOTE)).toBeVisible();
    await expect(page.getByRole('table', { name: 'Overridden posts' })).toBeVisible();

    const newest = modes.slice().sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || `${a.surface}:${a.postId}`.localeCompare(`${b.surface}:${b.postId}`));
    expect(await modeIds(page)).toEqual(newest.map((state) => `${state.surface}:${state.postId}`));
    for (const state of modes) {
      await expect(radio(page, state, MODE_LABELS[state.override!])).toHaveAttribute('aria-checked', 'true');
      await expect(modeRow(page, state).getByRole('cell').nth(2)).toHaveText(state.tagMode ? MODE_LABELS[state.tagMode] : 'Unknown', INNER);
      await expect(readersGet(page, state)).toHaveText(state.effectiveMode ? MODE_LABELS[state.effectiveMode] : 'Unknown', INNER);
    }
  });

  test('one click changes an override in place, Z undoes it, and Default hands it back to its tags', async ({ page }) => {
    const state = (await modeList(page)).find((entry) => entry.slug === 'retry-budget');
    expect(state, 'the demo overrides retry-budget').toBeTruthy();
    const target = state!;
    try {
      await open(page, '/comments/modes');
      const order = await modeIds(page);

      await radio(page, target, 'Off').click();
      await expect(radio(page, target, 'Off')).toHaveAttribute('aria-checked', 'true');
      await expect(readersGet(page, target)).toHaveText('Off', INNER);
      const changed = toast(page, `Off on “${target.title}”`);
      await expect(changed).toBeVisible();
      await expect(changed).toContainText(CACHE_NOTE);
      expect(await modeIds(page)).toEqual(order);
      await expect.poll(() => overrideOf(page, target.surface, target.postId)).toBe('off');

      await page.keyboard.press('z');
      await expect(radio(page, target, MODE_LABELS[target.override!])).toHaveAttribute('aria-checked', 'true');
      await expect.poll(() => overrideOf(page, target.surface, target.postId)).toBe(target.override);

      // Cleared, the row stays until the screen is left, showing its tags.
      await radio(page, target, 'Default').click();
      await expect(readersGet(page, target)).toHaveText(MODE_LABELS[target.tagMode!], INNER);
      const cleared = toast(page, `“${target.title}” follows its tags again`);
      await expect(cleared).toContainText(CACHE_NOTE);
      expect(await modeIds(page)).toEqual(order);
      await expect.poll(() => overrideOf(page, target.surface, target.postId)).toBeNull();

      await cleared.getByRole('button', { name: 'Undo' }).click();
      await expect(radio(page, target, MODE_LABELS[target.override!])).toHaveAttribute('aria-checked', 'true');
      await expect.poll(() => overrideOf(page, target.surface, target.postId)).toBe(target.override);
    } finally {
      await setOverride(page, target.surface, target.postId, target.override);
    }
  });

  test('a search finds a post with no override, sets one, and it joins the list on top', async ({ page }) => {
    const target = { surface: 'blog', postId: '66f1ad980000000000000000', title: 'Astro migration effect sandbox' };
    await setOverride(page, target.surface, target.postId, null);
    try {
      await open(page, '/comments/modes');
      await page.keyboard.press('/');
      await page.keyboard.insertText('sandbox');
      const found = modeRow(page, target);
      await expect(found.getByRole('radio', { name: 'Default', exact: true })).toHaveAttribute('aria-checked', 'true');
      await expect(found.getByRole('cell').nth(2)).toHaveText('Off', INNER);

      await found.getByRole('radio', { name: 'Read-only', exact: true }).click();
      await expect(found.getByRole('cell').nth(4)).toHaveText('Read-only', INNER);
      await expect(toast(page, `Read-only on “${target.title}”`)).toContainText(CACHE_NOTE);
      await expect.poll(() => overrideOf(page, target.surface, target.postId)).toBe('readonly');

      await page.getByRole('searchbox', { name: 'Find a post' }).press('Escape');
      await expect(page.getByRole('table', { name: 'Overridden posts' })).toBeVisible();
      expect((await modeIds(page))[0]).toBe(`${target.surface}:${target.postId}`);
    } finally {
      await setOverride(page, target.surface, target.postId, null);
    }
  });

  test('a pasted id that is no post says so in its row', async ({ page }) => {
    await open(page, '/comments/modes');
    await page.getByRole('searchbox', { name: 'Find a post' }).fill('6600dead00000000000000fe');
    await expect(page.locator('[data-mode-row="blog:6600dead00000000000000fe"]')).toContainText('No published post has this id.');
  });

  test('a site-api without the modes routes says so, and a failed change rolls back', async ({ page }) => {
    const list = apiPath('comment-modes');
    await page.route(list, (route) => route.fulfill(missingRoute(404)));
    await open(page, '/comments/modes');
    await expect(page.getByRole('status').filter({ hasText: MISSING })).toBeVisible();
    await page.unroute(list);

    const target = (await modeList(page)).find((entry) => entry.slug === 'retry-budget')!;
    await page.route((url) => url.pathname.startsWith(`${API}/comment-modes/`), (route) =>
      route.request().method() === 'GET' ? route.fallback() : route.fulfill(missingRoute(405)),
    );
    await page.reload();
    await radio(page, target, 'Off').click();
    const failed = toast(page, `The mode of “${target.title}” did not change`);
    await expect(failed).toContainText(MISSING);
    await expect(radio(page, target, MODE_LABELS[target.override!])).toHaveAttribute('aria-checked', 'true');
    expect(await overrideOf(page, target.surface, target.postId)).toBe(target.override);
  });
});

/* ------------------------------------------------------------------ */
/* Pin, lock and mode from the comment pane                            */
/* ------------------------------------------------------------------ */

interface DemoComment {
  id: string;
  parentId: string | null;
  status: string;
  author: string;
  postId: string;
  postTitle: string | null;
  surface?: string;
  pinnedAt?: string | null;
  lockedAt?: string | null;
}

const COMMENTS = `${API}/comments`;
const commentRow = (page: Page, id: string) => page.locator(`main [data-row-id="${id}"]`);
/** The row's button, whose name carries its status and marks. */
const rowButton = (page: Page, id: string) => commentRow(page, id).locator('[data-row-button]');
const commentPane = (page: Page) => page.getByRole('complementary', { name: 'Comment detail' });
const paneHeader = (page: Page) => commentPane(page).locator('header');
const pinToggle = (page: Page) => commentPane(page).getByRole('button', { name: 'Pin (P)' });
const lockToggle = (page: Page) => commentPane(page).getByRole('button', { name: 'Lock replies (L)' });
const loadedIds = (page: Page): Promise<string[]> =>
  page.locator('main [data-row-id]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-row-id')!));

async function demoComments(page: Page): Promise<DemoComment[]> {
  const response = await page.request.get(COMMENTS, { params: { status: 'all', limit: 100 } });
  return ((await response.json()) as { comments: DemoComment[] }).comments;
}

async function pinnedNow(page: Page, id: string): Promise<boolean> {
  return Boolean((await demoComments(page)).find((comment) => comment.id === id)?.pinnedAt);
}

async function lockedNow(page: Page, id: string): Promise<boolean> {
  return Boolean((await demoComments(page)).find((comment) => comment.id === id)?.lockedAt);
}

/** Puts every pin and lock back the way `before` had them. */
async function putControlsBack(page: Page, before: DemoComment[]): Promise<void> {
  const now = new Map((await demoComments(page)).map((comment) => [comment.id, comment]));
  for (const was of before) {
    const is = now.get(was.id);
    if (!is) continue;
    if (Boolean(was.pinnedAt) !== Boolean(is.pinnedAt)) await page.request[was.pinnedAt ? 'put' : 'delete'](`${COMMENTS}/${was.id}/pin`);
    if (Boolean(was.lockedAt) !== Boolean(is.lockedAt)) await page.request[was.lockedAt ? 'put' : 'delete'](`${COMMENTS}/${was.id}/lock`);
  }
}

const isRoot = (comment: DemoComment) => comment.parentId === null && comment.status === 'published';

test.describe('pin, lock and mode in the comment pane', () => {
  test('P pins a first comment in the frame, taking the post pin from another; Z gives it back', async ({ page }) => {
    const before = await demoComments(page);
    const pinned = before.find((comment) => comment.pinnedAt);
    expect(pinned, 'the demo pins a comment').toBeTruthy();
    const holder = pinned!;
    try {
      await open(page, '/comments?status=all');
      const loaded = new Set(await loadedIds(page));
      const target = before.find((comment) => isRoot(comment) && !comment.pinnedAt && comment.postId === holder.postId && loaded.has(comment.id));
      expect(target, 'another loaded first comment on the pinned post').toBeTruthy();
      const { id, postTitle } = target!;
      await expect(rowButton(page, holder.id)).toHaveAttribute('aria-label', /, pinned/);

      await rowButton(page, id).click();
      await expect(pinToggle(page)).toHaveAttribute('aria-pressed', 'false');
      await page.keyboard.press('p');
      await expect(pinToggle(page)).toHaveAttribute('aria-pressed', 'true');
      await expect(paneHeader(page)).toContainText('Pinned');
      await expect(rowButton(page, id)).toHaveAttribute('aria-label', /, pinned/);
      await expect(rowButton(page, holder.id)).not.toHaveAttribute('aria-label', /, pinned/);
      const receipt = toast(page, `Pinned to the top of “${postTitle}”`);
      await expect(receipt).toContainText(`It replaces ${holder.author}’s pin.`);
      await expect(receipt).toContainText(CACHE_NOTE);
      await expect.poll(() => pinnedNow(page, id)).toBe(true);
      expect(await pinnedNow(page, holder.id)).toBe(false);
      // The row kept its place and its one 44px line.
      expect(await loadedIds(page)).toEqual([...loaded]);
      expect((await commentRow(page, id).boundingBox())!.height).toBeLessThanOrEqual(44);

      await page.keyboard.press('z');
      await expect(pinToggle(page)).toHaveAttribute('aria-pressed', 'false');
      await expect(rowButton(page, holder.id)).toHaveAttribute('aria-label', /, pinned/);
      await expect.poll(() => pinnedNow(page, holder.id)).toBe(true);
      expect(await pinnedNow(page, id)).toBe(false);
    } finally {
      await putControlsBack(page, before);
    }
  });

  test('the pin toggle unpins, and Undo on the receipt pins it again', async ({ page }) => {
    const before = await demoComments(page);
    const pinned = before.find((comment) => comment.pinnedAt)!;
    try {
      await open(page, `/comments?status=all&c=${pinned.id}`);
      await expect(pinToggle(page)).toHaveAttribute('aria-pressed', 'true');
      await pinToggle(page).click();
      await expect(pinToggle(page)).toHaveAttribute('aria-pressed', 'false');
      await expect(paneHeader(page)).not.toContainText('Pinned');
      await expect(rowButton(page, pinned.id)).not.toHaveAttribute('aria-label', /, pinned/);
      const receipt = toast(page, `Unpinned from “${pinned.postTitle}”`);
      await expect(receipt).toContainText(CACHE_NOTE);
      await expect.poll(() => pinnedNow(page, pinned.id)).toBe(false);

      await receipt.getByRole('button', { name: 'Undo' }).click();
      await expect(pinToggle(page)).toHaveAttribute('aria-pressed', 'true');
      await expect(rowButton(page, pinned.id)).toHaveAttribute('aria-label', /, pinned/);
      await expect.poll(() => pinnedNow(page, pinned.id)).toBe(true);
    } finally {
      await putControlsBack(page, before);
    }
  });

  test('L on a reply locks its thread; the toggle unlocks and locks again, and both undo', async ({ page }) => {
    const before = await demoComments(page);
    try {
      await open(page, '/comments?status=all');
      const loaded = new Set(await loadedIds(page));
      const reply = before.find((comment) => {
        const root = before.find((row) => row.id === comment.parentId);
        return comment.status === 'published' && root && isRoot(root) && !root.lockedAt && loaded.has(comment.id) && loaded.has(root.id);
      });
      expect(reply, 'a loaded published reply under a loaded, unlocked first comment').toBeTruthy();
      const root = before.find((row) => row.id === reply!.parentId)!;

      await rowButton(page, reply!.id).click();
      await expect(lockToggle(page)).toHaveAttribute('aria-pressed', 'false');
      await page.keyboard.press('l');
      await expect(lockToggle(page)).toHaveAttribute('aria-pressed', 'true');
      await expect(paneHeader(page)).toContainText('Locked');
      await expect(rowButton(page, root.id)).toHaveAttribute('aria-label', /, replies locked/);
      await expect(commentPane(page)).toContainText('Replies are locked for readers; yours still publishes');
      const locked = toast(page, 'Replies locked');
      await expect(locked).toContainText(`Readers can no longer reply under ${root.author}’s comment.`);
      await expect(locked).toContainText(CACHE_NOTE);
      await expect.poll(() => lockedNow(page, root.id)).toBe(true);

      await page.keyboard.press('z');
      await expect(lockToggle(page)).toHaveAttribute('aria-pressed', 'false');
      await expect(rowButton(page, root.id)).not.toHaveAttribute('aria-label', /, replies locked/);
      await expect.poll(() => lockedNow(page, root.id)).toBe(false);

      await lockToggle(page).click();
      await expect(lockToggle(page)).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => lockedNow(page, root.id)).toBe(true);
      await lockToggle(page).click();
      await expect(lockToggle(page)).toHaveAttribute('aria-pressed', 'false');
      const unlocked = toast(page, 'Replies unlocked');
      await expect(unlocked).toContainText(CACHE_NOTE);
      await expect.poll(() => lockedNow(page, root.id)).toBe(false);

      await unlocked.getByRole('button', { name: 'Undo' }).click();
      await expect(lockToggle(page)).toHaveAttribute('aria-pressed', 'true');
      await expect(rowButton(page, root.id)).toHaveAttribute('aria-label', /, replies locked/);
      await expect.poll(() => lockedNow(page, root.id)).toBe(true);
    } finally {
      await putControlsBack(page, before);
    }
  });

  test('the post line sets the post mode with Undo, and Post modes shows the same', async ({ page }) => {
    const comment = (await demoComments(page)).find((row) => row.pinnedAt)!;
    const surface = comment.surface ?? 'blog';
    const start = await overrideOf(page, surface, comment.postId);
    const next = start === 'readonly' ? 'open' : 'readonly';
    const label = MODE_LABELS[next];
    const group = commentPane(page).getByRole('radiogroup', { name: `Comment mode for ${comment.postTitle}` });
    const choice = (name: string) => group.getByRole('radio', { name, exact: true });
    try {
      await open(page, `/comments?status=all&c=${comment.id}`);
      await expect(choice(start ? MODE_LABELS[start] : 'Default')).toHaveAttribute('aria-checked', 'true');
      await expect(commentPane(page)).toContainText(/Tags give\s*(Open|Read-only|Off)/);

      await choice(label).click();
      await expect(choice(label)).toHaveAttribute('aria-checked', 'true');
      const receipt = toast(page, `${label} on “${comment.postTitle}”`);
      await expect(receipt).toContainText(CACHE_NOTE);
      await expect.poll(() => overrideOf(page, surface, comment.postId)).toBe(next);

      await receipt.getByRole('button', { name: 'Undo' }).click();
      await expect(choice(start ? MODE_LABELS[start] : 'Default')).toHaveAttribute('aria-checked', 'true');
      await expect.poll(() => overrideOf(page, surface, comment.postId)).toBe(start);

      // Set again, then Post modes shows it, and Back returns to the pane.
      await choice(label).click();
      await expect.poll(() => overrideOf(page, surface, comment.postId)).toBe(next);
      await page.locator('[data-sidebar="sidebar"]').getByRole('link', { name: 'Post modes' }).click();
      await expect(radio(page, { surface, postId: comment.postId } as DemoModeState, label)).toHaveAttribute('aria-checked', 'true');
      await page.goBack();
      await expect(choice(label)).toHaveAttribute('aria-checked', 'true');
    } finally {
      await setOverride(page, surface, comment.postId, start);
    }
  });

  test('? lists P and L; P on a reply says why not; a refused pin rolls back with the reason', async ({ page }) => {
    const before = await demoComments(page);
    await open(page, '/comments?status=all');
    await page.keyboard.press('?');
    const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(shortcuts).toContainText('Pin to the top of its post, or unpin');
    await expect(shortcuts).toContainText('Lock or unlock replies to the thread');
    await page.keyboard.press('Escape');
    await expect(shortcuts).toBeHidden();

    const loaded = new Set(await loadedIds(page));
    const reply = before.find((comment) => comment.parentId && comment.status === 'published' && loaded.has(comment.id))!;
    await rowButton(page, reply.id).click();
    await expect(pinToggle(page)).toHaveCount(0);
    await page.keyboard.press('p');
    await expect(toast(page, 'Only a published first comment can be pinned')).toContainText('Pin the comment this one answers.');

    const target = before.find((comment) => isRoot(comment) && !comment.pinnedAt && loaded.has(comment.id))!;
    await page.route((url) => url.pathname === `${COMMENTS}/${target.id}/pin`, (route) => route.fulfill(missingRoute(405)));
    await rowButton(page, target.id).click();
    await pinToggle(page).click();
    await expect(toast(page, 'The comment was not pinned')).toContainText(MISSING);
    await expect(pinToggle(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(rowButton(page, target.id)).not.toHaveAttribute('aria-label', /, pinned/);
    expect(await pinnedNow(page, target.id)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

test.describe('p6 wiring', () => {
  test('G I opens Messages, ? lists its keys, and the palette reaches Post modes', async ({ page }) => {
    await open(page, '/comments');
    await page.keyboard.press('g');
    await page.keyboard.press('i');
    await expect(page.getByRole('heading', { level: 1, name: 'Messages', exact: true })).toBeVisible();
    expect(await pathname(page)).toBe(`${PORTAL}/messages`);

    await page.keyboard.press('?');
    const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(shortcuts).toContainText('Archive, or move back to Inbox');
    await page.keyboard.press('Escape');
    await expect(shortcuts).toBeHidden();

    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.insertText('post modes');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Post modes', exact: true })).toBeVisible();
  });
});
