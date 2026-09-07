// Regenerate public/message-og.png from source. Run: node scripts/generate-message-og.mjs
//
// The card is three messages on paper and nothing else. It had a title bar --
// peek, the name, the address -- and that was a mistake twice over: every
// client that shows this card already prints the domain and the page title in
// its own chrome directly above the image, so the bar spent a fifth of the
// card restating them, in the smallest type on it. What is left is the only
// thing the chrome cannot say, which is what the page sounds like.
//
// Every size here is chosen for the size the card is actually SEEN at, not the
// size it is drawn at. Telegram, Slack, iMessage and X all render a link
// preview around 500-560px wide, so a 1200px card arrives at roughly 0.45x.
// If you change a number, divide it by 2.2 and ask whether you could read it,
// then check the render with `sips -Z 520` rather than at full size.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p)).toString('base64');

const sansB64 = read('public/fonts/geist-sans-variable.woff2');

const WIDTH = 1200;
const HEIGHT = 630;
// Brighter than the paper og.png and docs-og share. Those cards are objects on
// a desk; this one is a screen, and the page it stands for is white under the
// bubbles.
const PAPER = '#faf9f6';
const INK = '#1b1917';

// The page's accent, already resolved: nameOnBackground('#007AFF', '#FFFFFF')
// in src/pages/message.astro. If that line moves, this one moves with it.
const ACCENT = '#0070EB';

// The bubble grey, warmed to the ground. #ececee on white is the page's own
// step (1.18); this is that same step measured against this paper, in the
// paper's hue -- an absolute grey lifted onto a warm ground disappears.
const SURFACE = '#e9e6de';

// One number drives the card. Everything else derives from it, so the layout
// stays in proportion when the type moves.
const MSG = 52;
const LINE = 1.3;
const PAD_Y = 30;
const PAD_X = 42;
const GAP_JOINED = 12;
const GAP_TURN = 48;
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

// The disc hangs above the first bubble, and it is not in the thread's box, so
// centring the box alone leaves the drawing sitting low. Centre what the eye
// sees -- the thread plus that overhang -- and pad down to it.
const OVERHANG = DISC - LAP;
const THREAD_H = BUBBLE_H * 3 + GAP_JOINED + GAP_TURN;
const PAD_TOP = r((HEIGHT - (OVERHANG + THREAD_H)) / 2) + OVERHANG;

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
*{margin:0;padding:0;box-sizing:border-box}
/* Bare paper, no dot grid -- /message switches the site's grid off, because a
   thread on graph paper reads as stickers on a worksheet. */
body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:${PAPER};color:${INK};
  font-family:'Geist',sans-serif;-webkit-font-smoothing:antialiased}
.card{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:${PAPER};
  padding:${PAD_TOP}px 56px 0}
.thread{display:flex;flex-direction:column;gap:${GAP_JOINED}px}
.msg{display:flex}
.msg--me{justify-content:flex-end}
.msg--turn{margin-top:${GAP_TURN - GAP_JOINED}px}
/* fit-content so a bubble is the width of its sentence: max-width alone leaves
   a block wider than the text inside it. */
.bubble{width:fit-content;max-width:92%;padding:${PAD_Y}px ${PAD_X}px;
  font-size:${MSG}px;line-height:${LINE};border-radius:52px;text-wrap:pretty}
.bubble--them{background:${SURFACE}}
.bubble--me{background:${ACCENT};color:#fff;border-bottom-right-radius:16px;position:relative}
/* The tightened shared corners are what make the two grey bubbles one person
   talking rather than two. */
.bubble--joined-below{border-bottom-left-radius:16px}
.bubble--joined-above{border-top-left-radius:16px}
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
  <div class="thread">
    <div class="msg msg--me"><p class="bubble bubble--me">Can I tell you something?<span class="react">🩷</span></p></div>
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
