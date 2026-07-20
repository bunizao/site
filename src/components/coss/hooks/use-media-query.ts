import * as React from 'react';

const BREAKPOINTS: Record<string, string> = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

export function useMediaQuery(query: string): boolean {
  const resolved = React.useMemo(() => normalize(query), [query]);
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined') return () => {};
      const mediaQuery = window.matchMedia(resolved);
      mediaQuery.addEventListener('change', onChange);
      return () => mediaQuery.removeEventListener('change', onChange);
    },
    [resolved],
  );
  const getSnapshot = React.useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(resolved).matches;
  }, [resolved]);

  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}

function normalize(query: string): string {
  const max = /^max-(.+)$/.exec(query);
  if (max) return `(max-width: calc(${breakpoint(max[1])} - 0.1px))`;
  const min = /^min-(.+)$/.exec(query);
  if (min) return `(min-width: ${breakpoint(min[1])})`;
  return query;
}

function breakpoint(name: string): string {
  return BREAKPOINTS[name] ?? name;
}
