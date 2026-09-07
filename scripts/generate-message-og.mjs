// Regenerate public/message-og.png from source. Run: node scripts/generate-message-og.mjs
//
// The card is a chat window, because the page is one: peek and the address
// across the top the way a thread names who you are writing to, and the
// messages under it.
//
// Every size here is chosen for the size the card is actually SEEN at, not the
// size it is drawn at. Telegram, Slack, iMessage and X all render a link
// preview around 500-560px wide, so a 1200px card arrives at roughly 0.45x:
// 32px body text lands at 14px and a 21px slug lands at 9px, which is what the
// first version got wrong. Everything below is sized so it survives that
// division -- body text at 44px reads as 20px in the feed, the slug as 11px.
// If you change a number, divide it by 2.2 and ask whether you could read it.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p)).toString('base64');

const sansB64 = read('public/fonts/geist-sans-variable.woff2');
const monoB64 = read('public/fonts/geist-mono-variable.woff2');
// peek reading his notes -- the pose for a page whose whole promise is that
// one person reads what you send. The favicon grid is the other candidate and
// the wrong one at this size: 10x7 is a shape built to survive 16px, so it is
// a silhouette, and a silhouette blown up is a blob or, outlined, masonry.
const stickerB64 = read('public/mascot/peek/stickers/notes.svg');

const WIDTH = 1200;
const HEIGHT = 630;
// Brighter than the paper og.png and docs-og share. Those cards are objects on
// a desk; this one is a screen, and the page it stands for is white under the
// bubbles.
const PAPER = '#faf9f6';
const INK = '#1b1917';
const MUTE = '#8f887c';
// Who you are writing to, and where. A URL alone names an address; a thread
// header names a person, and on a card that travels without the page around it
// that is the fact worth carrying. Both come from src/data/site.ts.
const NAME = 'Lucian Bu';
const SLUG = 'buxx.me/message';

// The page's accent, already resolved: nameOnBackground('#007AFF', '#FFFFFF')
// in src/pages/message.astro. If that line moves, this one moves with it.
const ACCENT = '#0070EB';

// The bubble grey, warmed to the ground, and the title bar's own ground a step
// off the paper. Every chat window puts its header on a different material
// from the thread; that band is what the card has instead of a drawn box.
const SURFACE = '#e9e6de';
const BAR = '#f2f0ea';

// One number drives the thread. Everything else is derived from it so the
// Tapback stays in proportion when the type moves.
const MSG = 44;
const LINE = 1.32;
const PAD_Y = 26;
const PAD_X = 36;
const BUBBLE_H = Math.round(MSG * LINE) + PAD_Y * 2;

// Tapback geometry, measured off an iOS 18 Messages screenshot rather than
// invented: the disc is 0.96x the bubble's height -- far bigger than it feels
// like it should be -- and nests into the top-left corner of a sent bubble,
// overlapping about a third of its own width and height so most of it floats
// outside. Flat fill, no border, no shadow: an outlined disc reads as a hole
// punched in the message, a filled one as a badge sitting on it. The two tail
// dots sit at 1.6 and 2.1 radii out on the diagonal and are the whole tell --
// without them it is a sticker someone dropped next to the message.
const DISC = Math.round(BUBBLE_H * 0.96);
const LAP = Math.round(DISC * 0.34);
const DOT1 = Math.round(DISC * 0.18);
const DOT2 = Math.round(DISC * 0.1);
const r = (n) => Math.round(n);

