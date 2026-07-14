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
  browser = await chromium.launch({ headless: true });
});

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
            lineStagger: 0,
            maxLineDuration: 0,
            minLineDuration: 0,
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
            donePower: 15,
            ease: (progress: number) => progress,
            fontTimeout: 0,
            maxLineDuration: 0.8,
            minLineDuration: 0.8,
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

  test('still collapses consecutive whitespace into one cell', async () => {
    const input = 'A \t\n  B';

    expect(await decodeCells(input)).toEqual(['A', ' ', 'B']);
    expect(await decodeCells(input, { segmenter: false })).toEqual(['A', ' ', 'B']);
  });
});
