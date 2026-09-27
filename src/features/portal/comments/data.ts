import * as React from 'react';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import type { AdminSourceKeyType } from '@bunizao/contracts';
import type { PortalComment, PortalComments, PortalCommentStatus } from '@/features/admin/server/portal-client';
import { toastManager } from '@/components/coss/toast';
import { apiGet, apiSend, describeError } from '../app/api';
import { forgetUndo, registerUndo } from '../app/undo';

export type StatusFilter = PortalCommentStatus | 'all';
export type Verdict = 'approve' | 'hide' | 'delete';

export const STATUS_FILTERS: readonly StatusFilter[] = ['held', 'published', 'rejected', 'deleted', 'all'];

export const STATUS_LABELS: Record<StatusFilter, string> = {
  held: 'Held',
  published: 'Published',
  rejected: 'Rejected',
  deleted: 'Deleted',
  all: 'All',
};

export interface CommentFilter {
  status: StatusFilter;
  postId?: string | null;
  key?: AdminSourceKeyType | null;
  value?: string | null;
}

const PAGE_SIZE = 50;

export const commentKeys = {
  all: ['comments'] as const,
  lists: () => ['comments', 'list'] as const,
  list: (filter: CommentFilter) => ['comments', 'list', filter] as const,
  counts: () => ['comments', 'counts'] as const,
};

export function useCommentList(filter: CommentFilter) {
  return useInfiniteQuery({
    queryKey: commentKeys.list(filter),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      apiGet<PortalComments>(
        'admin/comments',
        {
          status: filter.status,
          postId: filter.postId,
          key: filter.key,
          value: filter.value,
          limit: PAGE_SIZE,
          offset: pageParam,
        },
        signal,
      ),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    // The inbox is where new work lands; keep it fresh while it is open.
    refetchInterval: filter.status === 'held' ? 30_000 : false,
  });
}

/** Status counts for the sidebar badge and the tab strip. One row is the
    cheapest request that still carries the summary block. */
export function useCommentCounts() {
  return useQuery({
    queryKey: commentKeys.counts(),
    queryFn: ({ signal }) => apiGet<PortalComments>('admin/comments', { status: 'held', limit: 1 }, signal),
    select: (data) => ({ ...data.summary.byStatus, oldestHeldAt: data.summary.oldestHeldAt }),
    refetchInterval: 30_000,
  });
}

/* Deletes wait out their undo window before anything is sent: the backend
   has no undelete yet, so the only honest undo is not having done it. The
   rows stay out of every list meanwhile, and a closing tab flushes them. */

const pendingDeletes = new Map<string, () => void>();
const pendingListeners = new Set<() => void>();
let pendingSnapshot: ReadonlySet<string> = new Set();

function emitPending(): void {
  pendingSnapshot = new Set(pendingDeletes.keys());
  for (const listener of pendingListeners) listener();
}

export function usePendingDeletes(): ReadonlySet<string> {
  return React.useSyncExternalStore(
    (listener) => {
      pendingListeners.add(listener);
      return () => pendingListeners.delete(listener);
    },
    () => pendingSnapshot,
    () => pendingSnapshot,
  );
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const commit of pendingDeletes.values()) commit();
  });
}

/** What undoing a verdict does, given the status the row had before it. */
function inverseOf(verdict: Verdict): Verdict | null {
  if (verdict === 'approve') return 'hide';
  if (verdict === 'hide') return 'approve';
  return null;
}

const NEXT_STATUS: Record<Verdict, PortalCommentStatus> = {
  approve: 'published',
  hide: 'held',
  delete: 'deleted',
};

const RECEIPTS: Record<Verdict, string> = {
  approve: 'Approved and published',
  hide: 'Unpublished and moved back to Held',
  delete: 'Deleted',
};

type ListData = InfiniteData<PortalComments, number>;

function patchLists(client: QueryClient, ids: ReadonlySet<string>, status: PortalCommentStatus): void {
  for (const [key, data] of client.getQueriesData<ListData>({ queryKey: commentKeys.lists() })) {
    if (!data) continue;
    const filter = (key[2] ?? { status: 'all' }) as CommentFilter;
    const keep = filter.status === 'all' || filter.status === status;
    client.setQueryData<ListData>(key, {
      ...data,
      pages: data.pages.map((page) => {
        const comments = keep
          ? page.comments.map((row) => (ids.has(row.id) ? { ...row, status } : row))
          : page.comments.filter((row) => !ids.has(row.id));
        return { ...page, comments, total: page.total - (page.comments.length - comments.length) };
      }),
    });
  }
}

function send(id: string, verdict: Verdict, keepalive = false) {
  return apiSend<{ result: string }>('POST', `admin/comments/${encodeURIComponent(id)}`, { action: verdict }, { keepalive });
}

export function useModerate() {
  const client = useQueryClient();

  const settle = React.useCallback(() => {
    void client.invalidateQueries({ queryKey: commentKeys.all });
  }, [client]);

  const fail = React.useCallback(
    (error: unknown, count: number) => {
      toastManager.add({
        type: 'error',
        title: count > 1 ? `${count} comments were not updated` : 'The comment was not updated',
        description: describeError(error),
      });
      settle();
    },
    [settle],
  );

  /** Apply one verdict to one or many comments, optimistically, with undo. */
  return React.useCallback(
    (rows: readonly PortalComment[], verdict: Verdict) => {
      if (rows.length === 0) return;
      const ids = new Set(rows.map((row) => row.id));
      const label = rows.length === 1 ? RECEIPTS[verdict] : `${RECEIPTS[verdict]}: ${rows.length} comments`;

      if (verdict === 'delete') {
        const commit = (): void => {
          for (const id of ids) pendingDeletes.delete(id);
          emitPending();
          Promise.all([...ids].map((id) => send(id, 'delete', true))).then(settle, (error) => fail(error, ids.size));
        };
        for (const id of ids) pendingDeletes.set(id, commit);
        emitPending();
        let undone = false;
        const undo = (): void => {
          undone = true;
          for (const id of ids) pendingDeletes.delete(id);
          emitPending();
        };
        const toastId = toastManager.add({
          title: label,
          description: 'You have 6 seconds to undo.',
          timeout: 6000,
          actionProps: { children: 'Undo', onClick: undo },
          onRemove: () => {
            forgetUndo(toastId);
            if (!undone && [...ids].some((id) => pendingDeletes.has(id))) commit();
          },
        });
        registerUndo(toastId, undo);
        return;
      }

      const before = new Map(rows.map((row) => [row.id, row.status]));
      patchLists(client, ids, NEXT_STATUS[verdict]);
      const request = Promise.all([...ids].map((id) => send(id, verdict)));
      request.then(settle, (error) => fail(error, ids.size));

      const inverse = inverseOf(verdict);
      const fromRejected = [...before.values()].some((status) => status === 'rejected');
      const undo = inverse
        ? (): void => {
            void request
              .then(() => {
                patchLists(client, ids, NEXT_STATUS[inverse]);
                return Promise.all([...ids].map((id) => send(id, inverse)));
              })
              .then(settle, (error) => fail(error, ids.size));
          }
        : null;
      const toastId = toastManager.add({
        type: 'success',
        title: label,
        description: inverse === 'hide' && fromRejected ? 'Undo moves it to Held, not back to Rejected.' : undefined,
        timeout: 5000,
        actionProps: undo ? { children: 'Undo', onClick: undo } : undefined,
        onRemove: () => forgetUndo(toastId),
      });
      if (undo) registerUndo(toastId, undo);
    },
    [client, fail, settle],
  );
}
