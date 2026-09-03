import { expect, test, type Page } from '@playwright/test';

const PREVIEW = '/components/preview/mood-wheel';
const DRAG_X = 30;

interface WheelState {
  anchors: number[];
  scrollY: number;
  viewportHeight: number;
  progress: number;
}

async function readWheelState(page: Page): Promise<WheelState> {
  return page.evaluate(() => {
    const groups = Array.from(document.querySelectorAll<HTMLElement>('.mood-date-group'));
    const anchors = groups.map((group) => {
      const header = group.querySelector<HTMLElement>('.mood-date-header') ?? group;
      return window.scrollY + header.getBoundingClientRect().top;
    });
    const viewportHeight = document.documentElement.clientHeight;
    const focusY = window.scrollY + viewportHeight * 0.5;

    let progress = 0;
    for (let index = 0; index < anchors.length; index += 1) {
      const start = anchors[index];
      const end = index + 1 < anchors.length
        ? anchors[index + 1]
        : document.documentElement.scrollHeight;
      if (focusY < end) {
        progress = index + Math.max(0, (focusY - start) / Math.max(end - start, 1));
        break;
      }
      progress = index + 1;
    }

    return { anchors, scrollY: window.scrollY, viewportHeight, progress };
  });
}

async function openWheel(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(PREVIEW);
  await expect(page.locator('.timeline-notch.is-major').first()).toBeVisible();
  await expect(page.locator('[data-timeline-wheel]')).toHaveClass(/is-visible/);
}

/**
 * Press on the dial and drag `distance` px without releasing.
 *
 * `hold` decides what the release will mean. A deliberate drag ends with the
 * pointer at rest, so there is no throw to coast on and the wheel simply snaps —
 * that is the gesture for landing on a day you meant. A flick releases while
 * still moving, which is the gesture for fast travel.
 */
async function grabAndDrag(
  page: Page,
  distance: number,
  { hold = true }: { hold?: boolean } = {},
): Promise<void> {
  const surface = page.locator('[data-timeline-top]');
  const box = await surface.boundingBox();
  if (!box) throw new Error('wheel drag surface has no box');

  const startY = box.y + box.height * 0.5 - distance * 0.5;
  await page.mouse.move(DRAG_X, startY);
  await page.mouse.down();
  const steps = 12;
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(DRAG_X, startY + (distance * step) / steps);
    await page.waitForTimeout(16);
  }

  if (!hold) return;
  for (let step = 0; step < 4; step += 1) {
    await page.mouse.move(DRAG_X, startY + distance);
    await page.waitForTimeout(40);
  }
}

async function settle(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const first = await page.evaluate(() => window.scrollY);
      await page.waitForTimeout(140);
      const second = await page.evaluate(() => window.scrollY);
      return first === second;
    }, { timeout: 8_000 })
    .toBe(true);
}

