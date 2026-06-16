// Regenerate public/og.png from source. Run: node scripts/generate-og.mjs
// Keep this in sync with the brand: Geist Mono identity, dot grid, peek mascot
// peeking over a ledge in terracotta. Render is deterministic — edit the SVG
// below and re-run.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fontB64 = readFileSync(resolve(root, 'public/fonts/geist-mono-variable.woff2')).toString('base64');

const WIDTH = 1200;
const HEIGHT = 630;
const TERRACOTTA = '#bd5b48';

// peek mascot — "only the top of the head shows". '#' body, 'o' eye (cut out),
// '*' highlight. Pattern is the canonical PEEK_BASE from the mascot model.
const PEEK = ['.##....##.', '###....###', '##########', '##########', '##o####o##', '##o##*#o##', '##########'];
const PX = 42;
const MX = 760;
const MY = 188;
const mascot = PEEK.flatMap((row, y) =>
  [...row].map((c, x) => {
    if (c === '#') return `<rect x="${MX + x * PX}" y="${MY + y * PX}" width="${PX}" height="${PX}" fill="${TERRACOTTA}"/>`;
    if (c === '*') return `<rect x="${MX + x * PX + 12}" y="${MY + y * PX + 12}" width="${PX - 24}" height="${PX - 24}" fill="#f0e6d8"/>`;
    return '';
  }),
).join('');

const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
<defs>
<pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse">
<circle cx="2" cy="2" r="1.1" fill="#ffffff" fill-opacity="0.05"/>
</pattern>
</defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="#0a0a0a"/>
<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#dots)"/>

<g font-family="Geist Mono">
<rect x="96" y="150" width="11" height="11" fill="${TERRACOTTA}"/>
<text x="120" y="160" font-size="20" letter-spacing="4" fill="#8a8a8a">BUILDING</text>
<text x="92" y="330" font-size="124" font-weight="700" letter-spacing="-2" fill="#f5f5f5">Bunizao</text>
<text x="98" y="392" font-size="30" letter-spacing="1" fill="#7c7c7c">Student &#183; Developer &#183; Builder</text>
<text x="98" y="452" font-size="22" fill="#5a5a5a">frontend &#183; proxy &#183; open-source &#183; automation</text>
</g>

<g shape-rendering="crispEdges">${mascot}</g>

<rect x="0" y="474" width="${WIDTH}" height="156" fill="#0d0d0d"/>
<rect x="0" y="474" width="${WIDTH}" height="2" fill="${TERRACOTTA}" fill-opacity="0.55"/>

<g font-family="Geist Mono">
<text x="96" y="556" font-size="26" letter-spacing="1" fill="#cfcfcf">buxx.me</text>
<rect x="232" y="538" width="15" height="26" fill="${TERRACOTTA}"/>
<text x="1104" y="556" font-size="20" letter-spacing="3" fill="#5a5a5a" text-anchor="end">LISTENING</text>
</g>
</svg>`;

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:'Geist Mono';src:url(data:font/woff2;base64,${fontB64}) format('woff2');font-weight:100 900;font-style:normal}
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
