import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let browser: Browser;
let directory: string;
let source: string;

beforeAll(async () => {
  const root = join(import.meta.dir, '../..');
  directory = await mkdtemp(join(tmpdir(), 'comment-moderation-'));
  const entry = join(directory, 'entry.ts');
  await Bun.write(entry, `
    import React from '${root}/node_modules/react/index.js';
    import { createRoot } from '${root}/node_modules/react-dom/client.js';
    import BanDialog from '${root}/src/features/admin/ui/BanDialog.tsx';
    import BanOperations from '${root}/src/features/admin/ui/BanOperations.tsx';
    import ActorStrip from '${root}/src/features/admin/ui/ActorStrip.tsx';
    import CommentQuality from '${root}/src/features/admin/ui/CommentQuality.tsx';
    import { DEMO_COMMENTS } from '${root}/src/features/admin/server/portal-demo.ts';
    const root = createRoot(document.getElementById('root'));
    window.moderationReview = {
      ban: () => root.render(React.createElement(BanDialog, {source:{type:'ip24',value:'reviewed-subnet'},onClose:()=>{},onDone:()=>{}})),
      operations: () => root.render(React.createElement(BanOperations)),
      actor: () => {
        const actor = structuredClone(DEMO_COMMENTS.comments[0].actor);
        Object.assign(actor,{readerId:'claimed-reader',authAtWrite:'anonymous',claimedAt:'2026-09-13T00:00:00Z',claimMethod:'confirmed'});
        root.render(React.createElement(ActorStrip,{actor}));
      },
      quality: value => root.render(React.createElement(CommentQuality,{quality:value})),
    };
  `);
  const build = await Bun.build({ entrypoints: [entry], target: 'browser', format: 'esm', tsconfig: join(root, 'tsconfig.json') });
  if (!build.success) throw new AggregateError(build.logs, 'Could not bundle moderation fixtures');
  source = await build.outputs[0].text();
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL, headless: true });
}, 15_000);

afterAll(async () => {
  await browser?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

const impact = {
  accounts: 3, sessions: 8, comments: { total: 7, published: 5, held: 2, rejected: 0, deleted: 0 },
  reactions: 9, purge: { comments: 7, reactions: 9 }, windowDays: 90, purgeLimit: 500, purgeAllowed: true,
};

const operation = {
  id: 'operation-a', createdAt: new Date().toISOString(), source: 'portal', keys: [{ type: 'session', value: 'session-a' }],
  note: 'A reviewed ban', purged: { comments: 2, reactions: 3 }, restoredAt: null,
  restorableUntil: new Date(Date.now() + 86_400_000).toISOString(), restored: { comments: 0, reactions: 0 }, skipped: { comments: 0, reactions: 0 },
};

async function fixture(run: (page: Page, calls: Array<{ path: string; method: string; body: any }>) => Promise<void>, purgeAllowed = true) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const calls: Array<{ path: string; method: string; body: any }> = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/dev/portal/api/')) {
      const body = request.method() === 'POST' ? request.postDataJSON() : null;
      calls.push({ path, method: request.method(), body });
      if (path.endsWith('/preview')) await route.fulfill({ json: { ...impact, purgeAllowed } });
      else if (path.endsWith('/restore')) await route.fulfill({ json: { operation: { ...operation, restoredAt: new Date().toISOString(), restored: { comments: 1, reactions: 3 }, skipped: { comments: 1, reactions: 0 } } } });
      else if (path.endsWith('/operations')) await route.fulfill({ json: { operations: [operation] } });
      else await route.fulfill({ json: { bans: [], purged: { comments: 0, reactions: 0 } } });
      return;
    }
    await route.fulfill({ contentType: 'text/html', body: '<html><head><style>[role="checkbox"]{display:inline-block;width:20px;height:20px;border:1px solid}</style></head><body><div id="root"></div></body></html>' });
  });
  try {
    await page.goto('https://moderation.test/');
    await page.addScriptTag({ type: 'module', content: source });
    await page.waitForFunction(() => Boolean((window as any).moderationReview));
    await run(page, calls);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}

