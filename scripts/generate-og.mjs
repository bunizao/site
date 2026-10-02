// Regenerate public/og.png from source. Run: node scripts/generate-og.mjs
// Vertical identity lockup: peek as the mark, name as the wordmark, buxx.me as a
// quiet caption. Warm paper, warm near-black ink, no accent lines — the mascot
// is the only color. Centered, symmetric, generous air.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p));

const sansB64 = read('public/fonts/geist-sans-variable.woff2').toString('base64');
const monoB64 = read('public/fonts/geist-mono-variable.woff2').toString('base64');
const stickerB64 = read('public/mascot/peek/stickers/coding.svg').toString('base64');

const WIDTH = 1200;
const HEIGHT = 630;
const NAME = 'Lucian Bu';
const HANDLE = 'buxx.me';

const html = `<!doctype html><meta charset="utf-8">
<style>
@font-face{font-family:'Geist';src:url(data:font/woff2;base64,${sansB64}) format('woff2');font-weight:100 900;font-style:normal}
@font-face{font-family:'Geist Mono';src:url(data:font/woff2;base64,${monoB64}) format('woff2');font-weight:100 900;font-style:normal}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;font-family:'Geist',sans-serif;
  -webkit-font-smoothing:antialiased;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:#f4f2ee}
.lockup{display:flex;flex-direction:column;align-items:center;transform:translateY(-10px)}
.sticker{width:132px;height:auto;display:block;image-rendering:pixelated;
  filter:drop-shadow(0 16px 22px rgba(40,30,20,.11))}
h1{margin-top:44px;font-size:92px;font-weight:600;letter-spacing:-.035em;line-height:1;color:#1b1917}
.handle{margin-top:20px;font-family:'Geist Mono',monospace;font-size:23px;letter-spacing:.06em;color:#a8a195}
</style>
<div class="lockup">
  <img class="sticker" src="data:image/svg+xml;base64,${stickerB64}" alt="">
  <h1>${NAME}</h1>
  <div class="handle">${HANDLE}</div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const buf = await page.screenshot({ clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
writeFileSync(resolve(root, 'public/og.png'), buf);
await browser.close();
console.log('wrote public/og.png');
