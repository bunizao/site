import * as React from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { BroadcastRecord } from '@bunizao/contracts';
import { ArrowUp, Plus } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { Drawer, DrawerPopup } from '@/components/coss/drawer';
import { Kbd } from '@/components/coss/kbd';
import { Skeleton } from '@/components/coss/skeleton';
import { toastManager } from '@/components/coss/toast';
import { useMediaQuery } from '@/components/coss/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { HEAD, LINE, SMALL, SPACED, TABLE } from '../activity/table';
import { useHotkeys } from '../app/hotkeys';
import { navigate, useLocation } from '../app/router';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { forgetUndo, registerUndo } from '../app/undo';
import { plural } from '../moderation/format';
import { LoadError } from '../moderation/ui';
import {
  describeBroadcastError,
  flattenHistory,
  prefetchBroadcastHistory,
  useBroadcastDetail,
  useBroadcastHistory,
  useBroadcastProgress,
  withProgress,
} from './broadcast-data';
import { isBlank, loadDraft, saveDraft, type Draft } from './broadcast-model';
import { BroadcastComposer } from './BroadcastComposer';
import { BroadcastDetail } from './BroadcastPane';
import { BC_COLUMNS, BC_GRID, BC_MID, BC_WIDE, BroadcastRow } from './BroadcastRow';
import { CHANNELS } from './model';
import { useStableView } from './stable-view';

/* Broadcasts: every manual email, newest first, with a running send's
   progress live in its row. The path holds what is open: `/broadcasts/<id>`
   for a detail, `/broadcasts/new` for the composer, so Back, reload and a
   link from Home all land on the same view. */

const PATH = /^\/broadcasts\/([^/]+)$/;

function rowPath(id: string | null): string {
  return `/broadcasts${id ? `/${encodeURIComponent(id)}` : ''}`;
}

function rowButton(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"] [data-row-button]`);
}

function focusedRowId(): string | null {
  const active = document.activeElement;
  return active instanceof HTMLElement ? active.closest('[data-row-id]')?.getAttribute('data-row-id') ?? null : null;
}

function focusRow(id: string): void {
  requestAnimationFrame(() => {
    const button = rowButton(id);
    if (!button) return;
    button.focus({ preventScroll: true });
    button.closest('[data-row-id]')?.scrollIntoView({ block: 'nearest' });
  });
}

/** The history the screen draws first (see app/lazy-screen.ts). */
export function prefetch(client: QueryClient): Promise<unknown> | undefined {
  return prefetchBroadcastHistory(client);
}

