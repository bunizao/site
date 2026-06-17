// Regenerate public/og.png from source. Run: node scripts/generate-og.mjs
// Refined horizontal lockup: peek grounded by a soft shadow on warm paper, name
// in Geist, one terracotta rule, a single mono handle. No grid, no clutter.
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
  -webkit-font-smoothing:antialiased;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(125% 120% at 50% 18%,#faf9f7 0%,#f2f0ec 72%,#ece9e3 100%)}
.lockup{display:flex;align-items:center;gap:60px;transform:translateY(-6px)}
.sticker{width:190px;height:auto;display:block;image-rendering:pixelated;
  filter:drop-shadow(0 20px 28px rgba(40,30,20,.14))}
h1{font-size:88px;font-weight:600;letter-spacing:-.035em;line-height:.92;color:#181614}
.rule{width:68px;height:5px;background:#cf4a36;border-radius:2px;margin:24px 0 20px}
.handle{font-family:'Geist Mono',monospace;font-size:25px;letter-spacing:.02em;color:#8a847b}
</style>
<div class="lockup">
  <img class="sticker" src="data:image/svg+xml;base64,${stickerB64}" alt="">
  <div>
    <h1>${NAME}</h1>
    <div class="rule"></div>
    <div class="handle">${HANDLE}</div>
  </div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const buf = await page.screenshot({ clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
writeFileSync(resolve(root, 'public/og.png'), buf);
await browser.close();
console.log('wrote public/og.png');
