// The matrix drift. Each column is a real scroll container, so a wheel, a
// trackpad, a finger or the keyboard all move it natively, with the platform's
// own momentum. The script only adds the slow drift between those gestures and
// wraps the position between the three identical copies, so the loop never
// runs out. Speed eases towards its target, so a hover or a gesture settles
// the column instead of stopping it dead.

const DRIFT_PX_PER_S = 18;
// After a gesture, the column waits this long before it starts drifting again.
const RESUME_AFTER_MS = 1600;
// Time constant of the speed easing.
const EASE_MS = 260;

interface Column {
  el: HTMLElement;
  live: HTMLElement;
  dir: number;
  horizontal: boolean;
  size: number;
  pos: number;
  speed: number;
  written: number;
  hover: boolean;
  focus: boolean;
  pausedUntil: number;
}

const readPos = (col: Column) => (col.horizontal ? col.el.scrollLeft : col.el.scrollTop);

function writePos(col: Column, value: number) {
  if (col.horizontal) col.el.scrollLeft = value;
  else col.el.scrollTop = value;
  col.written = readPos(col);
}

function measure(col: Column) {
  col.horizontal = getComputedStyle(col.el).getPropertyValue('--mx-axis').trim() === 'x';
  const size = col.horizontal ? col.live.offsetWidth : col.live.offsetHeight;
  if (!size) return;
  // Keep the same place within the copy across a resize.
  const offset = col.size ? (((col.pos - col.size) % col.size) + col.size) % col.size : 0;
  col.size = size;
  col.pos = size + offset;
  writePos(col, col.pos);
}

// Move the position back into the middle copy. The copies are identical, so
// a jump of exactly one copy is invisible.
function wrap(col: Column) {
  if (!col.size) return;
  if (col.pos < col.size * 0.5) col.pos += col.size;
  else if (col.pos > col.size * 1.5) col.pos -= col.size;
}

export function initMatrix(root: ParentNode = document): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const columns: Column[] = [];

  root.querySelectorAll<HTMLElement>('[data-mx-col]').forEach((el) => {
    const live = el.querySelector<HTMLElement>('[data-mx-copy="live"]');
    if (!live) return;
    columns.push({
      el,
      live,
      dir: Number(el.dataset.dir) || 1,
      horizontal: false,
      size: 0,
      pos: 0,
      speed: 0,
      written: 0,
      hover: false,
      focus: false,
      pausedUntil: 0,
    });
  });
  if (!columns.length) return () => {};

  const cleanups: Array<() => void> = [];
  const on = <K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ) => {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };

  for (const col of columns) {
    measure(col);

    on(col.el, 'scroll', () => {
      const actual = readPos(col);
      // Our own writes land within a pixel; anything else is a person.
      if (Math.abs(actual - col.written) > 2) {
        col.pos = actual;
        col.written = actual;
        col.speed = 0;
        col.pausedUntil = performance.now() + RESUME_AFTER_MS;
      }
    }, { passive: true });

    // Touch never hovers; a finger on the column is already a scroll gesture.
    on(col.el, 'pointerenter', (event) => {
      if (event.pointerType !== 'touch') col.hover = true;
    });
    on(col.el, 'pointerleave', () => {
      col.hover = false;
    });

    // A keyboard user tabbing through the tiles holds the column still. A
    // click also focuses a tile, but only keyboard focus is visible.
    on(col.el, 'focusin', (event) => {
      col.focus = (event.target as Element).matches(':focus-visible');
    });
    on(col.el, 'focusout', () => {
      col.focus = false;
    });
  }

  const resizeObserver = new ResizeObserver(() => columns.forEach(measure));
  columns.forEach((col) => resizeObserver.observe(col.live));
  cleanups.push(() => resizeObserver.disconnect());

  let frame = 0;
  let last = 0;
  let visible = true;

  const tick = (now: number) => {
    frame = 0;
    const dt = Math.min(48, now - (last || now));
    last = now;
    const blend = 1 - Math.exp(-dt / EASE_MS);

    for (const col of columns) {
      if (!col.size) continue;
      const idle = now >= col.pausedUntil;
      const target = idle && !col.hover && !col.focus ? DRIFT_PX_PER_S : 0;
      col.speed += (target - col.speed) * blend;

      if (!idle) continue;
      col.pos += (col.dir * col.speed * dt) / 1000;
      wrap(col);
      if (Math.abs(col.pos - col.written) >= 0.5) writePos(col, col.pos);
    }
    if (canRun()) frame = requestAnimationFrame(tick);
  };

  const canRun = () => visible && !reduced.matches && !document.hidden;

  // A cold start forgets the last frame time, so a pause is not one long dt.
  const schedule = () => {
    if (frame || !canRun()) return;
    last = 0;
    frame = requestAnimationFrame(tick);
  };

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };

  // Nothing drifts off screen or in a background tab.
  const shown = new Set<Element>();
  const intersection = new IntersectionObserver((entries) => {
    entries.forEach((entry) => (entry.isIntersecting ? shown.add(entry.target) : shown.delete(entry.target)));
    visible = shown.size > 0;
    if (visible) schedule();
    else stop();
  });
  columns.forEach((col) => intersection.observe(col.el));
  cleanups.push(() => intersection.disconnect());

  const onVisibility = () => (document.hidden ? stop() : schedule());
  document.addEventListener('visibilitychange', onVisibility);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

  const onMotion = () => (reduced.matches ? stop() : schedule());
  reduced.addEventListener('change', onMotion);
  cleanups.push(() => reduced.removeEventListener('change', onMotion));

  schedule();

  return () => {
    stop();
    cleanups.forEach((cleanup) => cleanup());
  };
}
