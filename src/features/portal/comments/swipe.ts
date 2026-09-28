import * as React from 'react';

/* Touch gestures on a list row: swipe right to approve, left to delete,
   press and hold to start selecting. Mouse input is ignored; a mouse has
   the keyboard and the buttons. The row follows the finger through direct
   style writes, so a gesture never waits on a React render. */

export type SwipeDirection = 'right' | 'left';

export interface SwipeOptions {
  allow: Record<SwipeDirection, boolean>;
  onSwipe: (direction: SwipeDirection) => void;
  onLongPress?: () => void;
}

const SLOP = 8;
const COMMIT_SHARE = 0.35;
const FLICK_SPEED = 0.5; // px per ms
const FLICK_MIN = 40;
const LONG_PRESS_MS = 480;

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Returns props for the row and a ref for the part that slides. The row
    gets `data-swipe="right|left"` and `data-armed` while a gesture is live,
    for the action layer underneath to style itself. */
export function useSwipe(options: SwipeOptions) {
  const optionsRef = React.useRef(options);
  optionsRef.current = options;
  const slideRef = React.useRef<HTMLDivElement | null>(null);
  const state = React.useRef<{
    id: number;
    x: number;
    y: number;
    axis: 'x' | 'y' | null;
    dx: number;
    armed: boolean;
    samples: Array<{ x: number; t: number }>;
    timer: number | null;
  } | null>(null);
  const suppressClick = React.useRef(false);

  const reset = React.useCallback((row: HTMLElement, animate: boolean) => {
    const slide = slideRef.current;
    delete row.dataset.swipe;
    delete row.dataset.armed;
    if (!slide) return;
    if (animate && !reducedMotion()) {
      slide.style.transition = 'transform 150ms cubic-bezier(0.2, 0, 0, 1)';
      slide.addEventListener('transitionend', () => {
        slide.style.transition = '';
      }, { once: true });
    } else {
      slide.style.transition = '';
    }
    slide.style.transform = '';
  }, []);

  const end = (): void => {
    const current = state.current;
    if (current?.timer) window.clearTimeout(current.timer);
    state.current = null;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>): void => {
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    suppressClick.current = false;
    const row = event.currentTarget;
    const timer = optionsRef.current.onLongPress
      ? window.setTimeout(() => {
          if (!state.current || state.current.axis) return;
          suppressClick.current = true;
          navigator.vibrate?.(10);
          optionsRef.current.onLongPress?.();
          end();
          reset(row, false);
        }, LONG_PRESS_MS)
      : null;
    state.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null, dx: 0, armed: false, samples: [], timer };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>): void => {
    const current = state.current;
    if (!current || event.pointerId !== current.id) return;
    const row = event.currentTarget;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.axis) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      if (current.timer) window.clearTimeout(current.timer);
      current.timer = null;
      if (Math.abs(dy) >= Math.abs(dx)) {
        // A vertical drag is a scroll; let the browser have it.
        end();
        return;
      }
      current.axis = 'x';
      row.setPointerCapture(event.pointerId);
    }
    const direction: SwipeDirection = dx > 0 ? 'right' : 'left';
    const allowed = optionsRef.current.allow[direction];
    // A direction with no action still moves, a quarter as far, so the row
    // says "not this way" instead of ignoring the finger.
    const x = allowed ? dx : dx * 0.25;
    current.dx = dx;
    current.samples.push({ x: event.clientX, t: event.timeStamp });
    if (current.samples.length > 5) current.samples.shift();
    const armed = allowed && Math.abs(dx) >= row.clientWidth * COMMIT_SHARE;
    if (armed && !current.armed) navigator.vibrate?.(10);
    current.armed = armed;
    row.dataset.swipe = direction;
    if (armed) row.dataset.armed = '';
    else delete row.dataset.armed;
    if (slideRef.current) {
      slideRef.current.style.transition = '';
      slideRef.current.style.transform = `translate3d(${x}px, 0, 0)`;
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>): void => {
    const current = state.current;
    if (!current || event.pointerId !== current.id) return;
    const row = event.currentTarget;
    end();
    if (current.axis !== 'x') return;
    suppressClick.current = true;
    const direction: SwipeDirection = current.dx > 0 ? 'right' : 'left';
    const first = current.samples[0];
    const last = current.samples[current.samples.length - 1];
    const speed = first && last && last.t > first.t ? Math.abs(last.x - first.x) / (last.t - first.t) : 0;
    const flick = speed > FLICK_SPEED && Math.abs(current.dx) > FLICK_MIN;
    const commit = optionsRef.current.allow[direction] && (current.armed || flick);
    // A committed row is either gone on the next render or shows its new
    // status in place, so it returns without an animation.
    reset(row, !commit);
    if (commit) optionsRef.current.onSwipe(direction);
  };

  const onPointerCancel = (event: React.PointerEvent<HTMLElement>): void => {
    if (!state.current || event.pointerId !== state.current.id) return;
    end();
    reset(event.currentTarget, true);
  };

  const onClickCapture = (event: React.MouseEvent<HTMLElement>): void => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const onContextMenu = (event: React.MouseEvent<HTMLElement>): void => {
    // The long press is ours; no callout menu on top of it.
    if (suppressClick.current || state.current) event.preventDefault();
  };

  return {
    slideRef,
    rowProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture, onContextMenu },
  };
}
