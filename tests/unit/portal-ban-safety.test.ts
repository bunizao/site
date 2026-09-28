/* The ban-safety rules the retired admin/ui dialogs were tested for, held
   against the live portal modules. Pure rules run in bun; the dialogs and
   screens run in Chromium from tests/unit/portal-ban-harness.tsx, against
   routed /dev/portal/api responses. A `test.todo` is a rule the old dialog
   enforced and the live one does not: it keeps the old assertion so
   `bun test --todo` shows the gap, and it is reported rather than softened. */

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { chromium, type Browser, type Page } from '@playwright/test';
import { join } from 'node:path';
import type { AdminCommentActor, AdminCommentQuality } from '@bunizao/contracts';
import { DEMO_COMMENTS, DEMO_COMMENT_INSIGHTS, demoActor } from '@/features/admin/server/portal-demo';
import {
  deleteScope,
  fingerprintSweepKey,
  identityDetail,
  identityStatus,
  impactHold,
  sourceBanKey,
  type IdentityStatus,
} from '@/features/portal/comments/model';
import { formatShare } from '@/features/portal/moderation/format';

// Each browser scenario mounts a fresh page; a cold Chromium needs more than bun's 5s.
setDefaultTimeout(20_000);

let browser: Browser;
let source: string;

beforeAll(async () => {
  const root = join(import.meta.dir, '../..');
  const build = await Bun.build({
    entrypoints: [join(import.meta.dir, 'portal-ban-harness.tsx')],
    target: 'browser',
    format: 'esm',
    tsconfig: join(root, 'tsconfig.json'),
    // The dev-only demo switches in app/api.ts read import.meta.env.
    define: { 'import.meta.env.DEV': 'false' },
  });
  if (!build.success) throw new AggregateError(build.logs, 'Could not bundle the portal harness');
  source = await build.outputs[0].text();
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL, headless: true });
}, 30_000);

afterAll(async () => {
  await browser?.close();
});

type Call = { path: string; method: string; body: any };

/** Waits for a request the page makes on its own, such as the impact read. */
async function until(check: () => boolean, ms = 5_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the page');
    await Bun.sleep(20);
  }
}
type Answer = (call: Call) => unknown;

const impact = (purgeAllowed = true) => ({
  accounts: 0, sessions: 2, comments: { total: 7, published: 2, held: 5, rejected: 0, deleted: 0 },
  reactions: 9, purge: { comments: 7, reactions: 9 }, windowDays: 90, purgeLimit: 500, purgeAllowed,
});

/** Answers the ban routes every scenario touches; `answer` can override any path. */
function defaultAnswer(call: Call, purgeAllowed: boolean): unknown {
  if (call.path.endsWith('/admin/bans/preview')) return impact(purgeAllowed);
  if (call.method === 'POST' && call.path.endsWith('/admin/bans')) return { bans: [], purged: { comments: 0, reactions: 0 } };
  return null;
}

async function fixture(
  url: string,
  run: (page: Page, calls: Call[]) => Promise<void>,
  { answer, purgeAllowed = true }: { answer?: Answer; purgeAllowed?: boolean } = {},
) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const calls: Call[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    if (target.pathname.startsWith('/dev/portal/api/')) {
      const call = { path: target.pathname, method: request.method(), body: request.postData() ? request.postDataJSON() : null };
      calls.push(call);
      const json = answer?.(call) ?? defaultAnswer(call, purgeAllowed);
      if (json === null || json === undefined) await route.fulfill({ status: 404, json: { error: 'not_found' } });
      else await route.fulfill({ json });
      return;
    }
    await route.fulfill({
      contentType: 'text/html',
      // No stylesheet: give the toggles a box, and keep Base UI's unstyled
      // modal guard (fixed and transparent in the app) from covering the dialog.
      body: '<html><head><style>[role="checkbox"],[role="switch"]{display:inline-block;width:20px;height:20px;border:1px solid}[data-base-ui-inert]{pointer-events:none}</style></head><body><div id="root"></div></body></html>',
    });
  });
  try {
    await page.goto(`https://portal.test${url}`);
    await page.addScriptTag({ type: 'module', content: source });
    await page.waitForFunction(() => Boolean(window.portalHarness));
    await run(page, calls);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}

type BanTarget =
  | { kind: 'actor'; actor: AdminCommentActor; commentId?: string | null }
  | { kind: 'source'; type: string; value: string; ban: string; emailDomainPublishedComments?: number | null };

async function openBanDialog(page: Page, target: BanTarget): Promise<void> {
  await page.evaluate((value) => window.portalHarness.banDialog(value as never), target);
  await page.getByRole('dialog').waitFor();
}

interface ChoiceState { label: string; checked: boolean; disabled: boolean; text: string }

/** Every key row in the dialog, as the owner sees it. */
function readChoices(page: Page): Promise<ChoiceState[]> {
  return page.evaluate(() => [...document.querySelectorAll('[role="dialog"] fieldset label')].map((row) => {
    const box = row.querySelector('[role="checkbox"]')!;
    return {
      label: row.querySelector('.font-medium')?.textContent ?? '',
      checked: box.getAttribute('aria-checked') === 'true',
      disabled: box.hasAttribute('data-disabled') || box.getAttribute('aria-disabled') === 'true',
      text: row.textContent ?? '',
    };
  }));
}

