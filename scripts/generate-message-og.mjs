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

// The contact a chat header names, drawn as the avatar a chat header draws:
// peek knocked out of an ink disc. His grid is only 10x7 -- it is a favicon, a
// shape meant to survive 16px -- so any attempt to letter him with an outline
// at 60px turns him into masonry. Reversed out of a solid disc he keeps the
// silhouette that reads at a glance and gets his white face anyway, and the
// disc is what a thread puts beside a name.
//
// gridToSvg already draws exactly this: body cells take fg, the nose takes the
// accent, and the eyes are holes that let the disc through.
const MARK = gridToSvg(PEEK_BASE.base, PEEK_BASE.width, PEEK_BASE.height, {
  fg: '#ffffff',
  accent: PEEK_BASE.accent,
});

// Written for the card, not lifted from the page. A link preview is read cold,
// in a feed, by someone who has not opened anything -- so the three bubbles
// carry the three facts that decide whether it is worth a tap: you have
// something private to say, one person reads it, and an answer can come back.
// The page's own opening run is longer because a page has room to be a
// conversation; this has room to be a promise. Keep it in that voice -- see
// features/messages/copy.ts.
//
// The proposition goes in the accent bubble, because that is the one shape on
// the card anyone sees first and a greeting spends it on nothing. It stays the
// visitor's line rather than the owner's: the page rules that the accent is
// the visitor's own voice and only ever that, and a card that speaks in the
// owner's voice through it arrives at a page where the colour means something
// else.
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
/* 40x28 is the 10x7 grid at exactly 4px a cell -- an integer cell keeps every
   edge on a whole pixel, which is the whole point of a mark made of rectangles.
   Sat 1px high in the disc: the ears carry the shape's weight upward, so
   centring it by the box centres it visually low. */
.avatar{width:62px;height:62px;border-radius:50%;background:${INK};
  display:grid;place-items:center}
.avatar svg{width:40px;height:28px;display:block;transform:translateY(-1px)}
.slug{font-family:'Geist Mono',monospace;font-size:25px;letter-spacing:.06em;color:${MUTE}}
/* Pushed down, because messages sit at the bottom of a thread and the space
   above them is the part you have not scrolled back through. */
.thread{margin-top:auto;display:flex;flex-direction:column;gap:8px}
.msg{display:flex}
.msg--me{justify-content:flex-end}
.msg--turn{margin-top:40px}
.bubble{width:fit-content;max-width:62%;padding:22px 30px;font-size:32px;line-height:1.5;border-radius:34px;text-wrap:pretty}
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
    <span class="avatar">${MARK}</span>
    <span class="slug">${SLUG}</span>
  </div>
  <div class="thread">
    <div class="msg msg--me"><p class="bubble bubble--me">Can I tell you something?</p></div>
    <div class="msg msg--turn"><p class="bubble bubble--them bubble--joined-below">Go for it, nobody else sees this.</p></div>
    <div class="msg"><p class="bubble bubble--them bubble--joined-above">Drop an email and I'll write back <span class="emoji">📮</span></p></div>
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
