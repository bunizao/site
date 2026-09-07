// Regenerate public/message-og.png from source. Run: node scripts/generate-message-og.mjs
//
// The card is a chat window, because the page is one: peek and the address
// across the top the way a thread names who you are writing to, and the
// messages settling against the bottom the way messages do.
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
// a silhouette, and a silhouette blown up to 70px is a blob or, outlined,
// masonry. The sticker is drawn art and just needs to be drawn small.
const stickerB64 = read('public/mascot/peek/stickers/notes.svg');

const WIDTH = 1200;
const HEIGHT = 630;
// Brighter than the paper og.png and docs-og share. Those cards are objects on
// a desk; this one is a screen, and the page it stands for is white under the
// bubbles. Warm enough to stay in the family, light enough to read as glass.
const PAPER = '#faf9f6';
const INK = '#1b1917';
const MUTE = '#a8a195';
// Who you are writing to, and where. A URL alone names an address; a thread
// header names a person, and on a card that travels without the page around it
// that is the fact worth carrying. Both come from src/data/site.ts.
const NAME = 'Lucian Bu';
const SLUG = 'buxx.me/message';

// The page's accent, already resolved: nameOnBackground('#007AFF', '#FFFFFF')
// in src/pages/message.astro. If that line moves, this one moves with it.
const ACCENT = '#0070EB';

// The bubble grey, warmed to the ground. #ececee on white is the page's own
// step (1.18); this is that same step measured against this paper, in the
// paper's hue -- an absolute grey lifted onto a warm ground disappears.
const SURFACE = '#e9e6de';

// The title bar's own ground, a step off the paper and a long way short of the
// bubbles. Every chat window puts its header on a different material from the
// thread; here that band is what the card has instead of a drawn box, and it
// gives the space above the messages a reason to be empty.
const BAR = '#f2f0ea';

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
  display:flex;flex-direction:column}
/* The header a thread has: peek, the name, the address. Full bleed and on its
   own material, because a title bar that stops where the text stops is a
   caption. The hairline under it fades out to the right, following the thread
   below it -- a rule ruled edge to edge is a table. */
.bar{background:${BAR};padding:36px 84px 30px;position:relative;
  display:flex;align-items:center;gap:22px}
.bar::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;
  background:linear-gradient(90deg,rgba(27,25,23,.13),rgba(27,25,23,.02))}
.body{flex:1;display:flex;flex-direction:column;padding:0 84px 72px}
.who{display:flex;flex-direction:column;gap:7px}
.name{font-size:30px;font-weight:500;letter-spacing:-.01em;line-height:1}
/* Smooth-filtered, not image-rendering: pixelated. The sticker's pixel grid
   is not on an integer scale, so at this size pixelated snaps every edge to
   the wrong pixel and shreds the linework; letting the browser resample it
   leaves a small drawing instead of a broken big one. */
.peek{height:64px;width:auto;display:block}
.slug{font-family:'Geist Mono',monospace;font-size:21px;letter-spacing:.06em;
  color:${MUTE};line-height:1}
/* Pushed down, because messages sit at the bottom of a thread and the space
   above them is the part you have not scrolled back through. */
.thread{margin-top:auto;display:flex;flex-direction:column;gap:8px}
.msg{display:flex}
.msg--me{justify-content:flex-end}
.msg--turn{margin-top:40px}
.bubble{width:fit-content;max-width:62%;padding:22px 30px;font-size:32px;line-height:1.5;border-radius:34px;text-wrap:pretty}
.bubble--them{background:${SURFACE}}
.bubble--me{background:${ACCENT};color:#fff;border-bottom-right-radius:11px;position:relative}
/* An iMessage Tapback, copied off the real thing rather than invented. Numbers
   measured from a screenshot: the disc is 0.96x the bubble's height -- far
   bigger than it feels like it should be -- and it nests into the top-left
   corner of a sent bubble, overlapping about a third of its own width and
   height so most of it floats outside. Flat fill, no border, no shadow. The
   hairline was the mistake the first attempt made: an outlined disc reads as a
   hole punched in the message, and a filled one reads as a badge sitting on it.
   SURFACE is already the received-bubble grey, which is the colour Messages
   uses here, so the reaction stays the owner's voice answering the opener. */
.react{position:absolute;left:-57px;top:-57px;width:87px;height:87px;
  border-radius:50%;background:${SURFACE};
  display:grid;place-items:center;font-size:48px;line-height:1}
/* The tail: two dots on the diagonal away from the corner, 0.18x and 0.10x the
   disc, at 1.6 and 2.1 radii from its centre. They are the whole tell -- a bare
   disc is a sticker someone dropped next to the message, and the dots are what
   make it a thought about that message. */
.react::before,.react::after{content:"";position:absolute;border-radius:50%;
  background:${SURFACE}}
.react::before{width:15px;height:15px;left:-13px;top:84px}
.react::after{width:8px;height:8px;left:-26px;top:103px}
.bubble--joined-below{border-bottom-left-radius:11px}
.bubble--joined-above{border-top-left-radius:11px}
/* Apple Color Emoji is drawn wider than the advance it reports, so the space
   after one gets eaten. A hair of margin puts it back without touching the
   sentence. */
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