const ticked = (choices: ChoiceState[]) => choices.filter((choice) => choice.checked).map((choice) => choice.label);

/** Ticks one key row by its label, as the owner would. */
async function tick(page: Page, label: string): Promise<void> {
  await page.locator('[role="dialog"] fieldset label', { hasText: label }).locator('[role="checkbox"]').click();
}

/** Days from now to an ISO expiry, to the nearest day. */
const daysAhead = (iso: string) => Math.round((Date.parse(iso) - Date.now()) / 86_400_000);
const previews = (calls: Call[]) => calls.filter((call) => call.path.endsWith('/admin/bans/preview'));
/** Picks what the ban deletes, by its label. */
const deleting = (page: Page, label: string) => page.locator('[role="dialog"]').getByRole('button', { name: label, exact: true });
/** Comment ids the dialog took off the screen, and those it put back. */
const deletedIds = (page: Page) => page.evaluate(() => ({ deleted: window.portalHarness.deleted, putBack: window.portalHarness.putBack }));
const writes = (calls: Call[]) => calls.filter((call) => call.method === 'POST' && call.path.endsWith('/admin/bans'));

function writer(verified: boolean, overrides: Partial<AdminCommentActor> = {}): AdminCommentActor {
  return demoActor({
    readerId: verified ? 'reader-confirmed' : null,
    authAtWrite: verified ? 'verified' : 'anonymous',
    emailDomainPublishedComments: 11,
    keys: { email: 'email-claimed', emailDomain: 'example.com', clientFp: 'c11e0f9a' },
    ...overrides,
  });
}

const DIALOG = '/dev/portal/comments';

