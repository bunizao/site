import * as React from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { DeliveryMode, NotifyChannel, SubscriberRecord } from '@bunizao/contracts';
import { ArrowUp, ChevronDown, Download, Plus, Search, Trash2, UserMinus, X } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { Drawer, DrawerPopup } from '@/components/coss/drawer';
import { Input } from '@/components/coss/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/coss/input-group';
import { Kbd } from '@/components/coss/kbd';
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/components/coss/menu';
import { Skeleton } from '@/components/coss/skeleton';
import { toastManager } from '@/components/coss/toast';
import { useMediaQuery } from '@/components/coss/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { HEAD, LINE, SMALL, SPACED, TABLE } from '../activity/table';
import { useHotkeys } from '../app/hotkeys';
import { navigate, setSearch, useLocation } from '../app/router';
import { padUnderBulkBar } from '../app/scroll';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { undoLast } from '../app/undo';
import { formatCount, plural } from '../moderation/format';
import { EDGE_FADE, LoadError, StateTabs, TOUCH_MENU, TOUCH_TARGET, useSearchText } from '../moderation/ui';
import {
  LOCAL_CAP,
  PAGE,
  collectForExport,
  describeSubscriberError,
  detailOptions,
  findCached,
  flatten,
  prefetchSubscriberList,
  useBlogWelcome,
  useCreateSubscriber,
  useDeleteSubscribers,
  usePendingDeletes,
  useSubscriberCounts,
  useSubscriberDetail,
  useSubscriberList,
  useUpdateSubscribers,
} from './data';
import {
  ALL,
  CHANNELS,
  CHANNEL_LABELS,
  DELIVERY_LABELS,
  DELIVERY_MODES,
  DELIVERY_SHORT,
  EMAIL,
  STATUS_FILTERS,
  STATUS_LABELS,
  countFacets,
  csvFilename,
  emailHash,
  filterKey,
  isAll,
  matchesFilter,
  matchesQuery,
  normalizeQuery,
  readFilter,
  toCsv,
  type Filter,
  type StatusFilter,
  type SubscriberPatch,
} from './model';
import { SubscriberDetail } from './SubscriberPane';
import { MID, SUB_GRID, SubscriberRow, WIDE } from './SubscriberRow';
import { useRenderLimit, useStableView } from './stable-view';

/* The subscriber log: every address, newest change first, one line each.
   Filters, search, counts and export run in the browser over the whole
   list while it is small, so nothing on this screen waits on the network
   except a save, which paints first anyway. The URL holds the filter and
   the open subscriber (`/subscribers/<hash>`), so Back, reload and a shared
   link land on the same view. */

const PATH = /^\/subscribers\/([^/]+)$/;

function rowPath(hash: string | null): string {
  return `/subscribers${hash ? `/${encodeURIComponent(hash)}` : ''}${window.location.search}`;
}

function rowButton(hash: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(hash)}"] [data-row-button]`);
}

function focusedRowId(): string | null {
  const active = document.activeElement;
  return active instanceof HTMLElement ? active.closest('[data-row-id]')?.getAttribute('data-row-id') ?? null : null;
}

/** Focus a row without scrolling the page, then bring it just into view. */
function focusRow(hash: string): void {
  requestAnimationFrame(() => {
    const button = rowButton(hash);
    if (!button) return;
    button.focus({ preventScroll: true });
    button.closest('[data-row-id]')?.scrollIntoView({ block: 'nearest' });
  });
}

function setStatusFilter(status: StatusFilter): void {
  setSearch({ status: status === 'all' ? null : status });
}

