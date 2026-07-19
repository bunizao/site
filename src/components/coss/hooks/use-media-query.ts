import * as React from 'react';

/**
 * Subscribe to a CSS media query. Accepts a raw query or the shorthand
 * `max-<bp>` / `min-<bp>` (Tailwind-ish) used by coss components.
 */
export function useMediaQuery(query: string): boolean {
  const resolved = React.useMemo(() => normalize(query), [query]);
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined') return () => {};
      const mql = window.matchMedia(resolved);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [resolved],
  );
  const getSnapshot = React.useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(resolved).matches;
  }, [resolved]);

  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}

const BREAKPOINTS: Record<string, string> = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

function normalize(query: string): string {
  const max = /^max-(.+)$/.exec(query);
  if (max) return `(max-width: calc(${bp(max[1])} - 0.1px))`;
  const min = /^min-(.+)$/.exec(query);
  if (min) return `(min-width: ${bp(min[1])})`;
  return query;
}

function bp(name: string): string {
  return BREAKPOINTS[name] ?? name;
}
