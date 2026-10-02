import * as React from 'react';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  AdminBan,
  AdminBanKeyType,
  AdminBanListResult,
  AdminBanOperation,
  AdminBanOperationListResult,
  AdminBanRestoreResult,
  AdminBanResult,
  AdminCommentInsights,
  AdminCommentInsightsWindow,
  AdminReactionInsights,
  AdminReactionInsightsWindow,
  AdminReactionListResult,
  AdminReactionRecord,
  AdminSourceKeyType,
} from '@bunizao/contracts';
import type { PortalComments } from '@/features/admin/server/portal-client';
import { toastManager } from '@/components/coss/toast';
import { ApiError, apiGet, apiSend, describeError } from '../app/api';
import { shareRowsById } from '../app/share-rows';
import { forgetUndo, registerUndo } from '../app/undo';
import { COUNTS_POLL_MS, commentKeys } from '../comments/data';
import { BAN_TYPE_LABELS, banId, keyText } from './format';

/* Reads and writes for bans, reactions and insights.

   Two rules from how the old portal felt: a write changes the cache in the
   same frame as the click, and changing a filter keeps the old rows on
   screen until the new ones arrive (`keepPreviousData`), so nothing blanks
   or jumps while a request is in flight. BanDialog invalidates `['bans']`,
   so every bans key starts with it. */

export const banKeys = {
  all: ['bans'] as const,
  list: () => ['bans', 'list'] as const,
  operations: () => ['bans', 'operations'] as const,
};

export type ReactionTarget = 'post' | 'comment';

export interface ReactionFilter {
  target: ReactionTarget | null;
  targetId: string | null;
  key: AdminSourceKeyType | null;
  value: string | null;
}

export const reactionKeys = {
  all: ['reactions'] as const,
  list: (filter: ReactionFilter) => ['reactions', 'list', filter] as const,
  insights: (window: AdminReactionInsightsWindow) => ['reactions', 'insights', window] as const,
};

export const insightKeys = {
  comments: (window: AdminCommentInsightsWindow) => ['insights', 'comments', window] as const,
};

// ---------------------------------------------------------------------------
// Bans
// ---------------------------------------------------------------------------

const selectBans = (data: AdminBanListResult) => data.bans;

/** The whole list, expired rows included; site-api caps it at 500, so
    search and sorting stay in the browser. */
const bansOptions = {
  queryKey: banKeys.list(),
  queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<AdminBanListResult>('admin/bans', undefined, signal),
  // Lifting a ban keeps every other row's object, matched by key.
  structuralSharing: shareRowsById<AdminBan>('bans', banId),
};

export function useBans() {
  return useQuery({ ...bansOptions, select: selectBans });
}

const selectOperations = (data: AdminBanOperationListResult) => data.operations;

const operationsOptions = {
  queryKey: banKeys.operations(),
  queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<AdminBanOperationListResult>('admin/bans/operations', undefined, signal),
  structuralSharing: shareRowsById<AdminBanOperation>('operations', (operation) => operation.id),
};

export function useBanOperations() {
  return useQuery({ ...operationsOptions, select: selectOperations });
}

/** Both lists: the Bans screen mounts both queries whichever view is open. */
export function prefetchBans(client: QueryClient): Promise<unknown> {
  return Promise.all([client.query({ ...bansOptions, staleTime: 'static' }), client.query({ ...operationsOptions, staleTime: 'static' })]);
}

function patchBans(client: QueryClient, patch: (bans: AdminBan[]) => AdminBan[]): void {
  client.setQueryData<AdminBanListResult>(banKeys.list(), (data) => (data ? { ...data, bans: patch(data.bans) } : data));
}

