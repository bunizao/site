import * as React from 'react';
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  AuditEntry,
  BroadcastRecord,
  NotifyGateDecision,
  NotifyGateStatus,
} from '@bunizao/contracts';
import type { PortalComments } from '@/features/admin/server/portal-client';
import { toastManager } from '@/components/coss/toast';
import { apiGet, apiSend, describeError } from '../app/api';
import { COUNTS_POLL_MS, commentKeys } from '../comments/data';

export const homeKeys = {
  gate: ['notify-gate'] as const,
  oldestHeld: (held: number) => ['comments', 'oldest-held', held] as const,
  broadcasts: ['broadcasts', 'list'] as const,
  audit: ['audit', 100] as const,
};

const gateOptions = {
  queryKey: homeKeys.gate,
  queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<NotifyGateStatus>('admin/notify-gate', undefined, signal),
};

export function useNotifyGate() {
  return useQuery({ ...gateOptions, refetchInterval: 60_000 });
}

/** The oldest held comment. The list is newest first with no sort param,
    so the last row of the held set is one `limit=1` read at `held - 1`. */
export function useOldestHeld(held: number | undefined) {
  return useQuery({
    queryKey: homeKeys.oldestHeld(held ?? 0),
    queryFn: ({ signal }) =>
      apiGet<PortalComments>('admin/comments', { status: 'held', limit: 1, offset: Math.max(0, (held ?? 1) - 1) }, signal),
    enabled: Boolean(held),
    select: (data) => data.comments[0] ?? null,
    placeholderData: keepPreviousData,
  });
}

/** The comments summary's 14 dense UTC days. Same key and request as the
    sidebar's held badge, so it costs nothing extra. */
export function useCommentDaily() {
  return useQuery({
    queryKey: commentKeys.counts(),
    queryFn: ({ signal }) => apiGet<PortalComments>('admin/comments', { status: 'held', limit: 0 }, signal),
    select: (data) => data.summary.daily,
    refetchInterval: COUNTS_POLL_MS,
  });
}

const broadcastsOptions = {
  queryKey: homeKeys.broadcasts,
  queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<{ broadcasts: BroadcastRecord[] }>('admin/broadcasts', undefined, signal),
};

export function useBroadcasts() {
  return useQuery({ ...broadcastsOptions, select: (data) => data.broadcasts });
}

const auditOptions = {
  queryKey: homeKeys.audit,
  queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<{ events: AuditEntry[] }>('admin/audit', { limit: 100 }, signal),
};

export function useAudit() {
  return useQuery({ ...auditOptions, select: (data) => data.events });
}

/** Home's own reads; HomeScreen's `prefetch` adds the shared ones. */
export function prefetchHomeReads(client: QueryClient): Promise<unknown> {
  return Promise.all([
    client.query({ ...gateOptions, staleTime: 'static' }),
    client.query({ ...broadcastsOptions, staleTime: 'static' }),
    client.query({ ...auditOptions, staleTime: 'static' }),
  ]);
}

interface GateReleaseResult {
  decision: NotifyGateDecision;
  releasedPostIds: string[];
  remainingHeldPostIds: string[];
  sent: number;
  failed: number;
  status: 'released' | 'held';
  executionState: 'completed' | 'failed' | 'in_progress';
}

const RELEASE_COPY: Record<NotifyGateDecision, { pending: string; done: string }> = {
  digest: { pending: 'Sending the held posts as one digest', done: 'Digest sent' },
  individual: { pending: 'Sending each held post', done: 'Held posts sent' },
  drop: { pending: 'Dropping the held posts', done: 'Held posts dropped' },
};

/** Release the gate. The row leaves Home on the same frame; the request
    follows, and a failure puts the row back with the reason. There is no
    undo: a sent email cannot be recalled, which is why the caller confirms. */
export function useReleaseGate() {
  const client = useQueryClient();
  return React.useCallback(
    (decision: NotifyGateDecision) => {
      const before = client.getQueryData<NotifyGateStatus>(homeKeys.gate);
      void client.cancelQueries({ queryKey: homeKeys.gate });
      if (before) client.setQueryData<NotifyGateStatus>(homeKeys.gate, { ...before, state: 'open', heldSince: null, heldPostIds: [] });
      const count = before?.heldPostIds.length ?? 0;
      const toastId = toastManager.add({
        type: 'loading',
        title: RELEASE_COPY[decision].pending,
        description: `${count} ${count === 1 ? 'post' : 'posts'}. You can keep working.`,
        timeout: 0,
      });

      apiSend<GateReleaseResult>('POST', 'admin/notify-gate/release', { decision })
        .then((result) => {
          const failed = result.executionState !== 'completed' || result.failed > 0;
          const remaining = result.remainingHeldPostIds.length;
          toastManager.update(toastId, {
            type: failed ? 'error' : 'success',
            title: failed ? 'Some emails did not go out' : RELEASE_COPY[decision].done,
            description: failed
              ? `${result.failed} failed. The held posts were kept, so you can release them again from Home.`
              : [
                  decision === 'drop' ? null : `${result.sent} ${result.sent === 1 ? 'email' : 'emails'} sent.`,
                  remaining ? `${remaining} newer ${remaining === 1 ? 'post is' : 'posts are'} still held.` : null,
                ].filter(Boolean).join(' ') || undefined,
            timeout: failed ? 0 : 5_000,
          });
        })
        .catch((error) => {
          if (before) client.setQueryData(homeKeys.gate, before);
          toastManager.update(toastId, {
            type: 'error',
            title: 'The gate was not released',
            description: describeError(error),
            timeout: 0,
          });
        })
        .finally(() => void client.invalidateQueries({ queryKey: homeKeys.gate }));
    },
    [client],
  );
}
