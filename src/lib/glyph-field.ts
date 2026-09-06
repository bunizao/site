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
 * Budget: an ~11fps tick on a canvas the size of the host — the viewport
 * width (capped at MAX_BAND_WIDTH) by the band height the stylesheet sets —
 * gated on visibility, on being in the viewport, and on prefers-reduced-motion
 * (which gets one static frame and nothing else). Nothing off-screen is
 * simulated: a phone runs a few hundred cells, not the desktop's 3500.
 */

import { GLYPH_INKS, resolveGlyphInk, type GlyphInk } from '@/features/home/glyph-inks';

const GLYPHS = 'CLPSAR01<>=+*-#$';
const TICK_MS = 90;
const GLOW_DECAY = 0.78;
const FONT_PX = 12;
/** The band never runs wider than this, however wide the viewport is. */
const MAX_BAND_WIDTH = 1200;
/** The site's dot lattice module; the band width snaps to it. */
const LATTICE_PX = 24;
const CELL_W = 12;
const CELL_H = 16;
/** Pointer light: a soft lift of the cells under the cursor, not a torch. */
// The pointer is one light across the page: these match the core ellipse of
// the site spotlight (Layout.astro), which takes over below the band in the
// same ink, so the crossing reads as one glow moving over two textures.
const GLOW_RADIUS = 88;
const GLOW_ASPECT = 0.72;
const GLOW_PEAK = 0.5;
/**
 * A moving pointer repaints the whole band; capping that at ~30fps keeps a
 * fast mouse from costing a full repaint on every display frame while the
 * glow still reads as continuous.
 */
const GLOW_PAINT_MS = 33;
/**
 * Collapse. The band is sticky, so scrolling does not carry it away: over the
 * first COLLAPSE_PX of scroll every row converges on the band's middle row
 * while the glyphs fade, so the rain condenses and is gone before the rows
 * pile up. Nothing is left behind but the lattice, which rises to meet it.
 * The track only needs to hold the band through the collapse; empty, it
 * scrolls away.
 */
const COLLAPSE_PX = 320;
/**
 * Where the site's own texture (dot lattice, pointer spotlight) takes over:
 * published to the page as `--field-edge` in viewport space, see the homepage
 * stylesheet. It starts this far below the band's bottom, so the fade above
 * it covers the band's own mask, and rises to the band's top as the rows
 * collapse: the lattice is what remains once the rain has condensed.
 */
const FIELD_EDGE_PAD = 60;
/** The falling head is drawn at this alpha over its own trail, so the motion reads. */
const HEAD_SPARK = 0.9;
/**
 * Gusts. Every few seconds a front crosses the band: columns near it fall
 * faster, mutate more, and lift a little, then settle. It is the one event
 * that makes the field read as weather rather than as a screensaver. Times
 * are in simulation ticks (TICK_MS each).
 */
const GUST_TICKS = 14;
const GUST_EVERY_TICKS: [number, number] = [55, 110];
const FIRST_GUST_TICK = 22;
/** Half-width of the front, in columns. */
const GUST_WIDTH = 7;
const GUST_SPEED = 1.6;
const GUST_LIFT = 0.5;
/**
 * Entrance. The band arrives as weather does: a front sweeps down from the top
 * edge over ENTRANCE_MS while columns wake from the centre outward. Both are
 * gates on an already-running simulation, so the field is mid-flow the moment
 * it is fully visible.
 */
