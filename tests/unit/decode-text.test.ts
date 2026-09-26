import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser, type Page } from '@playwright/test';
import { join } from 'node:path';
import type { prepareDecode } from '../../packages/decode-text/src/index';

declare global {
  interface Window {
    __dt: { prepareDecode: typeof prepareDecode; step: () => boolean };
  }
}

let browser: Browser;
let page: Page;
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
  page = await browser.newPage();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

/**
 * Loads `html`, swaps rAF and performance.now for a manual 60fps clock, and
 * imports a fresh copy of the engine as `window.__dt`. `step()` runs one frame
 * and reports whether another is queued, so a multi-second reveal plays out
 * synchronously instead of on the display clock.
 */
async function setup(html: string, { segmenter = true } = {}): Promise<void> {
  await page.setContent(html);
  await page.evaluate(
    async ({ source, segmenter }) => {
      const pending = new Map<number, FrameRequestCallback>();
      let nextId = 1;
      let now = 0;
      window.requestAnimationFrame = (callback) => {
        pending.set(nextId, callback);
        return nextId++;
      };
      window.cancelAnimationFrame = (id) => {
        pending.delete(id);
      };
      Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
      const step = () => {
        now += 1000 / 60;
        const due = [...pending.values()];
        pending.clear();
        for (const callback of due) callback(now);
        return pending.size > 0;
      };

      // The engine picks its grapheme splitter at import time.
      const segmenterDescriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')!;
      if (!segmenter) {
        Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
      }
      const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      try {
        const engine = await import(moduleUrl);
        window.__dt = { prepareDecode: engine.prepareDecode, step };
      } finally {
        URL.revokeObjectURL(moduleUrl);
        Object.defineProperty(Intl, 'Segmenter', segmenterDescriptor);
      }
    },
    { source: moduleSource, segmenter }
  );
}

async function decodeCells(text: string, options: { segmenter?: boolean } = {}): Promise<string[]> {
  await setup('<div id="target"></div>', options);
  return page.evaluate(async (input) => {
    const { prepareDecode, step } = window.__dt;
    const root = document.querySelector<HTMLElement>('#target')!;
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
    while (step()) {}
    await controller.finished;

    return Array.from(root.querySelectorAll<HTMLElement>('.dt-c'), (cell) => cell.textContent ?? '');
  }, text);
}

async function firstScrambleGlyph(charset: string): Promise<string | null> {
  await setup('<div id="target">AB</div>');
  return page.evaluate(async (glyphs) => {
    const { prepareDecode, step } = window.__dt;
    const root = document.querySelector<HTMLElement>('#target')!;
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

    let glyph: string | null = null;
    let more = true;
    while (more && glyph === null) {
      more = step();
      glyph = root.querySelector<HTMLElement>('.dt-c[data-state="scramble"]')?.textContent ?? null;
    }
    controller.cancel();
    return glyph;
  }, charset);
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
  await setup(`<div id="target">${INTERLEAVE_TEXT}</div>`);
  return page.evaluate(
    async ({ input, queueOrder }) => {
      const { prepareDecode, step } = window.__dt;
      const root = document.querySelector<HTMLElement>('#target')!;
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
      let interleaved = false;
      controller.start();

      let more = true;
      while (more) {
        more = step();
        let sawUnsettled = false;
        cells.forEach((cell, index) => {
          const settled = !cell.dataset.state && cell.textContent === input[index];
          if (!settled) sawUnsettled = true;
          else if (sawUnsettled) interleaved = true;
        });
      }

      return interleaved;
    },
    { input: INTERLEAVE_TEXT, queueOrder: order }
  );
}

const BURST_TEXT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGH';

/**
 * Largest number of characters that flip from scramble to final text within a
 * single frame. The whole point of the separated fronts is that this stays a
 * trickle; the old three-power-front schedule resolved most of a line at once.
 */
async function largestSettleBurst(): Promise<{ burst: number; total: number }> {
  // Wide enough that the sample never wraps into a second visual line.
  await setup(`<div id="target" style="width:4000px">${BURST_TEXT}</div>`);
  return page.evaluate(async (input) => {
    const { prepareDecode, step } = window.__dt;
    const root = document.querySelector<HTMLElement>('#target')!;
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
    controller.start();

    let burst = 0;
    let previous = 0;
    let more = true;
    while (more) {
      more = step();
      const settled = cells.filter((cell, i) => cell.textContent === input[i]).length;
      burst = Math.max(burst, settled - previous);
      previous = settled;
    }
    return { burst, total: cells.length };
  }, BURST_TEXT);
}

/**
 * Order in which visual lines reach full settlement, plus the elapsed fraction
 * of the reveal at which the first one landed. Order guards against a short
 * wrapped remnant overtaking the long line above it; the fraction guards
 * against the lines being played back to back, which is what a per-line ease
 * produced — the first line finished a fifth of the way in and then sat there.
 */