describe('reviewed moderation actions', () => {
  test('previews only the selected source before an explicit ban write', async () => {
    await fixture(async (page, calls) => {
      await page.evaluate(() => (window as any).moderationReview.ban());
      await page.locator('.portal-ban__keys [role="checkbox"]').click();
      await page.getByRole('button', { name: 'Preview impact', exact: true }).click();
      await page.locator('[data-ban-preview]').waitFor();
      expect(calls.map((call) => call.path)).toEqual(['/dev/portal/api/admin/bans/preview']);
      expect(await page.locator('[data-ban-preview]').innerText()).toContain('Published comments');
      const response = page.waitForResponse((response) => response.url().endsWith('/admin/bans'));
      await page.getByRole('button', { name: 'Apply ban', exact: true }).click();
      await response;
      expect(calls[1]?.body.keys).toEqual([{ type: 'ip24', value: 'reviewed-subnet' }]);
      expect(calls[1]?.body.revokeReaderId).toBeNull();
    });
  });

  test('a broad removal must be narrowed or disabled after preview', async () => {
    await fixture(async (page, calls) => {
      await page.evaluate(() => (window as any).moderationReview.ban());
      await page.locator('.portal-ban__keys [role="checkbox"]').click();
      await page.locator('.portal-ban__switch [role="checkbox"]').click();
      await page.getByRole('button', { name: 'Preview impact', exact: true }).click();
      await page.locator('[data-ban-preview]').waitFor();
      expect(await page.getByRole('button', { name: 'Apply ban', exact: true }).isDisabled()).toBe(true);
      expect(await page.getByRole('alert').innerText()).toContain('500-record removal limit');
      expect(calls).toHaveLength(1);
    }, false);
  });

  test('restoring an operation requires confirmation and does not lift its ban', async () => {
    await fixture(async (page, calls) => {
      await page.evaluate(() => (window as any).moderationReview.operations());
      await page.getByRole('button', { name: 'Restore removed content', exact: true }).click();
      expect(calls).toHaveLength(1);
      await page.getByRole('button', { name: 'Confirm restore', exact: true }).click();
      await page.getByRole('status').waitFor();
      expect(await page.getByRole('status').innerText()).toContain('Restored 1 comments and 3 reactions');
      expect(await page.getByRole('status').innerText()).toContain('Skipped 1 comments');
      expect(calls.map((call) => call.method)).toEqual(['GET', 'POST']);
      expect(calls[1]?.path).toBe('/dev/portal/api/admin/bans/operations/operation-a/restore');
    });
  });

  test('historical claims remain distinct from verification at writing', async () => {
    await fixture(async (page) => {
      await page.evaluate(() => (window as any).moderationReview.actor());
      await page.locator('[data-provenance]').waitFor();
      expect(await page.locator('[data-provenance]').innerText()).toBe('Anonymous when written · linked later by reader confirmation');
      expect(await page.locator('[data-provenance]').getAttribute('data-provenance')).toBe('anonymous');
    });
  });

  test('empty quality denominators do not imply zero failure rates', async () => {
    await fixture(async (page) => {
      await page.evaluate(() => (window as any).moderationReview.quality({
        since: '2026-09-01T00:00:00Z', collectedSince: null,
        available: { moderation: true, requests: true, clientReports: false },
        moderation: { held: 0, reviewed: 0, released: 0, releasedShare: null },
        requests: { attempts: 0, failures: 0, failureShare: null, authenticatedAttempts: 0, authenticatedFailures: 0, authenticatedFailureShare: null, outcomes: [] },
        clientReports: { reports: 0, failures: 0, networkFailures: 0, challengedAttempts: 0, repeatedChallenges: 0, untrusted: true },
      }));
      await page.getByText('Held comments later approved', { exact: true }).waitFor();
      const text = await page.locator('#root').innerText();
      expect(text).toContain('No denominator');
      expect(text).toContain('Browser reports have not been collected.');
      expect(text).not.toContain('0.0%');
    });
  });
});
