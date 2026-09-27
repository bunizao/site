import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser, type Page } from '@playwright/test';
import { join } from 'node:path';

import { formatMoodDateKey, formatMoodTime } from '../../src/features/mood/shared/date-grouping';

let browser: Browser;
let moduleSource = '';
let inlineSource = '';

// Pinned "now": 14:00 on 2026-06-15 in UTC+2, so header labels are stable.
const NOW = new Date('2026-06-15T12:00:00.000Z');

async function buildModule(relativePath: string): Promise<string> {
  const build = await Bun.build({
    entrypoints: [join(import.meta.dir, relativePath)],
    format: 'esm',
    target: 'browser',
  });
  if (!build.success) {
    throw new AggregateError(build.logs, `Could not build ${relativePath} for browser tests`);
  }
  return build.outputs[0].text();
}

beforeAll(async () => {
  moduleSource = await buildModule('../../src/features/mood/shared/date-grouping.ts');
  inlineSource = await Bun.file(
    join(import.meta.dir, '../../src/features/mood/client/rekey-server-groups-inline.js'),
  ).text();
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL,
    headless: true,
  });
}, 15_000);

// Closing Chromium can outlast bun's 5s default hook timeout on a loaded
// machine and fail an otherwise green file.
afterAll(async () => {
  await browser?.close();
}, 15_000);

type FeedFixture = Array<{ key: string; posts: Array<{ id: string; datetime: string }> }>;

// SSR-shaped feed, hidden like FeedShell ships it: each entry becomes a
// mood-date-group whose members carry a `<time datetime>` for the local key.
function buildFeedHtml(groups: FeedFixture): string {
  const groupHtml = groups
    .map((group) => {
      const items = group.posts
        .map(
          (post) =>
            `<div class="mood-item" data-mood-id="${post.id}"><time class="mood-item-time" datetime="${post.datetime}">SSR</time></div>`
        )
        .join('');
      return `<div class="mood-date-group" data-date="${group.key}"><div class="mood-date-header"><span class="mood-date-text">Header</span></div><div class="mood-date-items">${items}</div></div>`;
    })
    .join('');
  return `<div data-mood-list style="visibility:hidden">${groupHtml}</div>`;
}

async function newPage(timezoneId: string): Promise<Page> {
  const context = await browser.newContext({ timezoneId });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  return page;
}

// One context per timezone, reused across tests; setContent resets the page.
const pagesByTimezone = new Map<string, Page>();

async function pageInTimezone(timezoneId: string): Promise<Page> {
  let page = pagesByTimezone.get(timezoneId);
  if (!page) {
    page = await newPage(timezoneId);
    pagesByTimezone.set(timezoneId, page);
  }
  return page;
}

interface FeedSnapshot {
  visibility: string;
  groups: Array<{ key: string; header: string; ids: string[]; times: string[] }>;
}

async function readFeed(page: Page): Promise<FeedSnapshot> {
  return page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('[data-mood-list]')!;
    return {
      visibility: list.style.visibility,
      groups: Array.from(list.querySelectorAll<HTMLElement>('.mood-date-group'), (group) => ({
        key: group.dataset.date ?? '',
        header: group.querySelector('.mood-date-text')?.textContent ?? '',
        ids: Array.from(
          group.querySelectorAll<HTMLElement>('.mood-date-items > .mood-item'),
          (item) => item.dataset.moodId ?? '',
        ),
        times: Array.from(group.querySelectorAll('.mood-item-time'), (time) => time.textContent ?? ''),
      })),
    };
  });
}

// Loads the SSR-shaped list, then runs the inline script the way the parser
// does right after FeedShell's list markup.
async function runInlineScript(timezoneId: string, html: string): Promise<FeedSnapshot> {
  const page = await pageInTimezone(timezoneId);
  await page.setContent(html);
  await page.addScriptTag({ content: inlineSource });
  return readFeed(page);
}

describe('mood date grouping formatters', () => {
  test('formats time and date key in the visitor timezone', () => {
    // bun test runs every file in one process under UTC; restore it after.
    const previousTimezone = process.env.TZ;
    process.env.TZ = 'Etc/GMT-2';
    try {
      // UTC+2: 23:30Z is 01:30 on the next local day.
      expect(formatMoodTime('2026-06-14T23:30:00.000Z')).toBe('01:30');
      expect(formatMoodDateKey('2026-06-14T23:30:00.000Z')).toBe('2026-06-15');
    } finally {
      process.env.TZ = previousTimezone ?? 'Etc/UTC';
    }
  });
});

