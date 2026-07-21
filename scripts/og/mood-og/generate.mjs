// Regenerate public/mood-og.png — the static Open Graph card for /mood.
//
// Renders template.html at 2x through the repo's Playwright Chromium, then
// downsamples to an exact 1200x630 PNG. Run from the repo root:
//
//   node scripts/og/mood-og/generate.mjs
//
// To refresh the channel avatar first (it is a baked snapshot):
//
//   curl -sL https://buxx.me/api/v2/images/channel/avatar \
//     | sips -s format png -Z 640 /dev/stdin --out scripts/og/mood-og/avatar.png
//
// Requires Node >= 22 and `bun install` (for playwright-core). Fonts load from
// buxx.me at render time, so the machine needs network access.

import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const template = resolve(here, 'template.html');
const out2x = resolve(here, '.mood-og-2x.png');
const out = resolve(here, '../../../public/mood-og.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
await page.goto('file://' + template);
await page.waitForFunction('window.__ready === true', { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(2500); // let the web font settle
await page.locator('#card').screenshot({ path: out2x });
await browser.close();

// Downsample 2400x1260 -> exact 1200x630 (macOS sips; swap for sharp on CI).
execFileSync('sips', ['-z', '630', '1200', out2x, '--out', out], { stdio: 'ignore' });
execFileSync('rm', ['-f', out2x]);
console.log('wrote', out);