test.describe('mood timeline wheel', () => {
  test('graduates the notches by how busy each day was', async ({ page }) => {
    await openWheel(page);

    // The fixture's per-day post counts, in feed order.
    const counts = [3, 1, 9, 2, 6, 1, 12, 4, 1, 7];
    // The notches are rotated into the arc, so a bounding box measures the
    // rotation, not the graduation. Read the laid-out width instead. Notches
    // near the active date are widened by their own state and are excluded:
    // density is what separates the notches at rest.
    const measured = await page.locator('.timeline-notch.is-major').evaluateAll(
      (notches) => notches.map((notch) => ({
        width: parseFloat(getComputedStyle(notch).width),
        plain: !/is-(active|neighbor|near)/.test(notch.className),
      })),
    );

    expect(measured).toHaveLength(counts.length);

    const resting = counts
      .map((count, index) => ({ count, ...measured[index] }))
      .filter((entry) => entry.plain);

    expect(resting.length).toBeGreaterThan(3);
    expect(new Set(resting.map((entry) => entry.width)).size).toBeGreaterThan(1);

    // Monotonic in the count, not merely different at the extremes.
    const byCount = [...resting].sort((a, b) => a.count - b.count);
    for (let index = 1; index < byCount.length; index += 1) {
      expect(byCount[index].width).toBeGreaterThanOrEqual(byCount[index - 1].width);
    }
  });

  test('drags the feed by date, at a rate independent of section height', async ({ page }) => {
    await openWheel(page);

    // 26px of drag per date is the controller's PX_PER_DATE. Crossing the
    // fixture's tallest day (12 posts) must cost the same drag as its shortest.
    const distance = 26 * 4;

    const start = await readWheelState(page);
    await grabAndDrag(page, distance);
    const dragged = await readWheelState(page);
    await page.mouse.up();
    const firstTravel = dragged.progress - start.progress;

    expect(firstTravel).toBeGreaterThan(3.5);
    expect(firstTravel).toBeLessThan(4.5);

    // The same drag again from there, now crossing the 12-post day — which is
    // more than three times the height of the days the first drag crossed.
    await settle(page);
    const before = await readWheelState(page);
    await grabAndDrag(page, distance);
    const after = await readWheelState(page);
    await page.mouse.up();
    const secondTravel = after.progress - before.progress;

    expect(secondTravel).toBeGreaterThan(3.5);
    expect(secondTravel).toBeLessThan(4.5);
    expect(Math.abs(secondTravel - firstTravel)).toBeLessThan(0.5);
  });

  test('comes to rest on a date, with its header on the readout line', async ({ page }) => {
    await openWheel(page);

    await grabAndDrag(page, 26 * 3.4);
    await page.mouse.up();
    await settle(page);

    const state = await readWheelState(page);
    const expected = state.anchors.map((anchor) => anchor - state.viewportHeight * 0.5);
    const nearest = expected.reduce(
      (best, candidate) =>
        Math.abs(candidate - state.scrollY) < Math.abs(best - state.scrollY) ? candidate : best,
      expected[0],
    );

    expect(Math.abs(state.scrollY - nearest)).toBeLessThan(2);
  });

  test('keeps the readout on the date while scrubbing, not the back-to-top cue', async ({ page }) => {
    await openWheel(page);

    await grabAndDrag(page, 26 * 3);
    const label = await page.locator('[data-timeline-label]').innerText();
    await page.mouse.up();

    expect(label).not.toContain('TOP');
  });

  test('still treats a press that never moved as back to top', async ({ page }) => {
    await openWheel(page);

    await page.mouse.move(DRAG_X, 400);
    await page.mouse.down();
    for (let step = 0; step < 6; step += 1) await page.mouse.move(DRAG_X, 400);
    await page.mouse.up();
    await settle(page);

    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(600);

    // And a real drag must NOT also fire back-to-top on release.
    await grabAndDrag(page, 26 * 4);
    await page.mouse.up();
    await settle(page);

    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  });

  test('steps one date per arrow key', async ({ page }) => {
    await openWheel(page);

    await page.locator('[data-timeline-top]').focus();
    const start = await readWheelState(page);
    const base = Math.floor(start.progress);

    await page.keyboard.press('ArrowDown');
    await settle(page);
    expect(Math.round((await readWheelState(page)).progress)).toBe(base + 1);

    await page.keyboard.press('ArrowDown');
    await settle(page);
    expect(Math.round((await readWheelState(page)).progress)).toBe(base + 2);

    await page.keyboard.press('ArrowUp');
    await settle(page);
    expect(Math.round((await readWheelState(page)).progress)).toBe(base + 1);
  });

  test('spins to a different day on shuffle', async ({ page }) => {
    await openWheel(page);

    const shuffle = page.locator('[data-timeline-shuffle]');
    await page.locator('[data-timeline-wheel]').hover();
    await expect(shuffle).toBeVisible();

    const before = await readWheelState(page);
    await shuffle.click();
    await settle(page);
    const after = await readWheelState(page);

    expect(Math.round(after.progress)).not.toBe(Math.round(before.progress));
    // A spin lands on a date, like every other way the dial comes to rest.
    const expected = after.anchors.map((anchor) => anchor - after.viewportHeight * 0.5);
    const nearest = expected.reduce(
      (best, candidate) =>
        Math.abs(candidate - after.scrollY) < Math.abs(best - after.scrollY) ? candidate : best,
      expected[0],
    );
    expect(Math.abs(after.scrollY - nearest)).toBeLessThan(2);
  });

  test('coasts on a flick, and stops well short of the far end', async ({ page }) => {
    await openWheel(page);

    const start = await readWheelState(page);
    await grabAndDrag(page, 26 * 3, { hold: false });
    await page.mouse.up();
    await settle(page);
    const after = await readWheelState(page);

    const travel = after.progress - start.progress;
    // Further than the drag itself — that is the point of a flick …
    expect(travel).toBeGreaterThan(3.5);
    // … but bounded, so a throw never loses you in the archive.
    expect(travel).toBeLessThan(16);
  });
});

