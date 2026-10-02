// Regenerate the desk's painted favicons and OG card. Run from the repo root:
//
//   node scripts/brand/generate.mjs
//
// Bundles paint.ts with bun, paints it in headless Chromium with the desk's
// knife engine, and writes og.jpg, favicon-{light,dark}.png and touch-icon.png
// into public/desk/. Only /new uses them; the rest of the site keeps og.png
// and /logo/peek.svg. Strokes are seeded, so a rerun on the same Chromium
// reproduces the committed files byte for byte.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const bundle = execFileSync('bun', ['build', resolve(root, 'scripts/brand/paint.ts'), '--target', 'browser'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
const font = readFileSync(resolve(root, 'public/fonts/space-grotesk-latin-variable.woff2')).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.setContent(`<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:'Space Grotesk';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:300 700}
</style><body>`);
await page.addScriptTag({ content: bundle });
const files = await page.evaluate(() => window.paintBrand());
await browser.close();

for (const [name, url] of Object.entries(files)) {
  writeFileSync(resolve(root, 'public/desk', name), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote public/desk/' + name);
}
