/**
 * One row of the homepage glyph field, drawn under the site nav on inner pages.
 *
 * A wayfinding thread, not weather: the same cells, the same session ink, but
 * a single 16px row at rest, with a few cells rewriting themselves every so
 * often. Cheap on purpose — one small canvas, one timer-paced frame loop that
 * stops while the tab is hidden, a single frame under reduced motion.
 *
 * The strip and the homepage band share a `view-transition-name`, so leaving
 * the homepage squashes the band into this row (see globals.css).
 */
import { GLYPH_INKS, resolveGlyphInk, type GlyphInk } from '@/features/home/glyph-inks';

const GLYPHS = 'CLPSAR01<>=+*-#$';
const FONT_PX = 12;
const CELL_W = 12;
const STRIP_WIDTH = 1200;
const STRIP_HEIGHT = 16;
/** Wall-clock pace of the mutations, and how many cells change per tick. */
const TICK_MS = 360;
const FLIPS_PER_TICK = 3;
/** Rest alpha of a cell, before the theme gain. */
const ALPHA_MIN = 0.1;
const ALPHA_RANGE = 0.22;
/** A freshly rewritten cell flares to this alpha and decays back to its rest. */
const FLARE = 0.75;
const FLARE_DECAY = 0.82;

export interface GlyphStripHandle {
  destroy: () => void;
}

export function mountGlyphStrip(host: HTMLElement): GlyphStripHandle | null {
  const canvas = host.querySelector('canvas');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return null;

  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const font = `${FONT_PX}px ${getComputedStyle(root).getPropertyValue('--font-mono').trim() || 'ui-monospace, monospace'}`;
  const inks: GlyphInk = GLYPH_INKS[resolveGlyphInk(location.search)];
  const count = Math.ceil(STRIP_WIDTH / CELL_W);
  const chars = Array.from({ length: count }, () => GLYPHS[(Math.random() * GLYPHS.length) | 0]);
  const rest = Float32Array.from({ length: count }, () => ALPHA_MIN + ALPHA_RANGE * Math.random());
  const flare = new Float32Array(count);

  let ink = inks.light;
  let gain = 0.72;
  let raf = 0;
  let last = 0;
  let destroyed = false;

  const readTheme = () => {
    const dark = root.classList.contains('dark');
    ink = dark ? inks.dark : inks.light;
    gain = dark ? 0.62 : 0.72;
    root.style.setProperty('--glyph-ink', ink);
  };

  const paint = () => {
    ctx.clearRect(0, 0, STRIP_WIDTH, STRIP_HEIGHT);
    ctx.textBaseline = 'top';
    ctx.font = font;
    ctx.fillStyle = ink;
    for (let c = 0; c < count; c++) {
      ctx.globalAlpha = Math.max(rest[c], flare[c]) * gain;
      ctx.fillText(chars[c], c * CELL_W, 1);
    }
    ctx.globalAlpha = 1;
  };

  const step = () => {
    for (let c = 0; c < count; c++) {
      if (flare[c] > 0) flare[c] = flare[c] < 0.03 ? 0 : flare[c] * FLARE_DECAY;
    }
    for (let i = 0; i < FLIPS_PER_TICK; i++) {
      const c = (Math.random() * count) | 0;
      chars[c] = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      flare[c] = FLARE;
    }
  };

  const shouldRun = () => !destroyed && document.visibilityState === 'visible' && !reduced.matches;

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (now - last < TICK_MS) return;
    last = now;
    step();
    paint();
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

  const themeObserver = new MutationObserver(() => {
    readTheme();
    paint();
  });

  const start = () => {
    if (destroyed) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(STRIP_WIDTH * dpr);
    canvas.height = Math.round(STRIP_HEIGHT * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    readTheme();
    paint();
    host.classList.add('is-ready');
    sync();
  };

  const fontReady = document.fonts?.load(font).then(() => undefined, () => undefined) ?? Promise.resolve();
  Promise.race([fontReady, new Promise<void>((r) => setTimeout(r, 800))]).then(start);

  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  themeObserver.observe(root, { attributes: true, attributeFilter: ['class'] });

  return {
    destroy() {
      destroyed = true;
      sync();
      document.removeEventListener('visibilitychange', sync);
      reduced.removeEventListener('change', sync);
      themeObserver.disconnect();
      root.style.removeProperty('--glyph-ink');
    },
  };
}
