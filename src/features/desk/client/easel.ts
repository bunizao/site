// The easel at /new. It paints the still life once the page is idle, lifts a
// thing off the table while its word in the prose (or the thing itself) is
// pointed at, and names it on the gallery label. Opening a section drags a
// coat of its colour over the whole canvas, row by row like a painter toning
// a ground, and sets the section on it halfway through; every opened section
// stays as a swatch tab. Going back to the painting scrapes the coat off with
// the same knife. Below 640px the canvas takes the whole screen while a
// section is on it, as a step in the history. Esc, the back gesture, or the
// small painting at the start of the tabs goes back to the still life.
//
// Every part of the painting comes in on a fresh canvas laid over the one on
// show, so the still life fades in piece by piece on the first visit and
// fades from day to night when the theme turns. The easel says when it starts
// a painting and when the paint is dry (`easel:painting`, `easel:painted`),
// which is when the lamp may come on, and which section it has just set on
// the canvas (`easel:shown`).

import { ASPECT, DISC, LAMP, THINGS, type Piece } from '@/features/desk/shared/still-life';
import { coat, css, draw, seedOf, seeded, swatch, type Tone } from './knife';
import { breathe } from './painterly';
import { play, type Sound } from './sound';
import { BLEED, paintBackdrop, paintLight, paintPiece } from './still-life';
import { paintStudies } from './studies';

