import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser } from '@playwright/test';
import { join } from 'node:path';

let browser: Browser;
let moduleSource = '';

beforeAll(async () => {
  const build = await Bun.build({
    entrypoints: [join(import.meta.dir, '../../packages/decode-text/src/index.ts')],
    format: 'esm',
    target: 'browser',
  });
  if (!build.success) {
    throw new AggregateError(build.logs, 'Could not build decode-text for browser tests');
  }

  moduleSource = await build.outputs[0].text();
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL,
    headless: true,
  });
}, 15_000);

afterAll(async () => {
  await browser?.close();
});

async function decodeCells(text: string, options: { segmenter?: boolean } = {}): Promise<string[]> {
  const page = await browser.newPage();
  try {
    await page.setContent('<div id="target"></div>');
    return await page.evaluate(
      async ({ source, input, segmenter }) => {
        if (!segmenter) {
          Object.defineProperty(Intl, 'Segmenter', {
            configurable: true,
            value: undefined,
          });
        }
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { prepareDecode } = await import(moduleUrl);
          const root = document.querySelector<HTMLElement>('#target');
          if (!root) throw new Error('Missing decode target');

          root.textContent = input;
          const controller = await prepareDecode(root, {
            durationPerChar: 0,
            fontTimeout: 0,
            maxDuration: 0,
            minDuration: 0,
            order: 'ltr',
            respectReducedMotion: false,
          });
          controller.start();
          await controller.finished;

          return Array.from(root.querySelectorAll<HTMLElement>('.dt-c'), (cell) => cell.textContent ?? '');
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      },
      { source: moduleSource, input: text, segmenter: options.segmenter ?? true }
    );
  } finally {
    await page.close();
  }
}

async function firstScrambleGlyph(charset: string): Promise<string> {
  const page = await browser.newPage();
  try {
    await page.setContent('<div id="target">AB</div>');
    return await page.evaluate(
      async ({ source, glyphs }) => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { prepareDecode } = await import(moduleUrl);
          const root = document.querySelector<HTMLElement>('#target');
          if (!root) throw new Error('Missing decode target');

          const controller = await prepareDecode(root, {
            charset: glyphs,
            ease: (progress: number) => progress,
            fontTimeout: 0,
            maxDuration: 0.8,
            minDuration: 0.8,
            mutationHz: 18,
            order: 'ltr',
            respectReducedMotion: false,
            scrambleFromText: false,
          });
          controller.start();
          const glyph = await new Promise<string>((resolve, reject) => {
            const deadline = performance.now() + 2_000;
            const inspect = () => {
              const cell = root.querySelector<HTMLElement>('.dt-c[data-state="scramble"]');
              if (cell) resolve(cell.textContent ?? '');
              else if (performance.now() >= deadline) reject(new Error('No scramble frame rendered'));
              else requestAnimationFrame(inspect);
            };
            inspect();
          });
          controller.cancel();
          return glyph;
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      },
      { source: moduleSource, glyphs: charset }
    );
  } finally {
    await page.close();
  }
}

const INTERLEAVE_TEXT = 'ABCDEFGHIJKLMNOP';

/**
 * True if a settled character was ever seen with an unsettled one to its left.
 * In shuffle mode that interleaving is the effect: settled and boiling
 * characters mixed across the line, no single edge to follow. In `ltr` mode it
 * must never happen, because resolution is the mash front shifted and that
 * front is ordered there.
 */
async function hasInterleavedSettlement(order: 'shuffle' | 'ltr'): Promise<boolean> {
  const page = await browser.newPage();
  try {
    await page.setContent(`<div id="target">${INTERLEAVE_TEXT}</div>`);
    return await page.evaluate(
      async ({ source, input, queueOrder }) => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { prepareDecode } = await import(moduleUrl);
          const root = document.querySelector<HTMLElement>('#target');
          if (!root) throw new Error('Missing decode target');

          const controller = await prepareDecode(root, {
            charset: '#',
            cursorChar: '-',
            ease: (progress: number) => progress,
            fontTimeout: 0,
            maxDuration: 0.3,
            minDuration: 0.3,
            mutationHz: 18,
            order: queueOrder,
            respectReducedMotion: false,
            scrambleFromText: false,
          });

          const cells = Array.from(root.querySelectorAll<HTMLElement>('.dt-c'));
          let finished = false;
          let interleaved = false;
          void controller.finished.then(() => {
            finished = true;
          });
          controller.start();

          while (!finished) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            let sawUnsettled = false;
            cells.forEach((cell, index) => {
              const settled = !cell.dataset.state && cell.textContent === input[index];
              if (!settled) sawUnsettled = true;
              else if (sawUnsettled) interleaved = true;
            });
          }

          return interleaved;
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      },
      { source: moduleSource, input: INTERLEAVE_TEXT, queueOrder: order }
    );
  } finally {
    await page.close();
  }
}

const BURST_TEXT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGH';

/**
 * Largest number of characters that flip from scramble to final text within a
 * single frame. The whole point of the separated fronts is that this stays a
 * trickle; the old three-power-front schedule resolved most of a line at once.
 */
