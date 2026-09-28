import * as React from 'react';
import { flushSync } from 'react-dom';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AdminOwnerMessage, AdminOwnerMessageAction, MessageState } from '@bunizao/contracts';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { Drawer, DrawerPopup } from '@/components/coss/drawer';
import { Skeleton } from '@/components/coss/skeleton';
import { toastManager } from '@/components/coss/toast';
import { useMediaQuery } from '@/components/coss/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { HEAD, LINE, SMALL, SPACED, TABLE } from '../activity/table';
import { ApiError, MISSING_ROUTE_MESSAGE, describeError, isMissingRoute } from '../app/api';
import { useHotkeys } from '../app/hotkeys';
import { lazyPart } from '../app/lazy-screen';
import { mergeHistoryState, navigate, readHistoryState, useLocation } from '../app/router';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { undoLast } from '../app/undo';
import { useStableView } from '../audience/stable-view';
import type { BanTarget } from '../comments/BanDialog';
import { plural } from '../moderation/format';
import { LoadError, StateTabs } from '../moderation/ui';
import {
  MESSAGE_VIEWS,
  flattenMessages,
  inView,
  nextState,
  prefetchMessageDetail,
  prefetchMessageList,
  useMessageAction,
  useMessageDetail,
  useMessageList,
  usePrefetchTrays,
  type MessageView,
} from './data';
import { MessageDetail } from './MessagePane';
import { MSG_COLUMNS, MSG_GRID, MSG_MID, MessageRow } from './MessageRow';

/* A key away and not part of the first paint: it loads with the idle
   screens (app/lazy-screen.ts), so by the first B it has usually arrived. */
const BanDialog = lazyPart(() => import('../comments/BanDialog').then((module) => module.BanDialog));

/* Messages sent to the owner through the site, newest first, in three
   trays: Inbox, Archived, Spam. The query holds the tray (`?view=spam`)
   and the open message (`?m=<id>`), so Back, reload and a link all land
   on the same view. Opening a new message marks it read; E and ! file it
   and move to the next one. B bans its sender and files it as spam. */

/** Older forms of a message link: `/messages/<id>` and `#<id>`. */
const LEGACY_PATH = /^\/messages\/([^/]+)$/;
const HASH_ID = /^[\w-]+$/;

const VIEW_LABELS: Record<MessageView, string> = { inbox: 'Inbox', archived: 'Archived', spam: 'Spam' };

function readView(search: URLSearchParams): MessageView {
  const view = search.get('view');
  return view === 'archived' || view === 'spam' ? view : 'inbox';
}

function trayOf(state: MessageState): MessageView {
  return state === 'archived' || state === 'spam' ? state : 'inbox';
}

function messagePath(id: string | null, view: MessageView): string {
  const params = new URLSearchParams();
  if (view !== 'inbox') params.set('view', view);
  if (id) params.set('m', id);
  const query = params.toString();
  return query ? `/messages?${query}` : '/messages';
}

function rowButton(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"] [data-row-button]`);
}

/* The row focus is on its way to, so a key inside focusRow's frame means
   that row (see comments/CommentsScreen.tsx). */
let focusTarget: string | null = null;

function focusedRowId(): string | null {
  if (focusTarget) return focusTarget;
  const active = document.activeElement;
  return active instanceof HTMLElement ? active.closest('[data-row-id]')?.getAttribute('data-row-id') ?? null : null;
}

function focusRow(id: string): void {
  focusTarget = id;
  requestAnimationFrame(() => {
    if (focusTarget === id) focusTarget = null;
    const button = rowButton(id);
    if (!button) return;
    button.focus({ preventScroll: true });
    button.closest('[data-row-id]')?.scrollIntoView({ block: 'nearest' });
  });
}

/** The act E (file) or ! (spam) means for a message where it is now. */
function actionFor(message: AdminOwnerMessage, key: 'file' | 'spam'): AdminOwnerMessageAction {
  if (key === 'file') return message.state === 'archived' ? 'unarchive' : 'archive';
  return message.state === 'spam' ? 'unspam' : 'spam';
}

/** The tray the screen draws first (see app/lazy-screen.ts). */
export function prefetch(client: QueryClient, search: URLSearchParams): Promise<unknown> {
  return prefetchMessageList(client, readView(search));
}

