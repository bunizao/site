import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeskUnlocked } from '../../scripts/desk-lock.mjs';
import { deskCssPlugin } from '../../scripts/desk-css.mjs';

const temporary: string[] = [];
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture(source?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'desk-lock-'));
  temporary.push(dir);
  mkdirSync(join(dir, 'src/features/desk'), { recursive: true });
  if (source !== undefined) writeFileSync(join(dir, 'src/features/desk/index.ts'), source);
  return pathToFileURL(dir + '/');
}

describe('desk lock', () => {
  test('falls back when the entry is missing or encrypted', () => {
    expect(isDeskUnlocked(fixture())).toBe(false);
    expect(isDeskUnlocked(fixture('U2FsdGVkX1ciphertext\n'))).toBe(false);
    expect(isDeskUnlocked(fixture("export { default as HomePage } from './Page.astro';\n"))).toBe(true);
  });
});

describe('desk CSS build transform', () => {
  test('uses the same identifiers in templates, query strings and stylesheet modules', () => {
    const plugin = deskCssPlugin();
    const root = join(process.cwd(), 'src/features/desk');
    const template = plugin.transform('<div class="dk-chip" style="--dk-h: 4">', root + '/Page.astro')!;
    const css = plugin.transform('.dk-chip { color: var(--dk-h); }', root + '/Page.astro?astro&type=style')!;
    const client = plugin.transform("document.querySelector('.dk-chip')", root + '/client/desk.ts')!;
    const token = template.code.match(/class="(k[a-z0-9]{5})"/)?.[1];
    expect(token).toBeDefined();
    expect(css.code).toContain('.' + token);
    expect(client.code).toContain('.' + token);
    expect(template.code).not.toContain('dk-');
    expect(plugin.transform('.dk-chip {}', join(process.cwd(), 'src/features/home/Page.astro'))).toBeNull();
  });

  test('rejects leftover names in both CSS and SSR output', () => {
    const plugin = deskCssPlugin();
    for (const output of [{ type: 'chunk', code: 'const name = "dk-chip"' }, { type: 'asset', source: '.dk-chip{}' }]) {
      expect(() => plugin.generateBundle({}, { 'output.js': output })).toThrow('Unrenamed desk CSS token');
    }
  });
});
