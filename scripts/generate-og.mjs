// Regenerate public/og.png from source. Run: node scripts/generate-og.mjs
// Minimal card: warm off-white, the peek "coding" sticker top-left, name set
// large and bold bottom-left in Geist. Edit and re-run — render is deterministic.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p));

const fontB64 = read('public/fonts/geist-sans-variable.woff2').toString('base64');
const stickerB64 = read('public/mascot/peek/stickers/coding.svg').toString('base64');

const WIDTH = 1200;
const HEIGHT = 630;
const NAME = 'Lucian Bu';

const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
<rect width="${WIDTH}" height="${HEIGHT}" fill="#f6f5f3"/>
<image href="data:image/svg+xml;base64,${stickerB64}" x="84" y="74" width="116" height="100"/>
<text x="86" y="512" font-family="Geist" font-size="98" font-weight="700" letter-spacing="-3" fill="#1a1a1a">${NAME}</text>
</svg>`;

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:'Geist';src:url(data:font/woff2;base64,${fontB64}) format('woff2');font-weight:100 900;font-style:normal}
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