// Written for the card, not lifted from the page. A link preview is read cold,
// in a feed, by someone who has not opened anything -- so the three bubbles
// carry the three facts that decide whether it is worth a tap: you have
// something private to say, one person reads it, and an answer can come back.
// Keep it in the page's voice -- see features/messages/copy.ts.
//
// The proposition goes in the accent bubble, because that is the one shape on
// the card anyone sees first and a greeting spends it on nothing. It stays the
// visitor's line rather than the owner's: the page rules that the accent is
// the visitor's own voice and only ever that.
const html = `<!doctype html><meta charset="utf-8">
<style>
@font-face{font-family:'Geist';src:url(data:font/woff2;base64,${sansB64}) format('woff2');font-weight:100 900;font-style:normal}
@font-face{font-family:'Geist Mono';src:url(data:font/woff2;base64,${monoB64}) format('woff2');font-weight:100 900;font-style:normal}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:${PAPER};color:${INK};
  font-family:'Geist',sans-serif;-webkit-font-smoothing:antialiased}
/* Bare paper, no dot grid -- /message switches the site's grid off, because a
   thread on graph paper reads as stickers on a worksheet. */
.card{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:${PAPER};
  display:flex;flex-direction:column}
/* The header a thread has: peek, the name, the address. Full bleed and on its
   own material, because a title bar that stops where the text stops is a
   caption. The hairline under it fades out to the right, following the thread
   below it -- a rule ruled edge to edge is a table. */
.bar{background:${BAR};padding:26px 72px 24px;position:relative;
  display:flex;align-items:center;gap:22px}
.bar::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;
  background:linear-gradient(90deg,rgba(27,25,23,.13),rgba(27,25,23,.02))}
/* Smooth-filtered, not image-rendering: pixelated. The sticker's pixel grid is
   not on an integer scale, so pixelated snaps every edge to the wrong pixel
   and shreds the linework. */
.peek{height:70px;width:auto;display:block}
.who{display:flex;flex-direction:column;gap:8px}
.name{font-size:37px;font-weight:500;letter-spacing:-.01em;line-height:1}
.slug{font-family:'Geist Mono',monospace;font-size:25px;letter-spacing:.04em;
  color:${MUTE};line-height:1}
/* The thread fills what is left. The first draft anchored it to the bottom and
   left the top two fifths as empty scrollback -- true to a chat window, and a
   waste of the only space the card has. Shrinking the dead area is what buys
   the type its size. */
.body{flex:1;display:flex;flex-direction:column;justify-content:flex-end;
  padding:0 72px 44px}
.thread{display:flex;flex-direction:column;gap:10px}
.msg{display:flex}
.msg--me{justify-content:flex-end}
.msg--turn{margin-top:34px}
/* fit-content so a bubble is the width of its sentence: max-width alone leaves
   a block wider than the text inside it. 86% because these lines are long and
   a narrower cap wraps them, and two-line bubbles do not fit next to a header
   at this type size. */
.bubble{width:fit-content;max-width:86%;padding:${PAD_Y}px ${PAD_X}px;
  font-size:${MSG}px;line-height:${LINE};border-radius:42px;text-wrap:pretty}
.bubble--them{background:${SURFACE}}
.bubble--me{background:${ACCENT};color:#fff;border-bottom-right-radius:14px;position:relative}
/* The tightened shared corners are what make the two grey bubbles one person
   talking rather than two. */
.bubble--joined-below{border-bottom-left-radius:14px}
.bubble--joined-above{border-top-left-radius:14px}
.react{position:absolute;left:${LAP - DISC}px;top:${LAP - DISC}px;
  width:${DISC}px;height:${DISC}px;border-radius:50%;background:${SURFACE};
  display:grid;place-items:center;font-size:${r(DISC * 0.55)}px;line-height:1}
.react::before,.react::after{content:"";position:absolute;border-radius:50%;
  background:${SURFACE}}
.react::before{width:${DOT1}px;height:${DOT1}px;
  left:${r(-0.063 * DISC - DOT1 / 2)}px;top:${r(1.0465 * DISC - DOT1 / 2)}px}
.react::after{width:${DOT2}px;height:${DOT2}px;
  left:${r(-0.25 * DISC - DOT2 / 2)}px;top:${r(1.23 * DISC - DOT2 / 2)}px}
/* Apple Color Emoji is drawn wider than the advance it reports, so the space
   after one gets eaten. A hair of margin puts it back. */
.emoji{margin-right:.1em}
</style>
<div class="card">
  <div class="bar">
    <img class="peek" src="data:image/svg+xml;base64,${stickerB64}" alt="">
    <span class="who">
      <span class="name">${NAME}</span>
      <span class="slug">${SLUG}</span>
    </span>
  </div>
  <div class="body">
  <div class="thread">
    <div class="msg msg--me"><p class="bubble bubble--me">Can I tell you something?<span class="react">🩷</span></p></div>
    <div class="msg msg--turn"><p class="bubble bubble--them bubble--joined-below">Go for it, nobody else sees this.</p></div>
    <div class="msg"><p class="bubble bubble--them bubble--joined-above">Drop an email and I'll write back <span class="emoji">📮</span></p></div>
  </div>
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