describe('the ban dialog', () => {
  test('ticks only the session, and the address when it was verified at writing', async () => {
    for (const verified of [false, true]) {
      await fixture(DIALOG, async (page, calls) => {
        await openBanDialog(page, { kind: 'actor', actor: writer(verified) });
        const choices = await readChoices(page);
        expect(ticked(choices)).toEqual(verified ? ['Session', 'Email'] : ['Session']);
        // The impact read carries exactly the ticked keys.
        await until(() => previews(calls).length > 0);
        expect(previews(calls)[0]!.body.keys.map((key: { type: string }) => key.type))
          .toEqual(verified ? ['session', 'email'] : ['session']);
        expect(writes(calls)).toEqual([]);
      });
    }
  });

  test('warns that device fingerprints collide', async () => {
    await fixture(DIALOG, async (page) => {
      await openBanDialog(page, { kind: 'actor', actor: writer(false) });
      const fingerprint = (await readChoices(page)).find((choice) => choice.label === 'Device fingerprint')!;
      expect(fingerprint.text).toMatch(/fingerprints collide/i);
      expect(fingerprint.checked).toBe(false);
    });
  });

  test('a domain with more than ten published comments cannot be banned whole', async () => {
    await fixture(DIALOG, async (page) => {
      await openBanDialog(page, { kind: 'actor', actor: writer(false) });
      const domain = (await readChoices(page)).find((choice) => choice.label === 'Email domain')!;
      expect(domain.disabled).toBe(true);
      expect(domain.checked).toBe(false);
      expect(domain.text).toContain('11 published comments');
    });
  });

  test('an unavailable email-domain count disables the broad ban', async () => {
    await fixture(DIALOG, async (page) => {
      await openBanDialog(page, { kind: 'actor', actor: writer(false, { emailDomainPublishedComments: null }) });
      const domain = (await readChoices(page)).find((choice) => choice.label === 'Email domain')!;
      expect(domain.disabled).toBe(true);
      expect(domain.text).toContain('did not load');
    });
  });

  test('claiming a historical comment ticks neither its address nor its account', async () => {
    await fixture(DIALOG, async (page, calls) => {
      const actor = writer(false, { readerId: 'reader-confirmed-later', claimedAt: new Date().toISOString(), claimMethod: 'confirmed' });
      await openBanDialog(page, { kind: 'actor', actor });
      expect(ticked(await readChoices(page))).toEqual(['Session']);
      expect(await page.getByRole('dialog').innerText()).not.toContain('reader account too');
      await until(() => previews(calls).length > 0);
      expect(previews(calls).every((call) => call.body.revokeReaderId === null)).toBe(true);
    });
  });

  test('a pivot offers exactly the viewed key and no account controls', async () => {
    await fixture(DIALOG, async (page, calls) => {
      await openBanDialog(page, { kind: 'source', type: 'ip24', value: 'subnet-viewed', ban: 'ip24' });
      const choices = await readChoices(page);
      expect(choices).toHaveLength(1);
      expect(choices[0]!.text).toContain('subnet-viewed');
      expect(await page.getByRole('dialog').innerText()).not.toContain('reader account too');
      await tick(page, 'Subnet');
      await until(() => previews(calls).length > 0);
      expect(previews(calls).every((call) => call.body.revokeReaderId === null)).toBe(true);
    });
  });

  test('a pivot on a shared key starts with nothing ticked, so B then Enter writes nothing', async () => {
    const shared: Array<[BanTarget & { kind: 'source' }, string]> = [
      [{ kind: 'source', type: 'ip24', value: 'subnet-viewed', ban: 'ip24' }, 'Subnet'],
      [{ kind: 'source', type: 'asn', value: '14061', ban: 'asn' }, 'Network'],
      [{ kind: 'source', type: 'email_domain', value: 'example.com', ban: 'email_domain', emailDomainPublishedComments: 2 }, 'Email domain'],
      [{ kind: 'source', type: 'client_fp', value: 'c11e0f9a', ban: 'client_fp' }, 'Device fingerprint'],
    ];
    for (const [target, label] of shared) {
      await fixture(DIALOG, async (page, calls) => {
        await openBanDialog(page, target);
        expect(ticked(await readChoices(page))).toEqual([]);
        // The Ban button has focus on open: Enter is the B-then-Enter path.
        const none = page.getByRole('button', { name: 'Ban 0 keys', exact: true });
        expect(await none.evaluate((element) => element === document.activeElement)).toBe(true);
        expect(await none.getAttribute('aria-disabled')).toBe('true');
        await page.keyboard.press('Enter');
        await Bun.sleep(100);
        expect(writes(calls)).toEqual([]);
        expect(previews(calls)).toEqual([]);
        // A deliberate tick reads the impact before the key can be banned.
        await tick(page, label);
        await page.getByText('Matches 7 comments').waitFor();
        expect(previews(calls).at(-1)!.body.keys).toEqual([{ type: target.ban, value: target.value }]);
        expect(await page.getByRole('button', { name: 'Ban 1 key', exact: true }).getAttribute('aria-disabled')).toBeNull();
      });
    }
  });

  test('a pivot on a session still arrives ticked', async () => {
    await fixture(DIALOG, async (page) => {
      await openBanDialog(page, { kind: 'source', type: 'session', value: 'session-viewed', ban: 'session' });
      expect(ticked(await readChoices(page))).toEqual(['Session']);
    });
  });

  test('a ban defaults to seven days, and writes that expiry', async () => {
    // site-api gives a ban with no expiresAt seven days too.
    await fixture(DIALOG, async (page, calls) => {
      await openBanDialog(page, { kind: 'actor', actor: writer(false) });
      expect(await page.getByRole('button', { name: '7 days', exact: true }).getAttribute('aria-pressed')).toBe('true');
      await page.getByText('Matches 7 comments').waitFor();
      const written = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/admin/bans'));
      await page.getByRole('button', { name: 'Ban 1 key', exact: true }).click();
      await written;
      expect(daysAhead(writes(calls)[0]!.body.expiresAt)).toBe(7);
    });
  });

  test('writes only the previewed keys, and only when Ban is pressed', async () => {
    await fixture(DIALOG, async (page, calls) => {
      await openBanDialog(page, { kind: 'source', type: 'ip24', value: 'reviewed-subnet', ban: 'ip24' });
      await tick(page, 'Subnet');
      await until(() => previews(calls).length > 0);
      await page.getByText('Matches 7 comments').waitFor();
      expect(calls.map((call) => call.path)).toEqual(['/dev/portal/api/admin/bans/preview']);
      expect(previews(calls)[0]!.body.keys).toEqual([{ type: 'ip24', value: 'reviewed-subnet' }]);
      const written = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/admin/bans'));
      await page.getByRole('button', { name: 'Ban 1 key', exact: true }).click();
      await written;
      expect(writes(calls)).toHaveLength(1);
      expect(writes(calls)[0]!.body.keys).toEqual([{ type: 'ip24', value: 'reviewed-subnet' }]);
      expect(writes(calls)[0]!.body.revokeReaderId).toBeNull();
      expect(writes(calls)[0]!.body.purge).toBe(false);
    });
  });

  test('with no key ticked, Ban writes nothing', async () => {
    await fixture(DIALOG, async (page, calls) => {
      await openBanDialog(page, { kind: 'actor', actor: writer(false) });
      await page.locator('[role="dialog"] fieldset label', { hasText: 'Session' }).locator('[role="checkbox"]').click();
      await page.getByText('Tick at least one key.').first().waitFor();
      // aria-disabled, not disabled: the button keeps focus, so Enter still submits the form.
      const ban = page.getByRole('button', { name: 'Ban 0 keys', exact: true });
      expect(await ban.getAttribute('aria-disabled')).toBe('true');
      await ban.press('Enter');
      await Bun.sleep(100);
      expect(writes(calls)).toEqual([]);
    });
  });

  test('a sweep over the limit must be narrowed or turned off before it can be written', async () => {
    await fixture(DIALOG, async (page, calls) => {
      await openBanDialog(page, { kind: 'source', type: 'ip24', value: 'reviewed-subnet', ban: 'ip24' });
      await tick(page, 'Subnet');
      await deleting(page, 'Everything matched').click();
      await page.getByText('Too much to delete at once: the limit is 500. Untick a shared key or pick Nothing.').waitFor();
      const ban = page.getByRole('button', { name: 'Ban 1 key and delete 7', exact: true });
      expect(await ban.getAttribute('aria-disabled')).toBe('true');
      await ban.press('Enter');
      await Bun.sleep(100);
      expect(writes(calls)).toEqual([]);
      // Deleting nothing makes the same keys bannable again.
      await deleting(page, 'Nothing').click();
      await page.getByText('Too much to delete at once').waitFor({ state: 'detached' });
      expect(await page.getByRole('button', { name: 'Ban 1 key', exact: true }).getAttribute('aria-disabled')).toBeNull();
    }, { purgeAllowed: false });
  });

  test('a sweep is never written before its impact is known', async () => {
    // Pressed early, the receipt would say "Banned" and then flip to "not
    // saved" when site-api refuses the sweep with 409 impact_too_large.
    await fixture(DIALOG, async (page, calls) => {
      await page.route('**/admin/bans/preview', () => {}); // never answers
      await openBanDialog(page, { kind: 'source', type: 'ip24', value: 'reviewed-subnet', ban: 'ip24' });
      await tick(page, 'Subnet');
      await deleting(page, 'Everything matched').click();
      const ban = page.getByRole('button', { name: 'Ban 1 key and delete', exact: true });
      expect(await ban.getAttribute('aria-disabled')).toBe('true');
      expect(await ban.getAttribute('title')).toBe('Checking what this deletes.');
      await ban.press('Enter');
      await Bun.sleep(100);
      expect(writes(calls)).toEqual([]);
    }, { purgeAllowed: false });
  });

  test('a sweep waits again when the ticked keys change, not on the last keys’ impact', async () => {
    await fixture(DIALOG, async (page, calls) => {
      await openBanDialog(page, { kind: 'actor', actor: writer(false) });
      await deleting(page, 'Same fingerprint').click();
      await page.getByText('Deletes 7 comments').waitFor();
      expect(await page.getByRole('button', { name: 'Ban 1 key and delete 7', exact: true }).getAttribute('aria-disabled')).toBeNull();
      // The next impact read hangs: the session's impact stays on screen, but
      // it is not the impact of the new set of keys.
      await page.route('**/admin/bans/preview', () => {});
      await tick(page, 'Device fingerprint');
      const ban = page.getByRole('button', { name: 'Ban 2 keys and delete', exact: true });
      expect(await ban.getAttribute('aria-disabled')).toBe('true');
      await ban.press('Enter');
      await Bun.sleep(100);
      expect(writes(calls)).toEqual([]);
    });
  });

  test('a shared key is never banned before its impact is known, removal or not', async () => {
    const shared: Array<[BanTarget & { kind: 'source' }, string]> = [
      [{ kind: 'source', type: 'ip24', value: 'subnet-viewed', ban: 'ip24' }, 'Subnet'],
      [{ kind: 'source', type: 'asn', value: '14061', ban: 'asn' }, 'Network'],
      [{ kind: 'source', type: 'domain', value: 'spam.example', ban: 'domain' }, 'Link domain'],
      [{ kind: 'source', type: 'client_fp', value: 'c11e0f9a', ban: 'client_fp' }, 'Device fingerprint'],
    ];
    for (const [target, label] of shared) {
      await fixture(DIALOG, async (page, calls) => {
        await page.route('**/admin/bans/preview', () => {}); // never answers
        await openBanDialog(page, target);
        await tick(page, label);
        expect(await deleting(page, 'Nothing').getAttribute('aria-pressed')).toBe('true');
        const ban = page.getByRole('button', { name: 'Ban 1 key', exact: true });
        expect(await ban.getAttribute('aria-disabled')).toBe('true');
        expect(await ban.getAttribute('title')).toBe('Checking what the ban reaches.');
        await ban.press('Enter');
        await Bun.sleep(100);
        expect(writes(calls)).toEqual([]);
      });
    }
  });

  test('a shared key added to a session waits for the new impact, removal off', async () => {
    await fixture(DIALOG, async (page, calls) => {
      await openBanDialog(page, { kind: 'actor', actor: writer(false) });
      await page.getByText('Matches 7 comments').waitFor();
      await page.route('**/admin/bans/preview', () => {});
      await tick(page, 'Device fingerprint');
      const ban = page.getByRole('button', { name: 'Ban 2 keys', exact: true });
      expect(await ban.getAttribute('aria-disabled')).toBe('true');
      await ban.press('Enter');
      await Bun.sleep(100);
      expect(writes(calls)).toEqual([]);
    });
  });

  test('a failed impact check on a shared key says to untick it, and writes nothing', async () => {
    await fixture(DIALOG, async (page, calls) => {
      await page.route('**/admin/bans/preview', (route) => route.fulfill({ status: 500, json: { error: 'internal' } }));
      await openBanDialog(page, { kind: 'source', type: 'ip24', value: 'subnet-viewed', ban: 'ip24' });
      await tick(page, 'Subnet');
      await page.getByText('The impact check failed').waitFor();
      const ban = page.getByRole('button', { name: 'Ban 1 key', exact: true });
      expect(await ban.getAttribute('title')).toBe('The impact check failed. Check again or untick the shared keys.');
      await ban.press('Enter');
      await Bun.sleep(100);
      expect(writes(calls)).toEqual([]);
    });
  });

  test('a ban raised from a comment deletes it by default, at once, before its impact arrives', async () => {
    await fixture(DIALOG, async (page, calls) => {
      await page.route('**/admin/bans/preview', () => {}); // never answers
      await openBanDialog(page, { kind: 'actor', actor: writer(false), commentId: 'comment-open' });
      expect(await deleting(page, 'This comment').getAttribute('aria-pressed')).toBe('true');
      const written = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/admin/bans'));
      // Focus is on Ban from the first frame: B then Enter.
      await page.keyboard.press('Enter');
      await written;
      const body = writes(calls)[0]!.body;
      expect(body.keys).toEqual([{ type: 'session', value: 'se55i0n0' }]);
      expect(body).toMatchObject({ purge: false, removeCommentId: 'comment-open' });
      expect(body.sweepKeys).toBeUndefined();
      expect(await deletedIds(page)).toEqual({ deleted: ['comment-open'], putBack: [] });
      await page.getByText('Banned 1 key and deleted the comment').waitFor();
    }, {
      // A site-api that deleted it answers with the operation.
      answer: (call) => (call.method === 'POST' && call.path.endsWith('/admin/bans')
        ? { bans: [], purged: { comments: 1, reactions: 0 }, operation: null }
        : null),
    });
  });

  test('the comment comes back when the ban is refused, or when site-api deleted nothing', async () => {
    // A refusal, and an older site-api that bans without deleting.
    for (const [receipt, refused] of [['The ban was not saved', true], ['The comment was not deleted. Press D to delete it.', false]] as const) {
      await fixture(DIALOG, async (page) => {
        if (refused) await page.route('**/admin/bans', (route) => route.fulfill({ status: 500, json: { error: 'internal' } }));
        await openBanDialog(page, { kind: 'actor', actor: writer(false), commentId: 'comment-open' });
        await page.getByRole('button', { name: 'Ban 1 key and delete', exact: true }).click();
        await page.getByText(receipt).waitFor();
        expect(await deletedIds(page)).toEqual({ deleted: ['comment-open'], putBack: ['comment-open'] });
      });
    }
  });

  test('same fingerprint sweeps the writer’s fingerprint too, and waits for exactly that impact', async () => {
    await fixture(DIALOG, async (page, calls) => {
      let release!: () => void;
      const answered = new Promise<void>((resolve) => (release = resolve));
      await openBanDialog(page, { kind: 'actor', actor: writer(false), commentId: 'comment-open' });
      await page.getByText('Deletes this comment. Restorable for 30 days.').waitFor();
      let asked: unknown = null;
      await page.route('**/admin/bans/preview', async (route) => {
        asked = route.request().postDataJSON();
        await answered;
        await route.fulfill({ json: { ...impact(), accounts: 3, spared: 2, purge: { comments: 7, reactions: 9, published: 1, sessions: 2, otherAccounts: 1 } } });
      });
      // 2 picks the second choice, as 1-5 pick a reject reason.
      await page.keyboard.press('2');
      expect(await deleting(page, 'Same fingerprint').getAttribute('aria-pressed')).toBe('true');
      const ban = page.getByRole('button', { name: 'Ban 1 key and delete', exact: true });
      expect(await ban.getAttribute('title')).toBe('Checking what this deletes.');
      await page.keyboard.press('Enter');
      await Bun.sleep(100);
      expect(writes(calls)).toEqual([]);

      release();
      await page.getByText('Spares 2 published comments by signed-in readers.', { exact: false }).waitFor();
      const text = await page.getByRole('dialog').innerText();
      expect(text).toContain('Deletes 7 comments (1 published) and 9 reactions from 2 sessions.');
      expect(text).toContain('Device fingerprint c11e0f9a.');
      expect(text).toContain('Also deletes from 1 other reader account. Check they are the same person.');
      const scope = { purge: true, sweepKeys: [{ type: 'client_fp', value: 'c11e0f9a' }], removeCommentId: 'comment-open' };
      expect(asked).toMatchObject(scope);
      const written = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/admin/bans'));
      await page.getByRole('button', { name: 'Ban 1 key and delete 7', exact: true }).press('Enter');
      await written;
      expect(writes(calls)[0]!.body).toMatchObject({ keys: [{ type: 'session', value: 'se55i0n0' }], ...scope });
    });
  });

  test('the account warning counts what the purge removes, not what the keys reach', async () => {
    // Accounts the spare rule protects, and the writer's own account, are
    // site-api's to leave out of otherAccounts; the dialog repeats it.
    for (const [otherAccounts, warning] of [[0, null], [2, 'Also deletes from 2 other reader accounts. Check they are the same person.']] as const) {
      await fixture(DIALOG, async (page) => {
        await page.route('**/admin/bans/preview', (route) =>
          route.fulfill({ json: { ...impact(), accounts: 4, purge: { comments: 7, reactions: 9, published: 0, sessions: 2, otherAccounts } } }));
        await openBanDialog(page, { kind: 'actor', actor: writer(false), commentId: 'comment-open' });
        await page.keyboard.press('2');
        await page.getByText('Deletes 7 comments and 9 reactions from 2 sessions.').waitFor();
        const text = await page.getByRole('dialog').innerText();
        if (warning) expect(text).toContain(warning);
        else expect(text).not.toContain('Also deletes from');
      });
    }
  });

  test('a digit typed in the note is text, not a choice', async () => {
    await fixture(DIALOG, async (page) => {
      await openBanDialog(page, { kind: 'actor', actor: writer(false), commentId: 'comment-open' });
      await page.getByLabel('Note to yourself').fill('');
      await page.getByLabel('Note to yourself').press('3');
      expect(await page.getByLabel('Note to yourself').inputValue()).toBe('3');
      expect(await deleting(page, 'This comment').getAttribute('aria-pressed')).toBe('true');
    });
  });

  test('without a fingerprint, same fingerprint is off and says why', async () => {
    await fixture(DIALOG, async (page) => {
      const actor = writer(false, { keys: { ...writer(false).keys, fp: null, clientFp: null, clientFpStable: null } });
      await openBanDialog(page, { kind: 'actor', actor, commentId: 'comment-open' });
      expect(await deleting(page, 'Same fingerprint').isDisabled()).toBe(true);
      await page.getByText('Same fingerprint is off: this writer sent no fingerprint.').waitFor();
      await page.keyboard.press('2');
      expect(await deleting(page, 'This comment').getAttribute('aria-pressed')).toBe('true');
    });
  });

  test('a ban raised from a reaction has no comment to delete, and deletes nothing unless asked', async () => {
    await fixture(DIALOG, async (page) => {
      await openBanDialog(page, { kind: 'actor', actor: writer(false) });
      expect(await deleting(page, 'This comment').count()).toBe(0);
      expect(await deleting(page, 'Nothing').getAttribute('aria-pressed')).toBe('true');
    });
  });

  test('a ban on one person’s keys goes at once, before its impact arrives', async () => {
    for (const verified of [false, true]) {
      await fixture(DIALOG, async (page, calls) => {
        await page.route('**/admin/bans/preview', () => {});
        await openBanDialog(page, { kind: 'actor', actor: writer(verified) });
        const written = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/admin/bans'));
        await page.getByRole('button', { name: verified ? 'Ban 2 keys' : 'Ban 1 key', exact: true }).press('Enter');
        await written;
        expect(writes(calls)[0]!.body.keys.map((key: { type: string }) => key.type))
          .toEqual(verified ? ['session', 'email'] : ['session']);
      });
    }
  });
});

