import * as React from 'react';
import { COMMENT_SURFACES, type AdminSourceKeyType } from '@bunizao/contracts';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ArrowUp, Ban, Check, ChevronDown, KeyRound, ListFilter as FilterIcon, MoreHorizontal, RotateCcw, Search, Trash2, X, XCircle } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { Drawer, DrawerPopup } from '@/components/coss/drawer';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/coss/input-group';
import { Kbd } from '@/components/coss/kbd';
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from '@/components/coss/menu';
import { Skeleton } from '@/components/coss/skeleton';
import { toastManager } from '@/components/coss/toast';
import { useMediaQuery } from '@/components/coss/hooks/use-media-query';
import { cn } from '@/lib/utils';
import type { PortalComment, PortalCommentStatus } from '@/features/admin/server/portal-client';
import { HEAD, LINE, LINE_PX, SMALL, SPACED, TABLE } from '../activity/table';
import { isMissingRoute } from '../app/api';
import { useHotkeys } from '../app/hotkeys';
import { mergeHistoryState, navigate, readHistoryState, setSearch, useLocation } from '../app/router';
import { padUnderBulkBar, useSavedScroll, useScrollRestoration } from '../app/scroll';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { undoLast } from '../app/undo';
import { EDGE_FADE, LoadError, StateTabs, TOUCH_MENU, TOUCH_TARGET, useSearchText } from '../moderation/ui';
import { BanDialog, type BanTarget } from './BanDialog';
import { CommentDetail, type CommentDetailProps } from './CommentPane';
import { CommentRow, LOG_COLUMNS, LOG_GRID, MID, WHILE_SELECTING, WIDE } from './CommentRow';
import { useCommentControls } from './controls';
import {
  MAX_ACT_IDS,
  RANGE_DAYS,
  REASON_FILTERS,
  REJECT_REASONS,
  SEARCH_DAYS,
  STATUS_FILTERS,
  STATUS_LABELS,
  canApply,
  listFilter,
  nextStatus,
  patchBanDeleted,
  prefetchCommentList,
  prefetchSourceProfile,
  staysIn,
  threadRoot,
  useCommentCounts,
  useCommentList,
  useModerate,
  usePrefetchStatuses,
  useSourceProfile,
  useTopPosts,
  type CommentFilter,
  type CommentModel,
  type CommentRange,
  type CommentSort,
  type ReasonFilter,
  type RejectReason,
  type StatusFilter,
  type Verdict,
} from './data';
import { LockdownLine, prefetchLockdown } from './Lockdown';
import { REASON_LABELS, SOURCE_TYPES, absoluteTime, pivotHref, shortHandle, sourceBanKey, sourceLabel, stamp, type Pivot } from './model';
import { OwnerSignInDialog, openOwnerSignIn } from './OwnerSignIn';
import { RejectMenu } from './RejectMenu';
import { useStableRows } from './stable-rows';
import type { SwipeDirection } from './swipe';

/* The comment log: every comment, newest first, one line each, with the
   keys that say where it came from written out. Clicking a key filters the
   same screen to everything sharing it; clicking the row opens its detail
   beside the table (1280px and up) or over it (below). The URL holds the
   whole state (status, post, key, search, open comment), so Back, reload
   and a shared link all land on the same view. */

/* Row heights without the 4px under each (44px in the table, 68px
   stacked), so a count from them over-fills the first frame and never
   draws short of a restored offset. */
const TABLE_ROW_PX = LINE_PX;
const STACK_ROW_PX = 68;

/* The list while a new search or filter loads: dimmed only once the wait
   is long enough to notice, and back at once. It scrolls clear of the
   floating bulk bar (padUnderBulkBar). */
const STALE_DIM =
  'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-(--bulk-bar) transition-opacity duration-150 data-stale:opacity-55 data-stale:delay-200 motion-reduce:transition-none';

const MODELS: readonly CommentModel[] = ['akismet', 'llm', 'none'];
const SORTS: readonly CommentSort[] = ['newest', 'oldest', 'risk'];
const RANGES = Object.keys(RANGE_DAYS) as CommentRange[];

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Everything the list is filtered by, from the URL. Unknown values are
    dropped rather than sent. */
function readFilter(search: URLSearchParams) {
  const status = oneOf(search.get('status'), STATUS_FILTERS) ?? 'all';
  const key = search.get('key');
  const value = search.get('value');
  const pivot = key && value && SOURCE_TYPES.has(key) ? { key: key as AdminSourceKeyType, value } : null;
  const filter: CommentFilter = {
    status,
    postId: search.get('post'),
    key: pivot?.key ?? null,
    value: pivot?.value ?? null,
    q: search.get('q'),
    surface: oneOf(search.get('surface'), COMMENT_SURFACES),
    reason: oneOf(search.get('reason'), REASON_FILTERS),
    model: oneOf(search.get('model'), MODELS),
    range: oneOf(search.get('range'), RANGES),
    sort: oneOf(search.get('sort'), SORTS),
  };
  return { status, pivot, postId: filter.postId ?? null, filter };
}

/** What the URL names, warmed on link intent and while the shell keeps the
    outgoing screen up (app/lazy-screen.ts). A pivot link prefetches too. */
export function prefetch(client: QueryClient, search: URLSearchParams): Promise<unknown> {
  const { pivot, filter } = readFilter(search);
  return Promise.all([
    prefetchCommentList(client, filter),
    pivot && prefetchSourceProfile(client, pivot.key, pivot.value),
    prefetchLockdown(client),
  ]);
}

const RANGE_WORDS: Record<CommentRange, string> = { '24h': '24 hours', '7d': '7 days', '30d': '30 days', '90d': '90 days' };

/** How far back the list reads: the range asked for, else the 30 days
    site-api reads for a search or the risk order, else everything. */
function windowWords(filter: CommentFilter): string | null {
  if (filter.range) return `last ${RANGE_WORDS[filter.range]}`;
  if (listFilter(filter).q || filter.sort === 'risk') return `last ${SEARCH_DAYS} days`;
  return null;
}

function setStatus(filter: StatusFilter): void {
  setSearch({ status: filter === 'all' ? null : filter });
}

function rowButton(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"] [data-row-button]`);
}

/* The row focus is on its way to. focusRow waits a frame, and a key that
   lands inside that frame (Shift+J held down, x right after j) means that
   row, not the one focus is leaving. */
let focusTarget: string | null = null;

function focusedRowId(): string | null {
  if (focusTarget) return focusTarget;
  const active = document.activeElement;
  return active instanceof HTMLElement ? active.closest('[data-row-id]')?.getAttribute('data-row-id') ?? null : null;
}

/** Focus a row without scrolling the page, then bring it just into view.
    Focus leaves another row, or the bulk bar, at once: the render this
    press causes may remove it or change its tabindex, and either one on the
    focused element makes Chrome lay the page out mid-commit (~22ms at 4x
    CPU on a 45-row log, measured), before the frame lays it out again. */
function focusRow(id: string, block: ScrollLogicalPosition = 'nearest'): void {
  focusTarget = id;
  const active = document.activeElement;
  const from = active instanceof HTMLElement ? active.closest('[data-row-id], [role=toolbar]') : null;
  if (from && from.getAttribute('data-row-id') !== id) (active as HTMLElement).blur();
  requestAnimationFrame(() => {
    if (focusTarget === id) focusTarget = null;
    const button = rowButton(id);
    if (!button) return;
    button.focus({ preventScroll: true });
    button.closest('[data-row-id]')?.scrollIntoView({ block });
  });
}

