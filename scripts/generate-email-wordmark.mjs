// Generate the blog email masthead rasters. Email clients strip @font-face and
// inline SVG, so the 無人之境 wordmark (LXGW WenKai) and the thinking-woman mark
// ship as static PNGs. This builds a self-contained HTML (font + mark inlined as
// base64), renders it in headless Chromium, and screenshots each tile into a
// transparent 2x PNG. Self-contained so it needs no dev server or network.
//
// Regenerate (needs Node 22; from repo root):
//   node scripts/generate-email-wordmark.mjs
//
// Outputs to public/email/: wordmark-light.png, wordmark-dark.png,
// mark-light.png, mark-dark.png
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const publicDir = join(repoRoot, 'public');

const fontB64 = (await readFile(join(publicDir, 'fonts', 'wenkai-wordmark.woff2'))).toString('base64');
const markB64 = (await readFile(join(publicDir, 'blog-mark.webp'))).toString('base64');

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
  @font-face{
    font-family:'LXGW WenKai Wordmark';
    src:url('data:font/woff2;base64,${fontB64}') format('woff2');
    font-weight:400; font-display:block;
    unicode-range:U+7121,U+4EBA,U+4E4B,U+5883;
  }
  html,body{margin:0;padding:0;background:transparent;}
  .tile{display:inline-block;padding:0;line-height:1;}
  .wordmark{
    font-family:'LXGW WenKai Wordmark','Songti SC','Noto Serif CJK SC',serif;
    font-size:120px; font-weight:400; letter-spacing:0.04em; line-height:1;
    white-space:nowrap;
  }
  .light{color:#0a0a0a;}
  .dark{color:#fafafa;}
  .mark{width:220px;height:220px;display:block;}
  .mark.dark{filter:invert(1);}
  #stage{padding:60px;}
  .row{margin:0 0 40px;}
</style></head><body>
<div id="stage">
  <div class="row"><span id="wordmark-light" class="tile wordmark light">無人之境</span></div>
  <div class="row"><span id="wordmark-dark" class="tile wordmark dark">無人之境</span></div>
  <div class="row"><img id="mark-light" class="mark light" src="data:image/webp;base64,${markB64}" alt=""></div>
  <div class="row"><img id="mark-dark" class="mark dark" src="data:image/webp;base64,${markB64}" alt=""></div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);

for (const name of ['wordmark-light', 'wordmark-dark', 'mark-light', 'mark-dark']) {
  await page.locator(`#${name}`).screenshot({
    path: join(publicDir, 'email', `${name}.png`),
    omitBackground: true,
  });
  console.log(`✓ public/email/${name}.png`);
}

await browser.close();