async function largestSettleBurst(): Promise<{ burst: number; total: number }> {
  const page = await browser.newPage();
  try {
    // Wide enough that the sample never wraps into a second visual line.
    await page.setContent(`<div id="target" style="width:4000px">${BURST_TEXT}</div>`);
    return await page.evaluate(
      async ({ source, input }) => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { prepareDecode } = await import(moduleUrl);
          const root = document.querySelector<HTMLElement>('#target');
          if (!root) throw new Error('Missing decode target');

          const controller = await prepareDecode(root, {
            charset: '#',
            cursorChar: '-',
            ease: (progress: number) => progress,
            fontTimeout: 0,
            maxDuration: 2,
            minDuration: 2,
            order: 'shuffle',
            respectReducedMotion: false,
            scrambleFromText: false,
          });

          const cells = Array.from(root.querySelectorAll<HTMLElement>('.dt-c'));
          let finished = false;
          void controller.finished.then(() => {
            finished = true;
          });
          controller.start();

          let burst = 0;
          let previous = 0;
          while (!finished) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            const settled = cells.filter((cell, i) => cell.textContent === input[i]).length;
            burst = Math.max(burst, settled - previous);
            previous = settled;
          }
          return { burst, total: cells.length };
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      },
      { source: moduleSource, input: BURST_TEXT }
    );
  } finally {
    await page.close();
  }
}

/**
 * Order in which visual lines reach full settlement, plus the elapsed fraction
 * of the reveal at which the first one landed. Order guards against a short
 * wrapped remnant overtaking the long line above it; the fraction guards
 * against the lines being played back to back, which is what a per-line ease
 * produced — the first line finished a fifth of the way in and then sat there.
 */
async function lineCompletions(
  texts: string[]
): Promise<{ order: number[]; firstAt: number }> {
  const page = await browser.newPage();
  try {
    await page.setContent(`<div id="target" style="width:4000px">${texts.join('<br>')}</div>`);
    return await page.evaluate(
      async ({ source, expected }) => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { prepareDecode } = await import(moduleUrl);
          const root = document.querySelector<HTMLElement>('#target');
          if (!root) throw new Error('Missing decode target');

          const controller = await prepareDecode(root, {
            charset: '#',
            cursorChar: '-',
            fontTimeout: 0,
            order: 'shuffle',
            respectReducedMotion: false,
            scrambleFromText: false,
          });

          const lines = Array.from(root.querySelectorAll<HTMLElement>('.dt-line'), (block) =>
            Array.from(block.querySelectorAll<HTMLElement>('.dt-c'))
          );
          const order: number[] = [];
          let finished = false;
          let firstFrame = 0;
          let frames = 0;
          void controller.finished.then(() => {
            finished = true;
          });
          controller.start();

          while (!finished) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            frames += 1;
            lines.forEach((cells, index) => {
              if (order.includes(index)) return;
              if (cells.every((cell, i) => cell.textContent === expected[index][i])) {
                order.push(index);
                if (order.length === 1) firstFrame = frames;
              }
            });
          }
          return { order, firstAt: firstFrame / frames };
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      },
      { source: moduleSource, expected: texts }
    );
  } finally {
    await page.close();
  }
}

describe('decode-text scheduling', () => {
  test('resolves as a trickle instead of one end-of-line snap', async () => {
    const { burst, total } = await largestSettleBurst();

    expect(burst).toBeLessThan(total * 0.25);
  });

  test('completes visual lines in reading order', async () => {
    // A short remnant after a long line is the case that used to invert:
    // duration tracks character count, so the short line finished first.
    const { order } = await lineCompletions([
      'THEQUICKBROWNFOXJUMPSOVERTHELAZYDOGANDKEEPSONRUNNING',
      'SHORTONE',
    ]);

    expect(order).toEqual([0, 1]);
  });

  test('runs the lines together instead of one after another', async () => {
    // Every line shares one eased timeline, so they are all still boiling when
    // the first one lands and the completions bunch into the tail. Easing each
    // line on its own instead finished line one at a fifth of the reveal and
    // left it static while the rest queued up behind it.
    const { firstAt } = await lineCompletions([
      'THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG',
      'PACKMYBOXWITHFIVEDOZENLIQUORJUGSNOW',
      'HOWVEXINGLYQUICKDAFTZEBRASJUMPTODAY',
      'SPHINXOFBLACKQUARTZJUDGEMYVOWTONIGHT',
    ]);

    expect(firstAt).toBeGreaterThan(0.5);
  });
});

describe('decode-text grapheme handling', () => {
  test('reveals one cell per user-visible grapheme', async () => {
    const cells = await decodeCells('A😀𠮷e\u0301👩‍💻');

    expect(cells).toEqual(['A', '😀', '𠮷', 'e\u0301', '👩‍💻']);
  });

  test('keeps graphemes intact when Intl.Segmenter is unavailable', async () => {
    const cells = await decodeCells('A😀𠮷e\u0301👩‍💻', { segmenter: false });

    expect(cells).toEqual(['A', '😀', '𠮷', 'e\u0301', '👩‍💻']);
  });

  test('keeps emoji modifiers and regional flags intact in the fallback', async () => {
    const cells = await decodeCells('👋🏽🇸🇬', { segmenter: false });

    expect(cells).toEqual(['👋🏽', '🇸🇬']);
  });

  test('renders a custom grapheme charset without splitting its glyphs', async () => {
    expect(await firstScrambleGlyph('👩‍💻')).toBe('👩‍💻');
  });

  test('interleaves settled and boiling characters in shuffle mode', async () => {
    expect(await hasInterleavedSettlement('shuffle')).toBe(true);
  });

  test('keeps final resolution left to right in ltr mode', async () => {
    expect(await hasInterleavedSettlement('ltr')).toBe(false);
  });

  test('still collapses consecutive whitespace into one cell', async () => {
    const input = 'A \t\n  B';

    expect(await decodeCells(input)).toEqual(['A', ' ', 'B']);
    expect(await decodeCells(input, { segmenter: false })).toEqual(['A', ' ', 'B']);
  });
});
