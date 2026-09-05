/**
 * The homepage glyph field: a monospace rain band behind the hero.
 *
 * Ported from the `02 Rain` / `03 Drift` concepts in src/pages/lab/glyph.astro.
 * Per-column falling heads leave trails that decay toward a per-cell floor, so
 * the band is mostly static haze with movement running through it. The pointer
 * paints a second channel that gently lifts whatever it passes over.
 *
 * Colour is one ink per theme from src/features/home/glyph-inks.ts, drawn at
 * random per session, with `?ink=` pinning one for review. What the clock changes is the
 * WEATHER, not the colour: by day the field runs closer to the lab's `rain`
 * preset, by night it settles into `drift` (slower fall, longer trails, fewer
 * columns). The two are blended on a daylight curve, so there is no step.
 *
 * Budget: an ~11fps tick on a canvas the width of the band, gated on
 * visibility, on being in the viewport, and on prefers-reduced-motion (which
 * gets one static frame and nothing else).
 */

import { GLYPH_INKS, resolveGlyphInk, type GlyphInk } from '@/features/home/glyph-inks';

const GLYPHS = 'CLPSAR01<>=+*-#$';
const TICK_MS = 90;
const GLOW_DECAY = 0.78;
const FONT_PX = 12;
const BAND_WIDTH = 1200;
const BAND_HEIGHT = 560;
/** Pointer light: a soft lift of the cells under the cursor, not a torch. */
const GLOW_RADIUS = 64;
const GLOW_PEAK = 0.5;
/** Columns wake from the centre outward: spread across the band, then ease. */
const WAKE_SPREAD_MS = 700;
const WAKE_MS = 600;

/**
 * Day (`rain`) and night (`drift`), blended by daylight. Both run thinner than
 * the lab presets: the field sits behind body copy, and a full-density band
 * read as grime rather than weather.
 */
const DAY = { speed: 1.0, head: 0.58, trail: 0.93, columns: 0.55 };
const NIGHT = { speed: 0.35, head: 0.48, trail: 0.965, columns: 0.45 };
/** Per-cell resting alpha. Near zero: the ground stays clean between streaks. */
const FLOOR_MIN = 0.01;
const FLOOR_RANGE = 0.03;

interface Column {
  chars: string[];
  alphas: Float32Array;
  floors: Float32Array;
  glows: Float32Array;
  head: number;
  speed: number;
  maxRow: number;
  brightness: number;
  /** Fixed per column; a column runs when `seed < weather.columns`. */
  seed: number;
  /** Wake delay from boot, by distance from the centre column. */
  delay: number;
}

interface Weather {
  speed: number;
  head: number;
  trail: number;
  columns: number;
}

/**
 * 0 at 03:00, 1 at 15:00, cosine between. Local time, so the field is the
 * visitor's weather rather than the server's. `?hour=` pins it for review.
 */
const daylight = (hour: number): number => 0.5 - 0.5 * Math.cos(((hour - 3) / 24) * Math.PI * 2);

const localHour = (): number => {
  const pinned = new URLSearchParams(location.search).get('hour');
  if (pinned !== null && pinned !== '' && !Number.isNaN(Number(pinned))) return Number(pinned);
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
};

const weatherAt = (hour: number): Weather => {
  const t = daylight(hour);
  const mix = (a: number, b: number) => b + (a - b) * t;
  return {
    speed: mix(DAY.speed, NIGHT.speed),
    head: mix(DAY.head, NIGHT.head),
    trail: mix(DAY.trail, NIGHT.trail),
    columns: mix(DAY.columns, NIGHT.columns),
  };
};

const pick = (): string => GLYPHS[(Math.random() * GLYPHS.length) | 0];

export interface GlyphFieldHandle {
  destroy: () => void;
}

