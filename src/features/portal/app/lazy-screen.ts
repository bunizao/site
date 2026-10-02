import * as React from 'react';
import type { QueryClient } from '@tanstack/react-query';

/* A screen loaded on demand, that can also be loaded, and have its data
   warmed, before anyone opens it.

   The shell preloads every screen chunk, and every idle `lazyPart`, once the
   first screen is up (see Outlet.tsx), then warms those screens' data
   through each module's optional `prefetch` export. A link the pointer
   rests on, or that gets focus, a touch or a press, warms its screen too.
   Once a chunk is in, React.lazy is
   handed an already settled thenable, which React reads without
   suspending. */

export interface ScreenModule {
  default: React.ComponentType;
  /** Warm the reads the screen draws first for this query string. Called on
      link intent and while the shell holds the outgoing screen, so it must
      resolve at once when the cache holds any data, even stale: use
      `client.query({ ...options, staleTime: 'static' })` (or
      `infiniteQuery`). Without 'static' it refetches stale data first and
      so holds the old screen for a round trip. The screen's own useQuery
      revalidates stale data on mount. */
  prefetch?: (client: QueryClient, search: URLSearchParams) => Promise<unknown> | undefined;
}

export type LazyScreen = React.LazyExoticComponent<React.ComponentType> & {
  preload: () => Promise<ScreenModule>;
  /** False for heavy screens: loaded on link intent or arrival, not idle. */
  idle: boolean;
};

export interface ScreenRoute {
  pattern: RegExp;
  Screen: LazyScreen;
}

/** React.lazy over `load`, plus a `preload` that starts it early. */
function preloadable<T extends object, P>(load: () => Promise<T>, component: (loaded: T) => React.ComponentType<P>) {
  let loaded: T | null = null;
  let pending: Promise<T> | null = null;

  const preload = (): Promise<T> => {
    pending ??= load().then(
      (value) => (loaded = value),
      (error: unknown) => {
        pending = null; // A failed chunk load may succeed on the next try.
        throw error;
      },
    );
    return pending;
  };

  const Lazy = React.lazy(() => {
    type Module = { default: React.ComponentType<P> };
    if (!loaded) return preload().then((value): Module => ({ default: component(value) }));
    const module: Module = { default: component(loaded) };
    // A thenable that calls back at once; see the note at the top.
    return { then: (resolve: (value: Module) => void) => resolve(module) } as unknown as Promise<Module>;
  });

  return Object.assign(Lazy, { preload });
}

export function lazyScreen(load: () => Promise<ScreenModule>, { idle = true }: { idle?: boolean } = {}): LazyScreen {
  return Object.assign(
    preloadable(load, (module) => module.default),
    { idle },
  );
}

export type LazyPart<P> = React.LazyExoticComponent<React.ComponentType<P>> & { preload: () => Promise<unknown> };

const idleParts: Array<LazyPart<never>> = [];

/** A piece of the shell that is not needed for the first paint, such as a
    dialog opened by a key. Render it under a Suspense boundary once it is
    first wanted; it loads with the screens once the first screen is up, so
    by the first press it has usually arrived. */
export function lazyPart<P>(load: () => Promise<React.ComponentType<P>>): LazyPart<P> {
  const part = preloadable(load, (component) => component);
  idleParts.push(part as LazyPart<never>);
  return part;
}

export function routeFor(routes: readonly ScreenRoute[], path: string): ScreenRoute | null {
  return routes.find((route) => route.pattern.test(path)) ?? null;
}

/* Screens that can draw at once: chunk in, and the reads their prefetch
   warms resolved. Kept for less than the query cache's gcTime (the 5-minute
   default), so the data warmed then is still in memory. */
const WARM_MS = 4 * 60_000;
const warmAt = new Map<string, number>();
const warmKey = (route: ScreenRoute, search: URLSearchParams): string => `${route.pattern.source}?${search}`;

/** True when `route` with this query string was warmed recently: switching
    to it has nothing to wait for. */
export function isWarm(route: ScreenRoute, search: URLSearchParams): boolean {
  const at = warmAt.get(warmKey(route, search));
  return at !== undefined && Date.now() - at < WARM_MS;
}

/** Load the chunk, then warm its data. Never rejects: a failure here is
    shown by the screen itself when it renders. */
export function prefetchScreen(route: ScreenRoute, client: QueryClient, search: URLSearchParams): Promise<unknown> {
  return route.Screen.preload()
    .then((module) => module.prefetch?.(client, search))
    .then(() => {
      const key = warmKey(route, search);
      warmAt.delete(key); // Re-insert, so the oldest entry is the one dropped.
      warmAt.set(key, Date.now());
      if (warmAt.size > 50) warmAt.delete(warmAt.keys().next().value!);
    })
    .catch(() => undefined);
}

let preloaded = false;

/** Every idle screen chunk and shell part, once, while the browser is idle.
    Then each of those screens' first reads, as its sidebar link opens it,
    so a first visit draws from memory like a revisit instead of waiting a
    round trip. One screen at a time, each in its own idle slot: a burst
    would queue a click's own request behind a dozen others. */
export function preloadScreens(routes: readonly ScreenRoute[], client: QueryClient): void {
  if (preloaded) return;
  preloaded = true;
  const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 200));
  const screens = routes.filter((route) => route.Screen.idle);
  const blank = new URLSearchParams();
  let next = 0;
  const warmNext = (): void => {
    const route = screens[next++];
    if (route) void prefetchScreen(route, client, blank).then(() => idle(warmNext));
  };
  idle(() => {
    for (const part of idleParts) void part.preload().catch(() => {});
    for (const route of screens) void route.Screen.preload().catch(() => {});
    warmNext();
  });
}
