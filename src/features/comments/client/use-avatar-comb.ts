/* Avatar-group comb hover (transitions.dev #11).

   Hovering one face lifts it and drags its neighbours up by a power falloff,
   so the row combs rather than one item popping out of a static line. The
   return is a bouncy overshoot.

   Both directions animate the same property, so the timing function is written
   inline BEFORE the variable writes: the browser uses whichever one is current
   at the moment the property changes, which is how one declaration gives a
   clean curve up and a spring back. */

const FALLBACK = {
  lift: -4,
  falloff: 0.45,
  scale: 1.05,
  easeIn: 'cubic-bezier(0.22, 1, 0.36, 1)',
  easeOut: 'cubic-bezier(0.34, 3.85, 0.64, 1)',
};

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Combs every [data-comb-item] inside `root` off the hovered one. */
export function mountAvatarComb(root: HTMLElement): () => void {
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-comb-item]'));
  if (items.length === 0 || reduced()) return () => {};

  // Read off the scope, not the document: the tuning lives on .blog-zone.
  const style = getComputedStyle(root);
  const num = (name: string, fallback: number) => {
    const value = Number.parseFloat(style.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };
  const ease = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;

  const lift = num('--avatar-lift', FALLBACK.lift);
  const falloff = num('--avatar-falloff', FALLBACK.falloff);
  const scale = num('--avatar-scale', FALLBACK.scale);
  const easeIn = ease('--avatar-ease-in', FALLBACK.easeIn);
  const easeOut = ease('--avatar-ease-out', FALLBACK.easeOut);

  function comb(active: number | null) {
    const timing = active === null ? easeOut : easeIn;
    items.forEach((el, i) => {
      el.style.transitionTimingFunction = timing;
      if (active === null) {
        el.style.setProperty('--shift', '0px');
        el.style.setProperty('--scale-active', '1');
        return;
      }
      const distance = Math.abs(i - active);
      el.style.setProperty('--shift', `${(lift * falloff ** distance).toFixed(3)}px`);
      el.style.setProperty('--scale-active', i === active ? String(scale) : '1');
    });
  }

  const enters = items.map((el, i) => {
    const handler = () => comb(i);
    el.addEventListener('mouseenter', handler);
    return handler;
  });
  const onLeave = () => comb(null);
  root.addEventListener('mouseleave', onLeave);

  return () => {
    items.forEach((el, i) => {
      el.removeEventListener('mouseenter', enters[i]);
      el.style.removeProperty('--shift');
      el.style.removeProperty('--scale-active');
      el.style.transitionTimingFunction = '';
    });
    root.removeEventListener('mouseleave', onLeave);
  };
}
