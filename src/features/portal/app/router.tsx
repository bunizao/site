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
  /** Names the history entry: stable across replaces and reloads, new on
      every push. Per-entry memory (scroll positions) is keyed by it. */
  key: string;
}

/* Every entry the portal pushes carries `{ key }` in history.state, and a
   replace keeps whatever state the entry already had. Screens may add their
   own fields (see scroll.ts), which then belong to that one entry. */

type EntryState = Record<string, unknown> & { key?: string };

export function readHistoryState(): EntryState {
  const state = history.state as unknown;
  return state && typeof state === 'object' ? (state as EntryState) : {};
}

/** Adds fields to the current entry's state, keeping the rest. */
export function mergeHistoryState(patch: Record<string, unknown>): void {
  history.replaceState({ ...readHistoryState(), ...patch }, '');
}

function newKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** An entry the portal did not create (first load, an in-page `#hash`
    link) has no key yet; give it one in place. */
function ensureEntryKey(): void {
  if (typeof readHistoryState().key !== 'string') {
    history.replaceState({ ...readHistoryState(), key: newKey() }, '');
  }
}

const listeners = new Set<() => void>();
let snapshot: { id: string; value: PortalLocation } | null = null;

function read(): PortalLocation {
  const key = readHistoryState().key ?? '';
  const id = `${key} ${location.pathname}${location.search}${location.hash}`;
  if (snapshot?.id === id) return snapshot.value;
  const raw = location.pathname.startsWith(PORTAL_BASE)
    ? location.pathname.slice(PORTAL_BASE.length)
    : location.pathname;
  const path = raw.replace(/\/+$/, '') || '/';
  const value = { path, search: new URLSearchParams(location.search), hash: location.hash.slice(1), key };
  snapshot = { id, value };
  return value;
}

function readPath(): string {
  return read().path;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function onPopState(): void {
  ensureEntryKey();
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener('popstate', onPopState);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('popstate', onPopState);
  };
}

if (typeof window !== 'undefined') ensureEntryKey();

/** The live URL. Only the shell's outlet and components outside it should
    need this; screens read `useLocation`. */
export function useLiveLocation(): PortalLocation {
  return React.useSyncExternalStore(subscribe, read, read);
}

/** Just the path, for chrome that must not re-render when a screen writes
    its query string (a status tab, the open comment, j/k). */
export function usePath(): string {
  return React.useSyncExternalStore(subscribe, readPath, readPath);
}

/** `select(path)`, re-rendering only when that answer changes: for chrome
    that cares about part of the path, like the sidebar's active entry,
    which opening a row on the same screen does not change. */
export function usePathSelect(select: (path: string) => string): string {
  const read = () => select(readPath());
  return React.useSyncExternalStore(subscribe, read, read);
}

/** The location the outlet is rendering. While the next screen loads, the
    outgoing one keeps rendering for its own URL, not the new one. */
export const ScreenLocationContext = React.createContext<PortalLocation | null>(null);

const noSubscribe = () => () => {};
const noSnapshot = () => null;

export function useLocation(): PortalLocation {
  const screen = React.useContext(ScreenLocationContext);
  // Inside the outlet the context is the whole answer, so skip the store
  // subscription: it would re-render an outgoing screen with the incoming
  // screen's query string. The branch is fixed for a component's lifetime.
  const live = React.useSyncExternalStore(screen ? noSubscribe : subscribe, screen ? noSnapshot : read, screen ? noSnapshot : read);
  return screen ?? live!;
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

export function isAppPath(fullHref: string): boolean {
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
  if (options.replace) history.replaceState(readHistoryState(), '', target);
  else history.pushState({ key: newKey() }, '', target);
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
  if (options.push) history.pushState({ key: newKey() }, '', target);
  else history.replaceState(readHistoryState(), '', target);
  emit();
}

export type LinkProps = Omit<React.ComponentProps<'a'>, 'href'> & { to: string };

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link({ to, onClick, ...props }, ref) {
  const target = href(to);
  return (
    <a
      ref={ref}
      href={target}
      // Astro prefetches every same-origin link on hover (astro.config.mjs).
      // Here that would fetch the server shell of a screen this app draws
      // itself, from an authenticated route. Raw portal anchors opt out too.
      data-astro-prefetch="false"
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
