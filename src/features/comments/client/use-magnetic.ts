/* Magnetic pointer pull.
   An element inside the radius drifts toward the cursor, hardest at the centre
   and falling off to nothing at the edge, then springs home on leave.

   Two timing functions, same property: while tracking the transform has to keep
   up with the pointer, so it runs on a short glide; the return is where the
   spring belongs. As in the avatar-group comb, the timing function is written
   inline BEFORE the transform, because the browser uses whichever one is
   current at the moment the property changes. */

export interface MagneticOptions {
  /** Distance in px at which the pull reaches zero. */
  radius?: number;
  /** Fraction of the pointer offset the element travels at full strength. */
  strength?: number;
  /** Extra lift applied while the pointer is inside the radius. */
  lift?: number;
  scale?: number;
}

const GLIDE_DURATION = '140ms';
const GLIDE_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';
const SPRING_DURATION = '420ms';
const SPRING_EASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Tracks the pointer across `scope` and pulls every [data-magnetic] inside it. */
export function mountMagnetic(scope: HTMLElement, options: MagneticOptions = {}): () => void {
  const { radius = 110, strength = 0.45, lift = -8, scale = 1.12 } = options;
  const targets = Array.from(scope.querySelectorAll<HTMLElement>('[data-magnetic]'));
  if (targets.length === 0 || reduced()) return () => {};

  let frame = 0;

  function apply(pointerX: number, pointerY: number) {
    let nearest: HTMLElement | null = null;
    let nearestPull = 0;

    for (const el of targets) {
      const box = el.getBoundingClientRect();
      const dx = pointerX - (box.left + box.width / 2);
      const dy = pointerY - (box.top + box.height / 2);
      const distance = Math.hypot(dx, dy);

      if (distance > radius) {
        release(el);
        continue;
      }

      // Falloff below 2 keeps the pull readable across the whole radius; a
      // squared curve collapses to nothing a third of the way out and reads as
      // no effect at all.
      const pull = (1 - distance / radius) ** 1.6;
      if (pull > nearestPull) {
        nearestPull = pull;
        nearest = el;
      }

      el.style.transitionDuration = GLIDE_DURATION;
      el.style.transitionTimingFunction = GLIDE_EASE;
      el.style.zIndex = '';
      el.style.transform =
        `translate3d(${(dx * strength * pull).toFixed(2)}px, ` +
        `${(dy * strength * pull + lift * pull).toFixed(2)}px, 0) ` +
        `scale(${(1 + (scale - 1) * pull).toFixed(4)})`;
    }

    // The faces overlap, so whichever one is being pulled hardest has to come
    // forward or its ring is clipped by the next one along.
    if (nearest) nearest.style.zIndex = '2';
  }

  function release(el: HTMLElement) {
    if (el.style.transform === '' || el.style.transform === 'none') return;
    el.style.transitionDuration = SPRING_DURATION;
    el.style.transitionTimingFunction = SPRING_EASE;
    el.style.zIndex = '';
    el.style.transform = '';
  }

  function onMove(event: PointerEvent) {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => apply(event.clientX, event.clientY));
  }

  function onLeave() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    targets.forEach(release);
  }

  // Bound on the scope rather than each target: the pull has to start before
  // the cursor is over anything, which is the whole point of a radius.
  scope.addEventListener('pointermove', onMove);
  scope.addEventListener('pointerleave', onLeave);

  return () => {
    if (frame) cancelAnimationFrame(frame);
    scope.removeEventListener('pointermove', onMove);
    scope.removeEventListener('pointerleave', onLeave);
    targets.forEach((el) => {
      el.style.transform = '';
      el.style.transitionDuration = '';
      el.style.transitionTimingFunction = '';
      el.style.zIndex = '';
    });
  };
}