/** Put rows in, replacing any with the same key, newest first like the server. */
function upsertBans(client: QueryClient, rows: readonly AdminBan[]): void {
  const ids = new Set(rows.map(banId));
  patchBans(client, (bans) =>
    [...rows, ...bans.filter((ban) => !ids.has(banId(ban)))].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
}

function removeBans(client: QueryClient, ids: ReadonlySet<string>): void {
  patchBans(client, (bans) => bans.filter((ban) => !ids.has(banId(ban))));
}

function deleteBan(ban: Pick<AdminBan, 'keyType' | 'keyValue'>): Promise<unknown> {
  return apiSend('DELETE', `admin/bans/${encodeURIComponent(ban.keyType)}/${encodeURIComponent(ban.keyValue)}`).catch(
    (error: unknown) => {
      // Already gone is what we asked for.
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    },
  );
}

/** Write one ban back exactly: the expiry is always sent, because site-api
    turns a missing one into seven days. */
function putBan(ban: Pick<AdminBan, 'keyType' | 'keyValue' | 'note' | 'expiresAt'>): Promise<AdminBanResult> {
  return apiSend<AdminBanResult>('POST', 'admin/bans', {
    keys: [{ type: ban.keyType, value: ban.keyValue }],
    note: ban.note ?? undefined,
    expiresAt: ban.expiresAt,
  });
}

function describeBan(ban: AdminBan): string {
  return `${BAN_TYPE_LABELS[ban.keyType].toLowerCase()} ${keyText(ban.keyType, ban.keyValue)}`;
}

/** Lift one or many bans at once, with undo. Returns a function that undoes
    it and closes the toast, for an inline Undo next to the lifted row. */
export function useLiftBans() {
  const client = useQueryClient();

  return React.useCallback(
    (bans: readonly AdminBan[]): (() => void) => {
      const ids = new Set(bans.map(banId));
      removeBans(client, ids);
      const request = Promise.all(bans.map(deleteBan));
      request.catch((error: unknown) => {
        toastManager.add({
          type: 'error',
          title: bans.length === 1 ? 'The ban was not lifted' : `${bans.length} bans were not lifted`,
          description: describeError(error),
        });
        void client.invalidateQueries({ queryKey: banKeys.all });
      });

      let undone = false;
      const undo = (): void => {
        if (undone) return;
        undone = true;
        upsertBans(client, bans);
        // Wait for the delete, or the re-ban can land first and be deleted.
        void request
          .catch(() => null)
          .then(() => Promise.all(bans.map(putBan)))
          .catch((error: unknown) => {
            toastManager.add({ type: 'error', title: 'The ban was not put back', description: describeError(error) });
            void client.invalidateQueries({ queryKey: banKeys.all });
          });
        // The re-created row has a fresh created_at on the server; keeping
        // the old one here until the next refetch stops it jumping to the top.
      };

      const toastId: string = toastManager.add({
        type: 'success',
        title: bans.length === 1 ? `Lifted the ban on ${describeBan(bans[0])}` : `Lifted ${bans.length} bans`,
        description: 'Their next comments are checked like anyone else’s.',
        timeout: 6000,
        actionProps: { children: 'Undo', onClick: undo },
        onRemove: (): void => forgetUndo(toastId),
      });
      registerUndo(toastId, undo);

      return () => {
        undo();
        forgetUndo(toastId);
        toastManager.close(toastId);
      };
    },
    [client],
  );
}

export interface BanDraft {
  type: AdminBanKeyType;
  value: string;
  note: string;
  /** Days until expiry, or null for never. */
  days: number | null;
}

/** Add (or edit) one ban. The row is in the list before the request leaves;
    a refusal takes it out again and offers the form back. */
export function useAddBan(onRetry: (draft: BanDraft) => void) {
  const client = useQueryClient();

  return React.useCallback(
    (draft: BanDraft) => {
      const previous = client.getQueryData<AdminBanListResult>(banKeys.list())?.bans
        .find((ban) => ban.keyType === draft.type && ban.keyValue === draft.value) ?? null;
      const optimistic: AdminBan = {
        keyType: draft.type,
        keyValue: draft.value,
        note: draft.note.trim() || null,
        source: 'portal',
        createdAt: previous?.createdAt ?? new Date().toISOString(),
        expiresAt: draft.days === null ? null : new Date(Date.now() + draft.days * 86_400_000).toISOString(),
        hits: previous?.hits ?? 0,
      };
      upsertBans(client, [optimistic]);

      const request = putBan(optimistic);
      let toastId = '';
      request.then(
        (result) => {
          const saved = result.bans[0];
          if (saved) upsertBans(client, [{ ...saved, createdAt: optimistic.createdAt }]);
        },
        (error: unknown) => {
          if (previous) upsertBans(client, [previous]);
          else removeBans(client, new Set([banId(optimistic)]));
          toastManager.close(toastId);
          toastManager.add({
            type: 'error',
            title: `Could not ban ${describeBan(optimistic)}`,
            description: describeBanError(error),
            timeout: 10_000,
            actionProps: { children: 'Edit and retry', onClick: () => onRetry(draft) },
          });
        },
      );

      const undo = (): void => {
        if (previous) upsertBans(client, [previous]);
        else removeBans(client, new Set([banId(optimistic)]));
        void request
          .then(() => (previous ? putBan(previous) : deleteBan(optimistic)))
          .catch(() => {
            void client.invalidateQueries({ queryKey: banKeys.all });
          });
      };
      toastId = toastManager.add({
        type: 'success',
        title: previous ? `Updated the ban on ${describeBan(optimistic)}` : `Banned ${describeBan(optimistic)}`,
        description: 'Their next comments are held silently.',
        timeout: 6000,
        actionProps: { children: 'Undo', onClick: undo },
        onRemove: (): void => forgetUndo(toastId),
      });
      registerUndo(toastId, undo);
    },
    [client, onRetry],
  );
}

/** Ban refusals worth their own words; the rest use the shared copy. */
export function describeBanError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'protected_email_domain') {
      return `${error.message} Ban the individual addresses instead.`;
    }
    if (error.code === 'invalid_key') return 'That value is not a key a ban can hold. Paste it again from a comment’s key list.';
    if (error.code === 'too_many_keys') return 'At most 20 keys fit in one ban. Split it into two.';
  }
  return describeError(error);
}

