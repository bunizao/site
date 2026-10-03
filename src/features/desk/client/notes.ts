// Music off the record. While the song on it plays, now and then a note
// lifts off the disc's upper edge and drifts up the wall, swaying, and
// fades. Each is painted once with the knife; after that only the compositor
// moves it, rising on its wrapper and swaying on the note itself, so nothing
// is drawn frame by frame. Only while the paint is dry, the record in view
// and the canvas uncovered; never for reduced motion.

import { RECORD_DISC } from '@/features/desk/shared/still-life';
import { draw, seeded, stroke, strokeAt, vary, type Rand, type Tone } from './knife';

/** A note's box, in painting widths. */
const SIZE = 0.04;
/** The painting's height over its width. */
const ASPECT = 1.25;
/** The first note comes once the disc is up to speed (client/turntable.ts). */
const FIRST_MS = 900;
const EVERY_MS = [1300, 2100] as const;
const RISE_MS = [3800, 4800] as const;
const PEAK = 0.85;

type Glyph = 'eighth' | 'quarter' | 'pair';
const GLYPHS: Glyph[] = ['eighth', 'quarter', 'pair'];

// Ink by day, the lamp's warm light by night.
const INK: Record<'day' | 'night', Tone> = {
  day: { l: 0.34, c: 0.03, h: 255 },
  night: { l: 0.88, c: 0.045, h: 85 },
};

/** Paints `glyph` into a square `s` pixels a side, with the knife. */
function paintGlyph(ctx: CanvasRenderingContext2D, glyph: Glyph, s: number, ink: Tone, rand: Rand) {
  const tone = () => vary(rand, ink, 0.03, 0.006, 4);
  const head = (x: number, y: number) => {
    draw(ctx, strokeAt(rand, x * s, y * s, -0.42, 0.34 * s, 0.22 * s, tone()));
    draw(ctx, strokeAt(rand, (x + 0.01) * s, (y + 0.02) * s, -0.3, 0.24 * s, 0.14 * s, tone()));
  };
  const stem = (x: number, from: number, to: number) => draw(ctx, stroke(rand, x * s, from * s, -Math.PI / 2, (from - to) * s, 0.07 * s, tone(), 0.6));
  const bar = (x0: number, y0: number, x1: number, y1: number, width: number) =>
    draw(ctx, stroke(rand, x0 * s, y0 * s, Math.atan2(y1 - y0, x1 - x0), Math.hypot(x1 - x0, y1 - y0) * s, width * s, tone(), 0.6));

  if (glyph === 'pair') {
    head(0.2, 0.82);
    head(0.66, 0.74);
    stem(0.34, 0.8, 0.16);
    stem(0.8, 0.72, 0.08);
    bar(0.31, 0.19, 0.84, 0.1, 0.12);
    return;
  }
  const x = glyph === 'eighth' ? 0.34 : 0.42;
  head(x, 0.8);
  stem(x + 0.14, 0.78, 0.1);
  if (glyph === 'eighth') bar(x + 0.12, 0.1, x + 0.36, 0.42, 0.1);
}

