import * as React from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Button } from '@/components/coss/button';
import { Spinner } from '@/components/coss/spinner';
import { isWarm, prefetchScreen, preloadScreens, routeFor, type ScreenRoute } from './lazy-screen';
import { PORTAL_BASE, ScreenLocationContext, useLiveLocation, type PortalLocation } from './router';
import { ScreenHeader } from './shell/ScreenHeader';
import { SMALL } from '../activity/table';

/* The outlet renders the screen for the URL, and never blanks it.

   Moving to another screen keeps the current one up (with a thin bar after
   100ms) until the next one's chunk is in and its data is warm, or
   ARRIVAL_WAIT_MS passes, whichever is first; then the new screen paints
   whole, or with its own skeleton if the network is slow. Within one screen
   every change is urgent: a status tab, j/k, a pivot. So is a switch to a
   screen that is already warm (see isWarm): it has nothing to wait for.

   Why useDeferredValue and not startTransition: the URL lives in an
   external store (history), and useSyncExternalStore updates are always
   synchronous, so a transition cannot wrap them. Holding the location in
   React state instead would let an urgent update (say a search param
   written while the next screen loads) commit the pending path in a sync
   render, which suspends and shows the fallback. Deferring the one value
   the outlet reads keeps history the single source of truth, and the rule
   (only a change of screen may lag) lives in these few lines. */

const ARRIVAL_WAIT_MS = 200;
/** A pointer sweeping over a list of links is not intent; one that rests is. */
const HOVER_INTENT_MS = 80;

const arrivals = new Map<string, Promise<unknown>>();

/** One promise per arrival, so React sees the same one on every retry. */
function arrival(route: ScreenRoute, location: PortalLocation, client: QueryClient): Promise<unknown> {
  const id = `${location.key} ${location.path}?${location.search}`;
  let wait = arrivals.get(id);
  if (!wait) {
    wait = Promise.race([
      prefetchScreen(route, client, location.search),
      new Promise((resolve) => window.setTimeout(resolve, ARRIVAL_WAIT_MS)),
    ]);
    arrivals.set(id, wait);
    if (arrivals.size > 20) arrivals.delete(arrivals.keys().next().value!);
  }
  return wait;
}

function Arrive({ wait }: { wait: Promise<unknown> | null }) {
  if (wait) React.use(wait);
  return null;
}

/** Commits only together with the screen, so it marks what is on screen. */
function Arrived({ route, onArrive }: { route: ScreenRoute; onArrive: (route: ScreenRoute) => void }) {
  React.useLayoutEffect(() => onArrive(route), [route, onArrive]);
  return null;
}

/* A screen that throws, or whose chunk fails to load (a deploy replaced it
   while the tab was open), takes down only itself. The sidebar stays, the
   header keeps the phone's way into it, and opening another screen resets
   the boundary. Reload covers both causes: it fetches the current build. */
