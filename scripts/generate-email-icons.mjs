// Generate the transactional email icon rasters. Gmail, Outlook and Android
// strip inline SVG, so the few glyphs the mail needs ship as static PNGs the
// same way the blog masthead art does (see public/email/README.md).
//
// Regenerate (needs Node 22; from repo root):
//   node scripts/generate-email-icons.mjs
//
// Outputs to public/email/: comment-light.png, comment-dark.png
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'email');

// lucide `message-square`, the same glyph the blog masthead and the comment
// surfaces draw. Stroke 1.5 because Lucide's default 2 is drawn for a 24px box
// and fills the counter at 16px.
const MESSAGE_SQUARE = 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z';

// 3x the 16px render size the mail declares.
const SIZE = 48;

const icons = [
  { file: 'comment-light.png', color: '#0a0a0a' },
  { file: 'comment-dark.png', color: '#fafafa' },
];

const tile = ({ color }) => `<svg class="tile" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24" fill="none"
  stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${MESSAGE_SQUARE}"/></svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent;}
  .tile{display:block;}
</style></head><body>${icons.map((icon) => tile(icon)).join('')}</body></html>`;

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE * icons.length }, deviceScaleFactor: 1 });
await page.setContent(html);
const tiles = await page.locator('.tile').all();
for (const [index, icon] of icons.entries()) {
  await tiles[index].screenshot({ path: join(outDir, icon.file), omitBackground: true });
  console.log(`wrote ${icon.file}`);
}
await browser.close();