describe('the manual ban dialog', () => {
  const answer: Answer = (call) => {
    if (call.method === 'GET' && call.path.endsWith('/admin/bans')) return { bans: [] };
    if (call.path.endsWith('/admin/bans/operations')) return { operations: [] };
    if (call.path.endsWith('/admin/readers/revoked')) return { readers: [] };
    return null;
  };

  test('defaults to seven days, and writes that expiry', async () => {
    await fixture('/dev/portal/comments/bans', async (page, calls) => {
      await page.evaluate(() => window.portalHarness.bansScreen());
      await page.getByRole('button', { name: /^Ban a key/ }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Ban a key' });
      await dialog.waitFor();
      expect(await dialog.getByRole('button', { name: '7 days', exact: true }).getAttribute('aria-pressed')).toBe('true');
      await dialog.getByLabel('Value').fill('session-typed');
      const written = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/admin/bans'));
      await dialog.getByRole('button', { name: /^Ban/ }).click();
      await written;
      expect(writes(calls)).toHaveLength(1);
      expect(daysAhead(writes(calls)[0]!.body.expiresAt)).toBe(7);
    }, { answer });
  });

  /** Opens the dialog on the Bans screen with this key kind picked. */
  async function openManual(page: Page, kind: string) {
    await page.evaluate(() => window.portalHarness.bansScreen());
    await page.getByRole('button', { name: /^Ban a key/ }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Ban a key' });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: kind, exact: true }).click();
    return dialog;
  }

  test('a shared key waits for its impact, and Enter writes nothing until it arrives', async () => {
    for (const kind of ['Subnet', 'IP address']) {
      await fixture('/dev/portal/comments/bans', async (page, calls) => {
        let release!: () => void;
        const answered = new Promise<void>((resolve) => (release = resolve));
        await page.route('**/admin/bans/preview', async (route) => {
          await answered;
          await route.fulfill({ json: impact() });
        });
        const dialog = await openManual(page, kind);
        await dialog.getByLabel('Value').fill('hash-typed');
        const ban = dialog.getByRole('button', { name: /^Ban/ });
        expect(await ban.isDisabled()).toBe(true);
        expect(await dialog.locator('#manual-ban-impact').innerText()).toContain('Ban waits: others can share this key.');
        await dialog.getByLabel('Value').press('Enter');
        await Bun.sleep(100);
        expect(writes(calls)).toEqual([]);

        release();
        await dialog.getByText(/^Matches 7 comments/).waitFor();
        const written = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/admin/bans'));
        await dialog.getByLabel('Value').press('Enter');
        await written;
        expect(writes(calls)).toHaveLength(1);
      }, { answer });
    }
  });

  test('a failed impact check on a shared key still lets the ban through', async () => {
    await fixture('/dev/portal/comments/bans', async (page, calls) => {
      await page.route('**/admin/bans/preview', (route) => route.fulfill({ status: 500, json: { error: 'internal' } }));
      const dialog = await openManual(page, 'Network');
      await dialog.getByLabel('Value').fill('AS14061');
      await dialog.getByText('Could not check what this matches. You can still ban it.').waitFor();
      const written = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/admin/bans'));
      await dialog.getByRole('button', { name: /^Ban/ }).click();
      await written;
      expect(writes(calls)[0]!.body.keys).toEqual([{ type: 'asn', value: '14061' }]);
    }, { answer });
  });

  test('a key that names one person goes at once, before its impact arrives', async () => {
    for (const kind of ['Session', 'Email']) {
      await fixture('/dev/portal/comments/bans', async (page, calls) => {
        await page.route('**/admin/bans/preview', () => {}); // never answers
        const dialog = await openManual(page, kind);
        await dialog.getByLabel('Value').fill('hash-typed');
        const written = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/admin/bans'));
        await dialog.getByLabel('Value').press('Enter');
        await written;
        expect(writes(calls)).toHaveLength(1);
      }, { answer });
    }
  });
});

describe('restoring a removal', () => {
  const operation = {
    id: 'operation-a', createdAt: new Date().toISOString(), source: 'portal', keys: [{ type: 'session', value: 'session-a' }],
    note: 'A reviewed ban', purged: { comments: 2, reactions: 3 }, restoredAt: null,
    restorableUntil: new Date(Date.now() + 86_400_000).toISOString(), restored: { comments: 0, reactions: 0 }, skipped: { comments: 0, reactions: 0 },
  };
  const answer: Answer = (call) => {
    if (call.path.endsWith('/admin/bans/operations')) return { operations: [operation] };
    if (call.path.endsWith('/restore')) {
      return { operation: { ...operation, restoredAt: new Date().toISOString(), restored: { comments: 1, reactions: 3 }, skipped: { comments: 1, reactions: 0 } } };
    }
    if (call.method === 'GET' && call.path.endsWith('/admin/bans')) return { bans: [] };
    if (call.path.endsWith('/admin/readers/revoked')) return { readers: [] };
    return null;
  };

  test('asks first, restores the content and leaves the ban in place', async () => {
    await fixture('/dev/portal/comments/bans?view=history', async (page, calls) => {
      await page.evaluate(() => window.portalHarness.bansScreen());
      await page.getByRole('button', { name: 'Restore…', exact: true }).click();
      await page.getByRole('alertdialog').waitFor();
      expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
      await page.getByRole('alertdialog').getByRole('button', { name: 'Restore', exact: true }).click();
      const receipt = page.getByText('Restored 1 comment, 3 reactions');
      await receipt.waitFor();
      expect(await page.getByText(/1 skipped because they were deleted again since\. The ban is still in place\./).count()).toBe(1);
      expect(calls.filter((call) => call.method !== 'GET').map((call) => `${call.method} ${call.path}`))
        .toEqual(['POST /dev/portal/api/admin/bans/operations/operation-a/restore']);
    }, { answer });
  });
});

describe('identity provenance', () => {
  function actorWith(fields: Partial<AdminCommentActor>): AdminCommentActor {
    return { ...structuredClone(DEMO_COMMENTS.comments[0]!.actor), ...fields };
  }

  test('an actor is verified only with a verified session at writing; claims and missing history read distinctly', () => {
    const rows: Array<[Partial<AdminCommentActor>, IdentityStatus]> = [
      [{ authAtWrite: 'verified', readerId: 'reader', claimedAt: null }, 'verified'],
      [{ authAtWrite: 'verified', readerId: 'reader', claimedAt: '2026-09-13T00:00:00Z' }, 'verified'],
      [{ authAtWrite: 'anonymous', readerId: 'reader', claimedAt: '2026-09-13T00:00:00Z' }, 'claimed'],
      [{ authAtWrite: 'anonymous', readerId: null, claimedAt: null }, 'anonymous'],
      // A reader id with no claim and no recorded session is not proof of anything.
      [{ authAtWrite: undefined, readerId: 'legacy-reader', claimedAt: null }, 'unknown'],
    ];
    expect(rows.map(([fields]) => identityStatus(actorWith(fields)))).toEqual(rows.map(([, status]) => status));
  });

  test('a historical claim reads as anonymous at writing, never as verified', () => {
    const actor = actorWith({ readerId: 'claimed-reader', authAtWrite: 'anonymous', claimedAt: '2026-09-13T00:00:00Z', claimMethod: 'confirmed' });
    expect(identityDetail(actor)).toBe('Anonymous, claimed later by confirming an email');
    expect(identityDetail(actorWith({ authAtWrite: 'verified', readerId: 'reader' }))).toBe('Signed in when writing');
  });
});

test('look-only keys offer no ban', () => {
  // The pivot line shows "Ban this …" only when sourceBanKey names a key.
  expect(sourceBanKey('storage_id')).toBeNull();
  expect(sourceBanKey('body_hash')).toBeNull();
  expect(sourceBanKey('client_fp_stable')).toBe('client_fp');
  expect(sourceBanKey('ip24')).toBe('ip24');
});

test('only a ban on one person’s keys skips the impact check', () => {
  // Session, and an address verified at writing: no wait, deleting the
  // open comment included, so B then Enter stays one motion.
  expect(impactHold(['session'], false, 'none')).toBeNull();
  expect(impactHold(['session'], false, 'comment')).toBeNull();
  expect(impactHold(['session', 'email'], true, 'comment')).toBeNull();
  // A sweep waits for its exact impact.
  expect(impactHold(['session'], false, 'fingerprint')).toBe('removal');
  expect(impactHold(['session'], false, 'matched')).toBe('removal');
  // Any key other readers share waits, whatever it deletes.
  for (const shared of ['ip', 'ip24', 'fp', 'asn', 'client_fp', 'domain', 'email_domain'] as const) {
    expect(impactHold([shared], false, 'none')).toBe('shared');
    expect(impactHold(['session', shared], true, 'comment')).toBe('shared');
    expect(impactHold(['session', shared], true, 'fingerprint')).toBe('shared');
  }
  // An address nobody confirmed can be typed by anybody.
  expect(impactHold(['email'], false, 'none')).toBe('shared');
});

test('the fingerprint a sweep adds is the fingerprint column, under the ban type that matches it', () => {
  const keys = (overrides: Partial<AdminCommentActor['keys']>) => demoActor({ keys: { fp: 'net-sig', ...overrides } });
  expect(fingerprintSweepKey(keys({ clientFp: 'device', clientFpStable: 'stable' })))
    .toEqual({ type: 'client_fp', value: 'device', label: 'Device fingerprint' });
  // The stable column bans as client_fp, which matches either column.
  expect(fingerprintSweepKey(keys({ clientFpStable: 'stable' })))
    .toEqual({ type: 'client_fp', value: 'stable', label: 'Stable fingerprint' });
  expect(fingerprintSweepKey(keys({}))).toEqual({ type: 'fp', value: 'net-sig', label: 'Network signature' });
  expect(fingerprintSweepKey(keys({ fp: null }))).toBeNull();
});

test('each delete choice maps to the ban input the design names', () => {
  const session = [{ type: 'session' as const, value: 's' }];
  const sweep = { type: 'client_fp' as const, value: 'device' };
  expect(deleteScope('comment', session, sweep, 'c1')).toEqual({ purge: false, removeCommentId: 'c1' });
  expect(deleteScope('fingerprint', session, sweep, 'c1')).toEqual({ purge: true, sweepKeys: [sweep], removeCommentId: 'c1' });
  expect(deleteScope('none', session, sweep, 'c1')).toEqual({ purge: false });
  expect(deleteScope('matched', session, null, null)).toEqual({ purge: true });
  // A ban from a reaction sweeps without a comment.
  expect(deleteScope('fingerprint', session, sweep, null)).toEqual({ purge: true, sweepKeys: [sweep] });
  // A fingerprint already ticked is banned, so the purge matches it anyway.
  expect(deleteScope('fingerprint', [...session, sweep], sweep, 'c1')).toEqual({ purge: true, removeCommentId: 'c1' });
});

describe('measured outcomes', () => {
  const quality: AdminCommentQuality = {
    since: '2026-09-01T00:00:00Z', collectedSince: null,
    available: { moderation: true, requests: true, clientReports: false },
    moderation: { held: 0, reviewed: 0, released: 0, releasedShare: null },
    requests: { attempts: 0, failures: 0, failureShare: null, authenticatedAttempts: 0, authenticatedFailures: 0, authenticatedFailureShare: null, outcomes: [] },
    clientReports: { reports: 0, failures: 0, networkFailures: 0, challengedAttempts: 0, repeatedChallenges: 0, untrusted: true },
  };

  test('an empty denominator is not a zero rate', () => {
    expect(formatShare(null)).toBe('–');
  });

  test('the insights screen shows no rate without a denominator, and says what was not collected', async () => {
    const answer: Answer = (call) => {
      if (call.path.endsWith('/admin/comments/insights')) return { ...DEMO_COMMENT_INSIGHTS, quality };
      if (call.path.endsWith('/admin/comments')) return DEMO_COMMENTS;
      return null;
    };
    await fixture('/dev/portal/comments/insights', async (page) => {
      await page.evaluate(() => window.portalHarness.insightsScreen());
      const block = page.getByRole('region', { name: 'Measured outcomes' });
      await block.getByText('Failed requests').waitFor();
      const text = await block.innerText();
      expect(text).not.toMatch(/\b0(\.0)?%/);
      expect(text).toContain('Not collected yet.');
      expect(text).toContain('The collection start is not known.');
    }, { answer });
  });
});
