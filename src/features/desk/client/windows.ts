// Floating windows. Anything with `data-open="<id>"` opens the window rendered
// with `data-win="<id>"`. On desktop windows are non-modal and stack like
// paper: they unfold out of whatever opened them, in its colour, drag by the
// mat around the card (and tilt a little with the speed of the drag), glide
// on when flicked, and come to the front when touched. Below 640px a window is a modal sheet that follows the finger down
// and closes past a threshold. Esc closes the window holding focus, or the top
// one, and focus goes back to the opener.

import type gsap from 'gsap';

type Gsap = typeof gsap;

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
const OPEN_MS = 560;
const CLOSE_MS = 320;
const EDGE = 16;
const CASCADE = 28;
// How much of a window has to stay on screen while it is dragged around.
const KEEP_VISIBLE = 120;
// Slower than this when the hand lets go (px/ms) is a put-down, not a throw.
const THROW_MIN_SPEED = 0.3;
// A hand that stopped this long before letting go has no speed left.
const THROW_STALE_MS = 60;

interface DeskWindow {
  id: string;
  el: HTMLElement;
  mat: HTMLElement;
  bar: HTMLElement;
  body: HTMLElement;
  x: number;
  y: number;
  /** Dragged by hand, so a reopen goes back to where it was left. */
  placed: boolean;
  opener: HTMLElement | null;
  closing: Animation[] | null;
  glide: gsap.core.Tween | null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// GSAP and its inertia plugin load on the first grab, so a throw on release
// finds them ready. A failed load only means a window stops where it is let go,
// and the next grab tries again.
let gsapLoad: Promise<Gsap | null> | null = null;
let loadedGsap: Gsap | null = null;
const loadGsap = () =>
  (gsapLoad ??= Promise.all([import('gsap'), import('gsap/InertiaPlugin')])
    .then(([{ default: core }, { InertiaPlugin }]) => {
      core.registerPlugin(InertiaPlugin);
      loadedGsap = core;
      return core;
    })
    .catch(() => {
      gsapLoad = null;
      return null;
    }));

const onScreen = (rect: DOMRect) =>
  rect.width > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;

export function initWindows(): () => void {
  const sheetQuery = window.matchMedia('(max-width: 639px)');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const desk = document.querySelector<HTMLElement>('[data-desk]');
  const scrim = document.querySelector<HTMLElement>('[data-desk-scrim]');
  const header = document.querySelector<HTMLElement>('[data-header-actions]');
  const wins = new Map<string, DeskWindow>();
  /** Open windows, back to front. */
  const stack: DeskWindow[] = [];
  let z = 1;

  document.querySelectorAll<HTMLElement>('[data-win]').forEach((el) => {
    const mat = el.querySelector<HTMLElement>('[data-win-drag]');
    const bar = el.querySelector<HTMLElement>('.win-bar');
    const body = el.querySelector<HTMLElement>('[data-win-body]');
    if (!mat || !bar || !body) return;
    const id = el.dataset.win ?? '';
    wins.set(id, { id, el, mat, bar, body, x: 0, y: 0, placed: false, opener: null, closing: null, glide: null });
  });

  const isOpen = (w: DeskWindow) => !w.el.hidden && !w.closing;
  const sheet = () => sheetQuery.matches;
  const windowOf = (node: EventTarget | null) => {
    const el = node instanceof Element ? node.closest<HTMLElement>('[data-win]') : null;
    return el ? wins.get(el.dataset.win ?? '') ?? null : null;
  };

  // Where a window may sit: partly off either side, never off the top.
  const bounds = (w: DeskWindow) => ({
    minX: KEEP_VISIBLE - w.el.offsetWidth,
    maxX: innerWidth - KEEP_VISIBLE,
    minY: EDGE / 2,
    maxY: innerHeight - 56,
  });

  const setPos = (w: DeskWindow, x: number, y: number) => {
    const { minX, maxX, minY, maxY } = bounds(w);
    w.x = clamp(x, minX, maxX);
    w.y = clamp(y, minY, maxY);
    w.el.style.setProperty('--x', `${Math.round(w.x)}px`);
    w.el.style.setProperty('--y', `${Math.round(w.y)}px`);
  };

  const toFront = (w: DeskWindow) => {
    w.el.style.zIndex = String(++z);
    const at = stack.indexOf(w);
    if (at !== -1) stack.splice(at, 1);
    stack.push(w);
  };

  // A new window lands over the matrix, where the prose is not, and each one
  // after it steps down and right. Opened from inside another window, it
  // steps off that window instead, so the pair reads as parent and child.
  const place = (w: DeskWindow, opener: HTMLElement | null) => {
    const width = w.el.offsetWidth;
    const height = w.el.offsetHeight;
    // A fresh window always lands whole on screen; only a drag may push it off.
    const fit = (x: number, y: number) =>
      setPos(
        w,
        clamp(x, EDGE, Math.max(EDGE, innerWidth - width - EDGE)),
        clamp(y, EDGE, Math.max(EDGE, innerHeight - height - EDGE)),
      );
    const parent = windowOf(opener);
    if (parent && parent !== w && isOpen(parent)) {
      fit(parent.x + 40, parent.y + 36);
      return;
    }
    const matrix = document.querySelector<HTMLElement>('[data-matrix]')?.getBoundingClientRect();
    const matrixBeside = matrix && matrix.width > 0 && matrix.left > innerWidth * 0.4;
    const centreX = matrixBeside ? matrix.left + matrix.width / 2 - 48 : innerWidth / 2;
    const step = (stack.filter((other) => other !== w).length % 5) * CASCADE;
    fit(centreX - width / 2 + step, (innerHeight - height) / 2 - 24 + step);
  };

  const syncHash = () => {
    const top = stack.at(-1);
    const hash = top ? `#${top.id}` : '';
    if (location.hash !== hash) history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`);
  };

  // Echo copies of the matrix are aria-hidden; focus never comes back to one.
  const liveTwin = (opener: HTMLElement | null) => {
    if (!opener?.closest('[data-mx-copy="echo"]')) return opener;
    return document.querySelector<HTMLElement>(`[data-mx-copy="live"] [data-open="${opener.dataset.open}"]`) ?? opener;
  };

  const syncModal = () => {
    const modal = sheet() && stack.length > 0;
    if (desk) desk.inert = modal;
    // The sheet's scrim covers the nav card, so it leaves the tab order too.
    if (header) header.inert = modal;
    scrim?.classList.toggle('is-on', modal);
    wins.forEach((w) => (modal ? w.el.setAttribute('aria-modal', 'true') : w.el.removeAttribute('aria-modal')));
  };

  // --- Motion ------------------------------------------------------------
  // The colour a window unfolds from and folds back into: the opener's own
  // (a chip's hue, a frame's backdrop), or the mat's when it has none.
  const toneOf = (w: DeskWindow, opener: HTMLElement | null | undefined) => {
    const tone = opener ? getComputedStyle(opener).getPropertyValue('--tone-bg').trim() : '';
    return tone || getComputedStyle(w.mat).backgroundColor;
  };

  const unfold = (w: DeskWindow, opener: HTMLElement | null) => {
    if (reduced.matches) {
      w.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
      return;
    }
    if (sheet()) {
      w.el.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 460, easing: EASE });
      return;
    }
    const from = opener?.getBoundingClientRect();
    if (!from || !onScreen(from)) {
      w.el.animate(
        [{ opacity: 0, transform: 'translateY(10px) scale(0.97)' }, { opacity: 1, transform: 'none' }],
        { duration: 340, easing: EASE },
      );
      return;
    }
    // A container transform: the window starts as the opener, its colour and
    // its size, and grows into itself while it travels. Clipping instead of
    // scaling keeps the text unsquashed the whole way.
    const to = w.el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const insetX = Math.max(0, (to.width - from.width) / 2);
    const insetY = Math.max(0, (to.height - from.height) / 2);
    const radius = Math.min(24, from.height / 2);
    const tone = toneOf(w, opener);
    const mat = getComputedStyle(w.mat).backgroundColor;
    const timing = { duration: OPEN_MS, easing: EASE };

    w.el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], timing);
    w.mat.animate(
      [
        { clipPath: `inset(${insetY}px ${insetX}px round ${radius}px)`, backgroundColor: tone },
        { clipPath: 'inset(0px 0px round 22px)', backgroundColor: mat },
      ],
      timing,
    );
    const fade = [{ opacity: 0 }, { opacity: 0, offset: 0.22 }, { opacity: 1 }];
    w.bar.animate(fade, { duration: OPEN_MS * 0.8, easing: 'linear' });
    w.body.animate(fade, { duration: OPEN_MS * 0.8, easing: 'linear' });
    w.el.animate(fade, { duration: OPEN_MS, easing: 'linear', pseudoElement: '::before' });
  };

  const fold = (w: DeskWindow): Animation[] => {
    const fill = 'forwards' as const;
    if (reduced.matches) {
      return [w.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill })];
    }
    if (sheet()) {
      return [w.el.animate([{ transform: 'none' }, { transform: 'translateY(100%)' }], { duration: 260, easing: EASE_IN, fill })];
    }
    const from = w.opener?.isConnected ? w.opener.getBoundingClientRect() : null;
    if (!from || !onScreen(from)) {
      return [
        w.el.animate(
          [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.97)' }],
          { duration: 180, easing: EASE_IN, fill },
        ),
      ];
    }
    const to = w.el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const insetX = Math.max(0, (to.width - from.width) / 2);
    const insetY = Math.max(0, (to.height - from.height) / 2);
    const radius = Math.min(24, from.height / 2);
    const tone = toneOf(w, w.opener);
    const mat = getComputedStyle(w.mat).backgroundColor;
    const timing = { duration: CLOSE_MS, easing: 'cubic-bezier(0.5, 0, 0.2, 1)', fill };
    const fade = [{ opacity: 1 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }];
    return [
      w.el.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px)` }], timing),
      w.mat.animate(
        [
          { clipPath: 'inset(0px 0px round 22px)', backgroundColor: mat },
          { clipPath: `inset(${insetY}px ${insetX}px round ${radius}px)`, backgroundColor: tone },
        ],
        timing,
      ),
      w.bar.animate(fade, { duration: CLOSE_MS, fill }),
      w.body.animate(fade, { duration: CLOSE_MS, fill }),
      w.el.animate(fade, { duration: CLOSE_MS, fill, pseudoElement: '::before' }),
    ];
  };

  const nudge = (w: DeskWindow) => {
    if (reduced.matches) return;
    w.mat.animate(
      [{ rotate: '0deg' }, { rotate: '-1.6deg' }, { rotate: '1.2deg' }, { rotate: '0deg' }],
      { duration: 380, easing: EASE },
    );
  };

  // --- Open / close --------------------------------------------------------
  // --- Throw ---------------------------------------------------------------
  // A flick keeps going: the window carries the speed it left the hand with,
  // slows like paper sliding on a desk, and comes to rest inside the same
  // bounds a drag has. It leans with its speed until it stops.
  const settle = (w: DeskWindow) => {
    if (!w.glide) return;
    w.glide.kill();
    w.glide = null;
    w.el.classList.remove('is-gliding');
    w.el.style.setProperty('--tilt', '0deg');
  };

  const fling = (w: DeskWindow, vx: number, vy: number) => {
    if (!loadedGsap || reduced.matches || Math.hypot(vx, vy) < THROW_MIN_SPEED) return false;
    const { minX, maxX, minY, maxY } = bounds(w);
    const at = { x: w.x, y: w.y };
    let lastX = at.x;
    let lastT = performance.now();
    w.el.classList.add('is-gliding');
    w.glide = loadedGsap.to(at, {
      inertia: {
        x: { velocity: vx * 1000, min: minX, max: maxX },
        y: { velocity: vy * 1000, min: minY, max: maxY },
        resistance: 2400,
        duration: { min: 0.3, max: 1.2 },
      },
      onUpdate: () => {
        const now = performance.now();
        const speed = (at.x - lastX) / Math.max(1, now - lastT);
        lastX = at.x;
        lastT = now;
        setPos(w, at.x, at.y);
        w.el.style.setProperty('--tilt', `${clamp(speed * 2.4, -5, 5).toFixed(2)}deg`);
      },
      onComplete: () => settle(w),
    });
    return true;
  };

  const finishClose = (w: DeskWindow) => {
    w.closing?.forEach((animation) => animation.cancel());
    w.closing = null;
    w.el.hidden = true;
  };

  const close = (w: DeskWindow, { restoreFocus = true } = {}) => {
    if (!isOpen(w)) return;
    settle(w);
    stack.splice(stack.indexOf(w), 1);
    const animations = fold(w);
    w.closing = animations;
    Promise.all(animations.map((animation) => animation.finished))
      .then(() => w.closing === animations && finishClose(w))
      .catch(() => {});
    syncModal();
    syncHash();

    if (!restoreFocus) return;
    const opener = liveTwin(w.opener);
    if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
    else stack.at(-1)?.el.focus({ preventScroll: true });
  };

  const open = (id: string, opener: HTMLElement | null) => {
    const w = wins.get(id);
    if (!w) return;

    if (isOpen(w)) {
      toFront(w);
      w.opener = opener ?? w.opener;
      nudge(w);
      w.el.focus({ preventScroll: true });
      syncHash();
      return;
    }

    // A sheet is one at a time.
    if (sheet()) [...stack].forEach((other) => close(other, { restoreFocus: false }));
    if (w.closing) finishClose(w);

    w.opener = opener;
    w.el.hidden = false;
    w.el.style.removeProperty('--tilt');
    w.el.style.removeProperty('--sheet-y');
    if (!sheet()) {
      if (w.placed) setPos(w, w.x, w.y);
      else place(w, opener);
    }
    toFront(w);
    syncModal();
    unfold(w, opener);
    w.el.focus({ preventScroll: true });
    syncHash();
  };

  // --- Input ---------------------------------------------------------------
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const target = event.target as Element;
    const closer = target.closest('[data-win-close]');
    if (closer) {
      const w = windowOf(closer);
      if (w) close(w);
      return;
    }
    const opener = target.closest<HTMLElement>('[data-open]');
    // A modified click is a request for the real page, in a new tab.
    if (!opener || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open(opener.dataset.open ?? '', opener);
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const active = document.activeElement;
    // Another dialog (the command palette) owns its own Escape.
    if (active?.closest('[role="dialog"]:not([data-win])')) return;
    const w = windowOf(active) ?? stack.at(-1);
    if (!w) return;
    event.preventDefault();
    close(w);
  };

  const onPointerDown = (event: PointerEvent) => {
    const w = windowOf(event.target);
    if (!w || !isOpen(w)) return;
    // A window in flight stops under the hand that catches it.
    settle(w);
    if (stack.at(-1) !== w) {
      toFront(w);
      syncHash();
    }
    // The mat is the handle; the card in it is for reading and selecting.
    const target = event.target as Element;
    if (!target.closest('[data-win-drag]') || target.closest('[data-win-body], a, button') || event.button !== 0) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const originX = w.x;
    const originY = w.y;
    let lastX = startX;
    let lastY = startY;
    let lastT = event.timeStamp;
    let velocityX = 0;
    let velocityY = 0;
    let offset = 0;
    const height = w.el.offsetHeight;
    const asSheet = sheet();

    w.mat.setPointerCapture(event.pointerId);
    w.el.classList.add('is-dragging');
    if (!asSheet) void loadGsap();

    const move = (e: PointerEvent) => {
      const dt = Math.max(1, e.timeStamp - lastT);
      velocityX += ((e.clientX - lastX) / dt - velocityX) * 0.35;
      velocityY += ((e.clientY - lastY) / dt - velocityY) * 0.35;
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = e.timeStamp;

      if (asSheet) {
        const dy = e.clientY - startY;
        // Down follows the finger; up resists, the sheet is already open.
        offset = dy > 0 ? dy : dy * 0.2;
        w.el.style.setProperty('--sheet-y', `${offset}px`);
        return;
      }
      setPos(w, originX + e.clientX - startX, originY + e.clientY - startY);
      // Paper tilts into the direction it is pulled.
      w.el.style.setProperty('--tilt', `${clamp(velocityX * 2.4, -5, 5).toFixed(2)}deg`);
    };

    const end = (e: PointerEvent) => {
      w.mat.removeEventListener('pointermove', move);
      w.mat.removeEventListener('pointerup', end);
      w.mat.removeEventListener('pointercancel', end);
      w.el.classList.remove('is-dragging');

      if (asSheet) {
        if (offset > height * 0.28 || velocityY > 0.6) {
          close(w);
          return;
        }
        w.el.style.setProperty('--sheet-y', '0px');
        if (!reduced.matches) {
          w.el.animate([{ translate: `0 ${offset}px` }, { translate: '0 0px' }], { duration: 320, easing: EASE });
        }
        return;
      }
      if (Math.abs(lastX - startX) + Math.abs(lastY - startY) > 3) w.placed = true;
      const moving = e.type === 'pointerup' && e.timeStamp - lastT < THROW_STALE_MS;
      if (!moving || !fling(w, velocityX, velocityY)) w.el.style.setProperty('--tilt', '0deg');
    };

    w.mat.addEventListener('pointermove', move);
    w.mat.addEventListener('pointerup', end);
    w.mat.addEventListener('pointercancel', end);
  };

  const onResize = () => stack.forEach((w) => !sheet() && setPos(w, w.x, w.y));
  const onModeChange = () => {
    [...stack].forEach((w) => {
      close(w, { restoreFocus: false });
      finishClose(w);
      w.placed = false;
    });
    syncModal();
  };
  const onScrim = () => stack.at(-1) && close(stack.at(-1)!);

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('resize', onResize);
  sheetQuery.addEventListener('change', onModeChange);
  scrim?.addEventListener('click', onScrim);

  // A shared link to /new#projects opens with the projects window up.
  const initial = decodeURIComponent(location.hash.slice(1));
  if (initial && wins.has(initial)) open(initial, null);

  return () => {
    document.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('resize', onResize);
    sheetQuery.removeEventListener('change', onModeChange);
    scrim?.removeEventListener('click', onScrim);
  };
}
