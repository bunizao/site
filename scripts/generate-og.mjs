// Regenerate public/og.png from source. Run: node scripts/generate-og.mjs
// Minimal but cohesive with peek's pixel/terminal identity: warm off-white with
// a faint graph-paper grid, the peek "coding" sticker in a sharp-cornered tile,
// name in Geist bold, a mono tagline with a terracotta accent. Deterministic.
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
const TERRACOTTA = '#cf4a36';

const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
<defs>
<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
<path d="M40 0H0V40" fill="none" stroke="#000000" stroke-opacity="0.035" stroke-width="1"/>
</pattern>
</defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="#f6f5f3"/>
<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)"/>

<rect x="84" y="72" width="112" height="112" fill="#ffffff" stroke="#000000" stroke-opacity="0.10" stroke-width="1.5"/>
<image href="data:image/svg+xml;base64,${stickerB64}" x="96" y="92" width="88" height="76"/>

<text x="84" y="478" font-family="Geist" font-size="94" font-weight="700" letter-spacing="-3" fill="#1a1a1a">${NAME}</text>
<rect x="88" y="512" width="14" height="14" fill="${TERRACOTTA}"/>
<text x="116" y="525" font-family="Geist Mono" font-size="24" letter-spacing="0.5" fill="#57534e">${TAGLINE}</text>
</svg>`;

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:'Geist';src:url(data:font/woff2;base64,${sansB64}) format('woff2');font-weight:100 900;font-style:normal}
@font-face{font-family:'Geist Mono';src:url(data:font/woff2;base64,${monoB64}) format('woff2');font-weight:100 900;font-style:normal}
*{margin:0;padding:0}html,body{width:${WIDTH}px;height:${HEIGHT}px}
</style>${svg}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const buf = await page.screenshot({ clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
writeFileSync(resolve(root, 'public/og.png'), buf);
await browser.close();
console.log('wrote public/og.png');
