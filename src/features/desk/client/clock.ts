// The desk clock keeps Melbourne time. Each digit is seven segments and each
// segment is one knife stroke: when the minute turns, the segments going dark
// are scraped off, right to left, and the new ones dragged on. The colon
// blinks with the seconds. Unlit segments stay as a faint ghost on the glass,
// the way a real one shows its eights.

import { CLOCK_FACE, THINGS } from '@/features/desk/shared/still-life';
import { css, draw, seeded, stroke, type Stroke, type Tone } from './knife';

const SCRAPE_MS = 240;
const LAY_MS = 340;
// Each digit to the left starts this much later.
const STAGGER_MS = 80;
const SEGMENTS = 'abcdefg';
// The segments lit for each numeral.
const DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];

const melbourne = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Australia/Melbourne',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "2147" for 21:47 in Melbourne. */
const timeNow = () => melbourne.format(new Date()).replace(/\D/g, '');

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

interface Glass {
  /** Per digit, per segment a–g. */
  lit: Stroke[][];
  ghost: Stroke[][];
  colon: Stroke[];
  glow: number;
}

/** What is left of a stroke after the knife has scraped `progress` of it away. */
function drawRest(ctx: CanvasRenderingContext2D, s: Stroke, progress: number) {
  if (progress >= 1) return;
  ctx.save();
  // The path is fixed as it is built; restoring the transform keeps it.
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.angle);
  ctx.beginPath();
  ctx.rect(s.length * progress - s.width * (1 - progress), -s.width, s.length * 2, s.width * 2);
  ctx.restore();
  ctx.clip();
  draw(ctx, s);
  ctx.restore();
}

function lay(width: number, height: number, night: boolean): Glass {
  const lit: Tone = night ? { l: 0.8, c: 0.16, h: 36 } : { l: 0.76, c: 0.15, h: 34 };
  const ghost: Tone = night ? { l: 0.31, c: 0.025, h: 36 } : { l: 0.34, c: 0.022, h: 38 };
  const padX = width * 0.075;
  const padY = height * 0.17;
  const colonWidth = width * 0.07;
  const gap = width * 0.04;
  const digitWidth = (width - padX * 2 - colonWidth - gap * 3) / 4;
  const digitHeight = height - padY * 2;
  const thick = digitHeight * 0.14;
  const mid = height / 2;
  // LED digits lean forward.
  const lean = (x: number, y: number): [number, number] => [x + (mid - y) * 0.09, y];

  const segmentsOf = (tone: Tone, left: number, seed: number) => {
    const rand = seeded(seed);
    const top = padY;
    const end = thick * 0.55;
    const ends: Record<string, [number, number, number, number]> = {
      a: [left + end, top, left + digitWidth - end, top],
      g: [left + end, top + digitHeight / 2, left + digitWidth - end, top + digitHeight / 2],
      d: [left + end, top + digitHeight, left + digitWidth - end, top + digitHeight],
      f: [left, top + end, left, top + digitHeight / 2 - end],
      b: [left + digitWidth, top + end, left + digitWidth, top + digitHeight / 2 - end],
      e: [left, top + digitHeight / 2 + end, left, top + digitHeight - end],
      c: [left + digitWidth, top + digitHeight / 2 + end, left + digitWidth, top + digitHeight - end],
    };
    return [...SEGMENTS].map((segment) => {
      const [x1, y1] = lean(ends[segment][0], ends[segment][1]);
      const [x2, y2] = lean(ends[segment][2], ends[segment][3]);
      const length = Math.hypot(x2 - x1, y2 - y1);
      // The solid paint stops short of the drag; stretch the drag so the
      // segment still reaches its end.
      return stroke(rand, x1, y1, Math.atan2(y2 - y1, x2 - x1), length / 0.84, thick, tone, 0.45);
    });
  };

  const lefts = [0, 1, 2, 3].map((i) => padX + i * (digitWidth + gap) + (i > 1 ? colonWidth : 0));
  const colonX = padX + 2 * digitWidth + gap * 1.5 + colonWidth / 2;
  const colon = [-0.2, 0.2].map((at, i) => {
    const [x, y] = lean(colonX - thick * 0.55, mid + digitHeight * at);
    return stroke(seeded(90 + i), x, y, 0, thick * 1.2, thick, lit, 0.3);
  });
  return {
    lit: lefts.map((left, i) => segmentsOf(lit, left, 40 + i)),
    ghost: lefts.map((left, i) => segmentsOf(ghost, left, 40 + i)),
    colon,
    glow: thick * (night ? 1.4 : 0.6),
  };
}

