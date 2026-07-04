// Static OG card for the /blog index — the publication's own identity, not a
// per-post preview (those stay dynamic, see src/features/posts/server/og-image.ts).
// Renders the ink mark + WenKai wordmark + tagline as a fixed 1200x630 raster so
// crawlers that don't run JS still get the real brand, once. Mirrors the
// generate-email-wordmark.mjs approach: self-contained HTML, fonts inlined as
// base64, headless Chromium screenshot — no dev server or network required.
//
// Palette is deliberately NOT blogPalette (that's a UI accent system for links
// and focus rings). This is ink-on-paper: bone-white ground, near-black ink —
// the actual reference material for a publication called 無人之境, not the
// site's link color.
//
// Regenerate (needs Node 22; from repo root):
//   node scripts/generate-blog-og-image.mjs
//
// Outputs to public/: blog-og.jpg
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const publicDir = join(repoRoot, 'public');

const wenkaiB64 = (await readFile(join(publicDir, 'fonts', 'wenkai-wordmark.woff2'))).toString('base64');
const sansB64 = (await readFile(join(publicDir, 'fonts', 'inter-variable.woff2'))).toString('base64');
const markB64 = (await readFile(join(publicDir, 'blog-mark.webp'))).toString('base64');

const WIDTH = 1200;
const HEIGHT = 630;

const INK = '#1C1916';
const INK_SOFT = 'rgba(28,25,22,0.58)';

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
  @font-face{
    font-family:'LXGW WenKai Wordmark';
    src:url('data:font/woff2;base64,${wenkaiB64}') format('woff2');
    font-weight:400; font-display:block;
    unicode-range:U+7121,U+4EBA,U+4E4B,U+5883;
  }
  @font-face{
    font-family:'Inter';
    src:url('data:font/woff2;base64,${sansB64}') format('woff2-variations');
    font-weight:100 900; font-display:block;
  }
  html,body{margin:0;padding:0;}
  #card{
    width:${WIDTH}px;height:${HEIGHT}px;position:relative;overflow:hidden;
    /* Bone-white paper: warm but desaturated, never a flat white and never yellow. */
    background:#F4F2EC;
    display:flex;align-items:center;justify-content:space-between;
    box-sizing:border-box;padding:0 104px;
  }
  /* Very faint paper fiber grain — texture, not tint. */
  #card::after{
    content:'';position:absolute;inset:0;opacity:0.04;mix-blend-mode:multiply;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  }
  /* Two-column editorial split: the wordmark holds the left, the illustration
     is the visual counterweight on the right. Asymmetric but balanced — the
     mark's ink mass answers the title's, no decorative filler needed. */
  .title{
    position:relative;z-index:1;
  }
  .wordmark{
    font-family:'LXGW WenKai Wordmark','Songti SC','Noto Serif CJK SC',serif;
    font-size:112px;font-weight:400;letter-spacing:0.06em;line-height:1;color:${INK};
  }
  .tagline{
    margin-top:28px;
    font-family:'Inter',sans-serif;
    font-size:26px;font-weight:400;letter-spacing:0.01em;line-height:1.5;color:${INK_SOFT};
  }
  .mark{
    width:300px;height:300px;flex:none;position:relative;z-index:1;
    /* Optical nudge: the illustration's visual mass sits slightly high, so drop
       it a touch to sit on the title's optical center, not its geometric one. */
    margin-top:14px;
    background:${INK};
    -webkit-mask-image:url("data:image/webp;base64,${markB64}");
    -webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;
    mask-image:url("data:image/webp;base64,${markB64}");
    mask-size:contain;mask-repeat:no-repeat;mask-position:center;
  }
</style></head><body>
<div id="card">
  <div class="title">
    <div class="wordmark">無人之境</div>
    <div class="tagline">生长于共鸣、独白、文学、与沉默之间。</div>
  </div>
  <div class="mark"></div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);

// JPEG, not PNG: the card is fully opaque and the noise texture defeats PNG's
// flat-color compression, so JPEG comes out roughly 10x smaller at this size.
await page.locator('#card').screenshot({ path: join(publicDir, 'blog-og.jpg'), type: 'jpeg', quality: 85 });
console.log('✓ public/blog-og.jpg');

await browser.close();