export function useRestoreOperation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiSend<AdminBanRestoreResult>('POST', `admin/bans/operations/${encodeURIComponent(id)}/restore`),
    onSuccess: (result) => {
      client.setQueryData<AdminBanOperationListResult>(banKeys.operations(), (data) =>
        data
          ? { ...data, operations: data.operations.map((row) => (row.id === result.operation.id ? result.operation : row)) }
          : data,
      );
      void client.invalidateQueries({ queryKey: commentKeys.all });
      void client.invalidateQueries({ queryKey: reactionKeys.all });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: banKeys.operations() });
    },
  });
}

export function isRestorable(operation: AdminBanOperation, now = Date.now()): boolean {
  return !operation.restoredAt && Date.parse(operation.restorableUntil) > now
    && operation.purged.comments + operation.purged.reactions > 0;
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

const REACTION_PAGE = 50;

const shareReactions = shareRowsById<AdminReactionRecord>('reactions', (row) => row.id);

function reactionsOptions(filter: ReactionFilter) {
  return {
    queryKey: reactionKeys.list(filter),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }: { pageParam: number; signal: AbortSignal }) =>
      apiGet<AdminReactionListResult>(
        'admin/reactions',
        {
          targetType: filter.target,
          targetId: filter.targetId,
          key: filter.key,
          value: filter.value,
          limit: REACTION_PAGE,
          offset: pageParam,
        },
        signal,
      ),
    // An empty page ends the list even if an offset came back, so a bad
    // cursor cannot loop the load-more sentinel.
    getNextPageParam: (last: AdminReactionListResult) => (last.reactions.length > 0 ? last.nextOffset ?? undefined : undefined),
    // A ban that purges reactions keeps every other row's object.
    structuralSharing: shareReactions,
  };
}

export function useReactions(filter: ReactionFilter) {
  return useInfiniteQuery({ ...reactionsOptions(filter), placeholderData: keepPreviousData });
}

function reactionInsightsOptions(window: AdminReactionInsightsWindow) {
  return {
    queryKey: reactionKeys.insights(window),
    queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<AdminReactionInsights>('admin/reactions/insights', { window }, signal),
    staleTime: 60_000,
  };
}

export function useReactionInsights(window: AdminReactionInsightsWindow) {
  return useQuery({ ...reactionInsightsOptions(window), placeholderData: keepPreviousData });
}

export function prefetchReactions(client: QueryClient, filter: ReactionFilter, window: AdminReactionInsightsWindow): Promise<unknown> {
  return Promise.all([
    client.infiniteQuery({ ...reactionsOptions(filter), staleTime: 'static' }),
    client.query({ ...reactionInsightsOptions(window), staleTime: 'static' }),
  ]);
}

// ---------------------------------------------------------------------------
// Comment insights
// ---------------------------------------------------------------------------

function fetchCommentInsights(window: AdminCommentInsightsWindow, signal?: AbortSignal) {
  return apiGet<AdminCommentInsights>('admin/comments/insights', { window }, signal);
}

/** Insights scan every comment in the window, so they are cached for a
    minute and a window is only fetched when asked for. */
export function useCommentInsights(window: AdminCommentInsightsWindow) {
  return useQuery({
    queryKey: insightKeys.comments(window),
    queryFn: ({ signal }) => fetchCommentInsights(window, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function prefetchCommentInsights(client: QueryClient, window: AdminCommentInsightsWindow): Promise<unknown> {
  return client.query({
    queryKey: insightKeys.comments(window),
    queryFn: ({ signal }) => fetchCommentInsights(window, signal),
    staleTime: 'static',
  });
}

/** Start the request on pointer-down, a few frames before the click lands. */
export function usePrefetchCommentInsights() {
  const client = useQueryClient();
  // A failed warm-up is the query's to report when the window opens.
  return React.useCallback((window: AdminCommentInsightsWindow) => void prefetchCommentInsights(client, window).catch(() => {}), [client]);
}

const selectSummary = (data: PortalComments) => data.summary;

/** The status summary rides along with the sidebar's count query, so the
    reasons and top posts cost no request of their own. Same key, same
    fetch, different `select`. */
export function useCommentSummary() {
  return useQuery({
    queryKey: commentKeys.counts(),
    queryFn: ({ signal }) => apiGet<PortalComments>('admin/comments', { status: 'held', limit: 0 }, signal),
    select: selectSummary,
    refetchInterval: COUNTS_POLL_MS,
  });
}