function download(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Counts<T extends string> = Partial<Record<T | 'all', number>> | null;

/** The list the screen draws first (see app/lazy-screen.ts). A small list
    computes every filter and search from it; a large one fetches its filter
    on mount, once the first page has said which it is. */
export function prefetch(client: QueryClient): Promise<unknown> {
  return prefetchSubscriberList(client);
}

export default function SubscribersScreen() {
  const location = useLocation();
  const client = useQueryClient();
  const table = useMediaQuery('(min-width: 768px)');
  const wide = useMediaQuery('(min-width: 1280px)');
  const coarse = useMediaQuery('(pointer: coarse)');

  const match = PATH.exec(location.path);
  const selectedHash = match ? decodeURIComponent(match[1]) : null;
  const filterId = filterKey(readFilter(location.search));
  // Keyed by value: `j` changes the path, and nothing below should notice.
  const filter = React.useMemo(() => readFilter(location.search), [filterId]);
  const filtered = !isAll(filter);
  const urlQuery = location.search.get('q') ?? '';
  const [queryText, setQueryText] = useSearchText(urlQuery, (value) => setSearch({ q: value || null }));
  const query = normalizeQuery(queryText);
  const serverQuery = normalizeQuery(urlQuery);

  /* Data. The unfiltered list decides the mode: small enough, and it all
     comes down and everything else is computed; past LOCAL_CAP, each
     filter and search is a server query. */
  const base = useSubscriberList(ALL, '');
  const total = base.data?.pages[0]?.total;
  const local = total !== undefined && total <= LOCAL_CAP;
  const serverMode = total !== undefined && !local;
  const complete = local && !base.hasNextPage;

  React.useEffect(() => {
    if (local && base.hasNextPage && !base.isFetchingNextPage && !base.isFetchNextPageError) void base.fetchNextPage();
  }, [local, base.hasNextPage, base.isFetchingNextPage, base.isFetchNextPageError, base.fetchNextPage]);

  const filterList = useSubscriberList(filter, '', serverMode && filtered);
  const searchList = useSubscriberList(filter, serverQuery, serverMode && serverQuery.length >= 2);
  const counts = useSubscriberCounts(serverMode);

  const baseRows = React.useMemo(() => flatten(base.data), [base.data]);
  const serverFilterRows = React.useMemo(() => flatten(filterList.data), [filterList.data]);
  const searchRows = React.useMemo(
    () => (serverMode && serverQuery.length >= 2 ? flatten(searchList.data) : undefined),
    [serverMode, serverQuery, searchList.data],
  );

  // The rows this filter holds, in server order. A server-side filter shows
  // the matching rows already loaded until its own answer arrives.
  const placeholder = serverMode && filtered && !serverFilterRows;
  const filterRows = React.useMemo(() => {
    if (!baseRows) return undefined;
    if (serverMode && filtered && serverFilterRows) return serverFilterRows;
    return filtered ? baseRows.filter((row) => matchesFilter(row, filter)) : baseRows;
  }, [baseRows, serverFilterRows, serverMode, filtered, filter]);

  const byHash = React.useMemo(() => {
    const map = new Map<string, SubscriberRecord>();
    for (const rows of [baseRows, serverFilterRows, searchRows]) {
      for (const row of rows ?? []) if (!map.has(row.emailHash)) map.set(row.emailHash, row);
    }
    return map;
  }, [baseRows, serverFilterRows, searchRows]);

  const viewKey = `${filterId}${placeholder ? '|placeholder' : ''}`;
  const loadedIds = React.useMemo(() => filterRows?.map((row) => row.emailHash), [filterRows]);
  const view = useStableView(viewKey, loadedIds);

  const viewRows = React.useMemo(
    () => view.ids.flatMap((hash) => {
      const row = byHash.get(hash);
      return row ? [row] : [];
    }),
    [view.ids, byHash],
  );

  const rows = React.useMemo(() => {
    if (!query) return viewRows;
    const found = viewRows.filter((row) => matchesQuery(row, query));
    if (!searchRows) return found;
    const seen = new Set(found.map((row) => row.emailHash));
    return [...found, ...searchRows.filter((row) => !seen.has(row.emailHash) && matchesQuery(row, query))];
  }, [viewRows, query, searchRows]);

  const pending = usePendingDeletes();
  const update = useUpdateSubscribers();
  const remove = useDeleteSubscribers();
  const create = useCreateSubscriber();
  const blogWelcome = useBlogWelcome();

  /* Selection. The open subscriber is in the path. */
  const deepLink = useSubscriberDetail(selectedHash && !byHash.has(selectedHash) && baseRows ? selectedHash : null);
  const selectedRow = selectedHash ? byHash.get(selectedHash) ?? deepLink.data?.subscriber ?? null : null;
  const missing = Boolean(selectedHash && !selectedRow && deepLink.isError);
  const index = selectedHash ? rows.findIndex((row) => row.emailHash === selectedHash) : -1;
  const lastSelected = React.useRef<SubscriberRecord | null>(null);
  if (selectedRow) lastSelected.current = selectedRow;
  // The panel follows one render behind, so the row highlight paints first
  // and holding j never waits on the panel.
  const shown = React.useDeferredValue(wide ? selectedRow : null);
  const shownIndex = shown ? rows.findIndex((row) => row.emailHash === shown.emailHash) : -1;

  const limit = useRenderLimit(`${viewKey}|${query}`, rows.length, Math.max(Math.ceil(view.savedScrollTop / 36) + 30, index));
  const visible = limit >= rows.length ? rows : rows.slice(0, limit);

  /* Bulk selection. */
  const [checked, setChecked] = React.useState<ReadonlySet<string>>(new Set());
  const anchor = React.useRef<string | null>(null);
  React.useEffect(() => setChecked(new Set()), [filterId]);
  const checkedRows = React.useMemo(() => rows.filter((row) => checked.has(row.emailHash)), [rows, checked]);

  const [adding, setAdding] = React.useState(false);
  const addRef = React.useRef<HTMLInputElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  // Everything the stable callbacks need, read at call time.
  const latest = React.useRef({ rows, selectedHash, checked, wide, coarse, view, pending, filter, query, serverQuery, serverMode, local });
  latest.current = { rows, selectedHash, checked, wide, coarse, view, pending, filter, query, serverQuery, serverMode, local };

  const drawerPushed = React.useRef(false);
  React.useEffect(() => {
    if (!selectedHash) drawerPushed.current = false;
  }, [selectedHash]);

  const select = React.useCallback((hash: string | null) => {
    navigate(rowPath(hash), { replace: true });
  }, []);

  const openRow = React.useCallback((hash: string) => {
    // A phone's Back closes the drawer, so opening it adds an entry.
    if (!latest.current.wide && !latest.current.selectedHash) {
      drawerPushed.current = true;
      navigate(rowPath(hash));
      return;
    }
    navigate(rowPath(hash), { replace: true });
  }, []);

  const closeDetail = React.useCallback(() => {
    const hash = latest.current.selectedHash;
    if (drawerPushed.current) {
      drawerPushed.current = false;
      history.back();
    } else {
      navigate(rowPath(null), { replace: true });
    }
    if (hash) focusRow(hash);
  }, []);

  // Focus the open row once its list exists, so the keys work at once.
  const hasRows = rows.length > 0;
  React.useEffect(() => {
    const hash = latest.current.selectedHash;
    if (!hash || !hasRows) return;
    requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      const button = rowButton(hash);
      if (!button) return;
      button.focus({ preventScroll: true });
      button.closest('[data-row-id]')?.scrollIntoView({ block: 'nearest' });
    });
  }, [viewKey, hasRows]);

  const onCheck = React.useCallback((row: SubscriberRecord, value: boolean, range: boolean) => {
    setChecked((current) => {
      const next = new Set(current);
      const all = latest.current.rows;
      if (range && anchor.current) {
        const from = all.findIndex((entry) => entry.emailHash === anchor.current);
        const to = all.findIndex((entry) => entry.emailHash === row.emailHash);
        if (from >= 0 && to >= 0) {
          for (const entry of all.slice(Math.min(from, to), Math.max(from, to) + 1)) {
            if (value) next.add(entry.emailHash);
            else next.delete(entry.emailHash);
          }
          return next;
        }
      }
      if (value) next.add(row.emailHash);
      else next.delete(row.emailHash);
      return next;
    });
    anchor.current = row.emailHash;
  }, []);

  const onOpen = React.useCallback(
    (row: SubscriberRecord) => {
      // While selecting on a touch screen, a tap ticks, like Mail's edit mode.
      if (latest.current.coarse && latest.current.checked.size > 0) {
        onCheck(row, !latest.current.checked.has(row.emailHash), false);
        return;
      }
      openRow(row.emailHash);
    },
    [onCheck, openRow],
  );

  const onIntent = React.useCallback(
    (row: SubscriberRecord) => {
      // A failed warm-up is the pane's to report when it opens.
      client.query(detailOptions(row.emailHash)).catch(() => {});
    },
    [client],
  );

  const onUpdate = React.useCallback(
    (row: SubscriberRecord, patch: SubscriberPatch, label: string) => update([row], patch, { label }),
    [update],
  );

  const onDelete = React.useCallback((row: SubscriberRecord) => remove([row]), [remove]);

  /** The rows a key acts on: the ticked ones, else the open or focused one. */
  const targets = (): SubscriberRecord[] => {
    if (checkedRows.length > 0) return checkedRows;
    if (selectedRow) return [selectedRow];
    const focused = focusedRowId();
    const row = focused ? rows.find((entry) => entry.emailHash === focused) : null;
    return row ? [row] : [];
  };

  const unsubscribe = (list: readonly SubscriberRecord[]): void => {
    const eligible = list.filter((row) => row.status !== 'unsubscribed' && !pending.has(row.emailHash));
    if (eligible.length === 0) return;
    update(eligible, { status: 'unsubscribed' }, {
      label: eligible.length === 1 ? `Unsubscribed ${eligible[0].email}` : `Unsubscribed ${plural(eligible.length, 'subscriber')}`,
    });
    if (list === checkedRows) setChecked(new Set());
  };

  const setDelivery = (list: readonly SubscriberRecord[], mode: DeliveryMode): void => {
    const eligible = list.filter((row) => row.deliveryMode !== mode && !pending.has(row.emailHash));
    if (eligible.length === 0) return;
    update(eligible, { deliveryMode: mode }, {
      label: `${eligible.length === 1 ? eligible[0].email : plural(eligible.length, 'subscriber')} now ${eligible.length === 1 ? 'gets' : 'get'} ${DELIVERY_LABELS[mode].toLowerCase()}`,
    });
    if (list === checkedRows) setChecked(new Set());
  };

  const deleteRows = (list: readonly SubscriberRecord[]): void => {
    const eligible = list.filter((row) => !pending.has(row.emailHash));
    if (eligible.length === 0) return;
    remove(eligible);
    if (list === checkedRows) setChecked(new Set());
  };

  const move = (delta: number, opens = wide): void => {
    if (rows.length === 0) return;
    const focused = focusedRowId();
    const from = index >= 0 ? index : focused ? rows.findIndex((row) => row.emailHash === focused) : delta > 0 ? -1 : rows.length;
    const target = rows[Math.max(0, Math.min(rows.length - 1, from + delta))];
    if (opens || selectedRow) select(target.emailHash);
    focusRow(target.emailHash);
    const source = serverMode ? (filtered ? filterList : base) : null;
    if (source && from + delta >= rows.length - 8 && source.hasNextPage && !source.isFetchingNextPage) void source.fetchNextPage();
  };

  const openAdd = (): void => {
    setAdding(true);
    requestAnimationFrame(() => addRef.current?.focus());
  };

  const actionKeys = {
    u: () => unsubscribe(targets()),
    d: () => deleteRows(targets()),
    z: () => undoLast(),
  };

  useHotkeys({
    j: () => move(1),
    arrowdown: () => move(1),
    k: () => move(-1),
    arrowup: () => move(-1),
    ...actionKeys,
    x: () => {
      const hash = selectedHash ?? focusedRowId();
      const row = hash ? rows.find((entry) => entry.emailHash === hash) : null;
      if (row) onCheck(row, !checked.has(row.emailHash), false);
    },
    n: openAdd,
    '/': () => searchRef.current?.focus(),
    escape: () => {
      if (document.activeElement === searchRef.current) {
        searchRef.current?.blur();
        const first = selectedHash ?? rows[0]?.emailHash;
        if (first) focusRow(first);
      } else if (checked.size > 0) setChecked(new Set());
      else if (selectedHash) closeDetail();
    },
    ...Object.fromEntries(STATUS_FILTERS.map((status, i) => [String(i + 1), () => setStatusFilter(status)])),
  });

  // The drawer is a modal dialog, which the page's hotkeys stand back for;
  // it gets the same keys itself.
  const onDrawerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, select, textarea, [role=menu]')) return;
    const key = event.key.toLowerCase();
    const handler =
      key === 'j' || key === 'arrowdown' ? () => move(1, true)
      : key === 'k' || key === 'arrowup' ? () => move(-1, true)
      : key in actionKeys ? actionKeys[key as keyof typeof actionKeys]
      : null;
    if (!handler) return;
    event.preventDefault();
    handler();
  };

  /* Adding. The row is on screen before the request leaves. */
  const submitAdd = React.useCallback(
    async (raw: string, restore: (email: string, message: string) => void): Promise<string | null> => {
      const email = raw.trim().toLowerCase();
      if (!EMAIL.test(email)) return 'That is not an email address. Check it for typos.';
      const hash = await emailHash(email);
      if (findCached(client, hash)) {
        openRow(hash);
        toastManager.add({ title: `${email} is already on the list`, description: 'It is open beside the list.', timeout: 3000 });
        return null;
      }
      const request = create(email, hash);
      latest.current.view.prepend([hash]);
      request.then(
        () =>
          toastManager.add({
            type: 'success',
            title: `Added ${email}`,
            description: 'Active on Blog and Mood, each email as it happens.',
            timeout: 5000,
            actionProps: { children: 'Open', onClick: () => openRow(hash) },
          }),
        (error: unknown) => {
          const message = describeSubscriberError(error);
          restore(email, message);
          toastManager.add({ type: 'error', title: `${email} was not added`, description: message });
        },
      );
      return null;
    },
    [client, create, openRow],
  );

  /* Export: the current filter and search, every page of it. */
  const [exporting, setExporting] = React.useState(false);
  const exportCsv = async (): Promise<void> => {
    if (exporting) return;
    setExporting(true);
    let toastId: string | null = null;
    try {
      let list: SubscriberRecord[];
      if (!serverMode) {
        const all = await collectForExport(ALL, '', baseRows ?? [], base.hasNextPage ? (base.data?.pages.length ?? 0) * PAGE : null, () => {});
        list = all.filter((row) => matchesFilter(row, filter) && matchesQuery(row, query));
      } else {
        const source = serverQuery ? searchList : filtered ? filterList : base;
        const loaded = flatten(source.data) ?? [];
        const next = !source.data ? 0 : source.hasNextPage ? source.data.pages.length * PAGE : null;
        if (next !== null) {
          toastId = toastManager.add({ type: 'loading', title: 'Exporting', description: `${formatCount(loaded.length)} rows so far`, timeout: 0 });
        }
        list = await collectForExport(filter, serverQuery, loaded, next, (count) => {
          if (toastId) toastManager.update(toastId, { description: `${formatCount(count)} rows so far` });
        });
        if (query !== serverQuery) list = list.filter((row) => matchesQuery(row, query));
      }
      download(toCsv(list), csvFilename(filter, query));
      const done = { type: 'success' as const, title: `Exported ${plural(list.length, 'subscriber')}`, description: csvFilename(filter, query), timeout: 4000 };
      if (toastId) toastManager.update(toastId, done);
      else toastManager.add(done);
    } catch (error) {
      const failed = { type: 'error' as const, title: 'The export stopped', description: describeSubscriberError(error), timeout: 0 };
      if (toastId) toastManager.update(toastId, failed);
      else toastManager.add(failed);
    } finally {
      setExporting(false);
    }
  };

  /* Infinite scroll past LOCAL_CAP, with a button fallback. */
  const pager = serverMode ? (serverQuery.length >= 2 && query ? searchList : filtered ? filterList : base) : null;
  const sentinel = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const node = sentinel.current;
    if (!node || !pager?.hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !pager.isFetchingNextPage) void pager.fetchNextPage();
      },
      { root: view.scrollRef.current, rootMargin: '0px 0px 600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [pager?.hasNextPage, pager?.isFetchingNextPage, pager?.fetchNextPage, view.scrollRef]);

  /* Counts for the three controls. Computed exactly while the whole list
     is here; past the cap, only what site-api can count. */
  const facets = React.useMemo(() => (complete && baseRows ? countFacets(baseRows, filter) : null), [complete, baseRows, filter]);
  const summary = counts.data ?? base.data?.pages[0];
  const statusCounts = React.useMemo((): Counts<StatusFilter> => {
    if (facets) return facets.status;
    if (!summary || filter.delivery) return null;
    const scope = filter.channel ? summary.channelCounts?.[filter.channel] : summary;
    if (!scope) return null;
    return {
      all: scope.activeCount + scope.pendingCount + scope.unsubscribedCount,
      active: scope.activeCount,
      pending: scope.pendingCount,
      unsubscribed: scope.unsubscribedCount,
    };
  }, [facets, summary, filter]);
  const channelCounts = React.useMemo((): Counts<NotifyChannel> => {
    if (facets) return facets.channel;
    if (!summary?.channelCounts || filter.delivery) return null;
    const field = filter.status === 'all' ? 'total' : (`${filter.status}Count` as const);
    return Object.fromEntries(CHANNELS.map((channel) => [channel, summary.channelCounts![channel][field]]));
  }, [facets, summary, filter]);
  const deliveryCounts: Counts<DeliveryMode> = facets?.delivery ?? null;

  const firstLoad = !baseRows && base.isPending;
  const loadError = !baseRows && base.isError;
  const empty = Boolean(filterRows) && rows.length === 0;

  const rowList = visible.map((row) => (
    <SubscriberRow
      key={row.emailHash}
      row={row}
      layout={table ? 'table' : 'stack'}
      active={row.emailHash === selectedHash}
      checked={checked.has(row.emailHash)}
      deleting={pending.has(row.emailHash)}
      tabbable={row.emailHash === (selectedHash ?? rows[0]?.emailHash)}
      onOpen={onOpen}
      onCheck={onCheck}
      onIntent={onIntent}
    />
  ));

  const body = firstLoad ? (
    <LoadingRows table={table} />
  ) : loadError ? (
    <LoadError what="Subscribers" error={base.error} onRetry={() => void base.refetch()} />
  ) : empty ? (
    <EmptyLine filter={filter} query={query} none={total === 0} onAdd={openAdd} />
  ) : null;

  const loadingMore = local && base.hasNextPage;
  const footer = !body && (
    <div ref={sentinel} className="flex h-12 items-center justify-center text-muted-foreground text-xs tabular-nums">
      {loadingMore ? (
        `Loading ${formatCount(baseRows?.length ?? 0)} of ${formatCount(total ?? 0)}…`
      ) : pager?.hasNextPage ? (
        <Button size="sm" className={SMALL} variant="ghost" loading={pager.isFetchingNextPage} onClick={() => void pager.fetchNextPage()}>
          Load more
        </Button>
      ) : query ? (
        `${formatCount(rows.length)} of ${formatCount(viewRows.length)} match`
      ) : (
        `All ${plural(rows.length, 'subscriber')} shown`
      )}
    </div>
  );

  const allChecked = checkedRows.length > 0 && checkedRows.length === rows.length;

  // Stable, so the memoized toolbar skips the render that opening a row
  // (or `j`) causes; each calls the latest closure.
  const actions = React.useRef({ exportCsv, openAdd });
  actions.current = { exportCsv, openAdd };
  const [toolbarActions] = React.useState(() => ({
    leaveSearch: () => {
      const first = latest.current.selectedHash ?? latest.current.rows[0]?.emailHash;
      if (first) focusRow(first);
    },
    exportCsv: () => void actions.current.exportCsv(),
    openAdd: () => actions.current.openAdd(),
  }));

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <Toolbar
        table={table}
        wide={wide}
        filter={filter}
        statusCounts={statusCounts}
        channelCounts={channelCounts}
        deliveryCounts={deliveryCounts}
        queryText={queryText}
        matched={query ? rows.length : null}
        exporting={exporting}
        searchRef={searchRef}
        onQuery={setQueryText}
        onLeaveSearch={toolbarActions.leaveSearch}
        onExport={toolbarActions.exportCsv}
        onAdd={toolbarActions.openAdd}
      />

      {missing && (
        <p role="status" className="flex min-h-11 shrink-0 items-center gap-2 border-b px-4 text-[13px]">
          <span className="min-w-0 flex-1">That subscriber is not on the list. The link may be old, or the address was never subscribed.</span>
          <Button size="sm" className={SMALL} variant="outline" onClick={() => navigate(rowPath(null), { replace: true })}>
            Close
          </Button>
        </p>
      )}

      {adding && <AddRow inputRef={addRef} onSubmit={submitAdd} onClose={() => setAdding(false)} />}

      <div className="flex min-h-0 flex-1">
        <div className="@container/log relative flex min-w-0 flex-1 flex-col">
          <div
            ref={view.scrollRef}
            role={table ? 'table' : 'list'}
            aria-label="Subscribers"
            aria-busy={firstLoad || undefined}
            className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain pb-(--bulk-bar)', TABLE)}
          >
            {table && (
              <div role="rowgroup" className="sticky top-0 z-30 bg-background">
                <div role="row" className={cn(SUB_GRID, HEAD, 'items-center [&>*]:truncate [&>*]:px-3')}>
                  <div role="columnheader" className="flex items-center justify-center self-stretch">
                    <input
                      type="checkbox"
                      aria-label="Select every shown subscriber"
                      className={cn(TOUCH_TARGET, 'size-4 accent-[hsl(var(--portal-accent))]')}
                      checked={allChecked}
                      disabled={rows.length === 0}
                      ref={(node) => {
                        if (node) node.indeterminate = checkedRows.length > 0 && !allChecked;
                      }}
                      onChange={(event) => setChecked(event.target.checked ? new Set(rows.map((row) => row.emailHash)) : new Set())}
                    />
                  </div>
                  <div role="columnheader">Email</div>
                  <div role="columnheader">Status</div>
                  <div role="columnheader" className={MID}>Channels</div>
                  <div role="columnheader">Delivery</div>
                  <div role="columnheader" className={WIDE}>Joined</div>
                  <div role="columnheader">Last event</div>
                </div>
              </div>
            )}
            {table ? <div role="rowgroup">{body ?? rowList}</div> : body ?? rowList}
            {footer}
          </div>

          {view.fresh.length > 0 && (
            <div role="status" className="pointer-events-none absolute inset-x-0 top-11 z-40 flex justify-center">
              <Button
                size="sm"
                className={cn(SMALL, 'pointer-events-auto rounded-full shadow-md')}
                onClick={() => {
                  view.merge();
                  if (view.scrollRef.current) view.scrollRef.current.scrollTop = 0;
                }}
              >
                <ArrowUp />
                {view.fresh.length} new
              </Button>
            </div>
          )}

          {/* Clear of the home indicator; on a phone, of the tab bar, which takes the home indicator's space itself. */}
          {checkedRows.length > 0 && (
            <div
              ref={padUnderBulkBar}
              role="toolbar"
              aria-label="Bulk actions"
              className="absolute inset-x-3 bottom-[max(env(safe-area-inset-bottom),1rem)] max-md:bottom-[calc(var(--portal-tabbar-h,0px)+1rem)] z-40 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 text-sm shadow-lg"
            >
              <span className="me-1 tabular-nums">{formatCount(checkedRows.length)} selected</span>
              <Button size="sm" className={SMALL} variant="outline" onClick={() => unsubscribe(checkedRows)}>
                <UserMinus />
                Unsubscribe
                <Kbd className="pointer-coarse:hidden">U</Kbd>
              </Button>
              <Menu>
                <MenuTrigger render={<Button size="sm" className={SMALL} variant="outline" />}>
                  Delivery
                  <ChevronDown />
                </MenuTrigger>
                <MenuPopup align="center" side="top" className={TOUCH_MENU}>
                  <MenuRadioGroup value="" onValueChange={(value) => setDelivery(checkedRows, value as DeliveryMode)}>
                    {DELIVERY_MODES.map((mode) => (
                      <MenuRadioItem key={mode} value={mode}>{DELIVERY_LABELS[mode]}</MenuRadioItem>
                    ))}
                  </MenuRadioGroup>
                </MenuPopup>
              </Menu>
              <Button size="sm" className={SMALL} variant="destructive-outline" onClick={() => deleteRows(checkedRows)}>
                <Trash2 />
                Delete
                <Kbd className="pointer-coarse:hidden">D</Kbd>
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Clear selection (Esc)" onClick={() => setChecked(new Set())}>
                <X />
              </Button>
            </div>
          )}
        </div>

        {wide && shown && (
          <aside aria-label="Subscriber detail" className="flex w-[440px] shrink-0 flex-col border-s">
            <SubscriberDetail
              row={shown}
              variant="panel"
              position={shownIndex >= 0 ? { index: shownIndex, total: rows.length } : null}
              deleting={pending.has(shown.emailHash)}
              onPrev={index > 0 ? () => move(-1) : null}
              onNext={index < rows.length - 1 ? () => move(1) : null}
              onClose={closeDetail}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onBlogWelcome={blogWelcome}
            />
          </aside>
        )}
      </div>

      {!wide && (
        <Drawer open={Boolean(selectedRow)} onOpenChange={(open) => !open && closeDetail()} position="right">
          <DrawerPopup
            variant="straight"
            aria-label="Subscriber"
            className="w-full max-w-[440px] duration-150 data-ending-style:duration-150 motion-reduce:transition-none"
            portalProps={{ className: '[&_[data-slot=drawer-backdrop]]:duration-150! motion-reduce:[&_[data-slot=drawer-backdrop]]:transition-none' }}
            finalFocus={false}
            onKeyDown={onDrawerKeyDown}
          >
            {lastSelected.current && (
              <SubscriberDetail
                row={selectedRow ?? lastSelected.current}
                variant="drawer"
                position={index >= 0 ? { index, total: rows.length } : null}
                deleting={pending.has((selectedRow ?? lastSelected.current).emailHash)}
                onPrev={index > 0 ? () => move(-1, true) : null}
                onNext={index >= 0 && index < rows.length - 1 ? () => move(1, true) : null}
                onClose={closeDetail}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onBlogWelcome={blogWelcome}
              />
            )}
          </DrawerPopup>
        </Drawer>
      )}
    </div>
  );
}