export default function CommentsScreen() {
  const location = useLocation();
  const { status, pivot, postId, filter } = readFilter(location.search);
  const query = location.search.get('q') ?? '';
  const selectedId = location.search.get('c');
  const wide = useMediaQuery('(min-width: 1280px)');
  const coarse = useMediaQuery('(pointer: coarse)');

  const client = useQueryClient();
  const moderate = useModerate();
  const counts = useCommentCounts();
  const topPosts = useTopPosts();
  const profile = useSourceProfile(pivot?.key ?? null, pivot?.value ?? null);
  const list = useCommentList(filter);
  const normal = listFilter(filter);
  // Search, reason, model, range and order: anything site-api filters on
  // that the status counts cannot follow.
  const narrowed = Boolean(normal.q || normal.surface || normal.reason || normal.model || normal.range || normal.sort);
  usePrefetchStatuses(!pivot && !postId && !narrowed && list.isSuccess && !list.isPlaceholderData);

  const loaded = React.useMemo(() => {
    if (!list.data) return undefined;
    const seen = new Set<string>();
    const rows: PortalComment[] = [];
    for (const page of list.data.pages) {
      for (const row of page.comments) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        if (status === 'all' || row.status === status) rows.push(row);
      }
    }
    return rows;
  }, [list.data, status]);
  const viewKey = JSON.stringify(normal);
  /* A new filter, search or order keeps the rows it replaces on screen,
     dimmed, until its own arrive (keepPreviousData): the view shown is the
     last one that settled, and nothing jumps while a keystroke is in flight. */
  const settledKey = React.useRef(viewKey);
  const stale = list.isPlaceholderData;
  if (!stale) settledKey.current = viewKey;
  // The rows on screen belong to another query until then: no paging.
  const canLoadMore = Boolean(list.hasNextPage) && !stale;
  const shownKey = stale ? settledKey.current : viewKey;
  const view = useStableRows(shownKey, stale ? undefined : loaded);
  // Each view keeps its own offset in the entry, so a status tab (which only
  // replaces the URL) and Back from a pivot both land where that list was.
  const scrollScope = `comments:${shownKey}`;
  useScrollRestoration(view.scrollRef, scrollScope, Boolean(loaded) || view.rows.length > 0);
  const rows = view.rows;

  const authors = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const row of loaded ?? []) map.set(row.id, row.author);
    for (const row of view.rows) map.set(row.id, row.author);
    return map;
  }, [loaded, view.rows]);

  const index = selectedId ? rows.findIndex((row) => row.id === selectedId) : -1;
  const selected = index >= 0 ? rows[index] : null;
  // The drawer keeps its last comment while it animates closed.
  const lastSelected = React.useRef<PortalComment | null>(null);
  if (selected) lastSelected.current = selected;
  /* The panel follows the selection one render behind, with the rows and
     thread of that render: the row highlight paints first, holding j never
     waits for the detail, and an act that moves the selection repaints its
     rows without redrawing the old comment (the memoized Panel keeps it). */
  const panelSource = React.useMemo(
    () => (wide && selected ? { comment: selected, rows, thread: threadOf(selected, loaded ?? rows) } : null),
    [wide, selected, rows, loaded],
  );
  const deferred = React.useDeferredValue(panelSource);
  // A change to the comment already open (a pin, a lock, a status in All)
  // paints with its row: only a move to another comment waits.
  const panel = deferred && panelSource && deferred.comment.id === panelSource.comment.id ? panelSource : deferred;

  /* Selection. On a wide screen it only replaces the URL; on a narrow one,
     opening the drawer pushes an entry so the phone's Back closes it. The
     entry is marked, so its X goes Back even after Back from a pivot has
     returned to it, instead of leaving a copy of the list to step through. */
  const select = React.useCallback((id: string | null) => {
    setSearch({ c: id });
  }, []);

  const openRow = React.useCallback(
    (id: string) => {
      if (!wide && !new URLSearchParams(location.search).get('c')) {
        setSearch({ c: id }, { push: true });
        mergeHistoryState({ drawer: true });
        return;
      }
      setSearch({ c: id });
    },
    [wide],
  );

  const closeDetail = React.useCallback(() => {
    const id = new URLSearchParams(location.search).get('c');
    if (readHistoryState().drawer === true) history.back();
    else setSearch({ c: null });
    if (id) focusRow(id);
  }, []);

  /* Deep links, from Telegram or a copied link: `#<id>` becomes `?c=<id>`;
     the row is scrolled to once, loading more pages if it is further down. */
  const [deepLink, setDeepLink] = React.useState<string | null>(() => selectedId ?? (location.hash || null));
  const [deepLinkMissing, setDeepLinkMissing] = React.useState<string | null>(null);
  React.useLayoutEffect(() => {
    if (location.hash && /^[\w-]+$/.test(location.hash)) {
      const params = new URLSearchParams(location.search);
      params.set('c', location.hash);
      setDeepLink(location.hash);
      navigate(`/comments?${params}`, { replace: true });
    }
  }, [location.hash, location.search]);

  React.useEffect(() => {
    if (!deepLink || !list.isSuccess || stale) return;
    if (view.rows.some((row) => row.id === deepLink)) {
      setDeepLink(null);
      focusRow(deepLink, 'center');
      return;
    }
    if (canLoadMore && (list.data?.pages.length ?? 0) < 6) {
      if (!list.isFetchingNextPage) void list.fetchNextPage();
      return;
    }
    setDeepLink(null);
    setDeepLinkMissing(deepLink);
  }, [deepLink, list.isSuccess, stale, list.data, canLoadMore, list.isFetchingNextPage, list.fetchNextPage, view.rows]);

  // A pivot or Back swaps the list out from under the link that had focus;
  // put focus on the open row, without scrolling, so the keys stay in the list.
  const hasRows = rows.length > 0;
  React.useEffect(() => {
    const id = latest.current.selectedId;
    if (!id || !hasRows) return;
    requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      rowButton(id)?.focus({ preventScroll: true });
    });
  }, [shownKey, hasRows]);

  /* Arriving on a view draws the rows that can be on screen first (down to
     a restored offset, and at least to the open row), and the rest once that
     frame is painted, in a transition. Mounting all 50 rows at once was most
     of what a tab, a pivot or Back cost: 60 of ~90ms at 4x CPU, measured. */
  const [completeView, setCompleteView] = React.useState<string | null>(null);
  const complete = completeView === shownKey;
  const savedTop = useSavedScroll(scrollScope);
  const firstRows = Math.max(Math.ceil(((savedTop ?? 0) + window.innerHeight) / (wide ? TABLE_ROW_PX : STACK_ROW_PX)) + 2, index + 3);
  React.useEffect(() => {
    if (complete || !hasRows) return;
    let timer = 0;
    // A task queued from a rAF callback runs after that frame paints.
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => React.startTransition(() => setCompleteView(shownKey)));
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [complete, hasRows, shownKey]);
  const drawn = complete ? rows : rows.slice(0, firstRows);

  /* Bulk selection. An act takes at most MAX_ACT_IDS rows, the first in
     list order; the rest stay selected for the next press. Each row lands
     where site-api says it is: one it left unchanged in this view comes
     back selected and marked with why. */
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const [failed, setFailed] = React.useState<ReadonlyMap<string, string>>(new Map());
  const anchor = React.useRef<string | null>(null);
  const checkedRows = React.useMemo(() => rows.filter((row) => checked.has(row.id)), [rows, checked]);
  React.useEffect(() => {
    setChecked(new Set());
    setFailed(new Map());
  }, [viewKey]);
  const selecting = checked.size > 0;

  /* The reject menu (S) and the reply box (R) belong to the open comment;
     the keys open the row first when it is not. */
  const [rejectFor, setRejectFor] = React.useState<string | null>(null);
  const [bulkRejectOpen, setBulkRejectOpen] = React.useState(false);
  const [replyRequest, setReplyRequest] = React.useState<{ id: string; at: number } | null>(null);

  const [ban, setBan] = React.useState<BanTarget | null>(null);
  const [banOpen, setBanOpen] = React.useState(false);
  // The comment the open ban came from, for the delete it carries.
  const banFrom = React.useRef<PortalComment | null>(null);
  const openBan = React.useCallback((comment: PortalComment) => {
    banFrom.current = comment;
    setBan({ kind: 'actor', actor: comment.actor, commentId: comment.status === 'deleted' ? null : comment.id });
    setBanOpen(true);
  }, []);
  const controls = useCommentControls(view.patch);

  // Everything the stable row callbacks need, read at call time.
  const latest = React.useRef({ rows, selectedId, checked, status, wide, coarse, view });
  latest.current = { rows, selectedId, checked, status, wide, coarse, view };

  /** A comment moving to `to`. The row leaves (or changes in place) in
      this frame, the selection moves to the next row with it, and focus
      stays in the list. Returns what puts it back. */
  const leave = React.useCallback(
    (comment: PortalComment, to: PortalCommentStatus): (() => void) => {
      const { rows: current, selectedId: open, status: filter, view: stable } = latest.current;
      const leaves = filter !== 'all' && to !== filter;
      const at = current.findIndex((row) => row.id === comment.id);
      const wasOpen = open === comment.id;
      // Advance only when the row leaves this view (triaging Held); in All
      // it stays with its new status, and so does the selection.
      const next = wasOpen || focusedRowId() === comment.id
        ? (leaves ? current[at + 1] ?? current[at - 1] ?? null : comment)
        : null;
      const restore = leaves ? stable.remove([comment.id]) : () => {};
      setFailed((marks) => (marks.size > 0 ? new Map() : marks));
      if (wasOpen && next?.id !== comment.id) select(next?.id ?? null);
      if (next) focusRow(next.id);
      return () => {
        restore();
        if (next && latest.current.selectedId === next.id) select(comment.id);
      };
    },
    [select],
  );

  /** One verdict on one comment. */
  const act = React.useCallback(
    (comment: PortalComment, verdict: Verdict, reason?: RejectReason) => {
      if (!canApply(comment, verdict) || (verdict === 'reject' && !reason)) return;
      const filter = latest.current.status;
      const back = leave(comment, nextStatus(comment, verdict));
      moderate([comment], verdict, {
        reason,
        onRevert: back,
        // Back only when site-api left it in this view; a row someone moved
        // elsewhere first left for real.
        onUnchanged: (unchanged) => {
          const here = staysIn(unchanged, filter);
          if (here.length === 0) return;
          back();
          setFailed(new Map(here.map((id) => [id, unchanged.get(id)!.line])));
        },
      });
    },
    [leave, moderate],
  );

  /** The ban deletes the comment it came from: off the screen as D takes
      it, and back as one on an undo or a refused ban. */
  const banDeletes = React.useCallback(
    (id: string): (() => void) => {
      const comment = banFrom.current;
      if (comment?.id !== id) return () => {};
      const unpatch = patchBanDeleted(client, comment);
      const back = leave(comment, 'deleted');
      return () => {
        unpatch();
        back();
      };
    },
    [client, leave],
  );

  const actOnChecked = React.useCallback(
    (verdict: Verdict, reason?: RejectReason) => {
      if (verdict === 'reject' && !reason) return;
      const { rows: current, checked: ticked, selectedId: open, status: filter, view: stable } = latest.current;
      const eligible = current.filter((row) => ticked.has(row.id) && canApply(row, verdict)).slice(0, MAX_ACT_IDS);
      if (eligible.length === 0) return;
      const leaving = filter === 'all' ? [] : eligible.filter((row) => nextStatus(row, verdict) !== filter).map((row) => row.id);
      // The nearest row that stays, after the given one, else before it.
      const survivor = (id: string | null): PortalComment | null => {
        const at = id ? current.findIndex((row) => row.id === id) : -1;
        if (at < 0) return current.find((row) => !leaving.includes(row.id)) ?? null;
        if (!leaving.includes(id!)) return current[at];
        return current.slice(at + 1).find((row) => !leaving.includes(row.id))
          ?? current.slice(0, at).reverse().find((row) => !leaving.includes(row.id))
          ?? null;
      };
      if (open && leaving.includes(open)) select(survivor(open)?.id ?? null);
      const focusTo = survivor(open ?? focusedRowId());
      const restore = leaving.length > 0 ? stable.remove(leaving) : () => {};
      const acted = new Set(eligible.map((row) => row.id));
      setFailed((marks) => (marks.size > 0 ? new Map() : marks));
      // Whatever comes back, from an undo, a failed request or a row site-api
      // left in this view, comes back selected, so the next try is one key.
      const back = (ids: readonly string[]): void => {
        restore(ids);
        setChecked((ticked) => new Set([...ticked, ...ids]));
      };
      moderate(eligible, verdict, {
        reason,
        onRevert: back,
        // Each row lands where site-api says it is: those still in this view
        // come back marked with why, the rest stay out.
        onUnchanged: (unchanged) => {
          const here = staysIn(unchanged, filter);
          if (here.length > 0) back(here);
          setFailed(new Map(here.map((id) => [id, unchanged.get(id)!.line])));
        },
      });
      setChecked((ticked) => new Set([...ticked].filter((id) => !acted.has(id))));
      if (focusTo) focusRow(focusTo.id);
    },
    [moderate, select],
  );

  const onCheck = React.useCallback((comment: PortalComment, value: boolean, range: boolean) => {
    setChecked((current) => {
      const next = new Set(current);
      const all = latest.current.rows;
      if (range && anchor.current) {
        const from = all.findIndex((row) => row.id === anchor.current);
        const to = all.findIndex((row) => row.id === comment.id);
        if (from >= 0 && to >= 0) {
          for (const row of all.slice(Math.min(from, to), Math.max(from, to) + 1)) {
            if (value) next.add(row.id);
            else next.delete(row.id);
          }
          return next;
        }
      }
      if (value) next.add(comment.id);
      else next.delete(comment.id);
      return next;
    });
    anchor.current = comment.id;
  }, []);

  const onOpen = React.useCallback(
    (comment: PortalComment) => {
      const { checked: ticked, coarse: touch } = latest.current;
      // While selecting on a touch screen, a tap ticks, like Mail's edit mode.
      if (touch && ticked.size > 0) {
        onCheck(comment, !ticked.has(comment.id), false);
        return;
      }
      openRow(comment.id);
    },
    [onCheck, openRow],
  );

  const onPivot = React.useCallback((event: React.MouseEvent<HTMLAnchorElement>, comment: PortalComment, target: Pivot) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    // Keep a comment open across the pivot only if one was open already.
    navigate(pivotHref(target.type, target.value, latest.current.selectedId ? comment.id : null));
  }, []);

  const onSwipe = React.useCallback(
    (comment: PortalComment, direction: SwipeDirection) => act(comment, direction === 'right' ? 'approve' : 'delete'),
    [act],
  );

  const onLongPress = React.useCallback((comment: PortalComment) => {
    anchor.current = comment.id;
    setChecked((current) => new Set(current).add(comment.id));
  }, []);

  const move = (delta: number, opens = wide): void => {
    if (rows.length === 0) return;
    const focused = focusedRowId();
    const from = index >= 0 ? index : focused ? rows.findIndex((row) => row.id === focused) : delta > 0 ? -1 : rows.length;
    const target = rows[Math.max(0, Math.min(rows.length - 1, from + delta))];
    if (opens || selected) select(target.id);
    focusRow(target.id);
    if (from + delta >= rows.length - 8 && canLoadMore && !list.isFetchingNextPage) void list.fetchNextPage();
  };
  // The panel's arrows: one function the memoized Panel can keep, moving
  // from wherever the selection is when pressed.
  const moveRef = React.useRef(move);
  moveRef.current = move;
  const step = React.useCallback((delta: number) => moveRef.current(delta), []);

  const current = (): PortalComment | null => {
    if (selected) return selected;
    const focused = focusedRowId();
    return focused ? rows.find((row) => row.id === focused) ?? null : null;
  };

  /** The verdict keys, shared by the page and the drawer. */
  const verdictKeys = {
    a: () => {
      const row = current();
      if (row) act(row, 'approve');
    },
    u: () => {
      const row = current();
      if (row) act(row, 'hide');
    },
    // Opens the reject menu on the row, opening the row first; 1-5 then
    // pick the reason and act.
    s: () => {
      const row = current();
      if (!row || !canApply(row, 'reject')) return;
      if (row.id !== selectedId) openRow(row.id);
      setRejectFor(row.id);
    },
    d: () => {
      const row = current();
      if (row) act(row, 'delete');
    },
    r: () => {
      const row = current();
      if (!row) return;
      if (row.status !== 'published') {
        toastManager.add({ type: 'info', title: 'Only a published comment can be answered', description: 'Approve it first, then press R.' });
        return;
      }
      if (row.id !== selectedId) openRow(row.id);
      setReplyRequest({ id: row.id, at: Date.now() });
    },
    b: () => {
      const row = current();
      if (row) openBan(row);
    },
    // Toggles, not verdicts: the row stays where it is in every view.
    p: () => {
      const row = current();
      if (row) controls.pin(row);
    },
    l: () => {
      const row = current();
      if (row) controls.lock(row);
    },
    z: () => undoLast(),
  };

  /** Shift+J and Shift+K: tick this row and the next, and move on. */
  const extend = (delta: number): void => {
    const row = current();
    const at = row ? rows.findIndex((item) => item.id === row.id) : -1;
    const target = at >= 0 ? rows[at + delta] : undefined;
    if (!row || !target) return;
    setChecked((ticked) => new Set(ticked).add(row.id).add(target.id));
    anchor.current = target.id;
    move(delta, false);
  };

  const searchRef = React.useRef<HTMLInputElement>(null);
  useHotkeys({
    j: () => move(1),
    arrowdown: () => move(1),
    k: () => move(-1),
    arrowup: () => move(-1),
    'shift+j': () => extend(1),
    'shift+arrowdown': () => extend(1),
    'shift+k': () => extend(-1),
    'shift+arrowup': () => extend(-1),
    ...verdictKeys,
    x: () => {
      const row = current();
      if (row) onCheck(row, !checked.has(row.id), false);
    },
    'shift+a': () => actOnChecked('approve'),
    'shift+s': () => {
      if (checkedRows.some((row) => canApply(row, 'reject'))) setBulkRejectOpen(true);
    },
    'shift+d': () => actOnChecked('delete'),
    '/': () => searchRef.current?.focus(),
    escape: () => {
      if (document.activeElement === searchRef.current) {
        searchRef.current?.blur();
        const first = rows[0];
        if (first) focusRow(selected?.id ?? first.id);
      } else if (checked.size > 0) setChecked(new Set());
      else if (selected) closeDetail();
    },
    ...Object.fromEntries(
      STATUS_FILTERS.map((filter, i) => [
        String(i + 1),
        () => {
          // S opened a row and asked for its reject menu, and the digit
          // came before that row's pane: it is the reason, not a tab.
          const pending = rejectFor ? rows.find((row) => row.id === rejectFor) : undefined;
          if (pending && REJECT_REASONS[i]) {
            setRejectFor(null);
            act(pending, 'reject', REJECT_REASONS[i]);
          } else setStatus(filter);
        },
      ]),
    ),
  });

  // The drawer is a modal dialog, which the page's hotkeys stand back for;
  // it gets the same keys itself.
  const onDrawerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!(event.target instanceof HTMLElement) || !event.currentTarget.contains(event.target)) return;
    // The reply box is in the drawer too.
    if (event.target.isContentEditable || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT') return;
    const key = event.key.toLowerCase();
    const handler =
      key === 'j' || key === 'arrowdown' ? () => move(1, true)
      : key === 'k' || key === 'arrowup' ? () => move(-1, true)
      : !event.shiftKey && key in verdictKeys ? verdictKeys[key as keyof typeof verdictKeys]
      : null;
    if (!handler) return;
    event.preventDefault();
    handler();
  };

  /* Infinite scroll, with a button fallback: a hidden tab never intersects. */
  const sentinel = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const node = sentinel.current;
    if (!node || !canLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !list.isFetchingNextPage) void list.fetchNextPage();
      },
      { root: view.scrollRef.current, rootMargin: '0px 0px 600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [canLoadMore, list.isFetchingNextPage, list.fetchNextPage, view.scrollRef, wide, complete]);

  // Status counts: global without a filter, the key's own under a pivot,
  // and none under a post filter or a search, which site-api does not count.
  const countsHidden = Boolean(postId) || narrowed;
  const statusCounts = React.useMemo((): Partial<Record<StatusFilter, number>> | null => {
    if (pivot) return profile.data ? { ...profile.data.comments.byStatus, all: profile.data.comments.total } : null;
    if (!counts.data) return null;
    const { held, published, rejected, deleted } = counts.data;
    return { held, published, rejected, deleted, all: held + published + rejected + deleted };
  }, [Boolean(pivot), profile.data, counts.data]);

  // Kept by content: every act changes the rows, seldom the posts they name,
  // and a new list would redraw the whole Toolbar in the act's frame.
  const postList = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const post of topPosts.data ?? []) map.set(post.postId, post.title ?? post.slug ?? post.postId);
    for (const row of view.rows) if (!map.has(row.postId)) map.set(row.postId, row.postTitle ?? row.postSlug ?? row.postId);
    return JSON.stringify([...map].slice(0, 14));
  }, [topPosts.data, view.rows]);
  const posts = React.useMemo(() => JSON.parse(postList) as Array<[string, string]>, [postList]);

  const leaveSearch = React.useCallback(() => {
    const { rows: current, selectedId: open } = latest.current;
    const id = open ?? current[0]?.id;
    if (id) focusRow(id);
  }, []);

  const pivotLine = pivot && (
    <PivotLine
      pivot={pivot}
      profile={profile}
      rows={view.rows}
      onBan={(target) => {
        setBan(target);
        setBanOpen(true);
      }}
    />
  );

  const empty = !list.isPending && !list.isError && !stale && rows.length === 0;
  const table = wide;

  const rowList = drawn.map((comment) => (
    <CommentRow
      key={comment.id}
      comment={comment}
      layout={table ? 'table' : 'stack'}
      active={comment.id === selectedId}
      checked={checked.has(comment.id)}
      failed={failed.get(comment.id) ?? null}
      replyTo={comment.parentId ? authors.get(comment.parentId) ?? null : null}
      swipe={coarse}
      tabbable={comment.id === (selected?.id ?? rows[0]?.id)}
      onOpen={onOpen}
      onCheck={onCheck}
      onPivot={onPivot}
      onSwipe={onSwipe}
      onLongPress={onLongPress}
    />
  ));

  // Held back until every row is drawn, or it would ask for the next page.
  const since = windowWords(filter);
  // site-api cut a window wider than 90 days to the 90 before its end;
  // `from` is then where the read started.
  const clampedWindow = list.data?.pages[0]?.window;
  const clampedFrom = clampedWindow?.clamped ? clampedWindow.from : null;
  const footer = complete && !list.isPending && !list.isError && rows.length > 0 && (
    <>
      {clampedFrom && (
        <p data-window-clamped className="px-4 pt-3 text-center text-muted-foreground text-xs">
          Read from {absoluteTime(clampedFrom)} only: site-api searches 90 days at most.
        </p>
      )}
      <div ref={sentinel} className="flex h-12 items-center justify-center text-muted-foreground text-xs">
        {canLoadMore ? (
          <Button size="sm" className={SMALL} variant="ghost" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
            Load more
          </Button>
        ) : (
          `All ${view.rows.length} shown${since ? `, from the ${since}` : ''}`
        )}
      </div>
    </>
  );

  const clearNarrowing = (): void => setSearch({ q: null, surface: null, reason: null, model: null, range: null, sort: null });
  const body = list.isPending ? (
    <LoadingRows table={table} />
  ) : list.isError ? (
    <LoadError
      what="Comments"
      error={list.error}
      onRetry={() => void list.refetch()}
      // An older site-api has no search or filters: asking again fails again.
      action={isMissingRoute(list.error) && narrowed ? (
        <Button size="sm" variant="outline" className={SMALL} onClick={clearNarrowing}>
          <X />
          Clear search and filters
        </Button>
      ) : undefined}
    />
  ) : empty ? (
    <EmptyLine
      status={status}
      query={normal.q}
      since={since}
      filtered={Boolean(pivot || postId || narrowed)}
      onClear={() => setSearch({ key: null, value: null, post: null, q: null, surface: null, reason: null, model: null, range: null, sort: null })}
    />
  ) : null;

  /* What the bulk bar's buttons act on: the first MAX_ACT_IDS selected rows
     each verdict applies to. */
  const bulk = {
    approve: Math.min(checkedRows.filter((row) => canApply(row, 'approve')).length, MAX_ACT_IDS),
    reject: Math.min(checkedRows.filter((row) => canApply(row, 'reject')).length, MAX_ACT_IDS),
    delete: Math.min(checkedRows.filter((row) => canApply(row, 'delete')).length, MAX_ACT_IDS),
    restore: Math.min(checkedRows.filter((row) => canApply(row, 'restore')).length, MAX_ACT_IDS),
  };
  const capped = checkedRows.length > MAX_ACT_IDS;
  const capTitle = capped ? `Acts on the first ${MAX_ACT_IDS} selected, in list order; the rest stay selected.` : undefined;

  // The same functions every render, so the memoized Panel keeps them.
  const paneActs = React.useMemo(
    () => ({ onClose: closeDetail, onAct: act, onBan: openBan, onPin: controls.pin, onLock: controls.lock, onOpenComment: select }),
    [closeDetail, act, openBan, controls.pin, controls.lock, select],
  );
  const replyToOf = (comment: PortalComment): string | null => (comment.parentId ? authors.get(comment.parentId) ?? null : null);

  const paneProps = (comment: PortalComment) => ({
    ...paneActs,
    replyTo: replyToOf(comment),
    rejectOpen: rejectFor === comment.id,
    onRejectOpenChange: (open: boolean) => setRejectFor(open ? comment.id : null),
    replyFocus: replyRequest?.id === comment.id ? replyRequest.at : 0,
    thread: threadOf(comment, loaded ?? rows),
  });

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <Toolbar
        wide={wide}
        status={status}
        counts={statusCounts}
        countsHidden={countsHidden}
        posts={posts}
        postId={postId}
        query={query}
        searchSpan={filter.range ? `last ${RANGE_WORDS[filter.range]}` : `last ${SEARCH_DAYS} days`}
        busy={stale}
        surface={filter.surface ?? null}
        reason={filter.reason ?? null}
        model={filter.model ?? null}
        range={filter.range ?? null}
        sort={filter.sort ?? null}
        searchRef={searchRef}
        onLeaveSearch={leaveSearch}
      />

      {deepLinkMissing && (
        <p role="status" className="flex h-11 shrink-0 items-center gap-2 border-b px-4 text-[13px]">
          <span className="min-w-0 flex-1 truncate">That comment is not in this list. It may have been deleted, or it is further back.</span>
          <Button size="sm" className={SMALL} variant="outline" onClick={() => { setDeepLinkMissing(null); navigate(`/comments?c=${deepLinkMissing}`, { replace: true }); }}>
            Show all
          </Button>
          <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => setDeepLinkMissing(null)}>
            <X />
          </Button>
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        {/* data-selecting shows the checkbox column in every row by CSS (CommentRow's LOG_GRID). */}
        <div data-selecting={selecting || undefined} className="@container/log group/sel relative flex min-w-0 flex-1 flex-col">
          <LockdownLine scrollRef={view.scrollRef} />
          {pivotLine}
          <div className="relative flex min-h-0 flex-1 flex-col">
          {table ? (
            <div
              ref={view.scrollRef}
              role="table"
              aria-label={`${STATUS_LABELS[status]} comments`}
              aria-busy={list.isPending || stale || undefined}
              data-stale={stale || undefined}
              className={STALE_DIM}
            >
              <div className={cn(LOG_COLUMNS, TABLE)}>
                <div role="rowgroup" className="sticky top-0 z-30 bg-background">
                  <div role="row" className={cn(LOG_GRID, HEAD, 'items-center [&>*]:truncate [&>*]:px-3')}>
                    <div role="columnheader" className={cn('items-center justify-center', WHILE_SELECTING)}>
                      <label className={cn(TOUCH_TARGET, 'flex')}>
                        <input
                          type="checkbox"
                          aria-label="Select all loaded"
                          className="size-4 accent-[hsl(var(--portal-accent))]"
                          checked={checkedRows.length === rows.length && rows.length > 0}
                          ref={(node) => {
                            if (node) node.indeterminate = checkedRows.length > 0 && checkedRows.length < rows.length;
                          }}
                          onChange={(event) => setChecked(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())}
                        />
                      </label>
                    </div>
                    <div role="columnheader">Time</div>
                    <div role="columnheader">Status</div>
                    <div role="columnheader">Writer</div>
                    <div role="columnheader">Comment</div>
                    <div role="columnheader" className={MID}>Post</div>
                    <div role="columnheader">Fingerprint</div>
                    <div role="columnheader" className={MID}>IP</div>
                    <div role="columnheader" className={WIDE}>Location</div>
                    <div role="columnheader" className={WIDE}>Device</div>
                  </div>
                </div>
                <div role="rowgroup">{body ?? rowList}</div>
                {footer}
              </div>
            </div>
          ) : (
            <div
              ref={view.scrollRef}
              role="list"
              aria-label={`${STATUS_LABELS[status]} comments`}
              aria-busy={list.isPending || stale || undefined}
              data-stale={stale || undefined}
              className={cn(STALE_DIM, TABLE)}
            >
              {body ?? rowList}
              {footer}
            </div>
          )}

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

          {/* Clear of the home indicator; on a phone, of the tab bar, which takes the home indicator's space itself. */}
          {selecting && (
            <div
              ref={padUnderBulkBar}
              role="toolbar"
              aria-label="Bulk actions"
              className="absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),1rem)] max-md:bottom-[calc(var(--portal-tabbar-h,0px)+1rem)] z-40 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-center gap-2 rounded-xl border bg-popover px-3 py-2 text-sm shadow-lg"
            >
              <span className="me-1 tabular-nums max-sm:basis-full max-sm:text-center">
                {checkedRows.length} selected
                {capped && <span className="text-muted-foreground"> · {MAX_ACT_IDS} per act</span>}
              </span>
              <Button size="sm" className={SMALL} disabled={bulk.approve === 0} title={capTitle} onClick={() => actOnChecked('approve')}>
                <Check />
                Approve <span className="tabular-nums">{bulk.approve}</span>
                <Kbd className="pointer-coarse:hidden">⇧A</Kbd>
              </Button>
              <RejectMenu
                open={bulkRejectOpen}
                onOpenChange={setBulkRejectOpen}
                onPick={(reason) => actOnChecked('reject', reason)}
                align="center"
                trigger={<Button size="sm" className={SMALL} variant="outline" disabled={bulk.reject === 0} title={capTitle} />}
              >
                <XCircle />
                {/* A chevron marks the menu: "Reject 3…" read as a cut-off label. */}
                Reject <span className="tabular-nums">{bulk.reject}</span>
                <ChevronDown aria-hidden />
                <Kbd className="pointer-coarse:hidden">⇧S</Kbd>
              </RejectMenu>
              <Button size="sm" className={SMALL} variant="destructive-outline" disabled={bulk.delete === 0} title={capTitle} onClick={() => actOnChecked('delete')}>
                <Trash2 />
                Delete <span className="tabular-nums">{bulk.delete}</span>
                <Kbd className="pointer-coarse:hidden">⇧D</Kbd>
              </Button>
              {bulk.restore > 0 && (
                <Button size="sm" className={SMALL} variant="outline" title={capTitle} onClick={() => actOnChecked('restore')}>
                  <RotateCcw />
                  Restore <span className="tabular-nums">{bulk.restore}</span>
                </Button>
              )}
              <Button size="icon-sm" variant="ghost" aria-label="Clear selection (Esc)" onClick={() => setChecked(new Set())}>
                <X />
              </Button>
            </div>
          )}
        </div>

        {wide && panel && (
          <Panel
            comment={panel.comment}
            rows={panel.rows}
            thread={panel.thread}
            replyTo={replyToOf(panel.comment)}
            rejectOpen={rejectFor === panel.comment.id}
            replyFocus={replyRequest?.id === panel.comment.id ? replyRequest.at : 0}
            acts={paneActs}
            onStep={step}
            onRejectFor={setRejectFor}
          />
        )}
      </div>

      {!wide && (
        <Drawer open={Boolean(selected)} onOpenChange={(open) => !open && closeDetail()} position="right">
          <DrawerPopup
            variant="straight"
            aria-label="Comment"
            className="w-full max-w-none duration-200 motion-reduce:transition-none"
            finalFocus={false}
            onKeyDown={onDrawerKeyDown}
          >
            {lastSelected.current && (
              <CommentDetail
                comment={selected ?? lastSelected.current}
                variant="drawer"
                position={{ index: Math.max(index, 0), total: rows.length }}
                onPrev={index > 0 ? () => move(-1, true) : null}
                onNext={index >= 0 && index < rows.length - 1 ? () => move(1, true) : null}
                {...paneProps(selected ?? lastSelected.current)}
              />
            )}
          </DrawerPopup>
        </Drawer>
      )}

      <BanDialog target={ban} open={banOpen} onOpenChange={setBanOpen} onDeletesComment={banDeletes} onSwept={view.resync} />
      <OwnerSignInDialog open={location.search.get('dialog') === 'owner'} />
    </div>
  );
}