// ── The real /mood page ─────────────────────────────────────────────────────
// The preview fixture scrolls the document; /mood scrolls a contained element
// instead (see src/lib/page-scroll.ts), so the wheel's write path only really
// counts as covered here. The feed is mocked so the test owns its own dates.

const DAY_COUNTS = [2, 5, 1, 8, 3, 6, 1, 4];
// Long enough that the mocked feed genuinely overflows the scroller. A feed
// shorter than the viewport has nowhere to scrub to, and the test would pass or
// fail on content length rather than on the wheel.
const FILLER = 'wheel fixture body text '.repeat(12);

function createDatedFeed() {
  const posts = DAY_COUNTS.flatMap((count, dayIndex) =>
    Array.from({ length: count }, (_, itemIndex) => {
      const day = String(20 - dayIndex).padStart(2, '0');
      const hour = String(20 - itemIndex).padStart(2, '0');
      const id = `${dayIndex}${itemIndex}`.padStart(4, '9');
      return {
        id,
        datetime: `2026-02-${day}T${hour}:00:00+00:00`,
        tag: 'e2e',
        previewText: `Day ${dayIndex} item ${itemIndex}. ${FILLER}`,
        previewHtml: `Day ${dayIndex} item ${itemIndex}. ${FILLER}`,
        image: null,
        mediaHtml: '',
        needsDetailPage: false,
        forwardedFrom: null,
        quote: null,
        reactions: [],
        commentsCount: 0,
      };
    }),
  );

  return {
    posts,
    channel: { slug: 'e2e', title: 'E2E Channel', description: 'Wheel fixture', avatar: '' },
  };
}

async function openMoodFeed(page: Page): Promise<void> {
  const payload = createDatedFeed();
  await page.route('**/api/moods**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('probe') === '1') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ latestId: payload.posts[0].id }),
      });
      return;
    }
    if (url.searchParams.has('before')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts: [], channel: payload.channel }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/mood');
  await expect(page.locator('[data-mood-feed]')).not.toHaveClass(/is-hidden/, { timeout: 30_000 });
  await expect(page.locator('[data-timeline-wheel]')).toHaveClass(/is-visible/, { timeout: 30_000 });
  await expect
    .poll(() => page.locator('.mood-date-group').count(), { timeout: 30_000 })
    .toBe(DAY_COUNTS.length);

  // Precondition: there is somewhere to scrub to.
  const range = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('[data-page-scroller]');
    if (!scroller) throw new Error('/mood is expected to use a contained scroller');
    return scroller.scrollHeight - scroller.clientHeight;
  });
  expect(range).toBeGreaterThan(2_000);
}

const scrollTop = (page: Page): Promise<number> =>
  page.evaluate(() => (
    document.querySelector<HTMLElement>('[data-page-scroller]') ?? document.documentElement
  ).scrollTop);

test.describe('mood timeline wheel on the feed', () => {
  test('scrubs the contained scroller and graduates its notches', async ({ page }) => {
    await openMoodFeed(page);

    const measured = await page.locator('.timeline-notch.is-major').evaluateAll(
      (notches) => notches.map((notch) => ({
        weight: parseFloat(notch.style.getPropertyValue('--notch-weight')),
        plain: !/is-(active|neighbor|near)/.test(notch.className),
      })),
    );

    // Every day is measured, and the busiest outweighs the quietest.
    expect(measured.map((entry) => entry.weight)).toHaveLength(DAY_COUNTS.length);
    const busiest = DAY_COUNTS.indexOf(Math.max(...DAY_COUNTS));
    const quietest = DAY_COUNTS.indexOf(Math.min(...DAY_COUNTS));
    expect(measured[busiest].weight).toBeGreaterThan(measured[quietest].weight);

    expect(await scrollTop(page)).toBe(0);

    await grabAndDrag(page, 26 * 3);
    const scrubbed = await scrollTop(page);
    await page.mouse.up();

    expect(scrubbed).toBeGreaterThan(0);

    // And the readout followed the dial to a real date rather than staying put.
    const label = await page.locator('[data-timeline-label]').innerText();
    expect(label.replace(/\s+/g, '')).not.toBe('');
    expect(label).not.toContain('TOP');
  });
});
