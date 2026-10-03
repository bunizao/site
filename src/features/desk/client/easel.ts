// The easel at /new. It paints the still life once the page is idle, lifts a
// thing off the table while its word in the prose (or the thing itself) is
// pointed at, and names it on the gallery label. Opening a section drags a
// coat of its colour over the whole canvas, row by row like a painter toning
// a ground, and sets the section on it halfway through. While one is on the
// canvas, every section is a tab along its top, the one on show in its
// swatch, so the next is one click (or an arrow key) away. Going back to the
// painting scrapes the coat off with the same knife. Below 640px the canvas
// takes the whole screen while a section is on it, as a step in the history.
// Esc, the back gesture, or the small painting at the start of the tabs goes
// back to the still life.
//
// Every part of the painting is painted out of sight on a fresh canvas. The
// first time, once the painting is in view, each comes up under the knife,
// the wall row by row and then the things one drag after another; after
// that, a fresh canvas fades up over the one on show. The painting is kept
// by day and by night: once the one on show is dry, the other is painted out
// of sight while the page is idle, so a turn of the theme only swaps which
// canvases show (desk.css). The easel says when it starts a painting and
// when the paint is dry (`easel:painting`, `easel:painted`), which is when
// the lamp may come on, and which section it has just set on the canvas
// (`easel:shown`).
//
// The record wears the song on it: each new cover from the listening card is
// painted onto the sleeve and its colour onto the disc's label, brought up
// under the knife over the one before, and the gallery label names the song.

import { ASPECT, DISC, LAMP, THINGS, type Piece } from '@/features/desk/shared/still-life';
import { LISTENING_TRACK_EVENT, type ListeningTrackPayload } from '@/lib/listening/controller';
import { coat, css, draw, seedOf, seeded, swatch, type Stroke, type Tone } from './knife';
import { breathe } from './painterly';
import { coverOf, labelOf, loadCover, tintOf, type Song } from './record';
import { play, type Sound } from './sound';
import { BLEED, paintBackdrop, paintLight, paintPiece } from './still-life';
import { paintStudies } from './studies';

interface Section {
  id: string;
  tab?: string;
  title: string;
  date: string;
  medium: string;
  hue: number;
  chroma: number;
  href?: string;
  hrefLabel?: string;
  panel?: boolean;
}

interface Painting {
  title: string;
  date: string;
  medium: string;
}

const COVER_MS = 620;
const SCRAPE_MS = 460;
// A fresh canvas takes this long to come up over the one before it.
const FADE_MS = 700;
// The first painting comes up under the knife: the wall in this long, each
// thing in this long, and each starts once the one before is this far along.
const RISE_WALL_MS = 620;
const RISE_THING_MS = 420;
const RISE_NEXT_AT = 0.3;
// A tapped thing's name stays this long, unless the next tap takes it first.
const NAME_MS = 4000;
// The nudge waits this long once the painting is in view; then each thing
// lifts this long after the one to its left, and holds this long.
const NUDGE_DELAY_MS = 700;
const NUDGE_STEP_MS = 120;
const NUDGE_HOLD_MS = 450;
const NUDGE_KEY = 'desk-nudged';

// What a thing sounds like when it is the one opened.
const VOICES: Record<string, Sound> = {
  projects: 'knock',
  about: 'card',
  writing: 'pages',
  moods: 'clink',
  listening: 'needle',
  github: 'leaves',
};

/** A part of the painting, where its canvases go, and where that is on the painting. */
interface Layer {
  piece: Piece;
  holder: HTMLElement;
  /** The holder's top left, in canvas widths. */
  origin: [number, number];
}
// How much of the pass one stroke takes to drag; the rest is the stagger.
const DRAG_SHARE = 0.34;

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const scaleOf = () => Math.min(devicePixelRatio || 1, 2);

/** The painting's time of day, which is the theme's. */
type Time = 'day' | 'night';
const timeNow = (): Time => (document.documentElement.classList.contains('dark') ? 'night' : 'day');
const otherTime = (time: Time): Time => (time === 'day' ? 'night' : 'day');

const idle = () =>
  new Promise<void>((resolve) =>
    window.requestIdleCallback ? window.requestIdleCallback(() => resolve(), { timeout: 2000 }) : setTimeout(resolve, 60),
  );

/** Draws a coat's strokes as far as `t` (0..1) of the pass has dragged them. */
const dragTo = (ctx: CanvasRenderingContext2D, strokes: { stroke: Stroke; at: number }[], t: number) => {
  for (const { stroke, at } of strokes) {
    const progress = clamp01((t - at * (1 - DRAG_SHARE)) / DRAG_SHARE);
    if (progress <= 0) break;
    draw(ctx, stroke, easeOut(progress));
  }
};

function sized(canvas: HTMLCanvasElement, width: number, height: number, scale: number) {
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  return canvas.getContext('2d');
}

