import { useEffect, useState } from 'react';

// Drop-in replacement for framer-motion's `useReducedMotion`. Components that
// only need this boolean shouldn't have to pull in framer-motion's runtime
// just for it — this is a plain `matchMedia` listener instead.
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reduced;
}
