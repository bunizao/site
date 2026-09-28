import * as React from 'react';

/* A list that never moves under the pointer, over ids. The comment log's
   stable-rows does the same for comments and removes rows on a verdict;
   here nothing leaves by itself, because an edited subscriber should stay
   where it was, showing its new values, until the filter is re-entered.

   - Entering a filter (a switch, a mount) takes the loaded order as is.
   - Within a filter, ids on screen keep their place; ids from a later page
     are appended; ids new since the view formed wait behind a pill.
   - The scroll offset is kept per filter, in memory, so Back lands where
     you left. */

interface View {
  ids: string[];
  source: readonly string[] | null;
  fresh: string[];
  scrollTop: number;
}

const MAX_VIEWS = 24;
const views = new Map<string, View>();

function viewFor(key: string): View {
  let view = views.get(key);
  if (view) {
    views.delete(key);
    views.set(key, view);
    return view;
  }
  view = { ids: [], source: null, fresh: [], scrollTop: 0 };
  views.set(key, view);
  if (views.size > MAX_VIEWS) views.delete(views.keys().next().value!);
  return view;
}

function reconcile(view: View, loaded: readonly string[]): void {
  const known = new Set(view.ids);
  // The last loaded id already on screen: unknown ids after it came from a
  // later page, unknown ids before it are new since the view formed.
  let boundary = -1;
  for (let index = loaded.length - 1; index >= 0; index -= 1) {
    if (known.has(loaded[index])) {
      boundary = index;
      break;
    }
  }
  const appended: string[] = [];
  const fresh: string[] = [];
  loaded.forEach((id, index) => {
    if (known.has(id)) return;
    if (index > boundary) appended.push(id);
    else fresh.push(id);
  });
  if (appended.length > 0) view.ids = [...view.ids, ...appended];
  view.fresh = fresh;
}

export interface StableView {
  ids: readonly string[];
  fresh: readonly string[];
  /** Take the loaded order now, new ids included. */
  merge: () => void;
  /** Put ids at the top, for a row the owner just added. */
  prepend: (ids: readonly string[]) => void;
  /** The saved offset of this filter, for sizing the first render. */
  savedScrollTop: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export function useStableView(key: string, loaded: readonly string[] | undefined): StableView {
  const [, bump] = React.useReducer((count: number) => count + 1, 0);
  const view = viewFor(key);
  const entered = React.useRef<string | null>(null);
  // Idempotent per `loaded` identity and key, so a discarded render
  // changes nothing that the next one would not change the same way.
  if (loaded && (view.source !== loaded || entered.current !== key)) {
    if (entered.current === key) {
      reconcile(view, loaded);
    } else {
      entered.current = key;
      view.ids = [...loaded];
      view.fresh = [];
    }
    view.source = loaded;
  }

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const restored = React.useRef<string | null>(null);
  const restoredNode = React.useRef<HTMLDivElement | null>(null);
  const keyRef = React.useRef(key);
  keyRef.current = key;
  const ready = loaded !== undefined;

  // Restore once per filter, when its rows exist; until then the container
  // still holds the previous filter's offset, which must not be recorded.
  React.useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node || !ready || restored.current === key) return;
    restored.current = key;
    // Writing scrollTop forces a layout of the whole screen inside the
    // commit, which then lays out again before the paint. A container not
    // seen before was just mounted, so it is already at the top.
    if (view.scrollTop !== 0 || restoredNode.current === node) node.scrollTop = view.scrollTop;
    restoredNode.current = node;
  }, [key, ready, view]);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const onScroll = (): void => {
      if (restored.current !== keyRef.current) return;
      viewFor(keyRef.current).scrollTop = node.scrollTop;
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, []);

  const merge = React.useCallback(() => {
    view.ids = [...(view.source ?? [])];
    view.fresh = [];
    bump();
  }, [view]);

  const prepend = React.useCallback(
    (ids: readonly string[]) => {
      const add = ids.filter((id) => !view.ids.includes(id));
      if (add.length === 0) return;
      view.ids = [...add, ...view.ids];
      view.fresh = view.fresh.filter((id) => !add.includes(id));
      bump();
    },
    [view],
  );

  return { ids: view.ids, fresh: view.fresh, merge, prepend, savedScrollTop: view.scrollTop, scrollRef };
}

/** How many rows to render now. A filter or search change starts small, so
    its first frame paints fast, then grows to the whole list in a
    transition; data patches never shrink it. The first render covers the
    saved offset and the open row, so Back lands on real rows. 40 rows fill
    a tall screen; a floor of 120 cost ~100ms of first paint at 4x CPU. */
export function useRenderLimit(resetKey: string, total: number, cover: number): number {
  const initial = Math.max(40, cover + 10);
  const [state, setState] = React.useState({ key: resetKey, limit: initial });
  if (state.key !== resetKey) setState({ key: resetKey, limit: initial });
  const limit = state.key === resetKey ? state.limit : initial;

  React.useEffect(() => {
    if (limit >= total) return;
    // After the next frame has painted; the timer covers a hidden tab,
    // where animation frames stop.
    let done = false;
    const grow = (): void => {
      if (done) return;
      done = true;
      React.startTransition(() => setState((current) => (current.key === resetKey ? { ...current, limit: total } : current)));
    };
    const frame = requestAnimationFrame(grow);
    const timer = window.setTimeout(grow, 120);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [limit, total, resetKey]);

  return limit;
}
