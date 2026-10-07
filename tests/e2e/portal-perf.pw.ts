import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { resetPortalDemo } from './portal-demo';

/* Click-to-paint budgets for the dev portal at 4x CPU.

   Each time runs from the input event to the paint of the first frame that
   shows the result, measured in the page: rAF sees the result, then a
   MessageChannel hop lands after that frame's paint. Every frame between
   the input and that one must still show a screen header, so a switch that
   blanks the screen, or shows a spinner, fails however fast it is.

   The portal only has fixed data in demo mode (`astro dev` with no site-api:
   an in-memory API that answers after 140ms), so the spec skips anywhere
   else. It also skips on CI unless PORTAL_PERF=1: shared runners run two
   workers on a cold server, and a timing budget there measures the runner.

   Budgets are production targets turned into dev numbers. `astro dev` runs
   React's development build and unbundled modules; the same interactions
   on a production build of the same code (React production, minified, same
   demo API, same throttle), medians of 3 runs on 2026-09-28:

                                  dev    prod   dev / prod
     comments tab Held             91      42      2.2
     comments tab All             121      47      2.6
     Back to the log              107      48      2.2
     cached screen switch         152      70      2.2
     SVG gallery, first visit     159      60      2.7   render only
     j                             51      39      1.3   mostly one frame
     pivot, no hover              197     182      1.1   one demo round trip
     Bans, first visit            261     213      1.2   waits for its data

   Render work runs 2.2 to 2.7 times slower in dev; waiting on the network
   does not change. So a budget is the production target times DEV_MARGIN,
   plus any network wait unscaled. The production target for anything drawn
   from memory is 100ms, 50ms for j. */

const DEV_MARGIN = 2.5;
const PROD_TARGET_MS = 100;
/** Dev budget for a production target, with the documented margin. */
const dev = (prodMs: number): number => Math.ceil(prodMs * DEV_MARGIN);
/** The demo API answers every call after this long (server/demo-api.ts). */
const DEMO_LATENCY_MS = 140;
/** The outlet holds the old screen at most this long for the next one's data (app/Outlet.tsx). */
const ARRIVAL_WAIT_MS = 200;

/* First visit to each screen from the comment log: chunk preloaded on idle,
   data not yet cached. The old screen stays up until the new one's data is
   in or ARRIVAL_WAIT_MS passes, then the new one paints. Mascot, SVG gallery
   and Mood embed are not preloaded, so they also load their modules here. */
const FIRST_VISIT_MS = ARRIVAL_WAIT_MS + dev(PROD_TARGET_MS);
const FIRST_VISIT: Array<[link: string, title: string, budgetMs: number]> = [
  ['Home', 'Home', FIRST_VISIT_MS],
  ['Reactions', 'Reactions', FIRST_VISIT_MS],
  ['Bans', 'Bans', FIRST_VISIT_MS],
  ['Post modes', 'Post modes', FIRST_VISIT_MS],
  ['Messages', 'Messages', FIRST_VISIT_MS],
  ['Insights', 'Insights', FIRST_VISIT_MS],
  ['Subscribers', 'Subscribers', FIRST_VISIT_MS],
  ['Broadcasts', 'Broadcasts', FIRST_VISIT_MS],
  ['Analytics', 'Analytics', FIRST_VISIT_MS],
  ['Activity', 'Activity', FIRST_VISIT_MS],
  ['Mood', 'Mood', FIRST_VISIT_MS],
  ['Blog previews', 'Blog previews', FIRST_VISIT_MS],
  ['Email templates', 'Email templates', FIRST_VISIT_MS],
  ['Settings', 'Settings', FIRST_VISIT_MS],
  ['Mascot', 'Mascot', FIRST_VISIT_MS],
  ['SVG gallery', 'SVG gallery', FIRST_VISIT_MS],
  ['Mood embed', 'Mood embed', FIRST_VISIT_MS],
];

/** Back to a screen visited before: chunk and data are both cached. */
const CACHED_SWITCH_MS = dev(PROD_TARGET_MS);
const COMMENTS_MS = {
  tab: dev(PROD_TARGET_MS),
  // No hover first, so the click pays one demo round trip.
  pivot: DEMO_LATENCY_MS + dev(PROD_TARGET_MS),
  back: dev(PROD_TARGET_MS),
  j: dev(50),
};
/* The owner's acts are optimistic: each paints from memory before site-api
   answers, so each has the in-memory target. Search is the exception: its
   rows wait for one demo round trip after Enter. */
const COMMENT_ACTS_MS = {
  rejectMenu: dev(PROD_TARGET_MS),
  reject: dev(PROD_TARGET_MS),
  bulk: dev(PROD_TARGET_MS),
  keystroke: dev(50),
  search: DEMO_LATENCY_MS + dev(PROD_TARGET_MS),
  restore: dev(PROD_TARGET_MS),
  reply: dev(PROD_TARGET_MS),
  lift: dev(PROD_TARGET_MS),
};
const COMMENTS_API = '/dev/portal/api/admin/comments';

/* Messages, Readers and Post modes, past their first visit (FIRST_VISIT):
   each paints from memory. A tray switch (Archived and Spam load ahead once
   the Inbox is idle, so each paints its own read), a filing act, j, the Readers
   tab (read with the ban list), a restore and a mode change. */
const P6_MS = {
  tray: dev(PROD_TARGET_MS),
  archive: dev(PROD_TARGET_MS),
  j: dev(50),
  readersTab: dev(PROD_TARGET_MS),
  restore: dev(PROD_TARGET_MS),
  mode: dev(PROD_TARGET_MS),
};
const ADMIN_API = '/dev/portal/api/admin';

/* The comment pane's toggles: P and L paint the pressed toggle and the
   row's mark in the frame they are pressed, before site-api answers; a
   click on the post line's mode checks its radio the same way. */
const PANE_CONTROLS_MS = {
  pin: dev(PROD_TARGET_MS),
  lock: dev(PROD_TARGET_MS),
  mode: dev(PROD_TARGET_MS),
};