function CountText({ value }: { value: number | undefined }) {
  return <span className="min-w-[2ch] text-start text-muted-foreground text-xs tabular-nums">{value === undefined ? '' : formatCount(value)}</span>;
}

/** Status tabs, then the channel and delivery pickers. From 1280px they
    all lead the header row, as on every list screen; below it they take a
    row of their own under the header. Memoized: `j` changes the URL and
    nothing here. */
const Toolbar = React.memo(function Toolbar({
  table,
  wide,
  filter,
  statusCounts,
  channelCounts,
  deliveryCounts,
  queryText,
  matched,
  exporting,
  searchRef,
  onQuery,
  onLeaveSearch,
  onExport,
  onAdd,
}: {
  table: boolean;
  wide: boolean;
  filter: Filter;
  statusCounts: Counts<StatusFilter>;
  channelCounts: Counts<NotifyChannel>;
  deliveryCounts: Counts<DeliveryMode>;
  queryText: string;
  matched: number | null;
  exporting: boolean;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onQuery: (value: string) => void;
  onLeaveSearch: () => void;
  onExport: () => void;
  onAdd: () => void;
}) {
  const statusControl = (
    <StateTabs
      label="Status"
      value={filter.status}
      onChange={setStatusFilter}
      options={STATUS_FILTERS.map((status) => ({
        value: status,
        label: STATUS_LABELS[status],
        count: statusCounts?.[status] ?? null,
      }))}
    />
  );

  const channelPicker = (
    <FacetMenu
      label="Channel"
      anyLabel="All channels"
      value={filter.channel}
      options={CHANNELS.map((channel) => ({ value: channel, label: CHANNEL_LABELS[channel] }))}
      counts={channelCounts}
      onChange={(value) => setSearch({ channel: value })}
    />
  );
  const deliveryPicker = (
    <FacetMenu
      label="Delivery"
      anyLabel="Any delivery"
      value={filter.delivery}
      options={DELIVERY_MODES.map((mode) => ({ value: mode, label: DELIVERY_LABELS[mode], short: DELIVERY_SHORT[mode] }))}
      counts={deliveryCounts}
      onChange={(value) => setSearch({ delivery: value })}
    />
  );

  const search = (
    // On touch screens the field fills the 44px group, so a tap anywhere on it lands.
    <InputGroup
      className={cn(
        'h-8 pointer-coarse:h-11 pointer-coarse:**:[input]:h-full',
        wide ? 'w-32 min-[1440px]:w-56 2xl:w-64' : table ? 'w-64 min-w-0' : 'min-w-0 flex-1',
      )}
    >
      <InputGroupAddon>
        <Search aria-hidden />
      </InputGroupAddon>
      <InputGroupInput
        ref={searchRef}
        type="search"
        aria-label="Search addresses"
        // Short: the field is 128px wide at 1280px, and a phone gives it less.
        placeholder="Search"
        autoComplete="off"
        spellCheck={false}
        value={queryText}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'ArrowDown') {
            event.preventDefault();
            event.currentTarget.blur();
            onLeaveSearch();
          }
        }}
      />
      {/* On wide screens the match count sits in the field, in place of the / hint. */}
      {wide && matched !== null ? (
        <InputGroupAddon align="inline-end">
          <span className="whitespace-nowrap text-muted-foreground text-xs tabular-nums" aria-live="polite" title={plural(matched, 'match', 'matches')}>
            {formatCount(matched)}
            <span className="max-[1439px]:sr-only"> {matched === 1 ? 'match' : 'matches'}</span>
          </span>
        </InputGroupAddon>
      ) : (
        <InputGroupAddon align="inline-end" className="pointer-coarse:hidden">
          <Kbd>/</Kbd>
        </InputGroupAddon>
      )}
    </InputGroup>
  );

  const scoped = Boolean(filter.channel || filter.delivery);
  // Everything shares the header row from 1280px, so below 96rem Export and
  // Clear keep only their icons there, and Add drops its key hint.
  const tight = wide ? 'max-2xl:sr-only' : undefined;
  const filters = (
    <>
      {statusControl}
      {channelPicker}
      {deliveryPicker}
      {scoped && (
        <Button
          size="sm"
          variant="ghost"
          className={cn(SMALL, 'shrink-0')}
          title="Clear channel and delivery"
          onClick={() => setSearch({ channel: null, delivery: null })}
        >
          <X />
          <span className={tight}>Clear</span>
        </Button>
      )}
    </>
  );

  const actions = (
    <>
      {search}
      {table ? (
        <>
          <Button size="sm" className={SMALL} variant="outline" title="Export CSV" loading={exporting} onClick={onExport}>
            <Download />
            <span className={tight}>Export CSV</span>
          </Button>
          <Button size="sm" className={SMALL} title="Add a subscriber (N)" onClick={onAdd} aria-keyshortcuts="N">
            <Plus />
            Add
            <Kbd className={cn('pointer-coarse:hidden', wide && 'max-2xl:hidden')}>N</Kbd>
          </Button>
        </>
      ) : (
        <>
          <Button size="icon-sm" variant="outline" aria-label="Export CSV" loading={exporting} onClick={onExport}>
            <Download />
          </Button>
          <Button size="icon-sm" aria-label="Add subscriber" onClick={onAdd}>
            <Plus />
          </Button>
        </>
      )}
    </>
  );

  return (
    <>
      <ScreenHeader title="Subscribers">
        {wide ? (
          <div className="ms-3 flex min-w-0 flex-1 items-center gap-2">
            {/* Scrolls sideways only when long picks outgrow the row near
                1280px; the padding keeps focus rings and touch areas unclipped. */}
            <div className="-mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {filters}
            </div>
            <div className="ms-auto flex shrink-0 items-center gap-2">{actions}</div>
          </div>
        ) : (
          <div className="ms-auto flex min-w-0 flex-1 items-center justify-end gap-2">{actions}</div>
        )}
      </ScreenHeader>
      {!wide && (
        <div className={cn('flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b ps-4 [scrollbar-width:none] pointer-coarse:h-13 [&::-webkit-scrollbar]:hidden', EDGE_FADE)}>
          {filters}
          {matched !== null && (
            <span className="ms-auto shrink-0 ps-2 text-muted-foreground text-xs tabular-nums" aria-live="polite">
              {plural(matched, 'match', 'matches')}
            </span>
          )}
        </div>
      )}
    </>
  );
});