export default function BroadcastsScreen() {
  const location = useLocation();
  const table = useMediaQuery('(min-width: 768px)');
  const wide = useMediaQuery('(min-width: 1280px)');

  const match = PATH.exec(location.path);
  const segment = match ? decodeURIComponent(match[1]) : null;
  const composing = segment === 'new';
  const selectedId = composing ? null : segment;

  /* Data. Rows keep their place; a send started elsewhere waits behind a
     pill, and progress is laid over the row it belongs to. */
  const list = useBroadcastHistory();
  const stored = React.useMemo(() => flattenHistory(list.data), [list.data]);
  const byId = React.useMemo(() => new Map((stored ?? []).map((row) => [row.id, row])), [stored]);
  const loadedIds = React.useMemo(() => stored?.map((row) => row.id), [stored]);
  const view = useStableView(list.isPlaceholderData ? 'broadcasts|placeholder' : 'broadcasts', loadedIds);

  const deepLink = useBroadcastDetail(selectedId && stored && !list.isPlaceholderData && !byId.has(selectedId) ? selectedId : null);

  const sendingIds = React.useMemo(() => {
    const ids = (stored ?? []).filter((row) => row.status === 'sending').map((row) => row.id);
    if (deepLink.data?.status === 'sending' && !ids.includes(deepLink.data.id)) ids.push(deepLink.data.id);
    return ids;
  }, [stored, deepLink.data]);
  const progress = useBroadcastProgress(sendingIds);

  const rows = React.useMemo(
    () => view.ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [withProgress(row, progress.get(id))] : [];
    }),
    [view.ids, byId, progress],
  );

  /* Selection. */
  const index = selectedId ? rows.findIndex((row) => row.id === selectedId) : -1;
  const selectedRow = index >= 0 ? rows[index] : selectedId && deepLink.data ? withProgress(deepLink.data, progress.get(selectedId)) : null;
  const missing = Boolean(selectedId && !selectedRow && deepLink.isError);
  const lastSelected = React.useRef<BroadcastRecord | null>(null);
  if (selectedRow) lastSelected.current = selectedRow;
  // The panel follows one render behind, so the row highlight paints first.
  const shown = React.useDeferredValue(wide ? selectedRow : null);
  const shownIndex = shown ? rows.findIndex((row) => row.id === shown.id) : -1;

  const latest = React.useRef({ rows, selectedId, wide });
  latest.current = { rows, selectedId, wide };

  // True while the open detail or composer sits on a history entry of its
  // own, so closing it goes Back instead of adding another.
  const pushed = React.useRef(false);
  React.useEffect(() => {
    if (!segment) pushed.current = false;
  }, [segment]);

  const select = React.useCallback((id: string) => navigate(rowPath(id), { replace: true }), []);

  const openRow = React.useCallback((row: BroadcastRecord) => {
    // A phone's Back closes the drawer, so opening it adds an entry.
    if (!latest.current.wide && !latest.current.selectedId) {
      pushed.current = true;
      navigate(rowPath(row.id));
      return;
    }
    navigate(rowPath(row.id), { replace: true });
  }, []);

  const close = React.useCallback(() => {
    const id = latest.current.selectedId;
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      navigate(rowPath(null), { replace: true });
    }
    if (id) focusRow(id);
  }, []);

  const openComposer = React.useCallback(() => {
    pushed.current = true;
    navigate(rowPath('new'));
  }, []);

  const onSent = React.useCallback(
    (row: BroadcastRecord) => {
      view.prepend([row.id]);
      if (view.scrollRef.current) view.scrollRef.current.scrollTop = 0;
      // The composer's entry becomes the new broadcast's, so Back from it
      // still returns to where the composer was opened.
      navigate(rowPath(row.id), { replace: true });
    },
    [view],
  );

  const duplicate = React.useCallback(
    (row: BroadcastRecord) => {
      const before = loadDraft();
      const next: Draft = {
        subject: row.subject,
        body: row.bodyText ?? '',
        status: row.audience.status === 'pending' ? 'pending' : 'active',
        channels: CHANNELS.filter((channel) => row.audience.channels.includes(channel)),
        key: null,
      };
      saveDraft(next);
      openComposer();
      if (isBlank(before) || (before.subject === next.subject && before.body === next.body)) return;
      const id: string = toastManager.add({
        title: 'Your earlier draft was replaced',
        description: 'Undo brings it back into the composer.',
        timeout: 6000,
        actionProps: {
          children: 'Undo',
          onClick: () => {
            forgetUndo(id);
            saveDraft(before);
          },
        },
        onRemove: (): void => forgetUndo(id),
      });
      registerUndo(id, () => saveDraft(before));
    },
    [openComposer],
  );

  // Focus the open row once the list exists, so the keys work at once.
  const hasRows = rows.length > 0;
  React.useEffect(() => {
    const id = latest.current.selectedId;
    if (!id || !hasRows) return;
    requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      const button = rowButton(id);
      if (!button) return;
      button.focus({ preventScroll: true });
      button.closest('[data-row-id]')?.scrollIntoView({ block: 'nearest' });
    });
  }, [hasRows]);

  const move = (delta: number, opens = wide): void => {
    if (rows.length === 0) return;
    const focused = focusedRowId();
    const from = index >= 0 ? index : focused ? rows.findIndex((row) => row.id === focused) : delta > 0 ? -1 : rows.length;
    const target = rows[Math.max(0, Math.min(rows.length - 1, from + delta))];
    if (opens || selectedRow) select(target.id);
    focusRow(target.id);
    if (from + delta >= rows.length - 5 && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  };

  const target = (): BroadcastRecord | null => {
    if (selectedRow) return selectedRow;
    const focused = focusedRowId();
    return focused ? rows.find((row) => row.id === focused) ?? null : null;
  };

  useHotkeys({
    j: () => move(1),
    arrowdown: () => move(1),
    k: () => move(-1),
    arrowup: () => move(-1),
    n: openComposer,
    c: () => {
      const row = target();
      if (row) duplicate(row);
    },
    escape: () => {
      if (selectedId) close();
    },
  });

  // The drawer is a modal dialog, which the page's hotkeys stand back for;
  // it gets the same keys itself.
  const onDrawerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if ((event.target as HTMLElement).closest('input, select, textarea, [role=menu]')) return;
    const key = event.key.toLowerCase();
    const handler =
      key === 'j' || key === 'arrowdown' ? () => move(1, true)
      : key === 'k' || key === 'arrowup' ? () => move(-1, true)
      : key === 'c' && selectedRow ? () => duplicate(selectedRow)
      : null;
    if (!handler) return;
    event.preventDefault();
    handler();
  };

  /* Older pages as the end of the list comes near. */
  const sentinel = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const node = sentinel.current;
    if (!node || !list.hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !list.isFetchingNextPage) void list.fetchNextPage();
      },
      { root: view.scrollRef.current, rootMargin: '0px 0px 400px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [list.hasNextPage, list.isFetchingNextPage, list.fetchNextPage, view.scrollRef]);

  const firstLoad = !stored && list.isPending;
  const loadError = !stored && list.isError;
  const empty = Boolean(stored) && rows.length === 0;

  const body = firstLoad ? (
    <LoadingRows table={table} />
  ) : loadError ? (
    <LoadError what="Broadcasts" error={list.error} onRetry={() => void list.refetch()} />
  ) : empty ? (
    <p className="flex min-h-12 flex-wrap items-center gap-3 px-4 py-2 text-[13px] text-muted-foreground">
      No broadcasts yet. A broadcast emails everyone on the channels you pick, once.
      <Button size="sm" className={SMALL} variant="outline" onClick={openComposer}>
        <Plus />
        New broadcast
      </Button>
    </p>
  ) : null;

  const rowList = rows.map((row) => (
    <BroadcastRow
      key={row.id}
      row={row}
      layout={table ? 'table' : 'stack'}
      active={row.id === selectedId}
      tabbable={row.id === (selectedId ?? rows[0]?.id)}
      onOpen={openRow}
    />
  ));

  const footer = !body && (
    <div ref={sentinel} className="flex h-12 items-center justify-center text-muted-foreground text-xs tabular-nums">
      {list.hasNextPage ? (
        <Button size="sm" className={SMALL} variant="ghost" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          Load older
        </Button>
      ) : list.isFetchNextPageError ? (
        <span>
          Older broadcasts did not load. {describeBroadcastError(list.error)}{' '}
          <button type="button" className="text-foreground underline underline-offset-2" onClick={() => void list.fetchNextPage()}>
            Try again
          </button>
        </span>
      ) : (
        `All ${plural(rows.length, 'broadcast')} shown`
      )}
    </div>
  );

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <ScreenHeader title="Broadcasts">
        <div className="ms-auto flex items-center gap-2">
          <Button size="sm" onClick={openComposer} aria-keyshortcuts="N" className={SMALL}>
            <Plus />
            New broadcast
            <Kbd className="pointer-coarse:hidden">N</Kbd>
          </Button>
        </div>
      </ScreenHeader>

      {missing && (
        <p role="status" className="flex min-h-11 shrink-0 items-center gap-2 border-b px-4 text-[13px]">
          <span className="min-w-0 flex-1">
            {describeBroadcastError(deepLink.error)}
          </span>
          <Button size="sm" className={SMALL} variant="outline" onClick={() => navigate(rowPath(null), { replace: true })}>
            Close
          </Button>
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="@container/log relative flex min-w-0 flex-1 flex-col">
          <div
            ref={view.scrollRef}
            role={table ? 'table' : 'list'}
            aria-label="Broadcasts"
            aria-busy={firstLoad || undefined}
            className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', BC_COLUMNS, TABLE)}
          >
            {table && (
              <div role="rowgroup" className="sticky top-0 z-30 bg-background">
                <div role="row" className={cn(BC_GRID, HEAD, 'items-center [&>*]:truncate [&>*]:px-3')}>
                  <div role="columnheader">Subject</div>
                  <div role="columnheader">Status</div>
                  <div role="columnheader" className={BC_MID}>Audience</div>
                  <div role="columnheader" className={cn('text-end', BC_WIDE)}>Recipients</div>
                  <div role="columnheader">Sent</div>
                  <div role="columnheader" className={cn('text-end', BC_MID)}>Failed</div>
                  <div role="columnheader">Started</div>
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
        </div>

        {wide && shown && (
          <aside aria-label="Broadcast detail" className="flex w-[440px] shrink-0 flex-col border-s">
            <BroadcastDetail
              row={shown}
              variant="panel"
              position={shownIndex >= 0 ? { index: shownIndex, total: rows.length } : null}
              onPrev={index > 0 ? () => move(-1) : null}
              onNext={index >= 0 && index < rows.length - 1 ? () => move(1) : null}
              onClose={close}
              onDuplicate={duplicate}
            />
          </aside>
        )}
      </div>

      {!wide && (
        <Drawer open={Boolean(selectedRow)} onOpenChange={(open) => !open && close()} position="right">
          <DrawerPopup
            variant="straight"
            aria-label="Broadcast"
            className="w-full max-w-[440px] duration-150 data-ending-style:duration-150 motion-reduce:transition-none"
            portalProps={{ className: '[&_[data-slot=drawer-backdrop]]:duration-150! motion-reduce:[&_[data-slot=drawer-backdrop]]:transition-none' }}
            finalFocus={false}
            onKeyDown={onDrawerKeyDown}
          >
            {lastSelected.current && (
              <BroadcastDetail
                row={selectedRow ?? lastSelected.current}
                variant="drawer"
                position={index >= 0 ? { index, total: rows.length } : null}
                onPrev={index > 0 ? () => move(-1, true) : null}
                onNext={index >= 0 && index < rows.length - 1 ? () => move(1, true) : null}
                onClose={close}
                onDuplicate={duplicate}
              />
            )}
          </DrawerPopup>
        </Drawer>
      )}

      <BroadcastComposer open={composing} onClose={close} onSent={onSent} />
    </div>
  );
}

function LoadingRows({ table }: { table: boolean }) {
  return (
    <div aria-hidden>
      {Array.from({ length: table ? 12 : 8 }, (_, i) =>
        table ? (
          <div key={i} className={cn('flex items-center gap-6 px-3', LINE, SPACED)}>
            <Skeleton className="h-3 w-72" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="ms-auto h-3 w-28" />
          </div>
        ) : (
          <div key={i} className={cn('flex h-16 flex-col justify-center gap-2 px-3', SPACED)}>
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-3 w-full" />
          </div>
        ),
      )}
    </div>
  );
}
