// The easel at /new. It paints the still life once the page is idle, lifts a
// thing off the table while its word in the prose (or the thing itself) is
// pointed at, and names it on the gallery label. Opening a section drags a
// coat of its colour over the whole canvas, row by row like a painter toning
// a ground, and sets the section on it halfway through; every opened section
// stays as a swatch tab. Going back to the painting scrapes the coat off with
// the same knife. Below 640px the canvas takes the whole screen while a
// section is on it. Esc, or the small painting at the start of the tabs, goes
// back to the still life.

import { ASPECT, THINGS } from '@/features/desk/shared/still-life';
import { coat, css, draw, seedOf, seeded, swatch, type Tone } from './knife';
import { BLEED, paintBackdrop, paintThing } from './still-life';
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
// How much of the pass one stroke takes to drag; the rest is the stagger.
const DRAG_SHARE = 0.34;

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
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
  const backdrop = easel?.querySelector<HTMLCanvasElement>('[data-sl-backdrop]');
  const ground = easel?.querySelector<HTMLCanvasElement>('[data-ground]');
  const tabBar = easel?.querySelector<HTMLElement>('[data-tabs]');
  const homeButton = easel?.querySelector<HTMLElement>('[data-home]');
  const thumb = easel?.querySelector<HTMLCanvasElement>('[data-home-thumb]');
  const dataEl = easel?.querySelector('[data-easel-sections]');
  if (!easel || !frame || !still || !backdrop || !ground || !tabBar || !homeButton || !thumb || !dataEl) return () => {};

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
  const paintThumb = (width: number) => {
    const ctx = sized(thumb, thumb.clientWidth || 26, (thumb.clientWidth || 26) * ASPECT, scaleOf());
    if (!ctx) return;
    const k = thumb.width / backdrop.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(backdrop, 0, 0, thumb.width, thumb.height);
    for (const el of things) {
      const canvas = el.querySelector<HTMLCanvasElement>('canvas.sl-paint');
      const thing = THINGS.find((entry) => entry.id === el.dataset.thing);
      if (!canvas || !thing) continue;
      const x = (thing.box[0] - BLEED) * width * scaleOf() * k;
      const y = (thing.box[1] - BLEED) * width * scaleOf() * k;
      ctx.drawImage(canvas, x, y, canvas.width * k, canvas.height * k);
    }
  };

  // Each thing takes a few dozen milliseconds of knife work, so the painting
  // goes on one thing per frame; a newer pass (a resize, the theme) stops it.
  let paintPass = 0;
  const paint = async () => {
    if (easel.classList.contains('is-full')) return;
    const width = still.clientWidth;
    const night = isNight();
    if (!width || (width === painted.width && night === painted.night)) return;
    painted = { width, night };
    const scale = scaleOf();
    const mine = ++paintPass;

    const ctx = sized(backdrop, width, width * ASPECT, scale);
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    paintBackdrop(ctx, width, night);

    for (const el of things) {
      await nextFrame();
      if (mine !== paintPass) return;
      const thing = THINGS.find((entry) => entry.id === el.dataset.thing);
      if (!thing) continue;
      let canvas = el.querySelector<HTMLCanvasElement>('canvas.sl-paint');
      if (!canvas) {
        canvas = el.insertBefore(document.createElement('canvas'), el.firstChild);
        canvas.className = 'sl-paint';
        canvas.setAttribute('aria-hidden', 'true');
      }
      const [x, y, w, h] = thing.box;
      const bleed = BLEED * width;
      canvas.style.left = `${-bleed}px`;
      canvas.style.top = `${-bleed}px`;
      const thingCtx = sized(canvas, (w + BLEED * 2) * width, (h + BLEED * 2) * width, scale);
      if (!thingCtx) continue;
      thingCtx.setTransform(scale, 0, 0, scale, -(x - BLEED) * width * scale, -(y - BLEED) * width * scale);
      thingCtx.clearRect((x - BLEED) * width, (y - BLEED) * width, (w + BLEED * 2) * width, (h + BLEED * 2) * width);
      paintThing(thingCtx, thing, width, night);
    }
    paintThumb(width);
    easel.classList.add('is-painted');
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
  };

  // --- Full screen, for phones -------------------------------------------------------
  const setFull = (on: boolean) => {
    if (easel.classList.contains('is-full') === on) return;
    easel.classList.toggle('is-full', on);
    document.documentElement.classList.toggle('easel-locked', on);
    outside.forEach((el) => (el.inert = on));
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

  const home = () => {
    if (active === null) return;
    active = null;
    syncTabs();
    setLabel(null, false);
    syncHash();
    hidePanels();
    void lay(null).then(() => {
      if (active !== null) return;
      easel.classList.remove('is-covered');
      still.inert = false;
      setFull(false);
      const back = opener?.isConnected && !opener.closest('[inert]') ? opener : things[0];
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

  const onOver = (event: Event) => {
    const el = pointedAt(event.target);
    if (el) hot(el.dataset.open ?? el.dataset.hint ?? null);
  };

  const onOut = (event: Event) => {
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
    phone.removeEventListener('change', onPhoneChange);
  };
}
