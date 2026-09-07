// Regenerate public/message-og.png from source. Run: bun scripts/generate-message-og.mjs
//
// The card is a chat window, because the page is one: the address and the mark
// across the top the way a thread names who you are writing to, and the
// messages settling against the bottom the way messages do.
//
// bun rather than node, unlike its siblings in this folder: it imports the
// favicon's own pixel grid straight from src, so the mark on the card is the
// mark in the tab by construction and cannot drift from it.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PEEK_BASE } from '../src/features/mascot/peek/base';
import { gridToSvg } from '../src/features/logos/lib/render';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p)).toString('base64');

const sansB64 = read('public/fonts/geist-sans-variable.woff2');
const monoB64 = read('public/fonts/geist-mono-variable.woff2');

const WIDTH = 1200;
const HEIGHT = 630;
// Brighter than the paper og.png and docs-og share. Those cards are objects on
// a desk; this one is a screen, and the page it stands for is white under the
// bubbles. Warm enough to stay in the family, light enough to read as glass.
const PAPER = '#faf9f6';
const INK = '#1b1917';
const MUTE = '#a8a195';
const SLUG = 'buxx.me/message';

// The page's accent, already resolved: nameOnBackground('#007AFF', '#FFFFFF')
// in src/pages/message.astro. If that line moves, this one moves with it.
const ACCENT = '#0070EB';

// The bubble grey, warmed to the ground. #ececee on white is the page's own
// step (1.18); this is that same step measured against this paper, in the
// paper's hue -- an absolute grey lifted onto a warm ground disappears.
const SURFACE = '#e9e6de';

// 10x7 rects rather than one of the sticker poses. A sticker is a bitmap and
// mushes at any size a favicon is drawn at; this grid is the vector mark the
// tab already shows, and it stays crisp at any size. The red is peek's nose, and
// with the accent it is the whole palette.
const MARK = gridToSvg(PEEK_BASE.base, PEEK_BASE.width, PEEK_BASE.height, {
  fg: INK,
  accent: PEEK_BASE.accent,
  pad: 0,
});

// Written for the card, not lifted from the page. A link preview is read cold,
// in a feed, by someone who has not opened anything -- so the three bubbles
// carry the three facts that decide whether it is worth a tap: you can say
// anything, one person reads it, and an answer can come back. The page's own
// opening run is longer because a page has room to be a conversation; this has
// room to be a promise. Keep it in that voice -- see features/messages/copy.ts.
//
// Shapes are the page's, at 2.3x: 14px text -> 32, the 15px radius -> 34, the
// 5px shared corner -> 11, the 20px turn -> 40. Those tightened corners are
// what make the two grey bubbles one person talking. Line-height is the one
// number that does not scale -- 1.72 is what 14px needs and 32px does not.
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
  display:flex;flex-direction:column;padding:62px 84px 72px}
/* The header a thread has: who you are writing to, mark first. */
.head{display:flex;align-items:center;gap:18px}
/* 60x42 is the 10x7 grid at exactly 6px a cell: an integer cell keeps every
   edge on a whole pixel, and the eyes -- two transparent holes two cells wide
   -- stay holes instead of smudging shut. */
.mark{width:60px;height:42px;display:block}
.slug{font-family:'Geist Mono',monospace;font-size:25px;letter-spacing:.06em;color:${MUTE}}
/* Pushed down, because messages sit at the bottom of a thread and the space
   above them is the part you have not scrolled back through. */
.thread{margin-top:auto;display:flex;flex-direction:column;gap:8px}
.msg{display:flex}
.msg--me{justify-content:flex-end}
.msg--turn{margin-top:40px}
.bubble{max-width:62%;padding:22px 30px;font-size:32px;line-height:1.5;border-radius:34px;text-wrap:pretty}
.bubble--them{background:${SURFACE}}
.bubble--me{background:${ACCENT};color:#fff;border-bottom-right-radius:11px}
.bubble--joined-below{border-bottom-left-radius:11px}
.bubble--joined-above{border-top-left-radius:11px}
/* Apple Color Emoji is drawn wider than the advance it reports, so the space
   after one gets eaten. A hair of margin puts it back without touching the
   sentence. */
.emoji{margin-right:.1em}
</style>
<div class="card">
  <div class="head">
    <span class="mark">${MARK}</span>
    <span class="slug">${SLUG}</span>
  </div>
  <div class="thread">
    <div class="msg msg--me"><p class="bubble bubble--me">Hey <span class="emoji">👋</span></p></div>
    <div class="msg msg--turn"><p class="bubble bubble--them bubble--joined-below">Say anything, it reaches me and nobody else.</p></div>
    <div class="msg"><p class="bubble bubble--them bubble--joined-above">Leave an email and I'll write back <span class="emoji">📮</span></p></div>
  </div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const buf = await page.screenshot({ clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
writeFileSync(resolve(root, 'public/message-og.png'), buf);
await browser.close();
console.log('wrote public/message-og.png');
