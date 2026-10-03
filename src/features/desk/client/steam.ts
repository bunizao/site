// Steam off the coffee. Three wisps, each a ribbon that rises from the cup,
// sways as a wave runs up it, spreads and thins out. Each is laid soft on a
// canvas a third the size and drawn up, so its edges blur, then given a fine
// brighter core. It runs at twenty frames a second while the cup is in view,
// the canvas is uncovered and the paint is dry, and holds still for reduced
// motion.

import { CUP_MOUTH, THINGS } from '@/features/desk/shared/still-life';

// Each frame costs the same whatever it draws, so the rate is the cost. The
// steam is slow: a wisp sways at most 0.04 painting widths a second, under
// 1.5px a frame on the largest painting at this rate. Twenty also divides
// 60Hz and 120Hz, so every frame lasts the same.
const FPS = 20;
/** How high the steam goes, in canvas widths. */
const TOP = 0.79;
/** Half the width of the canvas it rises in. */
const SIDE = 0.075;
const SOFT = 3;

interface Wisp {
  /** Across the mouth, -1..1. */
  at: number;
  phase: number;
  speed: number;
  /** How far up it gets, as a share of the canvas. */
  reach: number;
}

const WISPS: Wisp[] = [
  { at: -0.42, phase: 0, speed: 1, reach: 0.86 },
  { at: 0.08, phase: 2.2, speed: 0.82, reach: 1 },
  { at: 0.5, phase: 4.1, speed: 1.16, reach: 0.72 },
];

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export function initSteam() {
  const easel = document.querySelector<HTMLElement>('[data-easel]');
  const host = easel?.querySelector<HTMLElement>('[data-thing="cup"]');
  const cup = THINGS.find((thing) => thing.id === 'cup');
  if (!easel || !host || !cup) return;
  const [mx, rim, half] = CUP_MOUTH;
  const [bx, by, bw, bh] = cup.box;
  const canvas = document.createElement('canvas');
  canvas.className = 'sl-steam';
  canvas.setAttribute('aria-hidden', 'true');
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
  Object.assign(canvas.style, {
    left: pct((mx - SIDE - bx) / bw),
    top: pct((TOP - by) / bh),
    width: pct((SIDE * 2) / bw),
    height: pct((rim - TOP) / bh),
  });
  host.append(canvas);
  const blur = document.createElement('canvas');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isNight = () => document.documentElement.classList.contains('dark');

  /** A wisp's centre line at time `t` (seconds), in canvas widths, rim first. */
  const lineOf = (wisp: Wisp, t: number) => {
    const points: [number, number, number][] = [];
    const steps = 22;
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const y = rim - 0.004 - s * (rim - 0.004 - TOP) * wisp.reach;
      const sway = (0.0025 + 0.017 * s ** 1.3) * Math.sin(Math.PI * 2 * 1.15 * s - t * 1.7 * wisp.speed + wisp.phase);
      const drift = 0.012 * s * s * Math.sin(t * 0.33 * wisp.speed + wisp.phase);
      points.push([mx + wisp.at * half * 0.5 + sway + drift, y, 0.004 + 0.022 * s]);
    }
    return points;
  };

  const ribbon = (ctx: CanvasRenderingContext2D, points: [number, number, number][], u: number, ox: number, oy: number, widthScale: number) => {
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    points.forEach(([x, y, w], i) => {
      const [nx, ny] = points[Math.min(points.length - 1, i + 1)];
      const [px, py] = points[Math.max(0, i - 1)];
      const dx = nx - px;
      const dy = ny - py;
      const n = Math.hypot(dx, dy) || 1;
      const off = (w * widthScale) / 2;
      left.push([(x - (dy / n) * off - ox) * u, (y + (dx / n) * off - oy) * u]);
      right.push([(x + (dy / n) * off - ox) * u, (y - (dx / n) * off - oy) * u]);
    });
    ctx.beginPath();
    [...left, ...right.reverse()].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };

  const render = (t: number) => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const scale = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * scale)) {
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      blur.width = Math.max(1, Math.round(width / SOFT));
      blur.height = Math.max(1, Math.round(height / SOFT));
    }
    const ctx = canvas.getContext('2d');
    const soft = blur.getContext('2d');
    if (!ctx || !soft) return;
    const night = isNight();
    const colour = night ? '232 236 244' : '255 255 255';
    const peak = night ? 0.3 : 0.62;
    const u = width / (SIDE * 2);
    const ox = mx - SIDE;
    soft.setTransform(1, 0, 0, 1, 0, 0);
    soft.clearRect(0, 0, blur.width, blur.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const wisp of WISPS) {
      const points = lineOf(wisp, t);
      // Each wisp comes and goes on its own breath.
      const breath = 0.6 + 0.4 * Math.sin(t * 0.55 * wisp.speed + wisp.phase * 1.7);
      const fade = (target: CanvasRenderingContext2D, k: number, alpha: number) => {
        const g = target.createLinearGradient(0, (rim - TOP) * k, 0, (rim - TOP) * k * (1 - wisp.reach));
        for (const s of [0, 0.08, 0.25, 0.5, 0.75, 1]) g.addColorStop(s, `rgb(${colour} / ${(alpha * breath * smooth(0, 0.12, s) * (1 - s) ** 1.3).toFixed(3)})`);
        return g;
      };
      soft.setTransform(1 / SOFT, 0, 0, 1 / SOFT, 0, 0);
      ribbon(soft, points, u, ox, TOP, 1);
      soft.fillStyle = fade(soft, u, peak);
      soft.fill();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ribbon(ctx, points, u, ox, TOP, 0.22);
      ctx.fillStyle = fade(ctx, u, peak * 0.55);
      ctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(blur, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
  };

  let dry = false;
  let inView = true;
  /** The next draw: a timer, then a frame. */
  let frame = 0;
  const live = () => dry && inView && !document.hidden && !easel.classList.contains('is-covered') && !reduced.matches;

  // A timer sleeps through most of the gap and a frame callback lands the
  // draw on the screen's beat, so the frames between draws wake nothing. The
  // timer ends a few ms early: the next beat after it is the one a twentieth
  // of a second on, at 60Hz and at 120Hz alike.
  const tick = (now: number) => {
    frame = 0;
    if (!live()) return;
    render(now / 1000);
    frame = window.setTimeout(() => (frame = requestAnimationFrame(tick)), 1000 / FPS - 6);
  };

  const wake = () => {
    if (!dry) return;
    if (reduced.matches) render(2.4);
    else if (!frame && live()) frame = requestAnimationFrame(tick);
  };

  easel.addEventListener('easel:painted', () => {
    dry = true;
    wake();
  });
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    wake();
  }).observe(host);
  new MutationObserver(wake).observe(easel, { attributes: true, attributeFilter: ['class'] });
  // A still frame takes the theme's colour too.
  new MutationObserver(() => reduced.matches && wake()).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', wake);
  reduced.addEventListener('change', wake);
}