/* Back to each audience, tools, analytics and moderation screen, with its
   data: the title, the screen's content, and no skeleton or busy list in
   view. A background refresh spinner beside cached content is fine. Mood
   embed's content is its preview frame, which loads a page over the network
   (production, from dev), so its budget covers the frame, not its page. */
const REVISIT_MS = dev(PROD_TARGET_MS);
const REVISIT: Array<[link: string, title: string, content: string]> = [
  ['Subscribers', 'Subscribers', `document.querySelector('[aria-label=Subscribers] [data-row-id]')`],
  ['Broadcasts', 'Broadcasts', `document.querySelector('[aria-label=Broadcasts] [data-row-id]')`],
  ['Settings', 'Settings', `/Signed|Unknown/.test(document.querySelector('[aria-labelledby=settings-owner]')?.textContent ?? '')`],
  ['Blog previews', 'Blog previews', `document.querySelector('main [data-row-id]')`],
  ['Email templates', 'Email templates', `document.querySelector('main [data-row-id]')`],
  ['SVG gallery', 'SVG gallery', `document.querySelector('main img')`],
  ['Mascot', 'Mascot', `document.querySelector('[aria-labelledby=mascot-runtime] li')`],
  ['Mood embed', 'Mood embed', `document.querySelector('iframe[title="Mood embed preview"]')`],
  ['Mood', 'Mood', `document.querySelector('[aria-labelledby=mood-ingest] li')`],
  ['Analytics', 'Analytics', `document.querySelector('main table tbody tr')`],
  ['Activity', 'Activity', `document.querySelector('main ol li, main [role=table] [role=row], main [data-row-id]')`],
  ['Reactions', 'Reactions', `document.querySelector('[aria-label="Reactions, newest first"]')`],
  ['Insights', 'Insights', `document.querySelector('main section[aria-label=Overview]')`],
];

/** No skeleton or busy region the viewer can see inside `scope`. */
const SETTLED = (scope: string): string => `![...document.querySelectorAll('${scope} [data-slot="skeleton"], ${scope} [aria-busy="true"]')].some((node) => {
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
})`;

/* The subscriber and article panes paint their header from the row that
   opened them, then their detail after one demo round trip. Back to an open
   subscriber (list, scroll position and pane), the broadcast composer and
   the manual-ban dialog are all drawn from memory. */
const PANES_MS = {
  subscriber: dev(PROD_TARGET_MS),
  subscriberDetail: DEMO_LATENCY_MS + dev(PROD_TARGET_MS),
  subscriberBack: dev(PROD_TARGET_MS),
  composer: dev(PROD_TARGET_MS),
  article: dev(PROD_TARGET_MS),
  articleDetail: DEMO_LATENCY_MS + dev(PROD_TARGET_MS),
  manualBan: dev(PROD_TARGET_MS),
};

interface Paint {
  ms: number | null;
  blank: boolean;
  /** False when the expression never held before the timeout. */
  held: boolean;
}

declare global {
  interface Window {
    __perf: {
      input: number;
      pending?: Promise<Paint[]>;
      /** Resolves once `expression` holds, with ms since the last input. */
      paint(expression: string, timeoutMs?: number): Promise<Paint>;
      markInput(): void;
    };
  }
}

/* Installed before the app runs. Kept dependency-free: it is serialised
   into the page. */
function installProbe(): void {
  const probe = {
    input: 0,
    markInput() {
      probe.input = performance.now();
    },
    paint(expression: string, timeoutMs = 8000): Promise<Paint> {
      // eslint-disable-next-line no-new-func
      const holds = new Function(`return Boolean(${expression})`) as () => boolean;
      const armed = probe.input;
      const started = performance.now();
      let blank = false;
      return new Promise((resolve) => {
        const frame = (): void => {
          const header = [...document.querySelectorAll('main h1')].some((node) => node.getClientRects().length > 0);
          if (probe.input !== armed && !header) blank = true;
          let done = false;
          try {
            done = holds();
          } catch {
            done = false;
          }
          if (done) {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => resolve({ ms: probe.input === armed ? null : performance.now() - probe.input, blank, held: true });
            channel.port2.postMessage(0);
            return;
          }
          if (performance.now() - started > timeoutMs) return resolve({ ms: null, blank, held: false });
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    },
  };
  const mark = (event: Event): void => {
    probe.input = event.timeStamp;
  };
  addEventListener('pointerdown', mark, true);
  addEventListener('keydown', mark, true);
  (window as unknown as { __perf: typeof probe }).__perf = probe;
}

/** The visible screen title. Suspense hides a replaced screen, it stays in the DOM. */
const TITLE_IS = (title: string): string =>
  `[...document.querySelectorAll('main h1')].find((node) => node.getClientRects().length > 0)?.textContent === ${JSON.stringify(title)}`;

/* `astro dev` swaps a module in place when its source file changes, as when
   another session edits the portal during a run. A swap re-creates the lazy
   screens, so the next switch suspends and paints no screen at all, and the
   recompile runs on the CPU being measured. Neither is the portal's doing:
   a test the dev server swapped modules under is skipped, with the reason,
   instead of failing on a blank frame or a slow paint it did not cause. */
const hotSwaps = new WeakMap<Page, number>();

function countHotSwaps(page: Page): void {
  hotSwaps.set(page, 0);
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload === 'string' && /"type":"(update|full-reload)"/.test(payload)) {
        hotSwaps.set(page, (hotSwaps.get(page) ?? 0) + 1);
      }
    });
  });
}

/** Skips the running test once the dev server has swapped a module under it. */
function skipIfHotSwapped(page: Page): void {
  const swaps = hotSwaps.get(page) ?? 0;
  test.skip(swaps > 0, `The dev server swapped modules ${swaps} time(s) mid-run after a source edit; these timings measure Vite. Rerun.`);
}

