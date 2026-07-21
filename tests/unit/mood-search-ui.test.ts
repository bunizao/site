import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser } from '@playwright/test';
import { join } from 'node:path';

let browser: Browser;
let moduleSource = '';

beforeAll(async () => {
  const build = await Bun.build({
    entrypoints: [join(import.meta.dir, '../../src/features/mood/client/search-panel.ts')],
    format: 'esm',
    target: 'browser',
  });
  if (!build.success) {
    throw new AggregateError(build.logs, 'Could not build search-panel for browser tests');
  }
  moduleSource = await build.outputs[0].text();
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
});

const PANEL_MARKUP = `
  <div data-mood-search>
    <button data-mood-search-toggle aria-expanded="false" aria-controls="mood-search-panel"></button>
    <div id="mood-search-panel" data-mood-search-panel hidden>
      <div>
        <input data-mood-search-input type="search" maxlength="64" />
        <button data-mood-search-close></button>
      </div>
      <p data-mood-search-status></p>
      <div data-mood-search-results></div>
    </div>
  </div>
`;

describe('isSafeSnippetHtml', () => {
  test('accepts plain text and <mark>-only markup, rejects other tags', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('<div></div>');
      const result = await page.evaluate(async ({ source }) => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { isSafeSnippetHtml } = await import(moduleUrl);
          return {
            plain: isSafeSnippetHtml('a calm morning'),
            mark: isSafeSnippetHtml('a <mark>calm</mark> morning'),
            markClosed: isSafeSnippetHtml('<mark>x</mark> and <mark>y</mark>'),
            img: isSafeSnippetHtml('<img src=x onerror=alert(1)>'),
            script: isSafeSnippetHtml('<script>alert(1)</script>'),
            partial: isSafeSnippetHtml('<mark>ok</mark> <b>bad</b>'),
          };
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      }, { source: moduleSource });

      expect(result.plain).toBe(true);
      expect(result.mark).toBe(true);
      expect(result.markClosed).toBe(true);
      expect(result.img).toBe(false);
      expect(result.script).toBe(false);
      expect(result.partial).toBe(false);
    } finally {
      await page.close();
    }
  });
});

describe('buildResultRow', () => {
  test('links to detail page, keeps <mark>, falls back to text for unsafe HTML', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('<div></div>');
      const result = await page.evaluate(async ({ source }) => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { buildResultRow } = await import(moduleUrl);
          const safe = buildResultRow({
            id: '3641',
            datetime: '2026-07-01T10:00:00Z',
            snippet: 'a <mark>calm</mark> morning',
            tags: ['life', 'calm'],
          });
          const unsafe = buildResultRow({
            id: '99',
            datetime: '2026-07-01T10:00:00Z',
            snippet: '<img src=x onerror=alert(1)>',
            tags: [],
          });
          return {
            href: safe.getAttribute('href'),
            hasMark: Boolean(safe.querySelector('.mood-search-result-snippet mark')),
            tags: safe.querySelector('.mood-search-result-tags')?.textContent ?? null,
            unsafeHtml: unsafe.querySelector('.mood-search-result-snippet')?.innerHTML ?? '',
            unsafeText: unsafe.querySelector('.mood-search-result-snippet')?.textContent ?? '',
            unsafeHasImg: Boolean(unsafe.querySelector('.mood-search-result-snippet img')),
          };
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      }, { source: moduleSource });

      expect(result.href).toBe('/mood/3641');
      expect(result.hasMark).toBe(true);
      expect(result.tags).toBe('#life #calm');
      expect(result.unsafeHasImg).toBe(false);
      expect(result.unsafeText).toBe('<img src=x onerror=alert(1)>');
      expect(result.unsafeHtml).not.toContain('<img');
    } finally {
      await page.close();
    }
  });
});

describe('initMoodSearchPanel', () => {
  test('debounce coalesces rapid input into a single request', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(PANEL_MARKUP);
      const result = await page.evaluate(async ({ source }) => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { initMoodSearchPanel } = await import(moduleUrl);

          const requested: string[] = [];
          const originalFetch = window.fetch;
          window.fetch = (async (url: string) => {
            requested.push(String(url));
            return new Response(JSON.stringify({ results: [] }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }) as unknown as typeof fetch;

          try {
            initMoodSearchPanel();
            const toggle = document.querySelector('[data-mood-search-toggle]') as HTMLButtonElement;
            const input = document.querySelector('[data-mood-search-input]') as HTMLInputElement;
            toggle.click();

            for (const value of ['c', 'ca', 'cal', 'calm']) {
              input.value = value;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
            // Wait past the debounce window for the trailing call to fire.
            await new Promise((resolve) => setTimeout(resolve, 500));
            return { requested };
          } finally {
            window.fetch = originalFetch;
          }
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      }, { source: moduleSource });

      expect(result.requested).toHaveLength(1);
      expect(result.requested[0]).toContain('q=calm');
      expect(result.requested[0]).toContain('limit=10');
    } finally {
      await page.close();
    }
  });

  test('renders empty and error states', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(PANEL_MARKUP);
      const result = await page.evaluate(async ({ source }) => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { initMoodSearchPanel } = await import(moduleUrl);

          let mode: 'empty' | 'error' = 'empty';
          const originalFetch = window.fetch;
          window.fetch = (async () => {
            if (mode === 'error') return new Response('boom', { status: 500 });
            return new Response(JSON.stringify({ results: [] }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }) as unknown as typeof fetch;

          try {
            initMoodSearchPanel();
            const toggle = document.querySelector('[data-mood-search-toggle]') as HTMLButtonElement;
            const input = document.querySelector('[data-mood-search-input]') as HTMLInputElement;
            const status = document.querySelector('[data-mood-search-status]') as HTMLElement;
            toggle.click();

            const triggerEnter = () => {
              input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            };

            input.value = 'calm';
            triggerEnter();
            await new Promise((resolve) => setTimeout(resolve, 60));
            const emptyText = status.textContent;

            mode = 'error';
            input.value = 'anger';
            triggerEnter();
            await new Promise((resolve) => setTimeout(resolve, 60));
            const errorText = status.textContent;

            return { emptyText, errorText };
          } finally {
            window.fetch = originalFetch;
          }
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      }, { source: moduleSource });

      expect(result.emptyText).toBe('No results');
      expect(result.errorText).toBe('Search is unavailable right now');
    } finally {
      await page.close();
    }
  });

  test('Escape closes and clears the panel', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(PANEL_MARKUP);
      const result = await page.evaluate(async ({ source }) => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { initMoodSearchPanel } = await import(moduleUrl);
          initMoodSearchPanel();
          const toggle = document.querySelector('[data-mood-search-toggle]') as HTMLButtonElement;
          const panel = document.querySelector('[data-mood-search-panel]') as HTMLElement;
          const input = document.querySelector('[data-mood-search-input]') as HTMLInputElement;
          toggle.click();
          const openedHidden = panel.hidden;
          input.value = 'calm';
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          return {
            openedHidden,
            closedHidden: panel.hidden,
            clearedValue: input.value,
            expanded: toggle.getAttribute('aria-expanded'),
          };
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      }, { source: moduleSource });

      expect(result.openedHidden).toBe(false);
      expect(result.closedHidden).toBe(true);
      expect(result.clearedValue).toBe('');
      expect(result.expanded).toBe('false');
    } finally {
      await page.close();
    }
  });
});