const SORT_OPTIONS: ReadonlyArray<[CommentSort, string]> = [
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['risk', 'Riskiest first'],
];
const SURFACE_OPTIONS: ReadonlyArray<[string, string]> = [
  ['', 'Blog and mood'],
  ['blog', 'Blog'],
  ['mood', 'Mood'],
];
const REASON_OPTIONS: ReadonlyArray<[string, string]> = [['', 'Any verdict'], ...REASON_FILTERS.map((reason): [string, string] => [reason, REASON_LABELS[reason]])];
const MODEL_OPTIONS: ReadonlyArray<[string, string]> = [
  ['', 'Any'],
  ['akismet', 'Akismet alone'],
  ['llm', 'Akismet and the second opinion'],
  ['none', 'Not checked'],
];
const RANGE_OPTIONS: ReadonlyArray<[string, string]> = [['', 'Any time'], ...RANGES.map((range): [string, string] => [range, `Last ${RANGE_WORDS[range]}`])];

function optionLabel(options: ReadonlyArray<[string, string]>, value: string | null): string {
  return options.find(([key]) => key === (value ?? ''))?.[1] ?? '';
}

/** One filter as a submenu: its current value beside the name, and a pick
    closes the whole menu, so one filter is two clicks. */
function FilterSub({ label, value, options, onChange, note }: {
  label: string;
  value: string;
  options: ReadonlyArray<[string, string]>;
  onChange: (value: string) => void;
  note?: (value: string) => string | null;
}) {
  return (
    <MenuSub>
      <MenuSubTrigger className="pointer-coarse:min-h-11">
        <span className="flex-1">{label}</span>
        <span className="max-w-32 truncate text-muted-foreground text-xs">{optionLabel(options, value)}</span>
      </MenuSubTrigger>
      <MenuSubPopup className="min-w-52">
        <MenuRadioGroup value={value} onValueChange={(next) => onChange(next as string)}>
          {options.map(([key, text]) => (
            <MenuRadioItem key={key} value={key} closeOnClick className="pointer-coarse:min-h-11">
              <span className="flex items-baseline gap-2">
                {text}
                {note?.(key) && <span className="text-muted-foreground text-xs">{note(key)}</span>}
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuSubPopup>
    </MenuSub>
  );
}

/** Order, where, the checks' verdict, which checks ran, and when: one
    button whose label says what is on. */
function FilterMenu({ surface, reason, model, range, sort }: {
  surface: string | null;
  reason: string | null;
  model: string | null;
  range: CommentRange | null;
  sort: CommentSort | null;
}) {
  const on = [
    sort && sort !== 'newest' ? optionLabel(SORT_OPTIONS, sort) : null,
    surface ? optionLabel(SURFACE_OPTIONS, surface) : null,
    reason ? optionLabel(REASON_OPTIONS, reason) : null,
    model ? optionLabel(MODEL_OPTIONS, model) : null,
    range ? optionLabel(RANGE_OPTIONS, range) : null,
  ].filter((text): text is string => Boolean(text));

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            aria-label={on.length > 0 ? `Filters: ${on.join(', ')}` : 'Filters'}
            className={cn(SMALL, 'min-w-0 max-w-64 shrink-0 font-normal', on.length > 0 ? 'text-foreground' : 'text-muted-foreground')}
          />
        }
      >
        <FilterIcon />
        <span className="truncate">{on.length > 0 ? on.join(' · ') : 'Filter'}</span>
      </MenuTrigger>
      <MenuPopup align="start" className={cn('min-w-56', TOUCH_MENU)}>
        <FilterSub
          label="Order"
          value={sort ?? 'newest'}
          options={SORT_OPTIONS}
          onChange={(value) => setSearch({ sort: value === 'newest' ? null : value })}
          note={(value) => (value === 'risk' && !range ? `last ${SEARCH_DAYS} days` : null)}
        />
        <FilterSub label="Where" value={surface ?? ''} options={SURFACE_OPTIONS} onChange={(value) => setSearch({ surface: value || null })} />
        <FilterSub label="Checks said" value={reason ?? ''} options={REASON_OPTIONS} onChange={(value) => setSearch({ reason: value || null })} />
        <FilterSub label="Checked by" value={model ?? ''} options={MODEL_OPTIONS} onChange={(value) => setSearch({ model: value || null })} />
        <FilterSub label="Written" value={range ?? ''} options={RANGE_OPTIONS} onChange={(value) => setSearch({ range: value || null })} />
        {on.length > 0 && (
          <>
            <MenuSeparator />
            <MenuItem onClick={() => setSearch({ surface: null, reason: null, model: null, range: null, sort: null })}>
              <X />
              Clear filters
            </MenuItem>
          </>
        )}
      </MenuPopup>
    </Menu>
  );
}

/** The loaded rows of a comment's thread, oldest first, itself left out. */
function threadOf(comment: PortalComment, rows: readonly PortalComment[]): PortalComment[] {
  const root = threadRoot(comment);
  return rows
    .filter((row) => row.id !== comment.id && (row.id === root || row.parentId === root))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** The reading pane from 1280px. Memoized: it draws one render behind the
    list, from that render's rows and thread, so j or an act repaints the
    rows alone and the pane redraws once, in the deferred render after.
    Redrawing the old comment in the act's frame cost ~25ms at 4x CPU. */
const Panel = React.memo(function Panel({
  comment,
  rows,
  thread,
  replyTo,
  rejectOpen,
  replyFocus,
  acts,
  onStep,
  onRejectFor,
}: {
  comment: PortalComment;
  /** The rows of the render the comment is from: its place in the list. */
  rows: readonly PortalComment[];
  thread: readonly PortalComment[];
  replyTo: string | null;
  rejectOpen: boolean;
  replyFocus: number;
  acts: Pick<CommentDetailProps, 'onClose' | 'onAct' | 'onBan' | 'onPin' | 'onLock' | 'onOpenComment'>;
  onStep: (delta: number) => void;
  onRejectFor: (id: string | null) => void;
}) {
  const at = rows.findIndex((row) => row.id === comment.id);
  return (
    <aside aria-label="Comment detail" className="flex w-[440px] shrink-0 flex-col border-s">
      <CommentDetail
        comment={comment}
        variant="panel"
        position={{ index: Math.max(at, 0), total: rows.length }}
        onPrev={at > 0 ? () => onStep(-1) : null}
        onNext={at >= 0 && at < rows.length - 1 ? () => onStep(1) : null}
        replyTo={replyTo}
        rejectOpen={rejectOpen}
        onRejectOpenChange={(open) => onRejectFor(open ? comment.id : null)}
        replyFocus={replyFocus}
        thread={thread}
        {...acts}
      />
    </aside>
  );
});

/** The header: title, status counts, post picker, filters, search and the
    ⋯ menu, on one line from 1280px. Memoized, because j changes the URL and
    nothing here. */
const Toolbar = React.memo(function Toolbar({
  wide,
  status,
  counts,
  countsHidden,
  posts,
  postId,
  query,
  searchSpan,
  busy,
  surface,
  reason,
  model,
  range,
  sort,
  searchRef,
  onLeaveSearch,
}: {
  wide: boolean;
  status: StatusFilter;
  counts: Partial<Record<StatusFilter, number>> | null;
  /** Under a post, a search or a filter the counts would not match the list. */
  countsHidden: boolean;
  posts: ReadonlyArray<[string, string]>;
  postId: string | null;
  query: string;
  /** How far back a search reads, as words: `last 30 days`. */
  searchSpan: string;
  /** A new search or filter is loading; the rows shown are the last ones. */
  busy: boolean;
  surface: string | null;
  reason: string | null;
  model: string | null;
  range: CommentRange | null;
  sort: CommentSort | null;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onLeaveSearch: () => void;
}) {
  const postTitle = postId ? posts.find(([id]) => id === postId)?.[1] ?? 'One post' : null;
  const [text, setText] = useSearchText(query, (value) => setSearch({ q: value || null }));
  const tooShort = text.trim().length === 1;

  const statusControl = (
    <StateTabs
      label="Status"
      value={status}
      onChange={setStatus}
      countsHidden={countsHidden}
      options={STATUS_FILTERS.map((filter) => ({
        value: filter,
        label: STATUS_LABELS[filter],
        count: counts?.[filter] ?? null,
        urgent: filter === 'held',
      }))}
    />
  );

  const postPicker = (
    <Menu>
      <MenuTrigger
        render={
          <Button size="sm" variant="ghost" className={cn(SMALL, 'min-w-0 max-w-56 shrink-0 font-normal', postId ? 'text-foreground' : 'text-muted-foreground')} />
        }
      >
        <span className="truncate">{postTitle ?? 'All posts'}</span>
        <ChevronDown className="size-3.5 opacity-100" />
      </MenuTrigger>
      <MenuPopup align="start" className="max-w-80">
        <MenuRadioGroup value={postId ?? ''} onValueChange={(value) => setSearch({ post: (value as string) || null })}>
          <MenuRadioItem value="">All posts</MenuRadioItem>
          {posts.map(([id, title]) => (
            <MenuRadioItem key={id} value={id}>
              <span className="truncate">{title}</span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );

  // site-api searches comment text and writer names over a window, never
  // everything, and the box says so.
  const search = (
    <InputGroup className={cn('min-w-0', wide ? 'w-52 min-[1440px]:w-64' : 'flex-1')}>
      <InputGroupAddon>
        <Search aria-hidden className={cn(busy && 'animate-pulse text-foreground')} />
      </InputGroupAddon>
      <InputGroupInput
        ref={searchRef}
        type="search"
        maxLength={100}
        aria-label={`Search comment text and writer names, ${searchSpan}`}
        placeholder={wide ? `Search ${searchSpan}` : `Search ${searchSpan.replace('last ', '')}`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'ArrowDown') {
            event.preventDefault();
            // Enter searches now rather than after the pause.
            if (event.key === 'Enter') setSearch({ q: text || null });
            event.currentTarget.blur();
            onLeaveSearch();
          }
        }}
      />
      <InputGroupAddon align="inline-end" className={cn(!tooShort && 'pointer-coarse:hidden')}>
        {tooShort ? <span className="text-muted-foreground text-xs">2+ letters</span> : <Kbd>/</Kbd>}
      </InputGroupAddon>
    </InputGroup>
  );

  const filters = <FilterMenu surface={surface} reason={reason} model={model} range={range} sort={sort} />;

  const moreMenu = (
    <Menu>
      <MenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label="More" />}>
        <MoreHorizontal />
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuItem onClick={openOwnerSignIn}>
          <KeyRound />
          Write as the owner…
        </MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => navigate('/comments/bans')}>
          <Ban />
          Manage bans
        </MenuItem>
      </MenuPopup>
    </Menu>
  );

  return (
    <>
      <ScreenHeader title="Comments">
        {wide ? (
          <>
            <div className="ms-3 flex min-w-0 flex-1 items-center gap-1">
              {statusControl}
              {postPicker}
              {filters}
            </div>
            {search}
          </>
        ) : (
          <div className="ms-auto flex min-w-0 flex-1 justify-end">{search}</div>
        )}
        {moreMenu}
      </ScreenHeader>
      {!wide && (
        <div className={cn('flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto border-b ps-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', EDGE_FADE)}>
          {statusControl}
          {postPicker}
          {filters}
        </div>
      )}
    </>
  );
});

function PivotLine({ pivot, profile, rows, onBan }: {
  pivot: { key: AdminSourceKeyType; value: string };
  profile: ReturnType<typeof useSourceProfile>;
  rows: readonly PortalComment[];
  onBan: (target: BanTarget) => void;
}) {
  const banKey = sourceBanKey(pivot.key);
  const data = profile.data;
  const banned = Boolean(data?.bans.some((entry) => entry.keyType === banKey && entry.keyValue === pivot.value));
  // Show a readable value where a loaded row carries it in plain text.
  const sample = rows.find((row) =>
    pivot.key === 'ip' ? row.actor.keys.ip === pivot.value : pivot.key === 'email' ? row.actor.keys.email === pivot.value : false);
  const display = (pivot.key === 'ip' ? sample?.actor.ip : pivot.key === 'email' ? sample?.actor.email : null) ?? shortHandle(pivot.value);
  const byStatus = data?.comments.byStatus;

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b px-4 text-[13px]">
      <span className="flex min-w-0 shrink-0 items-center gap-1.5">
        <span className="text-muted-foreground">{sourceLabel(pivot.key)}</span>
        <code className="max-w-56 truncate font-mono text-foreground text-xs" title={pivot.value}>{display}</code>
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-3 truncate text-muted-foreground">
        {profile.isPending ? (
          <Skeleton className="h-3.5 w-72" />
        ) : profile.isError ? (
          <span>
            The profile did not load.{' '}
            <button type="button" className="text-foreground underline underline-offset-2" onClick={() => void profile.refetch()}>
              Try again
            </button>
          </span>
        ) : data ? (
          <span className="truncate tabular-nums">
            {data.firstSeenAt ? `first ${stamp(data.firstSeenAt)}` : 'never seen'}
            {data.lastSeenAt ? ` · last ${stamp(data.lastSeenAt)}` : ''}
            {` · ${data.comments.total} ${data.comments.total === 1 ? 'comment' : 'comments'}`}
            {byStatus
              ? `: ${(['held', 'published', 'rejected', 'deleted'] as const)
                  .filter((status) => byStatus[status] > 0)
                  .map((status) => `${byStatus[status]} ${STATUS_LABELS[status].toLowerCase()}`)
                  .join(', ')}`
              : ''}
            {data.reactions.total > 0 ? ` · ${data.reactions.total} reactions` : ''}
          </span>
        ) : null}
      </span>
      {banned ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-[hsl(var(--portal-danger))] text-xs">
          <Ban className="size-3.5" aria-hidden />
          Banned
        </span>
      ) : banKey ? (
        <Button
          size="sm"
          variant="destructive-outline"
          className={cn(SMALL, 'shrink-0')}
          onClick={() => onBan({ kind: 'source', type: pivot.key, value: pivot.value, ban: banKey, display })}
        >
          <Ban />
          Ban this {sourceLabel(pivot.key).toLowerCase()}
        </Button>
      ) : null}
      <Button size="icon-xs" variant="ghost" aria-label="Clear filter" className="shrink-0" onClick={() => setSearch({ key: null, value: null })}>
        <X />
      </Button>
    </div>
  );
}