/** A picker that names its facet ("Channel") until something is picked,
    then the pick, short where one is given ("Every 5h"). */
function FacetMenu<T extends string>({ label, anyLabel, value, options, counts, onChange }: {
  label: string;
  anyLabel: string;
  value: T | null;
  options: Array<{ value: T; label: string; short?: string }>;
  counts: Counts<T>;
  onChange: (value: T | null) => void;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant={current ? 'outline' : 'ghost'}
            aria-label={`${label}: ${current?.label ?? anyLabel}`}
            className={cn(SMALL, 'shrink-0 font-normal', current ? 'text-foreground' : 'text-muted-foreground')}
          />
        }
      >
        {current ? (current.short ?? current.label) : label}
        <ChevronDown className="size-3.5" />
      </MenuTrigger>
      <MenuPopup align="start" className={cn('min-w-52', TOUCH_MENU)}>
        <MenuRadioGroup value={value ?? ''} onValueChange={(next) => onChange(((next as string) || null) as T | null)}>
          <MenuRadioItem value="">
            <span className="flex w-full items-center gap-4">
              <span className="flex-1">{anyLabel}</span>
              <CountText value={counts?.all} />
            </span>
          </MenuRadioItem>
          {options.map((option) => (
            <MenuRadioItem key={option.value} value={option.value}>
              <span className="flex w-full items-center gap-4">
                <span className="flex-1">{option.label}</span>
                <CountText value={counts?.[option.value]} />
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

function AddRow({ inputRef, onSubmit, onClose }: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (email: string, restore: (email: string, message: string) => void) => Promise<string | null>;
  onClose: () => void;
}) {
  const [text, setText] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const restore = React.useCallback((email: string, message: string) => {
    setText((current) => current || email);
    setError(message);
  }, []);

  return (
    <form
      aria-label="Add a subscriber"
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b bg-[hsl(var(--portal-accent)/0.06)] px-4 py-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        const value = text;
        if (!value.trim()) return;
        setError(null);
        setText('');
        void onSubmit(value, restore).then((message) => {
          if (!message) return;
          setText((current) => current || value);
          setError(message);
        });
      }}
    >
      <Input
        ref={inputRef}
        type="email"
        inputMode="email"
        autoComplete="off"
        spellCheck={false}
        aria-label="Email address"
        aria-invalid={error ? true : undefined}
        aria-describedby="add-hint"
        placeholder="name@example.com"
        className="min-w-0 flex-1 basis-56 font-mono"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      />
      <Button type="submit" size="sm" className={SMALL}>
        Add
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Close (Esc)" onClick={onClose}>
        <X />
      </Button>
      <p id="add-hint" className={cn('w-full text-xs', error ? 'text-[hsl(var(--portal-danger))]' : 'text-muted-foreground')}>
        {error ?? 'Enter adds the address as active on Blog and Mood, each email as it happens. Change it in the panel after.'}
      </p>
    </form>
  );
}

function LoadingRows({ table }: { table: boolean }) {
  return (
    <div aria-hidden>
      {Array.from({ length: table ? 18 : 10 }, (_, i) =>
        table ? (
          <div key={i} className={cn('flex items-center gap-6 ps-12 pe-3', LINE, SPACED)}>
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="ms-auto h-3 w-32" />
          </div>
        ) : (
          <div key={i} className={cn('flex h-16 flex-col justify-center gap-2 ps-11 pe-3', SPACED)}>
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-full" />
          </div>
        ),
      )}
    </div>
  );
}

function EmptyLine({ filter, query, none, onAdd }: { filter: Filter; query: string; none: boolean; onAdd: () => void }) {
  let text: string;
  let action: React.ReactNode = null;
  if (none) {
    text = 'No subscribers yet. People join from the form under every post, or add one here.';
    action = (
      <Button size="sm" className={SMALL} variant="outline" onClick={onAdd}>
        <Plus />
        Add subscriber
      </Button>
    );
  } else if (query) {
    text = `No address contains “${query}” here.`;
    action = (
      <Button size="sm" className={SMALL} variant="outline" onClick={() => setSearch({ q: null })}>
        Clear search
      </Button>
    );
  } else {
    const parts = [
      filter.status === 'all' ? null : STATUS_LABELS[filter.status].toLowerCase(),
    ].filter(Boolean);
    text = `No ${parts.join(' ')}${parts.length ? ' ' : ''}subscribers${filter.channel ? ` on ${CHANNEL_LABELS[filter.channel]}` : ''}${filter.delivery ? ` with ${DELIVERY_LABELS[filter.delivery].toLowerCase()}` : ''}.`;
    action = (
      <Button size="sm" className={SMALL} variant="outline" onClick={() => setSearch({ status: null, channel: null, delivery: null })}>
        Show all
      </Button>
    );
  }
  return (
    <p className="flex min-h-12 flex-wrap items-center gap-3 px-4 py-2 text-[13px] text-muted-foreground">
      {text}
      {action}
    </p>
  );
}
