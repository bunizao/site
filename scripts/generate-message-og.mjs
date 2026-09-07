// Regenerate public/message-og.png from source. Run: node scripts/generate-message-og.mjs
// The card is the thread, because the page is one: the visitor's opening line
// in the accent, the owner's two answers under it in grey, peek at the desk as
// the counterweight. Same copy as features/messages/copy.ts, same shapes as
// the page draws them -- nothing on the card is written for the card.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p)).toString('base64');

const sansB64 = read('public/fonts/geist-sans-variable.woff2');
const monoB64 = read('public/fonts/geist-mono-variable.woff2');
// Native 408x313 and drawn 1:1 below, same as docs-og: the sticker is pixel-art
// WebP inside an SVG shell, and any fractional scale resamples the grid to mush.
// `focus` rather than a wave, because the three dots on its laptop are the
// page's own typing indicator -- peek is the one writing back.
const stickerB64 = read('public/mascot/peek/stickers/focus.svg');

const WIDTH = 1200;
const HEIGHT = 630;
const PAPER = '#f4f2ee';
const INK = '#1b1917';
const MUTE = '#a8a195';
const SLUG = 'buxx.me/message';

// The page's accent, already resolved: nameOnBackground('#007AFF', '#FFFFFF')
// in src/pages/message.astro. Inlined rather than imported so the script stays
// a standalone Node render with no bundler in the path -- if that line moves,
// this one moves with it.
const ACCENT = '#0070EB';

// The bubble grey, warmed. The page sets #ececee because it sits on white;
// here the ground is warm paper, and #ececee on it is a 1.02 step -- an edge
// nobody can see. This lands the same distance below the paper as the page's
// grey lands below white, in the paper's own hue.
const SURFACE = '#e6e2da';

// The thread, transcribed from the page: the copy is features/messages/copy.ts
// word for word (opener, intro, invite), and the shapes are that page's own
// ratios at 2x -- 14px text -> 28, the 15px radius -> 30, the 5px shared
// corner -> 10, the 20px turn -> 34. Those tightened corners are the reason the
// two grey bubbles read as one person talking rather than two loose chips.
// Line-height is the one number that does not scale: 1.72 is what 14px needs
// to breathe and what 28px does not, so it comes down to 1.5.
//
// Edit the copy here when copy.ts changes -- the strings cannot be imported
// (this is a bundler-free Node render) and the PNG is baked either way, so
// both ends move by hand or not at all.
const html = `<!doctype html><meta charset="utf-8">
<style>
@font-face{font-family:'Geist';src:url(data:font/woff2;base64,${sansB64}) format('woff2');font-weight:100 900;font-style:normal}
@font-face{font-family:'Geist Mono';src:url(data:font/woff2;base64,${monoB64}) format('woff2');font-weight:100 900;font-style:normal}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:${PAPER};color:${INK};
  font-family:'Geist',sans-serif;-webkit-font-smoothing:antialiased}
/* Bare paper, no dot grid -- /message switches the site's grid off, because a
   thread on graph paper reads as stickers on a worksheet. docs-og keeps the
   grid for the same reason: its page has one. */
.card{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:${PAPER};
  display:flex;align-items:flex-end;justify-content:space-between;padding:62px 84px 56px;gap:36px}
/* Three anchors and no hole, which is how mood-og and docs-og ride the
   diagonal too: the thread hangs from the top-left the way a thread is read,
   the slug closes the bottom-left, peek holds the bottom-right. Hanging the
   slug straight under the last bubble instead empties the whole lower left,
   and the two halves stop reading as one card. */
.left{flex:none;width:626px;align-self:stretch;display:flex;flex-direction:column;
  justify-content:space-between}
.thread{display:flex;flex-direction:column;gap:7px}
.msg{display:flex}
.msg--me{justify-content:flex-end}
.msg--turn{margin-top:34px}
.bubble{padding:18px 26px;font-size:28px;line-height:1.5;border-radius:30px;text-wrap:pretty}
.bubble--them{background:${SURFACE}}
.bubble--me{background:${ACCENT};color:#fff;border-bottom-right-radius:10px}
.bubble--joined-below{border-bottom-left-radius:10px}
.bubble--joined-above{border-top-left-radius:10px}
.slug{margin-left:6px;font-family:'Geist Mono',monospace;
  font-size:25px;letter-spacing:.06em;color:${MUTE}}
/* No drop shadow: with the grid off the page has no lit surfaces left, and a
   shadow under the mascot would be the only one on the card. */
.peek{flex:none;image-rendering:pixelated}
/* Apple Color Emoji is drawn wider than the advance it reports, so the space
   after one gets eaten. A hair of margin puts it back without touching the
   sentence. */
.emoji{margin-right:.1em}
</style>
<div class="card">
  <div class="left">
    <div class="thread">
      <div class="msg msg--me"><p class="bubble bubble--me">Hey <span class="emoji">👋</span> wanted to reach out!</p></div>
      <div class="msg msg--turn"><p class="bubble bubble--them bubble--joined-below">Go for it! It's totally private and comes straight to me.</p></div>
      <div class="msg"><p class="bubble bubble--them bubble--joined-above">plz drop an email so I can get back to you <span class="emoji">📮</span></p></div>
    </div>
    <div class="slug">${SLUG}</div>
  </div>
  <img class="peek" src="data:image/svg+xml;base64,${stickerB64}" width="408" height="313" alt="">
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const buf = await page.screenshot({ clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
writeFileSync(resolve(root, 'public/message-og.png'), buf);
await browser.close();
console.log('wrote public/message-og.png');
