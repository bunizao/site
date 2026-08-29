// Regenerate public/docs-og.png from source. Run: node scripts/generate-docs-og.mjs
// Editorial split on the site's dot grid: the newspaper glyph and the word Docs
// are one lockup on the left with the path hanging under it, peek reading its
// notes as the counterweight on the right. Three elements, no ornament — the
// mascot is the only colour, same as og.png.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p)).toString('base64');

const sansB64 = read('public/fonts/geist-sans-variable.woff2');
const monoB64 = read('public/fonts/geist-mono-variable.woff2');
// Native 352x316 and drawn 1:1 below: the sticker is pixel-art WebP inside an
// SVG shell, so any fractional scale resamples the grid into mush.
const stickerB64 = read('public/mascot/peek/stickers/notes.svg');

const WIDTH = 1200;
const HEIGHT = 630;
const PAPER = '#f4f2ee';
const INK = '#1b1917';
const MUTE = '#a8a195';
const SLUG = 'buxx.me/docs';

// lucide-react v1.33.0 `newspaper`, transcribed from its icon node. Inlined
// rather than imported so the script stays a standalone Node render with no
// bundler in the path.
const NEWSPAPER = `<path d="M15 18h-5"/><path d="M18 14h-8"/><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="10" y="6" rx="1"/>`;

const html = `<!doctype html><meta charset="utf-8">
<style>
@font-face{font-family:'Geist';src:url(data:font/woff2;base64,${sansB64}) format('woff2');font-weight:100 900;font-style:normal}
@font-face{font-family:'Geist Mono';src:url(data:font/woff2;base64,${monoB64}) format('woff2');font-weight:100 900;font-style:normal}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:${PAPER};color:${INK};
  font-family:'Geist',sans-serif;-webkit-font-smoothing:antialiased}
.card{width:${WIDTH}px;height:${HEIGHT}px;position:relative;overflow:hidden;background:${PAPER}}
/* The site's graph-paper dot grid, same 30px cadence as mood-og. */
.card::before{content:"";position:absolute;inset:0;
  background-image:radial-gradient(rgba(27,25,23,.07) 1.1px,transparent 1.1px);
  background-size:30px 30px;background-position:center}
.in{position:absolute;inset:0;z-index:1;display:flex;align-items:center;
  justify-content:space-between;padding:0 96px}
/* Icon and wordmark read as one object. lucide draws at stroke-width 2 on a
   24px viewBox, which turns into a slab at this size — 1.5 keeps it an icon.
   The nudge up puts it on the cap centre rather than the line-box centre. */
.lock{display:flex;align-items:center;gap:26px}
.lock svg{flex:none;transform:translateY(-4px)}
h1{font-size:118px;font-weight:600;letter-spacing:-.04em;line-height:1}
.slug{margin-top:24px;margin-left:2px;font-family:'Geist Mono',monospace;
  font-size:25px;letter-spacing:.06em;color:${MUTE}}
.peek{flex:none;image-rendering:pixelated;
  filter:drop-shadow(0 14px 20px rgba(40,30,20,.13))}
</style>
<div class="card"><div class="in">
  <div>
    <div class="lock">
      <svg viewBox="0 0 24 24" width="100" height="100" fill="none" stroke="${INK}"
        stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${NEWSPAPER}</svg>
      <h1>Docs</h1>
    </div>
    <div class="slug">${SLUG}</div>
  </div>
  <img class="peek" src="data:image/svg+xml;base64,${stickerB64}" alt="">
</div></div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const buf = await page.screenshot({ clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
writeFileSync(resolve(root, 'public/docs-og.png'), buf);
await browser.close();
console.log('wrote public/docs-og.png');