/** Arms the probe, acts, and waits for the paint. Arming is awaited first:
    a key press can reach the page before an unawaited evaluate runs. */
async function timed(page: Page, expression: string, act: () => Promise<void>): Promise<Paint> {
  const [paint] = await timedEach(page, [expression], act);
  return paint;
}

/** `timed` for an act with several milestones, such as a pane whose header
    paints before its detail arrives: one paint per expression. */
async function timedEach(page: Page, expressions: string[], act: () => Promise<void>): Promise<Paint[]> {
  let paints: Paint[];
  try {
    await page.evaluate((sources) => {
      window.__perf.pending = Promise.all(sources.map((source) => window.__perf.paint(source)));
    }, expressions);
    await act();
    paints = await page.evaluate(() => window.__perf.pending!);
  } catch (error) {
    // A full reload from a source edit destroys the page mid-measure.
    skipIfHotSwapped(page);
    throw error;
  }
  skipIfHotSwapped(page);
  return paints;
}

/** Waits for `expression` to hold, through the probe: the portal's CSP
    blocks the eval that a string `waitForFunction` runs on every poll. */
async function until(page: Page, expression: string, timeoutMs = 30_000): Promise<void> {
  const { held } = await page.evaluate(([source, timeout]) => window.__perf.paint(source, timeout), [expression, timeoutMs] as const);
  expect(held, `held within ${timeoutMs}ms: ${expression}`).toBe(true);
}