class ScreenBoundary extends React.Component<{ route: ScreenRoute; children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidUpdate(previous: { route: ScreenRoute }) {
    if (previous.route !== this.props.route && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-svh flex-col">
        <ScreenHeader title="Screen failed" />
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-muted-foreground text-sm">
          <p>This screen failed to load.</p>
          <code className="max-w-md break-words font-code text-xs">{error.message}</code>
          <Button variant="outline" size="sm" className={SMALL} onClick={() => location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    );
  }
}

function PendingBar({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      data-active={active || undefined}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 origin-left scale-x-0 bg-primary opacity-0 data-active:scale-x-75 data-active:opacity-100 data-active:[transition:transform_1.5s_cubic-bezier(.2,.8,.2,1)_100ms,opacity_0s_linear_100ms]"
    />
  );
}

function linkOf(event: Event): HTMLAnchorElement | null {
  return event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
}

/* Warm a screen when a link to it is about to be used: the pointer rests
   on it, it gets focus, or a finger lands on it. A press warms at once, so a
   click faster than the hover delay still starts its reads a press-length
   before the click navigates. Delegated, so raw anchors (the comment log's
   pivot keys) count as much as <Link>s. `pointerover` is the bubbling form
   of pointerenter, and fires on touch contact too. */
function useIntentPrefetch(routes: readonly ScreenRoute[], client: QueryClient): void {
  React.useEffect(() => {
    let timer = 0;
    const warm = (anchor: HTMLAnchorElement): void => {
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith(PORTAL_BASE) || anchor.target === '_blank') return;
      const route = routeFor(routes, url.pathname.slice(PORTAL_BASE.length).replace(/\/+$/, '') || '/');
      if (route) void prefetchScreen(route, client, url.searchParams);
    };
    const onOver = (event: PointerEvent): void => {
      const anchor = linkOf(event);
      if (!anchor) return;
      window.clearTimeout(timer);
      if (event.pointerType === 'mouse') timer = window.setTimeout(() => warm(anchor), HOVER_INTENT_MS);
      else warm(anchor);
    };
    const onOut = (event: PointerEvent): void => {
      const anchor = linkOf(event);
      if (anchor && !(event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget))) window.clearTimeout(timer);
    };
    // Chrome focuses a pressed link, so focusin already covers a press
    // there; Safari does not focus links on click.
    const onFocusOrPress = (event: FocusEvent | PointerEvent): void => {
      const anchor = linkOf(event);
      if (anchor) warm(anchor);
    };
    document.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('pointerout', onOut, { passive: true });
    document.addEventListener('pointerdown', onFocusOrPress, { passive: true });
    document.addEventListener('focusin', onFocusOrPress);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('pointerdown', onFocusOrPress);
      document.removeEventListener('focusin', onFocusOrPress);
    };
  }, [routes, client]);
}

export function Outlet({ routes, notFound }: { routes: readonly ScreenRoute[]; notFound: (path: string) => React.ReactNode }) {
  const client = useQueryClient();
  const live = useLiveLocation();
  const deferred = React.useDeferredValue(live);
  const liveRoute = routeFor(routes, live.path);
  const sameScreen = liveRoute === routeFor(routes, deferred.path);
  // A screen warmed moments ago (the link was hovered, or it was open a
  // minute ago) has nothing to wait for. Deferring it would only cost a
  // frame: the sidebar would paint first and the screen one frame later.
  const ready = !sameScreen && liveRoute !== null && isWarm(liveRoute, live.search);
  const shown = sameScreen || ready ? live : deferred;
  const route = routeFor(routes, shown.path);

  // The screen on screen, set when it commits. Read during render only to
  // decide whether this render is an arrival from another screen.
  const committed = React.useRef<ScreenRoute | null>(null);
  const onArrive = React.useCallback(
    (next: ScreenRoute) => {
      committed.current = next;
      preloadScreens(routes, client);
    },
    [routes, client],
  );
  useIntentPrefetch(routes, client);

  // Not on a cold start: there is nothing on screen to keep up, and the
  // screen's own skeleton beats a longer spinner.
  const wait = route && !ready && committed.current && committed.current !== route ? arrival(route, shown, client) : null;

  // Every location change renders the outlet twice: once urgently, and once
  // more when the deferred value catches up, with the same `shown`. The
  // memo makes that second pass stop here instead of redrawing the screen,
  // and keeps the outgoing screen still while the next one loads. A screen
  // reads the location from the context, so it still sees every change.
  const screen = React.useMemo(
    () =>
      route ? (
        <ScreenBoundary route={route}>
          <React.Suspense
            fallback={
              <div className="flex h-svh items-center justify-center">
                <Spinner className="size-5 text-muted-foreground" />
              </div>
            }
          >
            <Arrive wait={wait} />
            <route.Screen />
            <Arrived route={route} onArrive={onArrive} />
          </React.Suspense>
        </ScreenBoundary>
      ) : (
        notFound(shown.path)
      ),
    [route, wait, onArrive, notFound, shown.path],
  );

  return (
    <>
      <PendingBar active={!sameScreen && !ready} />
      <ScreenLocationContext value={shown}>{screen}</ScreenLocationContext>
    </>
  );
}
