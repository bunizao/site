// A frame-gap readout for tuning the wheel on a device: ?debug=wheel. It
// counts animation frames for as long as a scrub lasts and reports the ones
// that came late. Safari caps requestAnimationFrame at 60Hz, so this cannot
// tell 120 from 60; it does show frames the engine dropped below 60.

const LONG_FRAME_MS = 20;

export interface FrameMeter {
  start(): void;
  stop(): void;
  destroy(): void;
}

export function createFrameMeter(): FrameMeter {
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:100;padding:4px 8px;border-radius:6px;' +
    'font:11px/1.4 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,0.72);pointer-events:none;';
  box.textContent = 'scrub to measure';
  document.body.appendChild(box);

  let raf = 0;
  let last = 0;
  let frames = 0;
  let long = 0;
  let worst = 0;

  const step = (now: number): void => {
    if (last !== 0) {
      const gap = now - last;
      frames += 1;
      if (gap > LONG_FRAME_MS) long += 1;
      if (gap > worst) worst = gap;
    }
    last = now;
    raf = requestAnimationFrame(step);
  };

  return {
    start() {
      if (raf !== 0) return;
      last = 0;
      frames = 0;
      long = 0;
      worst = 0;
      box.textContent = 'measuring…';
      raf = requestAnimationFrame(step);
    },
    stop() {
      if (raf === 0) return;
      cancelAnimationFrame(raf);
      raf = 0;
      const surface = document.querySelector('.timeline-wheel.is-solid') ? 'solid' : 'frosted';
      box.textContent = `${surface} · ${frames} frames · ${long} over ${LONG_FRAME_MS}ms · worst ${worst.toFixed(0)}ms`;
    },
    destroy() {
      cancelAnimationFrame(raf);
      box.remove();
    },
  };
}