const median =(values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function sidebarLink(page: Page, name: string) {
  return page.locator('[data-sidebar="sidebar"]').getByRole('link', { name, exact: true }).first();
}

/** Opens the comment log, waits for the idle preload, then throttles. */
async function openPortal(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(installProbe);
  countHotSwaps(page);
  await page.goto('/dev/portal/comments');
  const sidebar = page.locator('[data-sidebar="sidebar"]');
  await sidebar.waitFor({ timeout: 60_000 });
  // The sidebar says Demo when there is no site-api behind the portal.
  test.skip(!(await sidebar.getByText('Demo', { exact: true }).isVisible()), 'Needs portal demo mode: astro dev without site-api.');
  await page.locator('[data-row-id]').first().waitFor({ timeout: 30_000 });
  // Idle chunk preload and the first polls; unthrottled, so the run starts settled.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

test.describe('portal click-to-paint', () => {
  test.skip(Boolean(process.env.E2E_BASE_URL), 'Demo mode exists only on local astro dev.');
  test.skip(Boolean(process.env.CI) && process.env.PORTAL_PERF !== '1', 'Timing budgets are local only; set PORTAL_PERF=1 to run on CI.');
  // In order, in one worker: a parallel worker would share the CPU being measured.
  test.describe.configure({ mode: 'default' });

  test.beforeAll(async ({ browser, playwright }, testInfo) => {
    // The demo store back to its seed, so the rows measured are the same
    // every run (tests/e2e/portal-demo.ts).
    await resetPortalDemo(playwright, String(testInfo.project.use.baseURL));
    // A cold dev server compiles each screen's modules on first request.
    // Visit every screen once, so the budgets measure the app, not Vite.
    // Best effort: a failure here shows up as a real one in the tests.
    const page = await browser.newPage();
    try {
      await page.goto(new URL('/dev/portal/comments', testInfo.project.use.baseURL).href);
      await page.locator('[data-row-id]').first().waitFor({ timeout: 90_000 });
      for (const [link, title] of FIRST_VISIT) {
        await sidebarLink(page, link).click();
        await page.getByRole('heading', { level: 1, name: title, exact: true }).waitFor({ timeout: 60_000 });
      }
    } catch {
      // Not in demo mode, or a screen is broken; the tests say which.
    } finally {
      await page.close();
    }
  });

  test.afterAll(async ({ playwright }, testInfo) => {
    await resetPortalDemo(playwright, String(testInfo.project.use.baseURL));
  });

  test('first visit to each screen keeps the old one up and meets its budget', async ({ page }) => {
    await openPortal(page);
    const misses: string[] = [];
    for (const [link, title, budget] of FIRST_VISIT) {
      const anchor = sidebarLink(page, link);
      const paint = await timed(page, TITLE_IS(title), () => anchor.click());
      if (paint.blank) misses.push(`${title}: a frame with no screen on it`);
      if (paint.ms === null || paint.ms > budget) misses.push(`${title}: ${paint.ms?.toFixed(0) ?? 'timeout'}ms > ${budget}ms`);
      await page.waitForTimeout(1200); // Let the screen's own follow-up work finish.
    }
    expect(misses).toEqual([]);
  });

  test('switching back to a visited screen is cached and meets its budget', async ({ page }) => {
    await openPortal(page);
    const loop: Array<[link: string, title: string]> = [
      ['Bans', 'Bans'],
      ['Analytics', 'Analytics'],
      ['Activity', 'Activity'],
      ['Home', 'Home'],
      ['Inbox', 'Comments'],
    ];
    // First pass fills the caches; the second and third are measured.
    for (const [link, title] of loop) {
      await sidebarLink(page, link).click();
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
      await page.waitForTimeout(800);
    }
    const times: number[] = [];
    const misses: string[] = [];
    for (let round = 0; round < 2; round += 1) {
      for (const [link, title] of loop) {
        const anchor = sidebarLink(page, link);
        const paint = await timed(page, TITLE_IS(title), () => anchor.click());
        if (paint.blank) misses.push(`${title}: a frame with no screen on it`);
        times.push(paint.ms ?? Number.POSITIVE_INFINITY);
        await page.waitForTimeout(800);
      }
    }
    expect(misses).toEqual([]);
    expect(median(times), `cached switches: ${times.map((ms) => ms.toFixed(0)).join(', ')}ms`).toBeLessThanOrEqual(CACHED_SWITCH_MS);
  });

  test('comment log: tab, pivot, Back and j meet their budgets', async ({ page }) => {
    await openPortal(page);
    const rows = `document.querySelector('[data-row-id]')`;
    const filtered = `document.querySelector('button[aria-label="Clear filter"]')`;
    const tab = (name: string) => page.locator(`button[title^="${name} ("]`);
    const pressed = (name: string) => `document.querySelector('button[aria-pressed="true"][title^="${name} ("]')`;

    const tabs: number[] = [];
    const pivots: number[] = [];
    const backs: number[] = [];
    for (let round = 0; round < 3; round += 1) {
      tabs.push((await timed(page, `${pressed('Held')} && ${rows}`, () => tab('Held').click())).ms ?? Infinity);
      await page.waitForTimeout(600);
      tabs.push((await timed(page, `${pressed('All')} && ${rows}`, () => tab('All').click())).ms ?? Infinity);
      await page.waitForTimeout(600);

      // A different writer each round, so the pivot is never already cached.
      const key = page.locator('[data-row-id] a[title^="All comments with"]').nth(round + 1);
      pivots.push((await timed(page, `${filtered} && ${rows}`, () => key.click())).ms ?? Infinity);
      await page.waitForTimeout(800);
      const back = await page.evaluate(
        ([expression]) => {
          const pending = window.__perf.paint(expression);
          window.__perf.markInput();
          history.back();
          return pending;
        },
        [`!${filtered} && ${rows}`],
      );
      backs.push(back.ms ?? Infinity);
      await page.waitForTimeout(800);
    }

    await page.locator('[data-row-id] [data-row-button]').first().click();
    await page.waitForTimeout(600);
    const js: number[] = [];
    for (let step = 0; step < 5; step += 1) {
      const before = await page.evaluate(() => new URLSearchParams(location.search).get('c'));
      const moved = `new URLSearchParams(location.search).get('c') !== ${JSON.stringify(before)} && document.querySelector('[data-row-id][data-active]')?.getAttribute('data-row-id') === new URLSearchParams(location.search).get('c')`;
      js.push((await timed(page, moved, () => page.keyboard.press('j'))).ms ?? Infinity);
      await page.waitForTimeout(300);
    }

    skipIfHotSwapped(page); // Back is timed outside `timed`.
    const report = (values: number[]): string => `${values.map((ms) => ms.toFixed(0)).join(', ')}ms`;
    expect.soft(median(tabs), `tab: ${report(tabs)}`).toBeLessThanOrEqual(COMMENTS_MS.tab);
    expect.soft(median(pivots), `pivot: ${report(pivots)}`).toBeLessThanOrEqual(COMMENTS_MS.pivot);
    expect.soft(median(backs), `Back: ${report(backs)}`).toBeLessThanOrEqual(COMMENTS_MS.back);
    expect.soft(median(js), `j: ${report(js)}`).toBeLessThanOrEqual(COMMENTS_MS.j);
  });

  test('comment acts: reject, bulk, search, restore, reply and lift meet their budgets', async ({ page }) => {
    await openPortal(page);
    const tab = (name: string) => page.locator(`button[title^="${name} ("]`);
    const gone = (id: string) => `!document.querySelector('[data-row-id="${id}"]')`;
    const openRowId = () => page.evaluate(() => new URLSearchParams(location.search).get('c')!);
    const openFirst = async (): Promise<void> => {
      await page.locator('main [data-row-id] [data-row-button]').first().click();
      await page.waitForTimeout(600);
    };
    const pane = page.getByRole('complementary', { name: 'Comment detail' });
    const act = (id: string, action: string) => page.request.post(`${COMMENTS_API}/${id}`, { data: { action } });
    const ms = (paint: Paint): number => paint.ms ?? Number.POSITIVE_INFINITY;
    const times: Record<keyof typeof COMMENT_ACTS_MS, number[]> = {
      rejectMenu: [], reject: [], bulk: [], keystroke: [], search: [], restore: [], reply: [], lift: [],
    };
    // Each section puts back what it changed through the demo API.
    const undo: Array<() => Promise<unknown>> = [];
    const putBack = async (): Promise<void> => {
      for (const step of undo.splice(0)) await step();
    };

    try {
      // S opens the reject menu on the open row; a digit picks and the row leaves Held.
      await tab('Held').click();
      await openFirst();
      for (let round = 0; round < 3; round += 1) {
        const id = await openRowId();
        times.rejectMenu.push(ms(await timed(page, `document.querySelector('[role="menu"][data-open]')`, () => page.keyboard.press('s'))));
        undo.push(() => act(id, 'approve'), () => act(id, 'hide'));
        times.reject.push(ms(await timed(page, gone(id), () => page.keyboard.press('2'))));
        await page.waitForTimeout(600);
      }
      await putBack();

      // Two rows ticked with x and Shift+J, deleted in one act: both leave Published.
      await tab('Published').click();
      await openFirst();
      for (let round = 0; round < 3; round += 1) {
        await page.keyboard.press('x');
        await page.keyboard.press('Shift+J');
        const ids = await page.locator('main [data-row-id][data-checked]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-row-id')!));
        for (const id of ids) undo.push(() => act(id, 'restore'));
        times.bulk.push(ms(await timed(page, ids.map(gone).join(' && '), () => page.keyboard.press('Shift+D'))));
        await page.waitForTimeout(800);
      }
      await putBack();

      // Restore from the pane: the row leaves Deleted.
      await tab('Deleted').click();
      await page.waitForTimeout(600);
      for (let round = 0; round < 3; round += 1) {
        const restorable = page.locator('main [data-row-id]').filter({ has: page.locator('[data-row-button][aria-label*=", Deleted, "]') });
        let id: string | null = null;
        for (const candidate of await restorable.all()) {
          await candidate.locator('[data-row-button]').click();
          const canRestore = await pane.getByRole('button', { name: 'Restore' }).waitFor({ timeout: 1500 }).then(() => true, () => false);
          if (canRestore) {
            id = await candidate.getAttribute('data-row-id');
            break;
          }
        }
        if (!id) break;
        const restored = id;
        undo.push(() => act(restored, 'delete'));
        await page.waitForTimeout(400);
        times.restore.push(ms(await timed(page, gone(restored), () => pane.getByRole('button', { name: 'Restore' }).click())));
        await page.waitForTimeout(800);
      }
      await putBack();

      // A reply shows in the thread from the first frame after ⌘↵.
      await tab('Published').click();
      await openFirst();
      for (let round = 0; round < 3; round += 1) {
        await page.keyboard.press('r');
        const text = `perf reply ${round} ${Date.now().toString(36)}`;
        // insertText types into whatever has focus, so a box that never took
        // it would fail at the test timeout far below, with no reason given.
        await expect(pane.getByRole('textbox', { name: /^Reply to .* as the owner$/ })).toBeFocused();
        await page.keyboard.insertText(text);
        const answered = page.waitForResponse((response) => response.url().endsWith('/reply'), { timeout: 10_000 });
        const shown = `[...document.querySelectorAll('aside li')].some((node) => node.textContent.includes(${JSON.stringify(text)}))`;
        times.reply.push(ms(await timed(page, shown, () => page.keyboard.press('ControlOrMeta+Enter'))));
        const reply = (await (await answered).json()) as { comment: { id: string } };
        undo.push(() => act(reply.comment.id, 'delete'));
        await page.keyboard.press('Escape');
        await page.keyboard.press('j');
        await page.waitForTimeout(800);
      }
      await putBack();

      // Search: each keystroke paints at once while the old rows stay up, and
      // Enter brings the matching rows after one round trip. No frame in
      // between may show an empty list. Three terms the demo data holds, each
      // new to the cache, so the budget rests on a median of three trips.
      await tab('All').click();
      await page.waitForTimeout(600);
      const searchbox = page.getByRole('searchbox');
      let emptyFrames = 0;
      for (const term of ['crypto', 'weather', 'backlinks']) {
        await page.evaluate(() => {
          const probe = window as unknown as { emptyFrames: number; sampling: boolean };
          probe.emptyFrames = 0;
          probe.sampling = true;
          const tick = (): void => {
            if (!document.querySelector('main [data-row-id]')) probe.emptyFrames += 1;
            if (probe.sampling) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        await searchbox.focus();
        let typed = '';
        for (const char of term) {
          typed += char;
          const echoed = `document.querySelector('main input[type="search"]').value === ${JSON.stringify(typed)}`;
          times.keystroke.push(ms(await timed(page, echoed, () => page.keyboard.press(char))));
        }
        const matched = `(() => {
          const rows = [...document.querySelectorAll('main [data-row-id]')];
          return rows.length > 0 && !document.querySelector('[data-stale]') && rows.every((node) => node.textContent.toLowerCase().includes(${JSON.stringify(term)}));
        })()`;
        times.search.push(ms(await timed(page, matched, () => page.keyboard.press('Enter'))));
        emptyFrames += await page.evaluate(() => {
          const probe = window as unknown as { emptyFrames: number; sampling: boolean };
          probe.sampling = false;
          return probe.emptyFrames;
        });
        // Emptied, the box writes no `q` after its debounce: the log is back to All.
        await searchbox.fill('');
        await page.waitForTimeout(800);
      }
      expect.soft(emptyFrames, 'frames with no rows while searching').toBe(0);

      // Lift from the Comments header: the line goes at once.
      for (let round = 0; round < 3; round += 1) {
        await page.request.post(`${COMMENTS_API}/lockdown`, { data: { minutes: 60, note: 'perf' } });
        undo.push(() => page.request.delete(`${COMMENTS_API}/lockdown`));
        await page.reload();
        const line = page.locator('main [role="status"]').filter({ hasText: 'Lockdown' });
        await line.waitFor({ timeout: 30_000 });
        await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await page.waitForTimeout(800);
        const lineGone = `![...document.querySelectorAll('main [role="status"]')].some((node) => node.textContent.includes('Lockdown'))`;
        times.lift.push(ms(await timed(page, lineGone, () => line.getByRole('button', { name: 'Lift' }).click())));
        await page.waitForTimeout(600);
      }
    } finally {
      await putBack();
    }

    const report = (values: number[]): string => `${values.map((value) => value.toFixed(0)).join(', ')}ms`;
    for (const [name, budget] of Object.entries(COMMENT_ACTS_MS) as Array<[keyof typeof COMMENT_ACTS_MS, number]>) {
      test.info().annotations.push({ type: name, description: `${report(times[name])}, budget ${budget}ms` });
      expect.soft(times[name].length, `${name}: measured`).toBeGreaterThan(0);
      expect.soft(median(times[name]), `${name}: ${report(times[name])}`).toBeLessThanOrEqual(budget);
    }
  });

  test('messages, readers and post modes: trays, filing, j, restore and modes meet their budgets', async ({ page }) => {
    await openPortal(page);
    const ms = (paint: Paint): number => paint.ms ?? Number.POSITIVE_INFINITY;
    const times: Record<keyof typeof P6_MS, number[]> = {
      tray: [], archive: [], j: [], readersTab: [], restore: [], mode: [],
    };
    // A restored reader has no way back to revoked, so restores are answered here.
    await page.route((url) => /\/api\/admin\/readers\/[^/]+\/restore$/.test(url.pathname), (route) =>
      route.fulfill({ json: { readerId: 'perf', restoredAt: new Date().toISOString() } }),
    );
    const modes = ((await (await page.request.get(`${ADMIN_API}/comment-modes`)).json()) as {
      modes: Array<{ surface: string; postId: string; override: string; title: string | null }>;
    }).modes;
    // A post that still exists: a stale override can be cleared, not changed.
    const live = modes.find((entry) => entry.title);
    const archived: string[] = [];

    /** The selected tray, with rows that all belong to it. */
    const tray = (name: string, fits: string): string => `(() => {
      const tab = document.querySelector(${JSON.stringify(`button[aria-pressed="true"][title^="${name} ("]`)});
      const labels = [...document.querySelectorAll('main [data-row-id] [data-row-button]')].map((node) => node.getAttribute('aria-label'));
      return Boolean(tab) && labels.length > 0 && labels.every((label) => ${fits});
    })()`;

    try {
      await sidebarLink(page, 'Messages').click();
      await page.locator('main [data-row-id]').first().waitFor();
      await page.waitForTimeout(1200);

      for (let round = 0; round < 3; round += 1) {
        times.tray.push(ms(await timed(page, tray('Archived', `label.endsWith(', Archived')`), () => page.keyboard.press('2'))));
        await page.waitForTimeout(600);
        times.tray.push(ms(await timed(page, tray('Inbox', `!/, (Archived|Spam)$/.test(label)`), () => page.keyboard.press('1'))));
        await page.waitForTimeout(600);
      }

      // E on a read message: it leaves and the next one opens. Only read rows
      // are opened: a new one would be read for good.
      for (let round = 0; round < 3; round += 1) {
        const target = page.locator('main [data-row-id]').filter({ has: page.locator('[data-row-button][aria-label$=", Read"]') }).first();
        const id = (await target.getAttribute('data-row-id'))!;
        await target.locator('[data-row-button]').click();
        await page.waitForTimeout(600);
        archived.push(id);
        const left = `!document.querySelector('[data-row-id="${id}"]') && new URLSearchParams(location.search).get('m') !== '${id}'`;
        times.archive.push(ms(await timed(page, left, () => page.keyboard.press('e'))));
        await page.waitForTimeout(800);
      }

      // j walks down, away from the new messages at the top.
      for (let step = 0; step < 4; step += 1) {
        const before = await page.evaluate(() => location.search);
        const moved = `location.search !== ${JSON.stringify(before)} && document.querySelector('main [data-row-id][data-active]')?.getAttribute('data-row-id') === new URLSearchParams(location.search).get('m')`;
        times.j.push(ms(await timed(page, moved, () => page.keyboard.press('j'))));
        await page.waitForTimeout(300);
      }

      // Bans → Readers: the list came with the ban list, so the tab is memory.
      await sidebarLink(page, 'Bans').click();
      await page.getByRole('heading', { level: 1, name: 'Bans', exact: true }).waitFor();
      await page.waitForTimeout(1200);
      const banTab = (name: string) => page.locator(`button[aria-pressed][title^="${name} ("]`);
      const readers = `document.querySelector('button[aria-pressed="true"][title^="Readers ("]') && document.querySelector('[data-readers] [id^="reader-"]')`;
      for (let round = 0; round < 3; round += 1) {
        times.readersTab.push(ms(await timed(page, readers, () => banTab('Readers').click())));
        await page.waitForTimeout(600);
        await banTab('Active').click();
        await page.waitForTimeout(600);
      }
      await banTab('Readers').click();
      await page.waitForTimeout(600);
      const readerRows = page.locator('[data-readers] [role="row"][id^="reader-"]');
      for (let round = 0; round < 3; round += 1) {
        const row = readerRows.nth(round);
        const id = (await row.getAttribute('id'))!;
        await row.getByRole('button', { name: 'Restore…' }).click();
        await page.waitForTimeout(400);
        const restored = `document.getElementById(${JSON.stringify(id)})?.textContent.includes('Restored')`;
        times.restore.push(ms(await timed(page, restored, () => row.getByRole('button', { name: /^Confirm: restore/ }).click())));
        await page.waitForTimeout(600);
      }

      // Post modes: one click per change.
      await sidebarLink(page, 'Post modes').click();
      await page.locator('[data-mode-row]').first().waitFor();
      await page.waitForTimeout(1200);
      const labels: Record<string, string> = { open: 'Open', readonly: 'Read-only', off: 'Off' };
      const state = live!;
      const key = `${state.surface}:${state.postId}`;
      const original = labels[state.override];
      const other = state.override === 'off' ? 'Open' : 'Off';
      const modeRow = page.locator(`[data-mode-row="${key}"]`);
      const checked = (label: string): string =>
        `document.querySelector('[data-mode-row="${key}"] [role="radio"][aria-checked="true"]')?.textContent === ${JSON.stringify(label)}`;
      for (let round = 0; round < 3; round += 1) {
        for (const label of [other, original]) {
          times.mode.push(ms(await timed(page, checked(label), () => modeRow.getByRole('radio', { name: label, exact: true }).click())));
          await page.waitForTimeout(600);
        }
      }
    } finally {
      for (const id of archived) await page.request.post(`${ADMIN_API}/messages/${id}`, { data: { action: 'unarchive' } });
      const state = live;
      if (state) await page.request.put(`${ADMIN_API}/comment-modes/${state.surface}/${state.postId}`, { data: { mode: state.override } });
    }

    const report = (values: number[]): string => `${values.map((value) => value.toFixed(0)).join(', ')}ms`;
    for (const [name, budget] of Object.entries(P6_MS) as Array<[keyof typeof P6_MS, number]>) {
      test.info().annotations.push({ type: name, description: `${report(times[name])}, budget ${budget}ms` });
      expect.soft(times[name].length, `${name}: measured`).toBeGreaterThan(0);
      expect.soft(median(times[name]), `${name}: ${report(times[name])}`).toBeLessThanOrEqual(budget);
    }
  });

  test('comment pane: pin, lock and the post mode meet their budgets', async ({ page }) => {
    await openPortal(page);
    const ms = (paint: Paint): number => paint.ms ?? Number.POSITIVE_INFINITY;
    const times: Record<keyof typeof PANE_CONTROLS_MS, number[]> = { pin: [], lock: [], mode: [] };
    type Row = { id: string; parentId: string | null; status: string; postId: string; surface?: string; postTitle: string | null; pinnedAt?: string | null; lockedAt?: string | null };
    const all = ((await (await page.request.get(COMMENTS_API, { params: { status: 'all', limit: 100 } })).json()) as { comments: Row[] }).comments;

    await page.locator('button[title^="All ("]').click();
    await page.waitForTimeout(1200);
    const loaded = new Set(await page.locator('main [data-row-id]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-row-id')!)));
    // A published first comment on a post nobody pinned: a pin takes no one's place.
    const target = all.find((row) =>
      row.parentId === null && row.status === 'published' && !row.pinnedAt && !row.lockedAt && row.postTitle && loaded.has(row.id)
      && !all.some((other) => other.pinnedAt && other.postId === row.postId));
    expect(target, 'a loaded, unpinned first comment on an unpinned post').toBeTruthy();
    const { id, postId } = target!;
    const modePath = `${ADMIN_API}/comment-modes/${target!.surface ?? 'blog'}/${postId}`;
    const startMode = ((await (await page.request.get(modePath)).json()) as { mode: { override: string | null } }).mode.override;

    const pane = `document.querySelector('aside[aria-label="Comment detail"]')`;
    const toggled = (key: 'P' | 'L', mark: string, on: boolean): string =>
      `${pane}?.querySelector('[aria-keyshortcuts="${key}"]')?.getAttribute('aria-pressed') === '${on}'
        && document.querySelector('[data-row-id="${id}"] [data-row-button]')?.getAttribute('aria-label').includes(${JSON.stringify(mark)}) === ${on}`;
    const checked = (label: string): string =>
      `${pane}?.querySelector('[role="radiogroup"] [role="radio"][aria-checked="true"]')?.textContent === ${JSON.stringify(label)}`;

    try {
      await page.locator(`main [data-row-id="${id}"] [data-row-button]`).click();
      // The post line's mode is read once, then stays in memory.
      await page.locator('aside[aria-label="Comment detail"] [role="radiogroup"] [role="radio"][aria-checked="true"]').waitFor();
      await page.waitForTimeout(800);

      for (let round = 0; round < 3; round += 1) {
        for (const on of [true, false]) {
          times.pin.push(ms(await timed(page, toggled('P', ', pinned', on), () => page.keyboard.press('p'))));
          await page.waitForTimeout(700);
        }
      }
      for (let round = 0; round < 3; round += 1) {
        for (const on of [true, false]) {
          times.lock.push(ms(await timed(page, toggled('L', ', replies locked', on), () => page.keyboard.press('l'))));
          await page.waitForTimeout(700);
        }
      }
      const labels: Record<string, string> = { open: 'Open', readonly: 'Read-only', off: 'Off' };
      const original = startMode ? labels[startMode] : 'Default';
      const other = startMode === 'off' ? 'Open' : 'Off';
      const group = page.locator('aside[aria-label="Comment detail"] [role="radiogroup"]');
      for (let round = 0; round < 3; round += 1) {
        for (const label of [other, original]) {
          times.mode.push(ms(await timed(page, checked(label), () => group.getByRole('radio', { name: label, exact: true }).click())));
          await page.waitForTimeout(700);
        }
      }
    } finally {
      await page.request.delete(`${COMMENTS_API}/${id}/pin`);
      await page.request.delete(`${COMMENTS_API}/${id}/lock`);
      if (startMode) await page.request.put(modePath, { data: { mode: startMode } });
      else await page.request.delete(modePath);
    }

    const report = (values: number[]): string => `${values.map((value) => value.toFixed(0)).join(', ')}ms`;
    for (const [name, budget] of Object.entries(PANE_CONTROLS_MS) as Array<[keyof typeof PANE_CONTROLS_MS, number]>) {
      test.info().annotations.push({ type: name, description: `${report(times[name])}, budget ${budget}ms` });
      expect.soft(times[name].length, `${name}: measured`).toBeGreaterThan(0);
      expect.soft(median(times[name]), `${name}: ${report(times[name])}`).toBeLessThanOrEqual(budget);
    }
  });

  test('revisiting audience, tools, analytics and moderation screens paints their data within budget', async ({ page }) => {
    test.setTimeout(240_000);
    await openPortal(page);
    const times = new Map<string, number[]>(REVISIT.map(([, title]) => [title, []]));
    const misses: string[] = [];
    // Round 0 fills the caches; rounds 1 to 3 are measured, each a switch
    // from the screen before it.
    for (let round = 0; round < 4; round += 1) {
      for (const [link, title, content] of REVISIT) {
        const anchor = sidebarLink(page, link);
        const ready = `${TITLE_IS(title)} && (${content})`;
        if (round === 0) {
          await anchor.click();
          await until(page, ready);
        } else {
          const paint = await timed(page, `${ready} && ${SETTLED('main')}`, () => anchor.click());
          if (paint.blank) misses.push(`${title}: a frame with no screen on it`);
          times.get(title)!.push(paint.ms ?? Number.POSITIVE_INFINITY);
        }
        await page.waitForTimeout(800);
      }
    }

    const report = (values: number[]): string => `${values.map((value) => value.toFixed(0)).join(', ')}ms`;
    for (const [title, values] of times) {
      test.info().annotations.push({ type: title, description: `${report(values)}, budget ${REVISIT_MS}ms` });
      expect.soft(median(values), `${title}: ${report(values)}`).toBeLessThanOrEqual(REVISIT_MS);
    }
    expect(misses).toEqual([]);
  });

  test('subscriber panes, report tabs, Back, the composer and the ban dialog meet their budgets', async ({ page }) => {
    test.setTimeout(180_000);
    await openPortal(page);
    const ms = (paint: Paint): number => paint.ms ?? Number.POSITIVE_INFINITY;
    const times: Record<keyof typeof PANES_MS, number[]> = {
      subscriber: [], subscriberDetail: [], subscriberBack: [], composer: [], article: [], articleDetail: [], manualBan: [],
    };
    const show = async (link: string, title: string, content: string): Promise<void> => {
      await sidebarLink(page, link).click();
      await until(page, `${TITLE_IS(title)} && (${content})`);
      await page.waitForTimeout(1000);
    };
    const subscribers = `document.querySelector('[aria-label=Subscribers] [data-row-id]')`;
    const broadcasts = `document.querySelector('[aria-label=Broadcasts] [data-row-id]')`;
    const subscriberPane = 'aside[aria-label="Subscriber detail"]';

    // A different row each round, so its detail is never cached.
    await show('Subscribers', 'Subscribers', subscribers);
    for (let round = 0; round < 3; round += 1) {
      const row = page.locator('[aria-label=Subscribers] [data-row-id]').nth(4 + round * 2).locator('[data-row-button]');
      const email = (await row.getAttribute('aria-label'))!.split(',')[0];
      const titled = `document.querySelector('${subscriberPane} h2')?.textContent === ${JSON.stringify(email)}`;
      const [header, detail] = await timedEach(page, [titled, `${titled} && ${SETTLED(subscriberPane)}`], () => row.click());
      times.subscriber.push(ms(header));
      times.subscriberDetail.push(ms(detail));
      await page.waitForTimeout(600);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
    }

    // A row far down open, off to Broadcasts, then Back: the list at its
    // scroll position with that row's pane, in one paint.
    for (let round = 0; round < 3; round += 1) {
      await show('Subscribers', 'Subscribers', subscribers);
      const list = page.locator('[aria-label=Subscribers][role=table]');
      await list.evaluate((node, top) => { node.scrollTop = top; }, 1200 + round * 600);
      await page.waitForTimeout(300);
      const far = await list.evaluate((node) => {
        const top = node.getBoundingClientRect().top;
        return [...node.querySelectorAll('[data-row-id]')].find((row) => row.getBoundingClientRect().top > top + 200)!.getAttribute('data-row-id')!;
      });
      await page.locator(`[data-row-id="${far}"] [data-row-button]`).click();
      await page.locator(`${subscriberPane} h2`).waitFor();
      await page.waitForTimeout(600);
      const saved = await list.evaluate((node) => node.scrollTop);
      const email = await page.locator(`${subscriberPane} h2`).textContent();
      await show('Broadcasts', 'Broadcasts', broadcasts);
      const restored = `(() => {
        const list = document.querySelector('[aria-label=Subscribers][role=table]');
        return Boolean(list) && Math.abs(list.scrollTop - ${saved}) < 4
          && document.querySelector('${subscriberPane} h2')?.textContent === ${JSON.stringify(email)}
          && Boolean(document.querySelector('[data-row-id="${far}"][data-active]'));
      })()`;
      const back = await page.evaluate(([expression]) => {
        const pending = window.__perf.paint(expression);
        window.__perf.markInput();
        history.back();
        return pending;
      }, [`${TITLE_IS('Subscribers')} && ${restored}`]);
      skipIfHotSwapped(page); // Back is timed outside `timed`.
      expect.soft(back.blank, 'Back to a subscriber: a frame with no screen on it').toBe(false);
      times.subscriberBack.push(ms(back));
      await page.waitForTimeout(800);
    }

    // n on Broadcasts: the composer's body is up in the first frame.
    await show('Broadcasts', 'Broadcasts', broadcasts);
    const composing = `(document.querySelector('[data-composer-body]')?.getBoundingClientRect().width ?? 0) > 0`;
    for (let round = 0; round < 3; round += 1) {
      times.composer.push(ms(await timed(page, composing, () => page.keyboard.press('n'))));
      await page.waitForTimeout(800);
      await page.keyboard.press('Escape');
      // A reload from a source edit can land between n and Escape: the key
      // goes to a page still loading, which then reopens the composer from
      // its URL. That skips, like every other swap.
      await expect(page.locator('[data-composer-body]')).toHaveCount(0).catch((error: unknown) => {
        skipIfHotSwapped(page);
        throw error;
      });
      await page.waitForTimeout(600);
    }

    // Report tabs retain their data on revisits, without an article-only pane.
    await show('Analytics', 'Analytics', `document.querySelector('main table tbody tr')`);
    for (const report of ['Pages', 'Clicks', 'Audience']) {
      const tabs = page.getByRole('navigation', { name: 'Analytics reports' });
      const selectedReport = report === 'Pages' ? 'pages' : report === 'Clicks' ? 'clicks' : 'audience';
      const loaded = `new URLSearchParams(location.search).get('report') === ${JSON.stringify(selectedReport)} && document.querySelector('main table tbody tr') && !document.querySelector('main [role="alert"]')`;
      const [header, detail] = await timedEach(page, [loaded, `${loaded} && ${SETTLED('main')}`], async () => {
        await page.evaluate(() => window.__perf.markInput());
        await tabs.getByRole('button', { name: report, exact: true }).click();
      });
      times.article.push(ms(header)); times.articleDetail.push(ms(detail));
      await page.waitForTimeout(800);
    }

    // n on Bans: the manual-ban dialog with its value field.
    await show('Bans', 'Bans', `document.querySelector('main [role=table], main [data-slot=bans-scroll] p')`);
    for (let round = 0; round < 3; round += 1) {
      times.manualBan.push(ms(await timed(page, `document.querySelector('[role=dialog] #manual-ban-value')`, () => page.keyboard.press('n'))));
      await page.waitForTimeout(600);
      await page.keyboard.press('Escape');
      await expect(page.locator('#manual-ban-value')).toHaveCount(0);
      await page.waitForTimeout(600);
    }

    const report = (values: number[]): string => `${values.map((value) => value.toFixed(0)).join(', ')}ms`;
    for (const [name, budget] of Object.entries(PANES_MS) as Array<[keyof typeof PANES_MS, number]>) {
      test.info().annotations.push({ type: name, description: `${report(times[name])}, budget ${budget}ms` });
      expect.soft(times[name].length, `${name}: measured`).toBeGreaterThan(0);
      expect.soft(median(times[name]), `${name}: ${report(times[name])}`).toBeLessThanOrEqual(budget);
    }
  });
});