export default function MessagesScreen() {
  const location = useLocation();
  const client = useQueryClient();
  const table = useMediaQuery('(min-width: 768px)');
  const wide = useMediaQuery('(min-width: 1280px)');

  const view = readView(location.search);
  const selectedId = location.search.get('m');

  /* Data. Each tray reads its own list, and warms the other two once idle.
     Rows keep their place while you work: a filed message leaves, and comes
     back where it was on Undo. */
  const list = useMessageList(view);
  usePrefetchTrays(view, list.isSuccess);
  const stored = React.useMemo(() => flattenMessages(list.data), [list.data]);
  const byId = React.useMemo(() => new Map((stored ?? []).map((message) => [message.id, message])), [stored]);
  const loadedIds = React.useMemo(
    () => stored?.filter((message) => inView(view, message.state)).map((message) => message.id),
    [stored, view],
  );
  const stable = useStableView(`messages|${view}`, loadedIds);
  const rows = React.useMemo(
    () => stable.ids.flatMap((id) => {
      const message = byId.get(id);
      return message && inView(view, message.state) ? [message] : [];
    }),
    [stable.ids, byId, view],
  );
  // Every tray's page carries the whole inbox's counts; a tray still
  // loading keeps the last ones, so the tabs never blank.
  const lastCounts = React.useRef<Record<MessageState, number> | undefined>(undefined);
  const counts = list.data?.pages[0]?.counts ?? lastCounts.current;
  lastCounts.current = counts;

  /* Selection. A message opened from another tray's history is not in
     these rows; it shows from what was clicked until its detail lands. */
  const detail = useMessageDetail(selectedId);
  const picked = React.useRef<AdminOwnerMessage | null>(null);
  const index = selectedId ? rows.findIndex((message) => message.id === selectedId) : -1;
  const selected: AdminOwnerMessage | null =
    index >= 0 ? rows[index]
    : !selectedId ? null
    : byId.get(selectedId) ?? (detail.data?.message.id === selectedId ? detail.data.message : null) ?? (picked.current?.id === selectedId ? picked.current : null);
  const missing = Boolean(selectedId && !selected && detail.isError);
  const lastSelected = React.useRef<AdminOwnerMessage | null>(null);
  if (selected) lastSelected.current = selected;
  // The panel follows one render behind, so the row highlight paints first.
  const shown = React.useDeferredValue(wide ? selected : null);
  const shownIndex = shown ? rows.findIndex((message) => message.id === shown.id) : -1;

  const latest = React.useRef({ rows, selectedId, wide, view, stable });
  latest.current = { rows, selectedId, wide, view, stable };

  /* A link names a message, not its tray (Telegram's is `?m=<id>`): it
     lands in the tray that holds the message, once this tray's rows or the
     message's own detail say which. The older forms become `?m=` first. */
  const legacy = LEGACY_PATH.exec(location.path);
  const linked = legacy ? decodeURIComponent(legacy[1]) : HASH_ID.test(location.hash) ? location.hash : null;
  const [arrival, setArrival] = React.useState<string | null>(() => selectedId ?? linked);
  React.useLayoutEffect(() => {
    if (!linked) return;
    setArrival(linked);
    navigate(messagePath(linked, view), { replace: true });
  }, [linked, view]);

  React.useEffect(() => {
    if (!arrival || !selectedId) return;
    if (selectedId !== arrival) {
      setArrival(null);
      return;
    }
    const found = byId.get(arrival) ?? (detail.data?.message.id === arrival ? detail.data.message : null);
    if (found) {
      setArrival(null);
      if (trayOf(found.state) !== view) navigate(messagePath(arrival, trayOf(found.state)), { replace: true });
    } else if (detail.isError) {
      setArrival(null);
    }
  }, [arrival, selectedId, byId, detail.data, detail.isError, view]);

  /* Selection. On a wide screen it only replaces the URL; on a narrow one,
     opening the drawer pushes an entry so the phone's Back closes it, and
     marks it, so its X goes Back too (see comments/CommentsScreen.tsx). */
  const select = React.useCallback((id: string | null) => {
    navigate(messagePath(id, latest.current.view), { replace: true });
  }, []);

  const openRow = React.useCallback((message: AdminOwnerMessage) => {
    const { wide: isWide, selectedId: open, view: tray } = latest.current;
    if (!isWide && !open) {
      navigate(messagePath(message.id, tray));
      mergeHistoryState({ drawer: true });
      return;
    }
    navigate(messagePath(message.id, tray), { replace: true });
  }, []);

  const close = React.useCallback(() => {
    const id = latest.current.selectedId;
    if (readHistoryState().drawer === true) window.history.back();
    else navigate(messagePath(null, latest.current.view), { replace: true });
    if (id) focusRow(id);
  }, []);

  const openFromHistory = React.useCallback((message: AdminOwnerMessage) => {
    picked.current = message;
    navigate(messagePath(message.id, latest.current.view), { replace: true });
  }, []);

  const onIntent = React.useCallback((id: string) => prefetchMessageDetail(client, id), [client]);

  const act = useMessageAction();

  /* Opening a new message reads it, quietly and at once: the row loses its
     weight and the unread count drops in the same frame; a failure puts it
     back without a word. */
  const readSent = React.useRef<string | null>(null);
  const unreadOpen = selected?.state === 'new' ? selected : null;
  React.useEffect(() => {
    if (!unreadOpen || readSent.current === unreadOpen.id) return;
    readSent.current = unreadOpen.id;
    void act(unreadOpen, 'read', { quiet: true });
  }, [unreadOpen, act]);

  /** E or !: the message changes tray, so it leaves these rows, and the
      selection and focus move to the next row with it. */
  const file = React.useCallback(
    (message: AdminOwnerMessage, key: 'file' | 'spam', options?: { quiet?: boolean; after?: Promise<unknown> }): Promise<boolean> => {
      const action = actionFor(message, key);
      const state = nextState(message, action);
      if (!state) return Promise.resolve(false);
      const { rows: current, selectedId: open, view: tray } = latest.current;
      const at = current.findIndex((row) => row.id === message.id);
      const leaves = at >= 0 && !inView(tray, state);
      const wasOpen = open === message.id;
      const next = leaves && (wasOpen || focusedRowId() === message.id) ? current[at + 1] ?? current[at - 1] ?? null : null;
      const done = act(message, action, options);
      if (wasOpen && leaves) {
        if (next) select(next.id);
        else close();
      }
      if (next) focusRow(next.id);
      return done;
    },
    [act, select, close],
  );

  /* B: the sender's keys, in the comment ban dialog. Only the detail
     carries them, so B bans the open message's sender; a site-api that
     does not record senders has nothing to ban by, and says so. */
  const [ban, setBan] = React.useState<BanTarget | null>(null);
  const [banOpen, setBanOpen] = React.useState(false);
  const openBan = React.useCallback(
    (message: AdminOwnerMessage) => {
      const loaded = detail.data?.message.id === message.id ? detail.data : null;
      if (!loaded?.actor) {
        toastManager.add(loaded
          ? { type: 'info', title: 'Nothing to ban this sender by', description: 'This site-api does not record who sent a message yet.' }
          : { type: 'info', title: 'Still loading the sender', description: 'Press B again in a moment.' });
        return;
      }
      const target: BanTarget = { kind: 'actor', actor: loaded.actor, messageId: message.id };
      BanDialog.preload().then(
        () => {
          // Mounted closed first: a dialog mounted open skips its enter transition.
          flushSync(() => setBan(target));
          setBanOpen(true);
        },
        () => toastManager.add({ type: 'error', title: 'That did not load', description: 'Check the connection, then press B again.' }),
      );
    },
    [detail.data],
  );

  /** The ban files its message as spam: it leaves the tray as ! takes it,
      its request waits for the ban, and an undo takes it back out. */
  const banFiles = React.useCallback(
    (id: string, banned: Promise<unknown>): (() => void) => {
      const message = latest.current.rows.find((row) => row.id === id) ?? (detail.data?.message.id === id ? detail.data.message : null);
      // Banned from the Spam tray: the message is already where it goes.
      if (!message || message.state === 'spam') return () => {};
      const filed = file(message, 'spam', { quiet: true, after: banned });
      return () => {
        // Once the filing lands, or the unspam could overtake it.
        void filed.then((ok) => ok && act({ ...message, state: 'spam' }, 'unspam', { quiet: true }));
      };
    },
    [file, act, detail.data],
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
    const from = index >= 0 ? index : focused ? rows.findIndex((message) => message.id === focused) : delta > 0 ? -1 : rows.length;
    const target = rows[Math.max(0, Math.min(rows.length - 1, from + delta))];
    if (opens || selected) select(target.id);
    focusRow(target.id);
    if (from + delta >= rows.length - 8 && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  };

  const target = (): AdminOwnerMessage | null => {
    if (selected) return selected;
    const focused = focusedRowId();
    return focused ? rows.find((message) => message.id === focused) ?? null : null;
  };

  const [replyRequest, setReplyRequest] = React.useState<{ id: string; at: number } | null>(null);

  /** The keys shared by the page and the drawer. */
  const actionKeys: Record<string, () => void> = {
    e: () => {
      const message = target();
      if (message) file(message, 'file');
    },
    '!': () => {
      const message = target();
      if (message) file(message, 'spam');
    },
    r: () => {
      const message = target();
      if (!message) return;
      if (message.id !== selectedId) openRow(message);
      setReplyRequest({ id: message.id, at: Date.now() });
    },
    b: () => {
      if (selected) openBan(selected);
    },
    z: () => undoLast(),
  };

  const switchView = (next: MessageView): void => {
    if (next === view) return;
    navigate(messagePath(null, next));
  };

  useHotkeys({
    j: () => move(1),
    arrowdown: () => move(1),
    k: () => move(-1),
    arrowup: () => move(-1),
    ...actionKeys,
    escape: () => {
      if (selectedId) close();
    },
    ...Object.fromEntries(MESSAGE_VIEWS.map((entry, i) => [String(i + 1), () => switchView(entry)])),
  });

  // The drawer is a modal dialog, which the page's hotkeys stand back for;
  // it gets the same keys itself.
  const onDrawerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if ((event.target as HTMLElement).closest('input, select, textarea, [role=menu]')) return;
    const key = event.key.toLowerCase();
    const handler =
      key === 'j' || key === 'arrowdown' ? () => move(1, true)
      : key === 'k' || key === 'arrowup' ? () => move(-1, true)
      : key in actionKeys && (key === '!' || !event.shiftKey) ? actionKeys[key]
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
      { root: stable.scrollRef.current, rootMargin: '0px 0px 400px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [list.hasNextPage, list.isFetchingNextPage, list.fetchNextPage, stable.scrollRef]);

  const firstLoad = !stored && list.isPending;
  const loadError = !stored && list.isError;
  const empty = Boolean(stored) && rows.length === 0;

  const body = firstLoad ? (
    <LoadingRows table={table} />
  ) : loadError ? (
    isMissingRoute(list.error) ? (
      <p role="status" className="px-4 py-6 text-[13px] text-muted-foreground">
        The message inbox needs the updated site-api, which is not deployed yet.
      </p>
    ) : (
      <LoadError what="Messages" error={list.error} onRetry={() => void list.refetch()} />
    )
  ) : empty ? (
    <p className="flex min-h-12 items-center px-4 py-2 text-[13px] text-muted-foreground">{EMPTY[view]}</p>
  ) : null;

  const layout = table ? 'table' : 'stack';
  const rowList = rows.map((message) => (
    <MessageRow
      key={message.id}
      message={message}
      layout={layout}
      active={message.id === selectedId}
      tabbable={message.id === (index >= 0 ? selectedId : rows[0]?.id)}
      onOpen={openRow}
      onIntent={onIntent}
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
          Older messages did not load. {describeError(list.error)}{' '}
          <button type="button" className="text-foreground underline underline-offset-2" onClick={() => void list.fetchNextPage()}>
            Try again
          </button>
        </span>
      ) : (
        `All ${plural(rows.length, 'message')} shown`
      )}
    </div>
  );

  const paneProps = (message: AdminOwnerMessage) => ({
    message,
    detail,
    focusRequest: replyRequest?.id === message.id ? replyRequest.at : 0,
    onClose: close,
    onArchive: () => file(message, 'file'),
    onSpam: () => file(message, 'spam'),
    onBan: () => openBan(message),
    onOpenMessage: openFromHistory,
  });

  const trays = (
    <StateTabs
      label="Message trays"
      value={view}
      onChange={switchView}
      options={MESSAGE_VIEWS.map((entry) => ({
        value: entry,
        label: VIEW_LABELS[entry],
        count: !counts ? null : entry === 'inbox' ? counts.new + counts.read + counts.replied : counts[entry],
      }))}
    />
  );

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <ScreenHeader title="Messages">
        {wide && <div className="ms-3 flex min-w-0 items-center">{trays}</div>}
        {counts && counts.new > 0 && (
          <span className="ms-auto text-muted-foreground text-xs tabular-nums">{counts.new} unread</span>
        )}
      </ScreenHeader>

      {!wide && (
        <div className="flex h-12 shrink-0 items-center overflow-x-auto border-b px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {trays}
        </div>
      )}

      {missing && (
        <p role="status" className="flex min-h-11 shrink-0 items-center gap-2 border-b px-4 text-[13px]">
          <span className="min-w-0 flex-1">
            {isMissingRoute(detail.error) ? MISSING_ROUTE_MESSAGE
              : detail.error instanceof ApiError && detail.error.status === 404 ? 'There is no message with that id. The link may be cut short.'
              : `That message could not be opened. ${describeError(detail.error)}`}
          </span>
          <Button size="sm" className={SMALL} variant="outline" onClick={() => select(null)}>
            Close
          </Button>
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="@container/log relative flex min-w-0 flex-1 flex-col">
          <div
            ref={stable.scrollRef}
            role={table ? 'table' : 'list'}
            aria-label={`Messages, ${VIEW_LABELS[view]}`}
            aria-busy={firstLoad || undefined}
            className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', MSG_COLUMNS, TABLE)}
          >
            {table && (
              <div role="rowgroup" className="sticky top-0 z-30 bg-background">
                <div role="row" className={cn(MSG_GRID, HEAD, 'items-center [&>*]:truncate [&>*]:px-3')}>
                  <div role="columnheader">From</div>
                  <div role="columnheader">Message</div>
                  <div role="columnheader">State</div>
                  <div role="columnheader" className={MSG_MID}>Country</div>
                  <div role="columnheader">Received</div>
                </div>
              </div>
            )}
            {table ? <div role="rowgroup">{body ?? rowList}</div> : body ?? rowList}
            {footer}
          </div>

          {stable.fresh.length > 0 && (
            <div role="status" className="pointer-events-none absolute inset-x-0 top-11 z-40 flex justify-center">
              <Button
                size="sm"
                className={cn(SMALL, 'pointer-events-auto rounded-full shadow-md')}
                onClick={() => {
                  stable.merge();
                  if (stable.scrollRef.current) stable.scrollRef.current.scrollTop = 0;
                }}
              >
                <ArrowUp />
                {stable.fresh.length} new
              </Button>
            </div>
          )}
        </div>

        {wide && shown && (
          <aside aria-label="Message detail" className="flex w-[440px] shrink-0 flex-col border-s">
            <MessageDetail
              {...paneProps(shown)}
              variant="panel"
              position={shownIndex >= 0 ? { index: shownIndex, total: rows.length } : null}
              onPrev={index > 0 ? () => move(-1) : null}
              onNext={index >= 0 && index < rows.length - 1 ? () => move(1) : null}
            />
          </aside>
        )}
      </div>

      {!wide && (
        <Drawer open={Boolean(selected)} onOpenChange={(open) => !open && close()} position="right">
          <DrawerPopup
            variant="straight"
            aria-label="Message"
            className="w-full max-w-[440px] duration-150 data-ending-style:duration-150 motion-reduce:transition-none"
            portalProps={{ className: '[&_[data-slot=drawer-backdrop]]:duration-150! motion-reduce:[&_[data-slot=drawer-backdrop]]:transition-none' }}
            finalFocus={false}
            onKeyDown={onDrawerKeyDown}
          >
            {lastSelected.current && (
              <MessageDetail
                {...paneProps(selected ?? lastSelected.current)}
                variant="drawer"
                position={index >= 0 ? { index, total: rows.length } : null}
                onPrev={index > 0 ? () => move(-1, true) : null}
                onNext={index >= 0 && index < rows.length - 1 ? () => move(1, true) : null}
              />
            )}
          </DrawerPopup>
        </Drawer>
      )}

      {ban !== null && <BanDialog target={ban} open={banOpen} onOpenChange={setBanOpen} onFilesMessage={banFiles} />}
    </div>
  );
}

const EMPTY: Record<MessageView, string> = {
  inbox: 'Nothing in the Inbox. Messages sent through the site’s message form land here.',
  archived: 'Nothing archived. Press E on a message to file it here.',
  spam: 'No spam. Messages the checks call spam land here, without a notification.',
};

function LoadingRows({ table }: { table: boolean }) {
  return (
    <div aria-hidden>
      {Array.from({ length: table ? 12 : 8 }, (_, i) =>
        table ? (
          <div key={i} className={cn('flex items-center gap-6 px-3', LINE, SPACED)}>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-72" />
            <Skeleton className="ms-auto h-3 w-20" />
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