export function initNotes() {
  const easel = document.querySelector<HTMLElement>('[data-easel]');
  const still = easel?.querySelector<HTMLElement>('[data-sl]');
  const host = easel?.querySelector<HTMLElement>('[data-thing="record"]');
  const lit = still?.querySelector<HTMLElement>('[data-sl-lit]');
  const listening = document.querySelector<HTMLElement>('[data-listening]');
  if (!easel || !still || !host || !lit || !listening) return;

  // Over the things, under the lamp's light.
  const layer = document.createElement('div');
  layer.className = 'sl-notes';
  layer.setAttribute('aria-hidden', 'true');
  lit.before(layer);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isNight = () => document.documentElement.classList.contains('dark');
  const rand = seeded(Date.now() & 0xffff);
  const between = ([least, most]: readonly [number, number]) => least + rand() * (most - least);
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;

  // Each glyph painted once per time of day and size.
  const sprites = new Map<string, HTMLCanvasElement>();
  const spriteOf = (glyph: Glyph, night: boolean, px: number) => {
    const key = `${glyph} ${night} ${px}`;
    let sprite = sprites.get(key);
    if (!sprite) {
      sprite = document.createElement('canvas');
      sprite.width = px;
      sprite.height = px;
      const ctx = sprite.getContext('2d');
      if (ctx) paintGlyph(ctx, glyph, px, INK[night ? 'night' : 'day'], seeded(GLYPHS.indexOf(glyph) + 1));
      sprites.set(key, sprite);
    }
    return sprite;
  };

  let last: Glyph | null = null;
  const spawn = () => {
    const u = layer.clientWidth;
    if (!u) return;
    const choices = GLYPHS.filter((glyph) => glyph !== last);
    const glyph = (last = choices[Math.floor(rand() * choices.length)]);
    const px = Math.round(SIZE * u * Math.min(devicePixelRatio || 1, 2));
    const note = document.createElement('canvas');
    note.width = px;
    note.height = px;
    note.getContext('2d')?.drawImage(spriteOf(glyph, isNight(), px), 0, 0);

    // Off the disc's upper right, and up the bare wall right of the works.
    const [cx, cy, r] = RECORD_DISC;
    const at = ((-55 + rand() * 30) * Math.PI) / 180;
    const wrap = document.createElement('span');
    wrap.className = 'sl-note';
    wrap.style.width = pct(SIZE);
    wrap.style.left = pct(cx + r * Math.cos(at) - SIZE / 2);
    wrap.style.top = pct((cy + r * Math.sin(at) - SIZE * 0.8) / ASPECT);
    wrap.append(note);
    layer.append(wrap);

    const duration = between(RISE_MS);
    const dx = (0.06 + rand() * 0.04) * u;
    const dy = -(0.12 + rand() * 0.05) * u;
    const sway = (0.01 + rand() * 0.01) * u * (rand() < 0.5 ? -1 : 1);
    const tilt = 8 + rand() * 10;
    // A lift off the record that slows as it floats.
    const rise = wrap.animate(
      [
        { translate: '0 0', scale: 0.55, opacity: 0 },
        { offset: 0.16, scale: 1, opacity: PEAK },
        { offset: 0.6, opacity: PEAK },
        { translate: `${dx}px ${dy}px`, scale: 1.06, opacity: 0 },
      ],
      { duration, easing: 'cubic-bezier(0.25, 0.6, 0.45, 1)' },
    );
    // Side to side on the way, leaning into each turn.
    note.animate(
      [
        { translate: '0 0', rotate: '0deg', easing: 'ease-in-out' },
        { translate: `${sway}px 0`, rotate: `${Math.sign(sway) * tilt}deg`, easing: 'ease-in-out' },
        { translate: `${-sway * 0.7}px 0`, rotate: `${-Math.sign(sway) * tilt * 0.7}deg`, easing: 'ease-in-out' },
        { translate: `${sway * 0.4}px 0`, rotate: `${Math.sign(sway) * tilt * 0.4}deg` },
      ],
      { duration },
    );
    void rise.finished.then(() => wrap.remove(), () => wrap.remove());
  };

  let dry = false;
  let inView = true;
  let timer = 0;
  const playing = () => listening.classList.contains('is-live') || listening.classList.contains('is-preview-playing');
  const live = () => dry && inView && playing() && !document.hidden && !easel.classList.contains('is-covered') && !reduced.matches;

  // A note now and then while the music plays; when it stops, the ones in
  // the air finish their way up and no more come.
  const next = () => {
    timer = 0;
    if (!live()) return;
    spawn();
    timer = window.setTimeout(next, between(EVERY_MS));
  };
  const wake = () => {
    if (!timer && live()) timer = window.setTimeout(next, FIRST_MS);
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
  new MutationObserver(wake).observe(listening, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', wake);
  reduced.addEventListener('change', wake);
}