export function mountGlyphField(host: HTMLElement): GlyphFieldHandle | null {
  const canvas = host.querySelector('canvas');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return null;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  const font = `${FONT_PX}px ${getComputedStyle(root).getPropertyValue('--font-mono').trim() || 'ui-monospace, monospace'}`;

  let columns: Column[] = [];
  let colCount = 0;
  let rowCount = 0;
  let colW = 0;
  let rowH = 0;
  const inks: GlyphInk = GLYPH_INKS[resolveGlyphInk(location.search)];
  let ink = inks.light;
  let gain = 0.72;
  let weather = weatherAt(localHour());

  let raf = 0;
  let last = 0;
  let onScreen = true;
  let bornAt = 0;
  let awake = false;
  let glowQueued = false;
  let destroyed = false;

  const readTheme = () => {
    const dark = root.classList.contains('dark');
    ink = dark ? inks.dark : inks.light;
    // Light ink on a dark ground carries further than dark ink on white, so the
    // same nominal alpha reads hotter. The ink is a mid blue rather than pure
    // black or white, so both run above the reference's 0.6 / 0.5.
    gain = dark ? 0.62 : 0.72;
  };

  const respawn = (col: Column, initial: boolean) => {
    col.head = initial ? Math.random() * rowCount * 2 : -Math.random() * rowCount * 1.5;
    col.speed = 0.25 + 0.75 * Math.random();
    if (initial || Math.random() < 0.2) {
      col.maxRow = Math.floor(rowCount * (0.35 + 0.65 * Math.random()));
      col.brightness = 0.5 + 0.5 * Math.random();
    }
  };

  const step = () => {
    const { speed, head, trail, columns: density } = weather;
    for (const col of columns) {
      const active = col.seed < density;
      if (active) col.head += col.speed * speed;
      const at = Math.floor(col.head);

      for (let r = 0; r <= col.maxRow; r++) {
        if (col.alphas[r] > 0) col.alphas[r] = Math.max(col.alphas[r] * trail, col.floors[r]);
      }
      if (active && at >= 0 && at <= col.maxRow && at < rowCount) col.alphas[at] = head;

      for (let r = 0; r < rowCount; r++) {
        if (col.glows[r] > 0) col.glows[r] = col.glows[r] < 0.03 ? 0 : col.glows[r] * GLOW_DECAY;
      }

      if (Math.random() < 0.4) col.chars[(Math.random() * rowCount) | 0] = pick();
      if (active && at > col.maxRow + 4) respawn(col, false);
    }
  };

  const lit: Array<number | string> = [];

  const paint = (now = performance.now()) => {
    ctx.clearRect(0, 0, BAND_WIDTH, BAND_HEIGHT);
    ctx.textBaseline = 'top';
    ctx.fillStyle = ink;
    ctx.font = font;
    lit.length = 0;

    const age = now - bornAt;
    let allAwake = true;

    for (let c = 0; c < colCount; c++) {
      const col = columns[c];
      let wake = 1;
      if (!awake) {
        const u = (age - col.delay) / WAKE_MS;
        if (u < 1) {
          allAwake = false;
          if (u <= 0) continue;
          wake = u * u * (3 - 2 * u);
        }
      }
      const x = c * colW;
      for (let r = 0; r < rowCount; r++) {
        const rain = col.alphas[r] * col.brightness * wake;
        const glow = col.glows[r];
        // Glow-dominant cells are painted after the rain so they sit on top.
        if (glow > rain) {
          lit.push(x, r * rowH, col.chars[r], glow * gain);
          continue;
        }
        if (rain * gain < 0.012) continue;
        ctx.globalAlpha = rain * gain;
        ctx.fillText(col.chars[r], x, r * rowH);
      }
    }
    if (allAwake) awake = true;

    if (lit.length) {
      for (let i = 0; i < lit.length; i += 4) {
        ctx.globalAlpha = lit[i + 3] as number;
        ctx.fillText(lit[i + 2] as string, lit[i] as number, lit[i + 1] as number);
      }
    }
    ctx.globalAlpha = 1;
  };

  const build = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(BAND_WIDTH * dpr);
    canvas.height = Math.round(BAND_HEIGHT * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = font;

    // Columns sit 70% wider than a glyph, so the rain reads as discrete
    // streaks rather than as solid text.
    colW = 1.7 * ctx.measureText('0').width;
    rowH = Math.round(FONT_PX * 1.333);
    colCount = Math.ceil(BAND_WIDTH / colW);
    rowCount = Math.ceil(BAND_HEIGHT / rowH);
    const mid = (colCount - 1) / 2;

    columns = Array.from({ length: colCount }, (_, c) => {
      const col: Column = {
        chars: Array.from({ length: rowCount }, pick),
        alphas: new Float32Array(rowCount),
        floors: new Float32Array(rowCount),
        glows: new Float32Array(rowCount),
        head: 0,
        speed: 0,
        maxRow: 0,
        brightness: 1,
        seed: Math.random(),
        delay: (Math.abs(c - mid) / mid) * WAKE_SPREAD_MS,
      };
      for (let r = 0; r < rowCount; r++) {
        col.floors[r] = FLOOR_MIN + FLOOR_RANGE * Math.random();
        col.alphas[r] = col.floors[r];
      }
      respawn(col, true);
      return col;
    });

    // Run the simulation forward before the first paint so the band opens
    // mid-flow instead of visibly filling in.
    for (let i = 0; i < rowCount * 4; i++) step();
  };

  /* ── Pointer glow ─────────────────────────────────────────────────────── */

  const glowAt = (clientX: number, clientY: number, radius: number) => {
    if (!columns.length) return;
    const box = canvas.getBoundingClientRect();
    const scale = BAND_WIDTH / box.width;
    const x = (clientX - box.left) * scale;
    const y = (clientY - box.top) * scale;
    if (x < -radius || x > BAND_WIDTH + radius) return;
    if (y < -radius || y > BAND_HEIGHT + radius) return;

    const c0 = Math.max(0, Math.floor((x - radius) / colW));
    const c1 = Math.min(colCount - 1, Math.ceil((x + radius) / colW));
    const r0 = Math.max(0, Math.floor((y - radius) / rowH));
    const r1 = Math.min(rowCount - 1, Math.ceil((y + radius) / rowH));

    for (let c = c0; c <= c1; c++) {
      const col = columns[c];
      const dx = c * colW + colW / 2 - x;
      for (let r = r0; r <= r1; r++) {
        const d = Math.hypot(dx, r * rowH + rowH / 2 - y);
        if (d > radius) continue;
        const g = GLOW_PEAK * Math.pow(1 - d / radius, 1.5);
        if (g > col.glows[r]) col.glows[r] = g;
      }
    }

    // Repaint on the next frame rather than per event — a fast pointer fires
    // far more often than the display can show it.
    if (glowQueued) return;
    glowQueued = true;
    requestAnimationFrame(() => {
      glowQueued = false;
      paint();
    });
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    glowAt(event.clientX, event.clientY, GLOW_RADIUS);
  };

  // A tap has no hover, so it plants a larger light that then decays.
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    glowAt(event.clientX, event.clientY, GLOW_RADIUS * 1.4);
  };

  /* ── Frame loop — visibility gated ────────────────────────────────────── */

  const shouldRun = () =>
    !destroyed && onScreen && document.visibilityState === 'visible' && !reduced.matches;

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (now - last < TICK_MS) return;
    last = now;
    step();
    paint(now);
  };

  const sync = () => {
    if (shouldRun()) {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const onVisibility = () => sync();
  const onReducedChange = () => {
    if (reduced.matches) awake = true;
    sync();
    paint();
  };

  // The theme toggle flips `html.dark`; the field follows on the next frame.
  const themeObserver = new MutationObserver(() => {
    readTheme();
    paint();
  });

  // The band only exists at the top of the document, so stop the moment it
  // scrolls away rather than simulating rows nobody can see.
  const io = new IntersectionObserver(
    (entries) => {
      onScreen = entries[0].isIntersecting;
      sync();
    },
    { rootMargin: '64px' },
  );

  // Weather follows the clock while the page stays open.
  const weatherTimer = window.setInterval(() => {
    weather = weatherAt(localHour());
  }, 60_000);

  const start = () => {
    if (destroyed) return;
    readTheme();
    build();
    bornAt = performance.now();
    // Reduced motion gets one honest frame: the band at rest, no entrance.
    awake = reduced.matches;
    paint(bornAt);
    host.classList.add('is-ready');
    sync();
  };

  // Measuring columns against the fallback face would misplace every glyph
  // once Geist Mono arrives, so wait for it — briefly.
  const fontReady = document.fonts?.load(font).then(() => undefined, () => undefined) ?? Promise.resolve();
  Promise.race([fontReady, new Promise<void>((r) => setTimeout(r, 800))]).then(start);

  document.addEventListener('visibilitychange', onVisibility);
  reduced.addEventListener('change', onReducedChange);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  themeObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
  io.observe(host);

  return {
    destroy() {
      destroyed = true;
      sync();
      clearInterval(weatherTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', onReducedChange);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      themeObserver.disconnect();
      io.disconnect();
    },
  };
}