interface Section {
  id: string;
  tab: string;
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
  };
  // Everything a full-screen canvas covers leaves the tab order.
  const outside = [...document.querySelectorAll<HTMLElement>('.desk-left, .desk-foot, [data-header-actions]')];

  const phone = window.matchMedia('(max-width: 639px)');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isNight = () => document.documentElement.classList.contains('dark');

  /** Open sections, in the order they were opened. */
  const opened: string[] = [];
  let active: string | null = null;
  let opener: HTMLElement | null = null;
  let painted = { width: 0, night: false };
  let pass = 0;

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

  /** The canvas a holder shows for `className`: the newest that has come up. */
  const shown = (holder: HTMLElement, className: string) => {
    const all = holder.querySelectorAll<HTMLCanvasElement>(`:scope > canvas.${className}:not(.is-wet)`);
    return all[all.length - 1] ?? null;
  };

  /**
   * Paints a fresh canvas over the one on show and brings it up; the old one
   * goes once it is covered. `place` sizes the fresh one and gives back its
   * context, ready for `work`.
   */
  const layOver = async (
    holder: HTMLElement,
    className: string,
    place: (canvas: HTMLCanvasElement) => CanvasRenderingContext2D | null,
    work: (ctx: CanvasRenderingContext2D) => Promise<void>,
    signal: AbortSignal,
  ) => {
    const old = [...holder.querySelectorAll<HTMLCanvasElement>(`:scope > canvas.${className}`)];
    const fresh = document.createElement('canvas');
    fresh.className = `${className} is-wet`;
    fresh.setAttribute('aria-hidden', 'true');
    // Over the last of its kind; the first goes under everything else in
    // the holder but the disc's turntable.
    const under = old[old.length - 1] ?? holder.querySelector(':scope > .sl-turn');
    if (under) under.after(fresh);
    else holder.prepend(fresh);
    const ctx = place(fresh);
    if (ctx) await work(ctx);
    if (signal.aborted || !ctx) {
      fresh.remove();
      return;
    }
    fresh.classList.remove('is-wet');
    window.setTimeout(() => old.forEach((canvas) => canvas.remove()), reduced.matches ? 0 : FADE_MS + 80);
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
  let paintJob: AbortController | null = null;
  const paint = async () => {
    if (easel.classList.contains('is-full')) return;
    const width = still.clientWidth;
    const night = isNight();
    if (!width || (width === painted.width && night === painted.night)) return;
    painted = { width, night };
    const scale = scaleOf();
    paintJob?.abort();
    const { signal } = (paintJob = new AbortController());
    easel.dispatchEvent(new CustomEvent('easel:painting'));

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
    );

    for (const { piece, holder, origin } of layers) {
      if (signal.aborted) return;
      const [x, y, w, h] = piece.box;
      await layOver(
        holder,
        'sl-paint',
        (canvas) => {
          canvas.style.left = `${(x - BLEED - origin[0]) * width}px`;
          canvas.style.top = `${(y - BLEED - origin[1]) * width}px`;
          const ctx = sized(canvas, (w + BLEED * 2) * width, (h + BLEED * 2) * width, scale);
          ctx?.setTransform(scale, 0, 0, scale, -(x - BLEED) * width * scale, -(y - BLEED) * width * scale);
          return ctx;
        },
        (ctx) => paintPiece(ctx, piece, width, night, signal),
        signal,
      );
    }
    await breathe();
    if (signal.aborted) return;

    // The light is soft; one pixel per CSS pixel is plenty.
    const litCtx = sized(lit, width, width * ASPECT, 1);
    const airCtx = sized(air, width, width * ASPECT, 1);
    if (litCtx && airCtx) {
      litCtx.clearRect(0, 0, lit.width, lit.height);
      airCtx.clearRect(0, 0, air.width, air.height);
      paintLight(litCtx, airCtx, width, night);
    }
    easel.classList.add('is-painted');
    easel.dispatchEvent(new CustomEvent('easel:painted'));
    paintThumb();
  };

  // --- Swatches ----------------------------------------------------------------
  const swatchTone = (el: HTMLElement): Tone => {
    const style = getComputedStyle(el);
    const h = Number(style.getPropertyValue('--h')) || 0;
    const c = Number(style.getPropertyValue('--c')) || 0;
    return isNight() ? { l: 0.42, c: c * 1.15, h } : { l: 0.87, c: c * 1.3, h };
  };

  const paintSwatch = (el: HTMLElement) => {
    if (!el.offsetWidth) return;
    const url = swatch(el.offsetWidth * 1.08 + 8, el.offsetHeight + 4, swatchTone(el), seedOf(el.textContent ?? ''));
    if (!url) return;
    el.style.setProperty('--swatch', `url(${url})`);
    el.classList.add('has-swatch');
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

  const paintSwatches = () => {
    document.querySelectorAll<HTMLElement>('.desk-chip').forEach(paintSwatch);
    tabs.forEach((tab) => !tab.hidden && paintSwatch(tab));
  };

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
      for (const { stroke, at } of strokes) {
        const progress = clamp01((t - at * (1 - DRAG_SHARE)) / DRAG_SHARE);
        if (progress <= 0) break;
        draw(ctx, stroke, easeOut(progress));
      }
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
    const shown = section ?? painting;
    if (label.title) label.title.textContent = shown.title;
    if (label.date) label.date.textContent = shown.date;
    if (label.medium) label.medium.textContent = shown.medium;
    if (!label.link || !label.linkText) return;
    const href = withLink ? section?.href : undefined;
    label.link.hidden = !href;
    if (href) {
      label.link.href = href;
      label.linkText.textContent = section?.hrefLabel ?? 'open the page';
    }
  };

  const syncTabs = () => {
    tabBar.hidden = opened.length === 0;
    tabs.forEach((tab, id) => {
      const at = opened.indexOf(id);
      const wasHidden = tab.hidden;
      tab.hidden = at === -1;
      tab.style.order = String(at);
      tab.classList.toggle('is-active', id === active);
      tab.querySelector('[data-tab-select]')?.setAttribute('aria-selected', String(id === active));
      if (wasHidden && !tab.hidden) paintSwatch(tab);
    });
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

  // --- Full screen, for phones -------------------------------------------------------
  // The full-screen canvas is a place of its own: going there adds a step to
  // the history, so the back gesture comes out of it instead of leaving the
  // page. The step is marked in its state, and a reload keeps it.
  const isFullStep = () => (history.state as { easelFull?: boolean } | null)?.easelFull === true;

  const setFull = (on: boolean) => {
    if (easel.classList.contains('is-full') === on) return;
    easel.classList.toggle('is-full', on);
    document.documentElement.classList.toggle('easel-locked', on);
    outside.forEach((el) => (el.inert = on));
    if (on && !isFullStep()) history.pushState({ ...history.state, easelFull: true }, '', location.href);
  };

  // --- Pointing at things --------------------------------------------------------------
  const hot = (id: string | null) => {
    if (active) return;
    things.forEach((el) => el.classList.toggle('is-hot', id !== null && (el.dataset.open ?? el.dataset.hint) === id));
    easel.toggleAttribute('data-hot', id !== null);
    setLabel(id ? sections.get(id) ?? null : null, false);
  };

  // --- Open, switch, close ------------------------------------------------------------
  const open = (id: string, from: HTMLElement | null = null) => {
    const section = sections.get(id);
    if (!section?.panel || !panels.has(id)) return;
    if (!opened.includes(id)) opened.push(id);
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
    easel.style.setProperty('--coat', css(coatTone(section)));
    still.inert = true;
    hidePanels();
    void lay(coatTone(section), () => showPanel(id));
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
    void lay(null).then(() => {
      if (active !== null) return;
      easel.classList.remove('is-covered');
      still.inert = false;
      setFull(false);
      // Focus goes back to what opened the section. Without one (the page
      // came in on a link to a section), the keyboard is given the first
      // thing in the painting; a back gesture is no keyboard, so nothing is.
      const back = opener?.isConnected && !opener.closest('[inert]') ? opener : byHistory ? null : things[0];
      back?.focus({ preventScroll: true });
    });
  };

  const close = (id: string) => {
    const at = opened.indexOf(id);
    if (at === -1) return;
    opened.splice(at, 1);
    if (active !== id) {
      syncTabs();
      return;
    }
    const next = opened[Math.min(at, opened.length - 1)];
    if (next) {
      active = null;
      open(next);
    } else {
      home();
    }
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

  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const target = event.target as Element;
    const closer = target.closest<HTMLElement>('[data-tab-close]');
    if (closer) {
      close(closer.closest<HTMLElement>('[data-tab]')?.dataset.tab ?? '');
      return;
    }
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

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !active) return;
    // Another dialog (the command palette) owns its own Escape.
    if (document.activeElement?.closest('[role="dialog"]')) return;
    event.preventDefault();
    home();
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
    easel.style.setProperty('--coat', css(coatTone(section)));
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
      void paint();
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

  let night = isNight();
  const themeObserver = new MutationObserver(() => {
    if (isNight() === night) return;
    night = isNight();
    void paint();
    paintSwatches();
    const section = active ? sections.get(active) : null;
    if (section) refill(section);
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  const onPhoneChange = () => setFull(phone.matches && active !== null);

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerover', onOver);
  document.addEventListener('pointerout', onOut);
  document.addEventListener('focusin', onOver);
  document.addEventListener('focusout', onOut);
  window.addEventListener('popstate', onPop);
  phone.addEventListener('change', onPhoneChange);

  // The painting waits for an idle moment; the chips wait for their font.
  (window.requestIdleCallback ?? ((callback: () => void) => setTimeout(callback, 60)))(() => void paint());
  void document.fonts.ready.then(paintSwatches);

  // A shared link to /new#writing opens with the writing on the canvas.
  const initial = decodeURIComponent(location.hash.slice(1));
  if (initial && panels.has(initial)) open(initial);

  return () => {
    resizeObserver.disconnect();
    themeObserver.disconnect();
    document.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerover', onOver);
    document.removeEventListener('pointerout', onOut);
    document.removeEventListener('focusin', onOver);
    document.removeEventListener('focusout', onOut);
    window.removeEventListener('popstate', onPop);
    phone.removeEventListener('change', onPhoneChange);
  };
}