export function initClock() {
  const host = document.querySelector<HTMLElement>('[data-thing="clock"]');
  const thing = THINGS.find((entry) => entry.id === 'clock');
  if (!host || !thing) return () => {};
  const canvas = document.createElement('canvas');
  canvas.className = 'sl-clock';
  canvas.setAttribute('aria-hidden', 'true');
  const [bx, by, bw, bh] = thing.box;
  const [fx, fy, fw, fh] = CLOCK_FACE;
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
  Object.assign(canvas.style, { left: pct((fx - bx) / bw), top: pct((fy - by) / bh), width: pct(fw / bw), height: pct(fh / bh) });
  host.append(canvas);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isNight = () => document.documentElement.classList.contains('dark');
  let glass: Glass | null = null;
  let glassKey = '';
  let shown = '';
  let turning: { from: string; start: number } | null = null;
  let colonOn = true;
  let timer = 0;
  let frame = 0;

  const render = (now: number) => {
    const scale = Math.min(devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const night = isNight();
    if (!width || !height || !shown) return false;
    const key = `${width}x${height}x${scale}x${night}`;
    if (key !== glassKey) {
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      glass = lay(width, height, night);
      glassKey = key;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx || !glass) return false;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (const digit of glass.ghost) for (const segment of digit) draw(ctx, segment);

    ctx.shadowColor = css({ l: 0.76, c: 0.15, h: 34, a: night ? 0.8 : 0.45 });
    ctx.shadowBlur = glass.glow;
    let moving = false;
    for (let i = 0; i < 4; i++) {
      const to = DIGITS[Number(shown[i])];
      const from = turning ? DIGITS[Number(turning.from[i])] : to;
      const local = turning ? now - turning.start - (3 - i) * STAGGER_MS : 0;
      [...SEGMENTS].forEach((segment, j) => {
        const was = from.includes(segment);
        const is = to.includes(segment);
        const s = glass!.lit[i][j];
        if (was && is) draw(ctx, s);
        else if (was) {
          const p = clamp01(local / SCRAPE_MS);
          if (p < 1) moving = true;
          drawRest(ctx, s, easeOut(p));
        } else if (is) {
          const p = clamp01((local - SCRAPE_MS * 0.6) / LAY_MS);
          if (p < 1) moving = true;
          draw(ctx, s, easeOut(p));
        }
      });
    }
    if (colonOn) for (const dot of glass.colon) draw(ctx, dot);
    ctx.shadowBlur = 0;
    if (!moving) turning = null;
    return moving;
  };

  const animate = (now: number) => {
    frame = render(now) ? requestAnimationFrame(animate) : 0;
  };

  const tick = () => {
    const time = timeNow();
    if (time !== shown) {
      turning = shown && !reduced.matches ? { from: shown, start: performance.now() } : null;
      shown = time;
      host.setAttribute('aria-label', `A desk clock: ${time.slice(0, 2)}:${time.slice(2)} in Melbourne`);
    }
    colonOn = reduced.matches || new Date().getSeconds() % 2 === 0;
    if (!document.hidden && !frame) animate(performance.now());
    timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 8);
  };

  const resizeObserver = new ResizeObserver(() => !frame && render(performance.now()));
  resizeObserver.observe(canvas);
  const themeObserver = new MutationObserver(() => !frame && render(performance.now()));
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  tick();

  return () => {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    themeObserver.disconnect();
    canvas.remove();
  };
}
