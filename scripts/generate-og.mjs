// Regenerate public/og.png from source. Run: node scripts/generate-og.mjs
// Rendered from HTML/CSS for precise type and spacing. Warm paper with a faint
// pixel grid (echoes peek's pixel world), the coding sticker top-left rendered
// crisp, name in Geist bold + a mono handle line with a terracotta tick.
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
const TAGLINE = 'buxx.me · developer · builder';

const html = `<!doctype html><meta charset="utf-8">
<style>
@font-face{font-family:'Geist';src:url(data:font/woff2;base64,${sansB64}) format('woff2');font-weight:100 900;font-style:normal}
@font-face{font-family:'Geist Mono';src:url(data:font/woff2;base64,${monoB64}) format('woff2');font-weight:100 900;font-style:normal}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${WIDTH}px;height:${HEIGHT}px;background:#f6f5f3;position:relative;overflow:hidden;font-family:'Geist',sans-serif;-webkit-font-smoothing:antialiased}
.grid{position:absolute;inset:0;
  background-image:linear-gradient(rgba(0,0,0,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.04) 1px,transparent 1px);
  background-size:48px 48px}
.frame{position:absolute;inset:88px;border:1px solid rgba(0,0,0,.07)}
.sticker{position:absolute;top:120px;left:120px;width:148px;height:auto;display:block;image-rendering:pixelated}
.block{position:absolute;left:118px;bottom:128px}
h1{font-size:104px;font-weight:700;letter-spacing:-.045em;line-height:.9;color:#161514}
.tag{display:flex;align-items:center;gap:14px;margin-top:26px;
  font-family:'Geist Mono',monospace;font-size:23px;letter-spacing:.01em;color:#6b6660}
.tick{width:13px;height:13px;background:#cf4a36;flex:none}
.corner{position:absolute;top:104px;right:120px;
  font-family:'Geist Mono',monospace;font-size:18px;letter-spacing:.18em;color:#a8a29a}
</style>
<div class="grid"></div>
<div class="frame"></div>
<img class="sticker" src="data:image/svg+xml;base64,${stickerB64}" alt="">
<div class="corner">PEEK · CODING</div>
<div class="block">
  <h1>${NAME}</h1>
  <p class="tag"><span class="tick"></span>${TAGLINE}</p>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const buf = await page.screenshot({ clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
writeFileSync(resolve(root, 'public/og.png'), buf);
await browser.close();
console.log('wrote public/og.png');
