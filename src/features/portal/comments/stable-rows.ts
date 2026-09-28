import * as React from 'react';
import type { PortalComment } from '@/features/admin/server/portal-client';

/* The list the moderator sees is not the list the server last sent. A poll
   or a refetch may add, drop or reorder rows at any moment; applying that
   directly moves rows under the pointer. So each filter keeps a view:

   - rows already on screen stay, in their order, updated in place;
   - rows from a newly fetched page are appended;
   - rows newer than the ones on screen wait behind an "N new" pill, and
     merge on a tap or when the list sits at the top, idle;
   - a row leaves only when the moderator acts on it, or on a merge.

   Views live in a small module-level cache keyed by filter, so Back lands
   on the same rows; the shell's scroll restoration (app/scroll.ts) puts it
   at the same place. */

interface View {
  ids: string[];
  byId: Map<string, PortalComment>;
  /** Ids the moderator removed, kept out until the server agrees. */
  gone: Map<string, number>;
  source: readonly PortalComment[] | null;
  rows: PortalComment[];
  fresh: PortalComment[];
  /** Take the server's rows at the next render. */
  resync: boolean;
}

const MAX_VIEWS = 16;
/** Longer than any refetch that could still carry a removed row. */
const GONE_MS = 15_000;
const IDLE_MS = 1_500;

const views = new Map<string, View>();

function viewFor(key: string): View {
  let view = views.get(key);
  if (view) {
    // Refresh recency for the LRU.
    views.delete(key);
    views.set(key, view);
    return view;
  }
  view = { ids: [], byId: new Map(), gone: new Map(), source: null, rows: [], fresh: [], resync: false };
  views.set(key, view);
  if (views.size > MAX_VIEWS) views.delete(views.keys().next().value!);
  return view;
}

function rebuild(view: View): void {
  view.rows = view.ids.flatMap((id) => {
    const row = view.byId.get(id);
    return row ? [row] : [];
  });
}

function reconcile(view: View, loaded: readonly PortalComment[]): void {
  const now = Date.now();
  for (const [id, until] of view.gone) if (until < now) view.gone.delete(id);
  for (const row of loaded) view.byId.set(row.id, row);

  const visible = loaded.filter((row) => !view.gone.has(row.id));
  if (view.ids.length === 0) {
    view.ids = visible.map((row) => row.id);
    view.fresh = [];
    rebuild(view);
    return;
  }

  const known = new Set(view.ids);
  // The last loaded row the view already shows: anything after it came from
  // a later page, anything unknown before it is new since the view formed.
  let boundary = -1;
  for (let index = visible.length - 1; index >= 0; index -= 1) {
    if (known.has(visible[index].id)) {
      boundary = index;
      break;
    }
  }
  const appended: string[] = [];
  const fresh: PortalComment[] = [];
  visible.forEach((row, index) => {
    if (known.has(row.id)) return;
    if (boundary >= 0 && index > boundary) appended.push(row.id);
    else fresh.push(row);
  });
  if (appended.length > 0) view.ids = [...view.ids, ...appended];
  view.fresh = fresh;
  rebuild(view);
}

function merge(view: View): void {
  const source = view.source ?? [];
  view.ids = source.filter((row) => !view.gone.has(row.id)).map((row) => row.id);
  view.fresh = [];
  rebuild(view);
}

export interface StableRows {
  rows: PortalComment[];
  fresh: PortalComment[];
  /** Take the server's order now, new rows included. */
  merge: () => void;
  /** Take the server's rows at the next render, once the list has
      refetched after an act that changed rows the screen cannot name, such
      as a ban's sweep. */
  resync: () => void;
  /** Take rows out of the view; the returned function puts them back where
      they were: all of them, or only the ids it is given. */
  remove: (ids: readonly string[]) => (only?: readonly string[]) => void;
  /** Change fields of rows on screen, in place, in this frame. The cache
      gets the same change, and it reaches the view a task later. */
  patch: (patches: ReadonlyMap<string, Partial<PortalComment>>) => void;
  /** Attach to the scroll container; the idle merge only runs at its top. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export function useStableRows(key: string, loaded: readonly PortalComment[] | undefined): StableRows {
  const [, bump] = React.useReducer((count: number) => count + 1, 0);
  const view = viewFor(key);
  // Idempotent per `loaded` identity, so a discarded render changes nothing.
  if (loaded && view.source !== loaded) {
    view.source = loaded;
    reconcile(view, loaded);
  }
  if (loaded && view.resync) {
    view.resync = false;
    merge(view);
  }

  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  // Merge by itself only at the top of the list, after the moderator has
  // stopped touching anything for a moment.
  const hasFresh = view.fresh.length > 0;
  React.useEffect(() => {
    if (!hasFresh) return;
    let lastInput = performance.now();
    const onInput = (): void => {
      lastInput = performance.now();
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    for (const name of events) window.addEventListener(name, onInput, { passive: true, capture: true });
    const timer = window.setInterval(() => {
      const node = scrollRef.current;
      if (!node || node.scrollTop > 2 || performance.now() - lastInput < IDLE_MS) return;
      merge(view);
      bump();
    }, 500);
    return () => {
      window.clearInterval(timer);
      for (const name of events) window.removeEventListener(name, onInput, { capture: true });
    };
  }, [hasFresh, view]);

  const mergeNow = React.useCallback(() => {
    merge(view);
    bump();
  }, [view]);

  const resync = React.useCallback(() => {
    view.resync = true;
    bump();
  }, [view]);

  const remove = React.useCallback(
    (ids: readonly string[]) => {
      const removed = ids
        .map((id) => ({ id, index: view.ids.indexOf(id), row: view.byId.get(id) }))
        .filter((entry) => entry.index >= 0)
        .sort((a, b) => a.index - b.index);
      if (removed.length === 0) return () => {};
      const until = Date.now() + GONE_MS;
      const drop = new Set(ids);
      for (const id of ids) view.gone.set(id, until);
      view.ids = view.ids.filter((id) => !drop.has(id));
      rebuild(view);
      bump();
      const back = new Set<string>();
      return (only?: readonly string[]) => {
        // Ascending, so each index counts the rows restored before it; the
        // ones still out are subtracted.
        let out = 0;
        let changed = false;
        for (const { id, index, row } of removed) {
          if (back.has(id)) continue;
          if (only && !only.includes(id)) {
            out += 1;
            continue;
          }
          back.add(id);
          changed = true;
          view.gone.delete(id);
          if (row) view.byId.set(id, row);
          if (!view.ids.includes(id)) view.ids.splice(Math.min(index - out, view.ids.length), 0, id);
        }
        if (!changed) return;
        rebuild(view);
        bump();
      };
    },
    [view],
  );

  const patch = React.useCallback(
    (patches: ReadonlyMap<string, Partial<PortalComment>>) => {
      let changed = false;
      for (const [id, fields] of patches) {
        const row = view.byId.get(id);
        if (!row) continue;
        view.byId.set(id, { ...row, ...fields });
        changed = true;
      }
      if (!changed) return;
      rebuild(view);
      bump();
    },
    [view],
  );

  return { rows: view.rows, fresh: view.fresh, merge: mergeNow, resync, remove, patch, scrollRef };
}