function LoadingRows({ table }: { table: boolean }) {
  return (
    <div aria-hidden>
      {Array.from({ length: table ? 18 : 10 }, (_, i) =>
        table ? (
          <div key={i} className={cn('flex items-center gap-6 px-3', LINE, SPACED)}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 flex-1" />
          </div>
        ) : (
          <div key={i} className={cn('flex h-[68px] flex-col justify-center gap-2 px-3', SPACED)}>
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-full" />
          </div>
        ),
      )}
    </div>
  );
}

function EmptyLine({ status, query, since, filtered, onClear }: {
  status: StatusFilter;
  query: string | null;
  /** How far back the list read, as words, when it did not read everything. */
  since: string | null;
  filtered: boolean;
  onClear: () => void;
}) {
  const which = status === 'all' ? '' : `${STATUS_LABELS[status].toLowerCase()} `;
  const [text, action, run] = query
    ? [`No ${which}comment from the ${since ?? `last ${SEARCH_DAYS} days`} has “${query}” in its text or writer's name.`, 'Clear search', () => setSearch({ q: null })]
    : filtered
      ? [`No ${which}comments match these filters${since ? ` in the ${since}` : ''}.`, 'Clear filters', onClear]
      : status === 'held'
        ? ['Nothing is held. Comments the checks are unsure about land here.', 'Show all', () => setSearch({ status: null })]
        : status === 'all'
          ? ['No comments yet.', null, null]
          : [`No ${STATUS_LABELS[status].toLowerCase()} comments.`, 'Show all', () => setSearch({ status: null })];
  return (
    <p className="flex min-h-12 items-center gap-3 px-4 text-[13px] text-muted-foreground">
      {text}
      {action && run && (
        <Button size="sm" className={SMALL} variant="outline" onClick={run}>
          {action}
        </Button>
      )}
    </p>
  );
}