const ENTRANCE_MS = 1100;
/** Soft edge of the sweeping front, in rows. */
const ENTRANCE_EDGE_ROWS = 7;
const WAKE_SPREAD_MS = 500;
const WAKE_MS = 500;

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
  /** Row of the falling head this tick, or -1 when the head is off the band. */
  spark: number;
  /** How much of the current gust this column feels, 0..1. */
  gust: number;
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
  /** Band size in CSS px, read from the host; 0 until measured. */
  let bandW = 0;
  let bandH = 0;
  let started = false;
  let lastGlowPaint = 0;
  const inks: GlyphInk = GLYPH_INKS[resolveGlyphInk(location.search)];
  let ink = inks.light;
  let gain = 0.72;
  let weather = weatherAt(localHour());

  let raf = 0;
  let last = 0;
  /** 0 = full rain, 1 = gone. Scroll-driven, see COLLAPSE_PX. */
  let collapse = 0;
  let paintQueued = false;
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
    // Published so the page can paint the pointer spotlight in the same ink.
    root.style.setProperty('--glyph-ink', ink);
  };

  const respawn = (col: Column, initial: boolean) => {
    col.head = initial ? Math.random() * rowCount * 2 : -Math.random() * rowCount * 1.5;
    col.speed = 0.25 + 0.75 * Math.random();
    if (initial || Math.random() < 0.2) {
      col.maxRow = Math.floor(rowCount * (0.35 + 0.65 * Math.random()));
      col.brightness = 0.5 + 0.5 * Math.random();
    }
  };

  let tick = 0;
  let gustStart = FIRST_GUST_TICK;
  let gustDir = 1;

  const scheduleGust = () => {
    const [min, max] = GUST_EVERY_TICKS;
    gustStart = tick + min + Math.random() * (max - min);
    gustDir = Math.random() < 0.5 ? -1 : 1;
  };

  /** Front position in columns for this tick, or null between gusts. */
  const gustFront = (): number | null => {
    const u = (tick - gustStart) / GUST_TICKS;
    if (u < 0) return null;
    if (u > 1) {
      scheduleGust();
      return null;
    }
    const span = colCount + 2 * GUST_WIDTH;
    const x = u * span - GUST_WIDTH;
    return gustDir > 0 ? x : colCount - x;
  };

  const step = () => {
    tick++;
    const { speed, head, trail, columns: density } = weather;
    const front = gustFront();
    for (let c = 0; c < colCount; c++) {
      const col = columns[c];
      const active = col.seed < density;
      let g = 0;
      if (front !== null) {
        const d = (c - front) / GUST_WIDTH;
        g = Math.exp(-d * d);
      }
      col.gust = g;
      if (active) col.head += col.speed * speed * (1 + GUST_SPEED * g);
      const at = Math.floor(col.head);

      for (let r = 0; r <= col.maxRow; r++) {
        if (col.alphas[r] > 0) col.alphas[r] = Math.max(col.alphas[r] * trail, col.floors[r]);
      }
      const onBand = active && at >= 0 && at <= col.maxRow && at < rowCount;
      if (onBand) col.alphas[at] = head;
      col.spark = onBand ? at : -1;

      for (let r = 0; r < rowCount; r++) {
        if (col.glows[r] > 0) col.glows[r] = col.glows[r] < 0.03 ? 0 : col.glows[r] * GLOW_DECAY;
      }

      if (Math.random() < 0.4 + 0.5 * g) col.chars[(Math.random() * rowCount) | 0] = pick();
      if (active && at > col.maxRow + 4) respawn(col, false);
    }
  };

  const lit: Array<number | string> = [];

  const paint = (now = performance.now()) => {
    ctx.clearRect(0, 0, bandW, bandH);
    ctx.textBaseline = 'top';
    ctx.fillStyle = ink;
    ctx.font = font;
    lit.length = 0;

    const age = now - bornAt;
    // Squared so the field is faint well before the rows overlap.
    const fade = (1 - collapse) * (1 - collapse);
    const focusY = (rowCount >> 1) * rowH;
    let allAwake = awake || age >= ENTRANCE_MS;
    // Rows above the front are shown; rows within ENTRANCE_EDGE_ROWS of it fade.
    const front = awake ? Infinity : (age / ENTRANCE_MS) * (rowCount + ENTRANCE_EDGE_ROWS);

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
        const gate = awake ? 1 : Math.min(1, Math.max(0, (front - r) / ENTRANCE_EDGE_ROWS));
        if (gate === 0) break;
        const lift = 1 + GUST_LIFT * col.gust;
        const rain = (r === col.spark ? HEAD_SPARK : col.alphas[r] * col.brightness * lift) * wake * gate * fade;
        const glow = col.glows[r] * fade;
        // Every row slides toward the focus row as the band collapses.
        const y = r * rowH + (focusY - r * rowH) * collapse;
        // Glow-dominant cells are painted after the rain so they sit on top.
        if (glow > rain) {
          lit.push(x, y, col.chars[r], glow * gain);
          continue;
        }
        if (rain * gain < 0.012) continue;
        ctx.globalAlpha = rain * gain;
        ctx.fillText(col.chars[r], x, y);
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

  /**
   * Reads the band's size off the host. The width snaps down to the lattice
   * module: the canvas is centred on the page axis, like the dots, so a
   * whole number of cells puts its edges and columns on the lattice.
   */
  const measure = () => {
    const width = Math.min(MAX_BAND_WIDTH, host.clientWidth);
    bandW = Math.floor(width / LATTICE_PX) * LATTICE_PX;
    bandH = Math.round(host.clientHeight);
  };

  const build = () => {
    measure();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(bandW * dpr);
    canvas.height = Math.round(bandH * dpr);
    canvas.style.width = `${bandW}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = font;

    // Cells are 12 x 16: two columns and one and a half rows per 24px cell of
    // the site's dot lattice. 12px is also ~1.7 glyph widths, which keeps the
    // rain reading as discrete streaks rather than solid text.
    colW = CELL_W;
    rowH = CELL_H;
    colCount = Math.ceil(bandW / colW);
    rowCount = Math.ceil(bandH / rowH);
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
        spark: -1,
        gust: 0,
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
    tick = 0;
    gustStart = FIRST_GUST_TICK;
  };

  /* ── Pointer glow ─────────────────────────────────────────────────────── */

  const glowAt = (clientX: number, clientY: number, radius: number) => {
    if (!columns.length) return;
    const box = canvas.getBoundingClientRect();
    const scale = bandW / box.width;
    const x = (clientX - box.left) * scale;
    const y = (clientY - box.top) * scale;
    if (x < -radius || x > bandW + radius) return;
    if (y < -radius || y > bandH + radius) return;

    const c0 = Math.max(0, Math.floor((x - radius) / colW));
    const c1 = Math.min(colCount - 1, Math.ceil((x + radius) / colW));
    const r0 = Math.max(0, Math.floor((y - radius) / rowH));
    const r1 = Math.min(rowCount - 1, Math.ceil((y + radius) / rowH));

    for (let c = c0; c <= c1; c++) {
      const col = columns[c];
      const dx = c * colW + colW / 2 - x;
      for (let r = r0; r <= r1; r++) {
        const d = Math.hypot(dx, (r * rowH + rowH / 2 - y) / GLOW_ASPECT);
        if (d > radius) continue;
        const g = GLOW_PEAK * Math.pow(1 - d / radius, 1.5);
        if (g > col.glows[r]) col.glows[r] = g;
      }
    }

    // Repaint on a frame rather than per event, and no more often than
    // GLOW_PAINT_MS: a fast pointer fires far more often than a full repaint
    // is worth.
    if (glowQueued) return;
    glowQueued = true;
    requestAnimationFrame(glowFrame);
  };

  const glowFrame = (now: number) => {
    if (now - lastGlowPaint < GLOW_PAINT_MS) {
      requestAnimationFrame(glowFrame);
      return;
    }
    glowQueued = false;
    lastGlowPaint = now;
    paint(now);
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

  // Fully collapsed there is nothing to draw until the reader scrolls back up.
  const shouldRun = () =>
    !destroyed && onScreen && collapse < 1 && document.visibilityState === 'visible' && !reduced.matches;

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

  const queuePaint = () => {
    if (paintQueued) return;
    paintQueued = true;
    requestAnimationFrame(() => {
      paintQueued = false;
      paint();
    });
  };

  const onScroll = () => {
    const u = Math.min(1, Math.max(0, window.scrollY / COLLAPSE_PX));
    const next = u * u * (3 - 2 * u);
    const top = host.getBoundingClientRect().top;
    const edge = top + (bandH + FIELD_EDGE_PAD) * (1 - next);
    root.style.setProperty('--field-edge', `${Math.max(0, edge)}px`);
    if (next === collapse) return;
    collapse = next;
    sync();
    if (columns.length) queuePaint();
  };

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

  // The band follows the host: a rotation or a breakpoint crossing changes
  // its size, and a hidden pane can hand over a zero box the first time.
  // Rebuilding reseeds the columns, which is invisible once the field is
  // awake; the entrance is never replayed.
  const resizer = new ResizeObserver(() => {
    if (!started || destroyed) return;
    const prevW = bandW;
    const prevH = bandH;
    measure();
    if (bandW === prevW && bandH === prevH) return;
    build();
    onScroll();
    paint();
  });

  const start = () => {
    if (destroyed) return;
    started = true;
    readTheme();
    build();
    bornAt = performance.now();
    // Reduced motion gets one honest frame: the band at rest, no entrance.
    awake = reduced.matches;
    onScroll();
    paint(bornAt);
    host.classList.add('is-ready');
    sync();
  };

  // Measuring columns against the fallback face would misplace every glyph
  // once Geist Mono arrives, so wait for it — briefly.
  const fontReady = document.fonts?.load(font).then(() => undefined, () => undefined) ?? Promise.resolve();
  Promise.race([fontReady, new Promise<void>((r) => setTimeout(r, 800))]).then(start);

  onScroll();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('scroll', onScroll, { passive: true });
  reduced.addEventListener('change', onReducedChange);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  themeObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
  io.observe(host);
  resizer.observe(host);

  return {
    destroy() {
      destroyed = true;
      sync();
      clearInterval(weatherTimer);
      resizer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('scroll', onScroll);
      root.style.removeProperty('--field-edge');
      root.style.removeProperty('--glyph-ink');
      reduced.removeEventListener('change', onReducedChange);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      themeObserver.disconnect();
      io.disconnect();
    },
  };
}
