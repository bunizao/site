// The record turns while a song plays, now on Apple Music or as a preview:
// the disc in the painting, under its sleeve, and the one on the listening
// panel. It runs up to 33⅓ like a turntable does, in under a second, and
// coasts to a stop when the music does.

const TURN_MS = 1800;
const SPIN_UP_MS = 900;
const COAST_MS = 1700;

export function initTurntable() {
  const listening = document.querySelector<HTMLElement>('[data-listening]');
  const discs = [...document.querySelectorAll<HTMLElement>('[data-turn]')];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!listening || !discs.length) return;

  const spins = discs.map((disc) => {
    const spin = disc.animate([{ rotate: '0turn' }, { rotate: '1turn' }], { duration: TURN_MS, iterations: Infinity });
    spin.pause();
    return spin;
  });

  let rate = 0;
  let target = 0;
  let frame = 0;
  let last = 0;

  const step = (now: number) => {
    const dt = now - last;
    last = now;
    // Constant torque up, constant friction down: the rate moves in a line.
    rate = target > rate ? Math.min(target, rate + dt / SPIN_UP_MS) : Math.max(target, rate - dt / COAST_MS);
    for (const spin of spins) {
      if (rate > 0) {
        spin.playbackRate = rate;
        if (spin.playState !== 'running') spin.play();
      } else {
        spin.pause();
      }
    }
    frame = rate === target ? 0 : requestAnimationFrame(step);
  };

  const sync = () => {
    const playing = listening.classList.contains('is-live') || listening.classList.contains('is-preview-playing');
    target = playing && !reduced.matches ? 1 : 0;
    if (frame || rate === target) return;
    last = performance.now();
    frame = requestAnimationFrame(step);
  };

  new MutationObserver(sync).observe(listening, { attributes: true, attributeFilter: ['class'] });
  reduced.addEventListener('change', sync);
  sync();
}
