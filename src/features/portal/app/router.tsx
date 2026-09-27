import * as React from 'react';

/* A deliberately tiny History-API router. The portal has a dozen flat
   screens and one query string each; a routing library would be the largest
   thing in the bundle and buy nothing the URL does not already say. */

export const PORTAL_BASE = '/dev/portal';

export interface PortalLocation {
  /** Path below PORTAL_BASE, always starting with `/` (`/` is home). */
  path: string;
  search: URLSearchParams;
  hash: string;
}

const listeners = new Set<() => void>();
let snapshot: { key: string; value: PortalLocation } | null = null;

function read(): PortalLocation {
  const key = location.pathname + location.search + location.hash;
  if (snapshot?.key === key) return snapshot.value;
  const raw = location.pathname.startsWith(PORTAL_BASE)
    ? location.pathname.slice(PORTAL_BASE.length)
    : location.pathname;
  const path = raw.replace(/\/+$/, '') || '/';
  const value = { path, search: new URLSearchParams(location.search), hash: location.hash.slice(1) };
  snapshot = { key, value };
  return value;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener('popstate', emit);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('popstate', emit);
  };
}

export function useLocation(): PortalLocation {
  return React.useSyncExternalStore(subscribe, read, read);
}

/** Full href for a portal path (`/comments?x=1` → `/dev/portal/comments?x=1`). */
export function href(to: string): string {
  if (/^[a-z]+:/i.test(to) || to.startsWith(PORTAL_BASE)) return to;
  return PORTAL_BASE + (to === '/' ? '' : to);
}

/* Screens the SPA renders itself. Anything else under /dev/portal is still a
   server-rendered page, so a link there must be a real navigation. */
let appRoutes: readonly RegExp[] = [];

export function registerAppRoutes(patterns: readonly RegExp[]): void {
  appRoutes = patterns;
}

function isAppPath(fullHref: string): boolean {
  const url = new URL(fullHref, location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith(PORTAL_BASE)) return false;
  const path = url.pathname.slice(PORTAL_BASE.length).replace(/\/+$/, '') || '/';
  return appRoutes.some((pattern) => pattern.test(path));
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  const target = href(to);
  if (!isAppPath(target)) {
    location.assign(target);
    return;
  }
  if (target === location.pathname + location.search + location.hash) return;
  history[options.replace ? 'replaceState' : 'pushState'](null, '', target);
  emit();
}

/** Merge query params into the current URL without adding a history entry. */
export function setSearch(patch: Record<string, string | null | undefined>, options: { push?: boolean } = {}): void {
  const params = new URLSearchParams(location.search);
  for (const [name, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === '') params.delete(name);
    else params.set(name, value);
  }
  const query = params.toString();
  const target = location.pathname + (query ? `?${query}` : '') + location.hash;
  history[options.push ? 'pushState' : 'replaceState'](null, '', target);
  emit();
}

export type LinkProps = Omit<React.ComponentProps<'a'>, 'href'> & { to: string };

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link({ to, onClick, ...props }, ref) {
  const target = href(to);
  return (
    <a
      ref={ref}
      href={target}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target === '_blank' ||
          !isAppPath(target)
        ) {
          return;
        }
        event.preventDefault();
        navigate(target);
      }}
      {...props}
    />
  );
});