async function lineCompletions(texts: string[]): Promise<{ order: number[]; firstAt: number }> {
  await setup(`<div id="target" style="width:4000px">${texts.join('<br>')}</div>`);
  return page.evaluate(async (expected) => {
    const { prepareDecode, step } = window.__dt;
    const root = document.querySelector<HTMLElement>('#target')!;
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
    let firstFrame = 0;
    let frames = 0;
    controller.start();

    let more = true;
    while (more) {
      more = step();
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
  }, texts);
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

  test('a settled cell never flickers back and the slot count holds', async () => {
    // Hero bio shape: paragraphs, link atoms, wrapped lines, engine defaults.
    await setup(
      '<div id="target" style="width:420px">' +
        '<p>I build <a href="/projects" data-decode-atom>projects</a> and study at ' +
        '<a href="#" data-decode-atom>Monash University</a>.</p>' +
        '<p>I also <a href="/blog" data-decode-atom>write</a>, about design engineering, ' +
        'motion and the quiet parts of software.</p>' +
        '</div>'
    );
    const result = await page.evaluate(async () => {
      const random = Math.random;
      let seed = 0x2f6e2b1;
      Math.random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
      };
      try {
        const { prepareDecode, step } = window.__dt;
        const root = document.querySelector<HTMLElement>('#target')!;
        const original = root.innerHTML;
        const controller = await prepareDecode(root, {
          fontTimeout: 0,
          respectReducedMotion: false,
          restore: true,
        });

        const cells = Array.from(root.querySelectorAll<HTMLElement>('.dt-c'));
        const settled = new Map<HTMLElement, string>();
        let regressed = 0;
        let slotDrift = false;
        controller.start();

        let more = true;
        while (more) {
          more = step();
          // `restore` swaps the cells back for the original markup at the end.
          const live = root.querySelectorAll('.dt-c').length;
          if (live === 0) break;
          if (live !== cells.length) slotDrift = true;
          for (const cell of cells) {
            const final = settled.get(cell);
            if (final !== undefined && (cell.dataset.state || cell.textContent !== final)) regressed += 1;
            if (!cell.dataset.state && cell.textContent && cell.textContent !== ' ') {
              settled.set(cell, cell.textContent);
            }
          }
        }
        await controller.finished;

        return { regressed, slotDrift, restored: root.innerHTML === original };
      } finally {
        Math.random = random;
      }
    });

    expect(result).toEqual({ regressed: 0, slotDrift: false, restored: true });
  });
});

describe('decode-text grapheme handling', () => {
  test('reveals one cell per user-visible grapheme', async () => {
    const cells = await decodeCells('A😀𠮷é👩‍💻');

    expect(cells).toEqual(['A', '😀', '𠮷', 'é', '👩‍💻']);
  });

  test('keeps graphemes intact when Intl.Segmenter is unavailable', async () => {
    const cells = await decodeCells('A😀𠮷é👩‍💻', { segmenter: false });

    expect(cells).toEqual(['A', '😀', '𠮷', 'é', '👩‍💻']);
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

describe('decode-text markup', () => {
  const MARKUP =
    '<p>Study at <a class="pill" href="#" data-decode-atom><i class="icon"></i>Monash University</a>.</p>' +
    '<p>I <a class="link" href="/blog" data-decode-atom>write</a> things.</p>';
  const TARGET = `<div id="target" style="width:240px;font:16px monospace">${MARKUP}</div>`;

  // Snapshot the DOM mid-reveal (prepared, before any frame runs) and after.
  async function decodeMarkup(restore: boolean) {
    await setup(TARGET);
    return page.evaluate(async (restore) => {
      const { prepareDecode, step } = window.__dt;
      const root = document.querySelector<HTMLElement>('#target')!;
      const original = root.innerHTML;
      const controller = await prepareDecode(root, {
        durationPerChar: 0,
        fontTimeout: 0,
        maxDuration: 0,
        minDuration: 0,
        respectReducedMotion: false,
        restore,
      });
      const mid = {
        paragraphs: root.querySelectorAll('p').length,
        pill: root.querySelectorAll('.pill').length,
        pillIcon: root.querySelectorAll('.pill > .icon').length,
        pillCells: root.querySelectorAll('.pill .dt-c').length,
        link: root.querySelectorAll('.link').length,
      };
      controller.start();
      while (step()) {}
      await controller.finished;
      return { mid, restored: root.innerHTML === original, cellsAfter: root.querySelectorAll('.dt-c').length };
    }, restore);
  }

  test('decodes every paragraph and keeps atoms whole', async () => {
    const { mid } = await decodeMarkup(false);

    expect(mid).toEqual({ paragraphs: 2, pill: 1, pillIcon: 1, pillCells: 17, link: 1 });
  });

  test('puts the original markup back when restore is on', async () => {
    expect(await decodeMarkup(true)).toMatchObject({ restored: true, cellsAfter: 0 });
    expect(await decodeMarkup(false)).toMatchObject({ restored: false });
  });

  test('a hidden tab force-finishes the reveal so text never stays scrambled', async () => {
    await setup(TARGET);
    const result = await page.evaluate(async () => {
      const { prepareDecode, step } = window.__dt;
      const root = document.querySelector<HTMLElement>('#target')!;
      const original = root.innerHTML;
      const controller = await prepareDecode(root, {
        fontTimeout: 0,
        respectReducedMotion: false,
        restore: true,
      });
      controller.start();
      for (let frame = 0; frame < 5; frame += 1) step();
      const midReveal = root.classList.contains('dt-animating');

      // A background tab stops rAF, so no further frame will ever arrive.
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      try {
        document.dispatchEvent(new Event('visibilitychange'));
      } finally {
        delete (document as unknown as { visibilityState?: string }).visibilityState;
      }
      const finished = await Promise.race([
        controller.finished.then(() => true),
        new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 100)),
      ]);

      return {
        midReveal,
        finished,
        restored: root.innerHTML === original,
        animating: root.classList.contains('dt-animating'),
      };
    });

    expect(result).toEqual({ midReveal: true, finished: true, restored: true, animating: false });
  });
});