export function initEasel(): () => void {
  const easel = document.querySelector<HTMLElement>('[data-easel]');
  const frame = easel?.querySelector<HTMLElement>('[data-easel-frame]');
  const still = easel?.querySelector<HTMLElement>('[data-sl]');
  const lit = easel?.querySelector<HTMLCanvasElement>('[data-sl-lit]');
  const air = easel?.querySelector<HTMLCanvasElement>('[data-sl-air]');
  const ground = easel?.querySelector<HTMLCanvasElement>('[data-ground]');
  const tabBar = easel?.querySelector<HTMLElement>('[data-tabs]');
  const homeButton = easel?.querySelector<HTMLElement>('[data-home]');
  const thumb = easel?.querySelector<HTMLCanvasElement>('[data-home-thumb]');
  const dataEl = easel?.querySelector('[data-easel-sections]');
  if (!easel || !frame || !still || !lit || !air || !ground || !tabBar || !homeButton || !thumb || !dataEl) return () => {};

  const { painting, sections: list } = JSON.parse(dataEl.textContent ?? '{}') as { painting: Painting; sections: Section[] };
  const sections = new Map(list.map((section) => [section.id, section]));
  const panels = new Map<string, HTMLElement>();
  easel.querySelectorAll<HTMLElement>('[data-panel]').forEach((el) => panels.set(el.dataset.panel ?? '', el));
  const tabs = new Map<string, HTMLElement>();
  easel.querySelectorAll<HTMLElement>('[data-tab]').forEach((el) => tabs.set(el.dataset.tab ?? '', el));
  const things = [...easel.querySelectorAll<HTMLElement>('[data-thing]')];
  const label = {
    title: easel.querySelector<HTMLElement>('[data-label-title]'),
    date: easel.querySelector<HTMLElement>('[data-label-date]'),
    medium: easel.querySelector<HTMLElement>('[data-label-medium]'),
    link: easel.querySelector<HTMLAnchorElement>('[data-label-link]'),
    linkText: easel.querySelector<HTMLElement>('[data-label-link-text]'),
    colophon: easel.querySelector<HTMLElement>('[data-label-colophon]'),
  };
  // Everything a full-screen canvas covers leaves the tab order.
  const outside = [...document.querySelectorAll<HTMLElement>('.desk-left, .desk-foot, [data-header-actions]')];

  const phone = window.matchMedia('(max-width: 639px)');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isNight = () => document.documentElement.classList.contains('dark');

  /** Whether anything has been opened this visit. */
  let openedAny = false;
  let active: string | null = null;
  let opener: HTMLElement | null = null;
  /** Whether the last press was a finger rather than a key or a mouse. */
  let byFinger = false;
  let pass = 0;
  /** The width each time of day was last painted whole at, and the song its record wears. */
  const painted: Record<Time, number> = { day: 0, night: 0 };
  const songOn: Record<Time, Song | null> = { day: null, night: null };
  /** The time of day the paint was last said to be dry for. */
  let onShow: Time | null = null;
  /** The paint going on, one job at a time: which time of day, how wide, and whether out of sight. */
  let job: { time: Time; width: number; quiet: boolean; stop: AbortController } | null = null;
  /** The song once its cover is in. */
  let song: Song | null = null;
  /** The section the gallery label names, and whether it shows its link. */
  let labelled: { id: string | null; withLink: boolean } = { id: null, withLink: false };

  // --- The still life --------------------------------------------------------
  // The things, back to front; the disc turns inside the record, under its
  // sleeve, and the lamp hangs in front of everything.
  const holders = new Map(things.map((el) => [el.dataset.thing, el]));
  const turntable = document.createElement('span');
  turntable.className = 'sl-turn';
  turntable.dataset.turn = '';
  turntable.setAttribute('aria-hidden', 'true');
  const recordHolder = holders.get('record');
  const record = THINGS.find((thing) => thing.id === 'record');
  if (recordHolder && record) {
    const [rx, ry, rw, rh] = record.box;
    const [dx, dy, dw, dh] = DISC.box;
    const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
    Object.assign(turntable.style, {
      left: pct((dx - BLEED - rx) / rw),
      top: pct((dy - BLEED - ry) / rh),
      width: pct((dw + BLEED * 2) / rw),
      height: pct((dh + BLEED * 2) / rh),
    });
    recordHolder.prepend(turntable);
  }
  const layers: Layer[] = [];
  for (const piece of [...THINGS, LAMP]) {
    const holder = holders.get(piece.id);
    if (piece.id === 'record' && recordHolder) layers.push({ piece: DISC, holder: turntable, origin: [DISC.box[0] - BLEED, DISC.box[1] - BLEED] });
    if (holder) layers.push({ piece, holder, origin: [piece.box[0], piece.box[1]] });
  }
  /** The parts of the painting that show the song: the disc, then its sleeve. */
  const songLayers = layers.filter((layer) => layer.piece.id === 'disc' || layer.piece.id === 'record');

  /** The canvas a holder shows for `className` at `time`: the newest that has come up. */
  const shown = (holder: HTMLElement, className: string, time = timeNow()) => {
    const all = holder.querySelectorAll<HTMLCanvasElement>(`:scope > canvas.${className}[data-time="${time}"]:not(.is-wet)`);
    return all[all.length - 1] ?? null;
  };

  // Below a phone's fold the first painting would come up for no one; it
  // waits until it is well in view.
  let onSeen = () => {};
  const seen = new Promise<void>((resolve) => (onSeen = resolve));
  const seenWatch = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    seenWatch.disconnect();
    onSeen();
  }, { threshold: 0.4 });
  seenWatch.observe(still);

  /** When the next drag may start, and when every drag so far is done. */
  let nextUp = 0;
  let up: Promise<unknown> = Promise.resolve();

  /**
   * Brings a dry first coat up under knife drags, `ms` long, once the one
   * before is far enough along: the strokes of a coat are a stencil, and the
   * paint shows through them as they are dragged.
   */
  const bringUp = (canvas: HTMLCanvasElement, ms: number) =>
    seen.then(
      () =>
        new Promise<void>((resolve) => {
          const ctx = canvas.getContext('2d');
          const dry = document.createElement('canvas');
          dry.width = canvas.width;
          dry.height = canvas.height;
          dry.getContext('2d')?.drawImage(canvas, 0, 0);
          if (!ctx) return resolve();
          const scale = scaleOf();
          const strokes = coat(seeded(canvas.width * 7919 + canvas.height), canvas.width / scale, canvas.height / scale, { l: 0.5, c: 0, h: 0 });
          const start = Math.max(performance.now(), nextUp);
          nextUp = start + ms * RISE_NEXT_AT;

          const render = (t: number) => {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (t >= 1) {
              ctx.drawImage(dry, 0, 0);
              return;
            }
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            dragTo(ctx, strokes, t);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalCompositeOperation = 'source-in';
            ctx.drawImage(dry, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
          };

          render(0);
          canvas.classList.add('is-rising');
          const step = (now: number) => {
            if (now >= start) {
              const t = Math.min(1, (now - start) / ms);
              render(t);
              if (t >= 1) {
                canvas.classList.remove('is-wet', 'is-rising');
                return resolve();
              }
            }
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }),
    );

  /**
   * Paints a fresh canvas for `time` over the one on show and brings it up;
   * the old one goes once it is covered. `place` sizes the fresh one and
   * gives back its context, ready for `work`. A fresh canvas fades up over an
   * old one, unless `rise` brings it up under the knife like a first coat.
   * A `quiet` one is for the time of day not on show: it only takes the old
   * one's place, out of sight.
   */
  const layOver = async (
    holder: HTMLElement,
    className: string,
    place: (canvas: HTMLCanvasElement) => CanvasRenderingContext2D | null,
    work: (ctx: CanvasRenderingContext2D) => Promise<void>,
    signal: AbortSignal,
    { time, rise = false, quiet = false }: { time: Time; rise?: boolean; quiet?: boolean },
  ) => {
    const all = [...holder.querySelectorAll<HTMLCanvasElement>(`:scope > canvas.${className}`)];
    const old = all.filter((canvas) => canvas.dataset.time === time);
    const fresh = document.createElement('canvas');
    fresh.className = `${className} is-wet`;
    fresh.dataset.time = time;
    fresh.setAttribute('aria-hidden', 'true');
    // Over the last of its kind; the first goes under everything else in
    // the holder but the disc's turntable.
    const under = all[all.length - 1] ?? holder.querySelector(':scope > .sl-turn');
    if (under) under.after(fresh);
    else holder.prepend(fresh);
    const ctx = place(fresh);
    if (ctx) await work(ctx);
    if (signal.aborted || !ctx) {
      fresh.remove();
      return;
    }
    if (quiet) {
      fresh.classList.remove('is-wet');
      old.forEach((canvas) => canvas.remove());
      return;
    }
    if ((!old.length || rise) && !reduced.matches) {
      const rising = bringUp(fresh, className === 'sl-backdrop' ? RISE_WALL_MS : RISE_THING_MS);
      up = Promise.all([up, rising]);
      void rising.then(() => old.forEach((canvas) => canvas.remove()));
      return;
    }
    fresh.classList.remove('is-wet');
    window.setTimeout(() => old.forEach((canvas) => canvas.remove()), reduced.matches ? 0 : FADE_MS + 80);
  };

  /** Sizes a fresh canvas for a part of the painting `width` wide, and sets it to draw in the painting's CSS pixels. */
  const placer = ({ piece, origin }: Layer, width: number) => (canvas: HTMLCanvasElement) => {
    const [x, y, w, h] = piece.box;
    const scale = scaleOf();
    canvas.style.left = `${(x - BLEED - origin[0]) * width}px`;
    canvas.style.top = `${(y - BLEED - origin[1]) * width}px`;
    const ctx = sized(canvas, (w + BLEED * 2) * width, (h + BLEED * 2) * width, scale);
    ctx?.setTransform(scale, 0, 0, scale, -(x - BLEED) * width * scale, -(y - BLEED) * width * scale);
    return ctx;
  };

  const paintThumb = () => {
    const width = still.clientWidth;
    const ctx = sized(thumb, thumb.clientWidth || 26, (thumb.clientWidth || 26) * ASPECT, scaleOf());
    const backdrop = shown(still, 'sl-backdrop');
    if (!ctx || !width || !backdrop) return;
    const k = thumb.width / width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(backdrop, 0, 0, thumb.width, thumb.height);
    for (const { piece, holder } of layers) {
      const canvas = shown(holder, 'sl-paint');
      if (!canvas) continue;
      const [x, y, w, h] = piece.box;
      ctx.drawImage(canvas, (x - BLEED) * width * k, (y - BLEED) * width * k, (w + BLEED * 2) * width * k, (h + BLEED * 2) * width * k);
    }
    if (!easel.classList.contains('is-lit')) return;
    ctx.globalCompositeOperation = 'color-dodge';
    ctx.drawImage(lit, 0, 0, thumb.width, thumb.height);
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(air, 0, 0, thumb.width, thumb.height);
    ctx.globalCompositeOperation = 'source-over';
  };

  // The knife work takes the best part of a second and gives the page room
  // as it goes; a newer pass (a resize, the theme) stops the one before.
  const paintWhole = async (time: Time, width: number, signal: AbortSignal, quiet: boolean) => {
    const night = time === 'night';
    const scale = scaleOf();
    await layOver(
      still,
      'sl-backdrop',
      (canvas) => {
        const ctx = sized(canvas, width, width * ASPECT, scale);
        ctx?.setTransform(scale, 0, 0, scale, 0, 0);
        return ctx;
      },
      (ctx) => paintBackdrop(ctx, width, night, signal),
      signal,
      { time, quiet },
    );

    // One song for the whole pass, though a new one may come in during it.
    const playing = (songOn[time] = song);
    for (const layer of layers) {
      if (signal.aborted) return;
      const art = songLayers.includes(layer) ? playing : null;
      await layOver(layer.holder, 'sl-paint', placer(layer, width), (ctx) => paintPiece(ctx, layer.piece, width, night, signal, art), signal, { time, quiet });
    }
    await breathe();
    // The lamp is the night: only the night has its light. It is soft; one
    // pixel per CSS pixel is plenty.
    if (signal.aborted || !night) return;
    const litCtx = sized(lit, width, width * ASPECT, 1);
    const airCtx = sized(air, width, width * ASPECT, 1);
    if (!litCtx || !airCtx) return;
    litCtx.clearRect(0, 0, lit.width, lit.height);
    airCtx.clearRect(0, 0, air.width, air.height);
    paintLight(litCtx, airCtx, width, true);
  };

  /** Repaints only the disc and its sleeve, with the song playing. */
  const paintRecord = async (time: Time, width: number, signal: AbortSignal, quiet: boolean) => {
    const playing = (songOn[time] = song);
    for (const layer of songLayers) {
      if (signal.aborted) return;
      await layOver(layer.holder, 'sl-paint', placer(layer, width), (ctx) => paintPiece(ctx, layer.piece, width, time === 'night', signal, playing), signal, {
        time,
        rise: true,
        quiet,
      });
    }
  };

  /** The paint for `time` is dry: the lamp may come on, and the small painting in the tabs takes it. */
  const dry = (time: Time) => {
    onShow = time;
    easel.classList.add('is-painted');
    easel.dispatchEvent(new CustomEvent('easel:painted'));
    paintThumb();
  };

  /**
   * Starts the next job, if nothing is being painted: the time of day on show
   * first, then the song on its record; then, once the page is idle and out
   * of sight, the same for the other time.
   */
  const settle = () => {
    const width = still.clientWidth;
    if (job || !width || easel.classList.contains('is-full')) return;
    const time = timeNow();
    const other = otherTime(time);
    if (painted[time] !== width) return void run(time, width, false, paintWhole);
    // Painted already, out of sight: the theme has only swapped the canvases.
    if (onShow !== time) dry(time);
    if (songOn[time] !== song) return void run(time, width, false, paintRecord);
    if (painted[other] !== width) return void run(other, width, true, paintWhole);
    if (songOn[other] !== song) return void run(other, width, true, paintRecord);
  };

  const run = async (time: Time, width: number, quiet: boolean, work: typeof paintWhole) => {
    const stop = new AbortController();
    const { signal } = stop;
    job = { time, width, quiet, stop };
    if (quiet) await idle();
    if (signal.aborted) return;
    if (work === paintWhole && !quiet) easel.dispatchEvent(new CustomEvent('easel:painting'));
    await work(time, width, signal, quiet);
    // Dry is not done until the knife has brought every part up.
    if (!quiet) await up;
    if (signal.aborted) return;
    job = null;
    if (work === paintWhole) painted[time] = width;
    if (quiet) paintAllSwatches(time);
    else if (work === paintWhole) dry(time);
    else paintThumb();
    settle();
  };

  /** A new size or theme: stops the paint going on, unless it is still the right job. */
  const repaint = () => {
    const width = still.clientWidth;
    const time = timeNow();
    if (job && job.width === width && (job.time === time) !== job.quiet) return;
    job?.stop.abort();
    job = null;
    settle();
  };

  // --- Swatches ----------------------------------------------------------------
  const swatchTone = (el: HTMLElement, time: Time): Tone => {
    const style = getComputedStyle(el);
    const h = Number(style.getPropertyValue('--h')) || 0;
    const c = Number(style.getPropertyValue('--c')) || 0;
    return time === 'night' ? { l: 0.42, c: c * 1.15, h } : { l: 0.87, c: c * 1.3, h };
  };

  // Each swatch as painted for each time of day, and at what size: a turn of
  // the theme only swaps them.
  const swatches = new WeakMap<HTMLElement, Partial<Record<Time, { size: string; url: string }>>>();

  /** Paints the swatch behind each of `els` for `time`, measuring all of them
      before painting any: a write between two reads would lay the page out
      again. Only the time on show is put on. */
  const paintSwatches = (els: HTMLElement[], time = timeNow()) => {
    const measured = els.map((el) => ({ el, width: el.offsetWidth, height: el.offsetHeight, tone: swatchTone(el, time) }));
    for (const { el, width, height, tone } of measured) {
      if (!width) continue;
      const size = `${width}x${height}`;
      const kept = swatches.get(el) ?? {};
      let url = kept[time]?.size === size ? kept[time].url : '';
      if (!url) {
        url = swatch(width * 1.08 + 8, height + 4, tone, seedOf(el.textContent ?? ''));
        if (!url) continue;
        swatches.set(el, { ...kept, [time]: { size, url } });
      }
      const value = `url(${url})`;
      if (time !== timeNow() || el.style.getPropertyValue('--swatch') === value) continue;
      el.style.setProperty('--swatch', value);
      el.classList.add('has-swatch');
    }
  };

  // Whatever in a panel is marked `data-slab` (the mood bubbles) is painted as
  // a slab, a lighter mix of the section's colour than the coat under it.
  const paintSlabs = (panel: HTMLElement, section: Section) => {
    const tone: Tone = isNight() ? { l: 0.35, c: section.chroma * 0.6, h: section.hue } : { l: 0.993, c: section.chroma * 0.12, h: section.hue };
    panel.querySelectorAll<HTMLElement>('[data-slab]').forEach((el) => {
      if (!el.offsetWidth) return;
      const url = swatch(el.offsetWidth + 12, el.offsetHeight + 8, tone, seedOf(el.textContent ?? ''));
      if (!url) return;
      el.style.setProperty('--swatch', `url(${url})`);
      el.classList.add('has-swatch');
    });
  };

  const paintAllSwatches = (time = timeNow()) =>
    paintSwatches([...document.querySelectorAll<HTMLElement>('.desk-chip'), ...[...tabs.values()].filter((tab) => !tab.hidden)], time);

  // --- The coat ------------------------------------------------------------------
  const coatTone = (section: Section): Tone =>
    isNight() ? { l: 0.26, c: section.chroma * 0.5, h: section.hue } : { l: 0.955, c: section.chroma * 0.42, h: section.hue };

  const groundSize = () => {
    const width = frame.clientWidth;
    const height = frame.clientHeight;
    const scale = scaleOf();
    return { width, height, scale, ctx: sized(ground, width, height, scale) };
  };

  /** Lays a coat over the canvas, or scrapes it off. Resolves when the knife lifts. */
  const lay = (tone: Tone | null, onHalf?: () => void) => {
    const token = ++pass;
    const { width, height, scale, ctx } = groundSize();
    if (!ctx) return Promise.resolve();
    const scrape = tone === null;
    play(scrape ? 'scrape' : 'lay');
    const strokes = coat(seeded(token * 7919 + 1), width, height, tone ?? { l: 0.5, c: 0, h: 0 });
    const base = document.createElement('canvas');
    base.width = ground.width;
    base.height = ground.height;
    base.getContext('2d')?.drawImage(ground, 0, 0);

    const render = (t: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, ground.width, ground.height);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.globalCompositeOperation = scrape ? 'destination-out' : 'source-over';
      dragTo(ctx, strokes, t);
      ctx.globalCompositeOperation = 'source-over';
      if (t >= 1 && tone) {
        // The finished coat owns the whole ground: whatever the knife skipped
        // takes the flat colour, not the paint underneath.
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = css(tone);
        ctx.fillRect(0, 0, width, height);
        for (const { stroke } of strokes) draw(ctx, stroke);
      }
      if (t >= 1 && scrape) ctx.clearRect(0, 0, width, height);
    };

    if (reduced.matches) {
      render(1);
      onHalf?.();
      return Promise.resolve();
    }
    const duration = scrape ? SCRAPE_MS : COVER_MS;
    const start = performance.now();
    return new Promise<void>((resolve) => {
      let half = false;
      const step = (now: number) => {
        if (token !== pass) return resolve();
        const t = Math.min(1, (now - start) / duration);
        render(t);
        if (!half && t >= 0.55) {
          half = true;
          onHalf?.();
        }
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  };

  // --- Label, tabs, panels ---------------------------------------------------------
  const setLabel = (section: Section | null, withLink: boolean) => {
    labelled = { id: section?.id ?? null, withLink };
    const shown = section ?? painting;
    if (label.title) label.title.textContent = shown.title;
    if (label.date) label.date.textContent = shown.date;
    if (label.medium) label.medium.textContent = shown.medium;
    // The colophon waits by the label while nothing is open; pointing at it
    // only names it.
    if (label.colophon) label.colophon.hidden = withLink;
    if (!label.link || !label.linkText) return;
    const href = withLink ? section?.href : undefined;
    label.link.hidden = !href;
    if (href) {
      label.link.href = href;
      label.linkText.textContent = section?.hrefLabel ?? 'open the page';
    }
  };

  const syncTabs = () => {
    const appeared = tabBar.hidden && active !== null;
    tabBar.hidden = active === null;
    tabs.forEach((tab, id) => {
      tab.classList.toggle('is-active', id === active);
      tab.querySelector('[data-tab-select]')?.setAttribute('aria-selected', String(id === active));
    });
    if (appeared) paintSwatches([...tabs.values()]);
    // Under a finger the tabs slide in one row; the active one stays in sight.
    // By hand, not scrollIntoView, which would also scroll the page.
    const shown = active ? tabs.get(active) : null;
    const list = shown?.parentElement;
    if (shown && list) {
      const box = list.getBoundingClientRect();
      const { left, right } = shown.getBoundingClientRect();
      if (left < box.left) list.scrollLeft += left - box.left;
      else if (right > box.right) list.scrollLeft += right - box.right;
    }
    homeButton.classList.toggle('is-active', active === null);
    homeButton.setAttribute('aria-pressed', String(active === null));
  };

  const syncHash = () => {
    const hash = active ? `#${active}` : '';
    if (location.hash !== hash) history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`);
  };

  const hidePanels = () => {
    panels.forEach((panel) => {
      if (panel.hidden) return;
      if (reduced.matches) {
        panel.hidden = true;
        return;
      }
      panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease-in' }).finished.then(
        () => panel.dataset.panel !== active && (panel.hidden = true),
        () => {},
      );
    });
  };

  const showPanel = (id: string) => {
    const panel = panels.get(id);
    if (!panel || active !== id) return;
    panels.forEach((other) => other !== panel && (other.hidden = true));
    panel.hidden = false;
    panel.scrollTop = 0;
    paintStudies(panel, isNight());
    const section = sections.get(id);
    if (section) paintSlabs(panel, section);
    if (!reduced.matches) {
      panel.animate(
        [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
        { duration: 360, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
      );
    }
    panel.focus({ preventScroll: true });
    easel.dispatchEvent(new CustomEvent('easel:shown', { detail: id }));
  };

  // The coat's colour, on the root: the frame under the canvas and the label
  // take it, and on a phone so do the system bars (desk.css).
  const setCoat = (section: Section) => document.documentElement.style.setProperty('--coat', css(coatTone(section)));

  // --- Full screen, for phones -------------------------------------------------------
  // The full-screen canvas is a place of its own: going there adds a step to
  // the history, so the back gesture comes out of it instead of leaving the
  // page. The step is marked in its state, and a reload keeps it.
  const isFullStep = () => (history.state as { easelFull?: boolean } | null)?.easelFull === true;

  // Under a laid coat the page is out of sight anyway. iOS still shows what
  // is scrolled under its status bar; with the page hidden, the bar takes the
  // body's colour, which is the coat's.
  const conceal = (on: boolean) => outside.forEach((el) => (el.style.visibility = on ? 'hidden' : ''));

  const setFull = (on: boolean) => {
    if (easel.classList.contains('is-full') === on) return;
    // The frame and label leave the page's flow; the section holds their
    // place, or the page would shorten under the reader and pull the scroll
    // up with it, never to give it back.
    easel.style.minHeight = on ? `${easel.offsetHeight}px` : '';
    easel.classList.toggle('is-full', on);
    document.documentElement.classList.toggle('easel-locked', on);
    outside.forEach((el) => (el.inert = on));
    if (!on) conceal(false);
    if (on && !isFullStep()) history.pushState({ ...history.state, easelFull: true }, '', location.href);
  };

  // --- Pointing at things --------------------------------------------------------------
  const hot = (id: string | null) => {
    if (active) return;
    things.forEach((el) => el.classList.toggle('is-hot', id !== null && (el.dataset.open ?? el.dataset.hint) === id));
    easel.toggleAttribute('data-hot', id !== null);
    setLabel(id ? sections.get(id) ?? null : null, false);
  };

  // --- Open, switch, go back ----------------------------------------------------------
  const open = (id: string, from: HTMLElement | null = null) => {
    const section = sections.get(id);
    if (!section?.panel || !panels.has(id)) return;
    openedAny = true;
    if (from) opener = from;
    if (active === id) {
      panels.get(id)?.focus({ preventScroll: true });
      return;
    }
    if (from && VOICES[id]) play(VOICES[id]);
    // The small painting in the tabs shows the room as it was left.
    if (active === null) paintThumb();
    hot(null);
    active = id;
    syncTabs();
    setLabel(section, true);
    syncHash();
    if (phone.matches) setFull(true);
    easel.classList.add('is-covered');
    setCoat(section);
    still.inert = true;
    hidePanels();
    void lay(coatTone(section), () => showPanel(id)).then(() => {
      if (active === id && easel.classList.contains('is-full')) conceal(true);
    });
  };

  /** Back to the still life. `byHistory` when the back gesture asked, not the canvas's own controls. */
  const home = (byHistory = false) => {
    if (active === null) return;
    active = null;
    syncTabs();
    setLabel(null, false);
    // Left by the canvas's own controls, the full-screen step is spent; the
    // step under it takes the hash once it is back (onPop).
    if (isFullStep()) history.back();
    else syncHash();
    hidePanels();
    conceal(false);
    void lay(null).then(() => {
      if (active !== null) return;
      easel.classList.remove('is-covered');
      still.inert = false;
      setFull(false);
      // Focus goes back to what opened the section. Without one (the page
      // came in on a link to a section), the keyboard is given the first
      // thing in the painting; a back gesture is no keyboard, so nothing is.
      // Nor is a finger: Safari would ring the thing and the room would dim
      // around its name.
      if (byFinger) return;
      const back = opener?.isConnected && !opener.closest('[inert]') ? opener : byHistory ? null : things[0];
      back?.focus({ preventScroll: true });
    });
  };

  // --- Input -------------------------------------------------------------------------
  const pointedAt = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<HTMLElement>('[data-open], [data-hint]') : null;

  // Pointing is a mouse or a pen over a thing, or the keyboard on it. A finger
  // has no hover: one landing on the painting is a scroll or a tap, and the
  // focus a tap leaves on a button is not pointing either.
  const pointing = (event: Event) =>
    event instanceof PointerEvent
      ? event.pointerType !== 'touch'
      : event.type === 'focusout' || (event.target instanceof Element && event.target.matches(':focus-visible'));

  const onOver = (event: Event) => {
    if (!pointing(event)) return;
    const el = pointedAt(event.target);
    if (el) hot(el.dataset.open ?? el.dataset.hint ?? null);
  };

  const onOut = (event: Event) => {
    if (!pointing(event)) return;
    const from = pointedAt(event.target);
    const to = pointedAt((event as FocusEvent | PointerEvent).relatedTarget);
    if (from && from !== to) hot(to ? to.dataset.open ?? to.dataset.hint ?? null : null);
  };

  /**
   * A finger's way of pointing: `id` is the thing just tapped that has a name
   * and nothing else to do (the clock, the lamp), or null for a tap anywhere
   * else. The name goes on the next tap or after NAME_MS, whichever is first,
   * so a dimmed room never waits on a finger that has moved on.
   */
  let nameTimer = 0;
  const nameByTouch = (id: string | null) => {
    clearTimeout(nameTimer);
    // A second tap on the same thing takes its name away.
    const again = id !== null && things.some((el) => el.dataset.hint === id && el.classList.contains('is-hot'));
    const shown = again ? null : id;
    hot(shown);
    if (shown) nameTimer = window.setTimeout(() => hot(null), NAME_MS);
  };

  const onPress = (event: Event) => (byFinger = event instanceof PointerEvent && event.pointerType === 'touch');

  // A finger cannot hover, so a tap is the only way it reads a label. A touch
  // that turns into a scroll ends in pointercancel, never here; and the clock
  // is a bare span, which iOS sends no click for.
  const onTap = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || active) return;
    const el = pointedAt(event.target);
    // A link leaves the page, and a thing with a section opens it.
    const named = el && !el.dataset.open && !(el instanceof HTMLAnchorElement) ? el.dataset.hint ?? null : null;
    nameByTouch(named);
  };

  // --- A nudge, for fingers -------------------------------------------------------------
  // Nothing hovers under a finger, so nothing says the painting can be
  // tapped. The first time the dry painting is well in view on such a screen,
  // its things lift in turn, left to right, once a session. The lamp is left
  // out: it swings when touched, which says enough.
  const nudgeTimers: number[] = [];
  const nudge = () => {
    const lifting = things.filter((el) => !el.hasAttribute('data-lamp')).sort((a, b) => a.offsetLeft - b.offsetLeft);
    lifting.forEach((el, i) => {
      const at = NUDGE_DELAY_MS + i * NUDGE_STEP_MS;
      nudgeTimers.push(
        window.setTimeout(() => el.classList.add('is-nudged'), at),
        window.setTimeout(() => el.classList.remove('is-nudged'), at + NUDGE_HOLD_MS),
      );
    });
  };
  const nudgeWatch = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      nudgeWatch.disconnect();
      // Whoever has opened something has found the things already.
      if (openedAny) return;
      try {
        sessionStorage.setItem(NUDGE_KEY, '1');
      } catch {
        /* Not kept: the next visit nudges again. */
      }
      nudge();
    },
    { threshold: 0.6 },
  );
  const nudged = () => {
    try {
      return sessionStorage.getItem(NUDGE_KEY) !== null;
    } catch {
      return false;
    }
  };

  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const target = event.target as Element;
    const select = target.closest<HTMLElement>('[data-tab-select]');
    if (select) {
      open(select.closest<HTMLElement>('[data-tab]')?.dataset.tab ?? '');
      return;
    }
    if (target.closest('[data-home]')) {
      home();
      return;
    }
    const trigger = target.closest<HTMLElement>('[data-open]');
    // A modified click is a request for the real page, in a new tab.
    if (!trigger || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open(trigger.dataset.open ?? '', trigger);
  };

  /** The section `step` along the tabs from the one on show, round the ends. */
  const along = (step: number) => {
    const ids = [...tabs.keys()];
    return ids[(ids.indexOf(active ?? '') + step + ids.length) % ids.length];
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || !active) return;
    // Another dialog (the command palette) owns its own keys.
    if (document.activeElement?.closest('[role="dialog"]')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      home();
      return;
    }
    // The arrows go along the tabs from the tabs themselves, or from a
    // section, which holds the focus once shown; not from inside one, where
    // they may be scrolling or typing.
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const from = event.target as Element;
    if (!step || event.altKey || event.metaKey || event.ctrlKey || !(tabBar.contains(from) || from.hasAttribute('data-panel'))) return;
    event.preventDefault();
    open(along(step));
  };

  // Back out of the full-screen canvas; any other step through the history
  // keeps the hash saying what is on the canvas.
  const onPop = () => {
    if (active !== null && !isFullStep()) home(true);
    else syncHash();
  };

  // A new size or theme repaints whatever is on the canvas, without the knife.
  const refill = (section: Section) => {
    ++pass;
    const { width, height, scale, ctx } = groundSize();
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = css(coatTone(section));
    ctx.fillRect(0, 0, width, height);
    setCoat(section);
    // A cancelled coat never reached its halfway mark.
    const panel = panels.get(section.id);
    if (panel?.hidden) showPanel(section.id);
    else if (panel) {
      paintStudies(panel, isNight());
      paintSlabs(panel, section);
    }
  };

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      repaint();
      const section = active ? sections.get(active) : null;
      if (!section) return;
      // Going full screen on a phone resizes the frame before the coat starts,
      // so that coat already fits; let it finish.
      const scale = scaleOf();
      if (ground.width === Math.round(frame.clientWidth * scale) && ground.height === Math.round(frame.clientHeight * scale)) return;
      refill(section);
    }, 140);
  };
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(frame);

  // A second row of tabs pushes the section down (desk.css). The observer
  // reports before the frame paints, so the panel never shows under them.
  // Hidden tabs measure nothing; the last section fades out where it stood.
  const tabsObserver = new ResizeObserver(([entry]) => {
    const height = entry.borderBoxSize[0].blockSize;
    if (height) easel.style.setProperty('--tabs-h', `${height}px`);
  });
  tabsObserver.observe(tabBar);

  let themeTime = timeNow();
  const themeObserver = new MutationObserver(() => {
    if (timeNow() === themeTime) return;
    themeTime = timeNow();
    repaint();
    paintAllSwatches();
    const section = active ? sections.get(active) : null;
    if (section) refill(section);
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  const onPhoneChange = () => setFull(phone.matches && active !== null);

  // --- The song on the record --------------------------------------------------------
  const vinylLabel = easel.querySelector<HTMLImageElement>('[data-vinyl-label]');
  const listening = sections.get('listening');
  let coverUrl = '';

  const onTrack = (event: Event) => {
    const track = (event as CustomEvent<ListeningTrackPayload>).detail;
    const named = labelOf(track);
    if (listening && named) {
      Object.assign(listening, named);
      if (labelled.id === 'listening') setLabel(listening, labelled.withLink);
    }
    // The record on the listening panel wears the cover too, once it is shown.
    const thumb = track.thumbUrl?.trim() || track.artworkUrl?.trim();
    if (vinylLabel && !vinylLabel.hidden && thumb) vinylLabel.src = thumb;

    const url = coverOf(track);
    if (url === coverUrl) return;
    coverUrl = url;
    void (url ? loadCover(url) : Promise.resolve(null)).then((image) => {
      if (url !== coverUrl) return;
      song = image ? { cover: image, tint: tintOf(image) } : null;
      // The record on show goes first; paint out of sight can wait.
      if (job?.quiet) {
        job.stop.abort();
        job = null;
      }
      settle();
    });
  };

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerover', onOver);
  document.addEventListener('pointerout', onOut);
  document.addEventListener('pointerup', onTap);
  document.addEventListener('pointerdown', onPress);
  document.addEventListener('keydown', onPress);
  document.addEventListener('focusin', onOver);
  document.addEventListener('focusout', onOut);
  window.addEventListener('popstate', onPop);
  phone.addEventListener('change', onPhoneChange);
  document.addEventListener(LISTENING_TRACK_EVENT, onTrack);

  // The painting waits for an idle moment. The chips are painted just after
  // the first frame, when the page is already laid out and measuring them
  // costs nothing, and again for any their font resizes once it is in.
  void idle().then(settle);
  requestAnimationFrame(() => setTimeout(() => {
    paintAllSwatches();
    void document.fonts.ready.then(() => paintAllSwatches());
  }));

  if (window.matchMedia('(hover: none)').matches && !reduced.matches && !nudged()) {
    easel.addEventListener('easel:painted', () => nudgeWatch.observe(still), { once: true });
  }

  // A shared link to /new#writing opens with the writing on the canvas.
  const initial = decodeURIComponent(location.hash.slice(1));
  if (initial && panels.has(initial)) open(initial);

  return () => {
    job?.stop.abort();
    clearTimeout(nameTimer);
    nudgeTimers.forEach(clearTimeout);
    nudgeWatch.disconnect();
    seenWatch.disconnect();
    resizeObserver.disconnect();
    tabsObserver.disconnect();
    themeObserver.disconnect();
    document.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerover', onOver);
    document.removeEventListener('pointerout', onOut);
    document.removeEventListener('pointerup', onTap);
    document.removeEventListener('pointerdown', onPress);
    document.removeEventListener('keydown', onPress);
    document.removeEventListener('focusin', onOver);
    document.removeEventListener('focusout', onOut);
    window.removeEventListener('popstate', onPop);
    phone.removeEventListener('change', onPhoneChange);
    document.removeEventListener(LISTENING_TRACK_EVENT, onTrack);
  };
}
