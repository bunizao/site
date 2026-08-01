import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser } from '@playwright/test';
import { join } from 'node:path';

let browser: Browser;
let moduleSource = '';

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
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL,
    headless: true,
  });
});

afterAll(async () => {
  await browser?.close();
});

// SSR-shaped feed: each entry becomes a mood-date-group whose members carry a
// `<time datetime>` so the client can recompute the local key.
function buildFeedHtml(groups: Array<{ key: string; posts: Array<{ id: string; datetime: string }> }>): string {
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
  return `<div data-mood-list>${groupHtml}</div>`;
}

async function runInTimezone<T>(
  timezoneId: string,
  html: string,
  evaluate: (args: { source: string }) => T | Promise<T>
): Promise<T> {
  const context = await browser.newContext({ timezoneId });
  const page = await context.newPage();
  try {
    await page.setContent(html);
    return await page.evaluate(evaluate, { source: moduleSource });
  } finally {
    await context.close();
  }
}

describe('mood date grouping formatters', () => {
  test('formats time and date key in the visitor timezone', async () => {
    const result = await runInTimezone('Etc/GMT-2', '<div id="x"></div>', async ({ source }) => {
      const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      try {
        const { formatMoodTime, formatMoodDateKey } = await import(moduleUrl);
        return {
          time: formatMoodTime('2026-06-14T23:30:00.000Z'),
          key: formatMoodDateKey('2026-06-14T23:30:00.000Z'),
        };
      } finally {
        URL.revokeObjectURL(moduleUrl);
      }
    });

    // UTC+2: 23:30Z is 01:30 on the next local day.
    expect(result.time).toBe('01:30');
    expect(result.key).toBe('2026-06-15');
  });
});

describe('rekeyMoodServerRenderedGroups', () => {
  test('merges two UTC groups that collapse to one local day', async () => {
    const html = buildFeedHtml([
      { key: '2026-06-15', posts: [{ id: '2', datetime: '2026-06-15T00:30:00.000Z' }] },
      { key: '2026-06-14', posts: [{ id: '1', datetime: '2026-06-14T23:30:00.000Z' }] },
    ]);

    const result = await runInTimezone('Etc/GMT-2', html, async ({ source }) => {
      const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      try {
        const { rekeyMoodServerRenderedGroups } = await import(moduleUrl);
        const list = document.querySelector<HTMLElement>('[data-mood-list]')!;
        rekeyMoodServerRenderedGroups(list);
        const groups = Array.from(list.querySelectorAll<HTMLElement>('.mood-date-group'));
        return {
          groupCount: groups.length,
          keys: groups.map((g) => g.dataset.date),
          firstGroupItems: groups[0]?.querySelectorAll('.mood-item').length ?? 0,
          times: Array.from(list.querySelectorAll<HTMLElement>('.mood-item-time'), (t) => t.textContent),
          lookupHits: groups[0]?.matches('[data-date="2026-06-15"]'),
        };
      } finally {
        URL.revokeObjectURL(moduleUrl);
      }
    });

    expect(result.groupCount).toBe(1);
    expect(result.keys).toEqual(['2026-06-15']);
    expect(result.firstGroupItems).toBe(2);
    expect(result.lookupHits).toBe(true);
    // Both times shifted to local (UTC+2).
    expect(result.times).toEqual(['02:30', '01:30']);
  });

  test('splits one UTC group across a local midnight boundary', async () => {
    const html = buildFeedHtml([
      {
        key: '2026-06-14',
        posts: [
          { id: '2', datetime: '2026-06-14T23:30:00.000Z' },
          { id: '1', datetime: '2026-06-14T20:00:00.000Z' },
        ],
      },
    ]);

    const result = await runInTimezone('Etc/GMT-2', html, async ({ source }) => {
      const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      try {
        const { rekeyMoodServerRenderedGroups } = await import(moduleUrl);
        const list = document.querySelector<HTMLElement>('[data-mood-list]')!;
        rekeyMoodServerRenderedGroups(list);
        const groups = Array.from(list.querySelectorAll<HTMLElement>('.mood-date-group'));
        return {
          keys: groups.map((g) => g.dataset.date),
          itemsPerGroup: groups.map((g) => Array.from(g.querySelectorAll<HTMLElement>('.mood-item'), (i) => i.dataset.moodId)),
        };
      } finally {
        URL.revokeObjectURL(moduleUrl);
      }
    });

    expect(result.keys).toEqual(['2026-06-15', '2026-06-14']);
    expect(result.itemsPerGroup).toEqual([['2'], ['1']]);
  });

  test('is a no-op for a UTC visitor and idempotent when run twice', async () => {
    const html = buildFeedHtml([
      { key: '2026-06-15', posts: [{ id: '2', datetime: '2026-06-15T00:30:00.000Z' }] },
      { key: '2026-06-14', posts: [{ id: '1', datetime: '2026-06-14T23:30:00.000Z' }] },
    ]);

    const result = await runInTimezone('UTC', html, async ({ source }) => {
      const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      try {
        const { rekeyMoodServerRenderedGroups } = await import(moduleUrl);
        const list = document.querySelector<HTMLElement>('[data-mood-list]')!;
        rekeyMoodServerRenderedGroups(list);
        const afterFirst = list.innerHTML;
        rekeyMoodServerRenderedGroups(list);
        const afterSecond = list.innerHTML;
        const groups = Array.from(list.querySelectorAll<HTMLElement>('.mood-date-group'));
        return {
          stable: afterFirst === afterSecond,
          keys: groups.map((g) => g.dataset.date),
          times: Array.from(list.querySelectorAll<HTMLElement>('.mood-item-time'), (t) => t.textContent),
        };
      } finally {
        URL.revokeObjectURL(moduleUrl);
      }
    });

    expect(result.stable).toBe(true);
    expect(result.keys).toEqual(['2026-06-15', '2026-06-14']);
    // UTC visitor: times reflect the source datetimes unchanged.
    expect(result.times).toEqual(['00:30', '23:30']);
  });
});