// The inline script is the only pass that rekeys SSR groups; the feed
// controller trusts its output.
describe('pre-paint inline rekey script', () => {
  test('merges two UTC groups that collapse to one local day', async () => {
    const result = await runInlineScript('Etc/GMT-2', buildFeedHtml([
      { key: '2026-06-15', posts: [{ id: '2', datetime: '2026-06-15T00:30:00.000Z' }] },
      { key: '2026-06-14', posts: [{ id: '1', datetime: '2026-06-14T23:30:00.000Z' }] },
    ]));

    expect(result.groups).toEqual([
      { key: '2026-06-15', header: 'Today', ids: ['2', '1'], times: ['02:30', '01:30'] },
    ]);
    expect(result.visibility).toBe('');
  });

  test('splits one UTC group across a local midnight boundary', async () => {
    const result = await runInlineScript('Etc/GMT-2', buildFeedHtml([
      {
        key: '2026-06-14',
        posts: [
          { id: '2', datetime: '2026-06-14T23:30:00.000Z' },
          { id: '1', datetime: '2026-06-14T20:00:00.000Z' },
        ],
      },
    ]));

    expect(result.groups).toEqual([
      { key: '2026-06-15', header: 'Today', ids: ['2'], times: ['01:30'] },
      { key: '2026-06-14', header: 'Yesterday', ids: ['1'], times: ['22:00'] },
    ]);
    expect(result.visibility).toBe('');
  });

  test('keeps posts without a parseable date when their SSR group empties', async () => {
    // A leading undated post joins the first local run, a trailing one the
    // current run; both SSR groups they sat in are dropped as empty.
    const result = await runInlineScript('Etc/GMT-2', buildFeedHtml([
      { key: '2026-06-16', posts: [{ id: '4', datetime: '' }] },
      { key: '2026-06-15', posts: [{ id: '3', datetime: '2026-06-15T00:30:00.000Z' }] },
      { key: '2026-06-14', posts: [{ id: '2', datetime: '2026-06-14T23:30:00.000Z' }] },
      { key: '2026-06-13', posts: [{ id: '1', datetime: '' }] },
    ]));

    expect(result.groups).toEqual([
      { key: '2026-06-15', header: 'Today', ids: ['4', '3', '2', '1'], times: ['SSR', '02:30', '01:30', 'SSR'] },
    ]);
  });

  test('keeps UTC groups for a UTC visitor and is stable when run twice', async () => {
    const first = await runInlineScript('UTC', buildFeedHtml([
      { key: '2026-06-15', posts: [{ id: '2', datetime: '2026-06-15T00:30:00.000Z' }] },
      { key: '2026-06-14', posts: [{ id: '1', datetime: '2026-06-14T23:30:00.000Z' }] },
    ]));
    const page = await pageInTimezone('UTC');
    const before = await page.locator('[data-mood-list]').innerHTML();
    await page.addScriptTag({ content: inlineSource });
    const after = await page.locator('[data-mood-list]').innerHTML();

    expect(first.groups).toEqual([
      { key: '2026-06-15', header: 'Today', ids: ['2'], times: ['00:30'] },
      { key: '2026-06-14', header: 'Yesterday', ids: ['1'], times: ['23:30'] },
    ]);
    expect(after).toBe(before);
  });

  test('reveals the list even when regrouping throws', async () => {
    // A split has to mint a group with Element.after; break it mid-run. The
    // patch outlives setContent, so this test gets a throwaway context.
    const page = await newPage('Etc/GMT-2');
    try {
      await page.setContent(buildFeedHtml([
        {
          key: '2026-06-14',
          posts: [
            { id: '2', datetime: '2026-06-14T23:30:00.000Z' },
            { id: '1', datetime: '2026-06-14T20:00:00.000Z' },
          ],
        },
      ]));
      await page.evaluate(() => {
        Element.prototype.after = () => {
          throw new Error('after unavailable');
        };
      });
      await page.addScriptTag({ content: inlineSource });

      expect((await readFeed(page)).visibility).toBe('');
    } finally {
      await page.context().close();
    }
  });

  test('matches the module formatters for every header branch', async () => {
    // Client appends look groups up by `data-date`, and the inline script
    // carries its own formatter copies. Cover Today, Yesterday, this year and
    // an earlier year, and compare against date-grouping.ts in the same page.
    const posts = [
      { id: '4', datetime: '2026-06-15T00:30:00.000Z' },
      { id: '3', datetime: '2026-06-14T12:00:00.000Z' },
      { id: '2', datetime: '2026-03-01T12:00:00.000Z' },
      { id: '1', datetime: '2025-12-31T12:00:00.000Z' },
    ];
    const inline = await runInlineScript('Etc/GMT-2', buildFeedHtml([{ key: 'utc', posts }]));
    const page = await pageInTimezone('Etc/GMT-2');
    const expected = await page.evaluate(async ({ source, datetimes }) => {
      const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      try {
        const { formatMoodDateHeader, formatMoodDateKey, formatMoodTime } = await import(moduleUrl);
        return datetimes.map((datetime: string) => {
          const key = formatMoodDateKey(datetime);
          return { key, header: formatMoodDateHeader(key), time: formatMoodTime(datetime) };
        });
      } finally {
        URL.revokeObjectURL(moduleUrl);
      }
    }, { source: moduleSource, datetimes: posts.map((post) => post.datetime) });

    expect(inline.groups.map((group) => group.header)).toEqual([
      'Today',
      'Yesterday',
      'March 1',
      'December 31, 2025',
    ]);
    expect(inline.groups).toEqual(
      expected.map((entry, index) => ({
        key: entry.key,
        header: entry.header,
        ids: [posts[index].id],
        times: [entry.time],
      })),
    );
  });
});
