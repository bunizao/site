import * as React from 'react';
import {
  infiniteQueryOptions,
  keepPreviousData,
  useInfiniteQuery,
  useQueries,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { BroadcastAudience, BroadcastInput, BroadcastPreviewResult, BroadcastRecord, BroadcastSendResult } from '@bunizao/contracts';
import { ApiError, apiGet, apiUrl, describeError } from '../app/api';
import { shareRowsById } from '../app/share-rows';
import { attempted } from './broadcast-model';

/* Reads and writes for the broadcast screen.

   History is site-api's list, newest first, 30 a page. A send in progress
   is polled through its own progress endpoint every two seconds while the
   page is visible, and the answer is laid over the row at render time, not
   written into the list: the stored row lags the job, and a list refetch
   must never pull a progress bar backwards. */

export const HISTORY_PAGE = 30;

export const broadcastKeys = {
  all: ['broadcasts'] as const,
  /** Home's first page (see home/data.ts): the same request, reused. */
  home: ['broadcasts', 'list'] as const,
  history: ['broadcasts', 'history'] as const,
  detail: (id: string) => ['broadcasts', 'detail', id] as const,
  progress: (id: string) => ['broadcasts', 'progress', id] as const,
  count: (audience: string) => ['broadcasts', 'count', audience] as const,
  preview: (subject: string, body: string) => ['broadcasts', 'preview', subject, body] as const,
};

interface ListResult {
  broadcasts: BroadcastRecord[];
}

export interface BroadcastProgress {
  id: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: BroadcastRecord['status'];
}

/** A POST that can be cancelled and carry headers, which apiSend cannot. */
async function post<T>(path: string, body: unknown, init: { signal?: AbortSignal; headers?: Record<string, string> } = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...init.headers },
    body: JSON.stringify(body),
    signal: init.signal,
  });
  const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!response.ok) {
    const code = payload?.error ?? null;
    throw new ApiError(response.status, code, payload?.message ?? code ?? `HTTP ${response.status}`);
  }
  return payload as T;
}

const historyOptions = infiniteQueryOptions({
  queryKey: broadcastKeys.history,
  initialPageParam: 0,
  queryFn: ({ pageParam, signal }) => apiGet<ListResult>('admin/broadcasts', { limit: HISTORY_PAGE, offset: pageParam }, signal),
  getNextPageParam: (last, pages) => (last.broadcasts.length === HISTORY_PAGE ? pages.length * HISTORY_PAGE : undefined),
  staleTime: 30_000,
  // A new broadcast on top keeps every other row's object.
  structuralSharing: shareRowsById<BroadcastRecord>('broadcasts', (row) => row.id),
});

export function useBroadcastHistory() {
  const client = useQueryClient();
  return useInfiniteQuery({
    ...historyOptions,
    // Coming from Home, its first page is already here: paint it at once.
    placeholderData: () => {
      const home = client.getQueryData<ListResult>(broadcastKeys.home);
      return home ? { pages: [home], pageParams: [0] } : undefined;
    },
  });
}

/** Warms the first history page; cached pages are enough, however old.
    With only Home's copy cached, the screen paints that as a placeholder,
    so the request goes out but nothing waits for it. */
export function prefetchBroadcastHistory(client: QueryClient): Promise<unknown> | undefined {
  const placeholder = !client.getQueryData(broadcastKeys.history) && Boolean(client.getQueryData(broadcastKeys.home));
  const warm = client.infiniteQuery({ ...historyOptions, staleTime: 'static' });
  if (!placeholder) return warm;
  warm.catch(() => {}); // The screen's own query reports a failure.
  return undefined;
}

/** Rows of every loaded page, once each, newest first. */
export function flattenHistory(data: { pages: readonly ListResult[] } | undefined): BroadcastRecord[] | undefined {
  if (!data) return undefined;
  const seen = new Set<string>();
  const rows: BroadcastRecord[] = [];
  for (const page of data.pages) {
    for (const row of page.broadcasts) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows;
}

/** One broadcast, for a link to one not in the loaded history. */
export function useBroadcastDetail(id: string | null) {
  return useQuery({
    queryKey: broadcastKeys.detail(id ?? ''),
    queryFn: ({ signal }) => apiGet<{ broadcast: BroadcastRecord }>(`admin/broadcasts/${encodeURIComponent(id!)}`, undefined, signal),
    select: (data) => data.broadcast,
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

function finished(client: QueryClient): void {
  // The stored row now has its final counts and `sentAt`; Home's list too.
  void client.invalidateQueries({ queryKey: broadcastKeys.all, predicate: (query) => query.queryKey[1] !== 'progress' });
}

// Module level, so `combine` keeps its result between renders.
function progressMap(results: Array<UseQueryResult<BroadcastProgress>>): ReadonlyMap<string, BroadcastProgress> {
  const map = new Map<string, BroadcastProgress>();
  for (const result of results) if (result.data) map.set(result.data.id, result.data);
  return map;
}

/** Live progress of each id, polled every 2s while the page is visible and
    the send is running. */
export function useBroadcastProgress(ids: readonly string[]): ReadonlyMap<string, BroadcastProgress> {
  const client = useQueryClient();
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: broadcastKeys.progress(id),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const { progress } = await apiGet<{ progress: BroadcastProgress }>(
          `admin/broadcasts/${encodeURIComponent(id)}/progress`,
          undefined,
          signal,
        );
        if (progress.status !== 'sending') finished(client);
        return progress;
      },
      refetchInterval: (query: { state: { data?: BroadcastProgress } }) => (query.state.data && query.state.data.status !== 'sending' ? false : 2_000),
      refetchIntervalInBackground: false,
      staleTime: 1_000,
      retry: 1,
    })),
    combine: progressMap,
  });
}

/** A row with its live progress laid over, never moving backwards. */
export function withProgress(row: BroadcastRecord, progress: BroadcastProgress | undefined): BroadcastRecord {
  if (!progress || attempted(progress) < attempted(row)) return row;
  if (
    progress.status === row.status
    && progress.sentCount === row.sentCount
    && progress.failedCount === row.failedCount
    && progress.recipientCount === row.recipientCount
  ) {
    return row;
  }
  return { ...row, status: progress.status, sentCount: progress.sentCount, failedCount: progress.failedCount, recipientCount: progress.recipientCount };
}

/* ------------------------------------------------------------------ */
/* Composer                                                            */
/* ------------------------------------------------------------------ */

/** A value that follows `value` once it has held still for `ms`. */
export function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    if (Object.is(value, settled)) return;
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, settled, ms]);
  return settled;
}

/** The exact recipient count for an audience, from site-api's dry run.
    Cached per audience, so going back to one is instant; a new one is
    asked for once the picks hold still for 250ms, and a pick made while
    it is in flight cancels it. */
export function useRecipientCount(audience: BroadcastAudience, key: string) {
  const settled = useSettled(key, 250);
  return useQuery({
    queryKey: broadcastKeys.count(key),
    // site-api wants a subject and body even for a dry run; neither changes the count.
    queryFn: ({ signal }) =>
      post<{ recipientCount: number }>('admin/broadcasts', { subject: 'Recipient count', body: 'Recipient count', audience, dryRun: true }, { signal }),
    select: (data) => data.recipientCount,
    enabled: audience.channels.length > 0 && settled === key,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}

/** The email as site-api will render it, once typing pauses. The audience
    only changes the counts it returns, so it is not part of the key. */
export function useBroadcastPreview(subject: string, body: string, audience: BroadcastAudience) {
  const input = useSettled(`${subject}\u0000${body}`, 400);
  const [settledSubject, settledBody] = input.split('\u0000');
  const audienceRef = React.useRef(audience);
  audienceRef.current = audience;
  return useQuery({
    queryKey: broadcastKeys.preview(settledSubject, settledBody),
    queryFn: ({ signal }) =>
      post<BroadcastPreviewResult>('admin/broadcasts/preview', { subject: settledSubject, body: settledBody, audience: audienceRef.current }, { signal }),
    enabled: Boolean(settledSubject.trim() && settledBody.trim()),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function sendBroadcast(input: BroadcastInput, idempotencyKey: string): Promise<BroadcastSendResult> {
  return post<BroadcastSendResult>('admin/broadcasts', input, { headers: { 'Idempotency-Key': idempotencyKey } });
}

/** Puts a just-sent broadcast at the top of the history, then asks for the
    stored row, which brings the rendered body. */
export function insertBroadcast(client: QueryClient, row: BroadcastRecord): void {
  client.setQueryData<InfiniteData<ListResult, number>>(broadcastKeys.history, (data) => {
    if (!data || data.pages.some((page) => page.broadcasts.some((entry) => entry.id === row.id))) return data;
    const [first, ...rest] = data.pages;
    return { ...data, pages: [{ broadcasts: [row, ...(first?.broadcasts ?? [])] }, ...rest] };
  });
  void client.invalidateQueries({ queryKey: broadcastKeys.all, predicate: (query) => query.queryKey[1] === 'history' || query.queryKey[1] === 'list' });
}

/** Human copy for a failed broadcast call. Every message says what to do. */
export function describeBroadcastError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'audience_empty':
        return 'No subscriber matches this audience. Add a channel or switch to Active.';
      case 'audience_required':
        return 'Pick at least one channel.';
      case 'subject_required':
        return 'The subject is empty. Write one, then send.';
      case 'body_required':
        return 'The message is empty. Write it, then send.';
      case 'idempotency_conflict':
        return 'This send was already started with different content. Press Send again to start a new one.';
      case 'idempotency_key_required':
        return 'The send had no valid idempotency key. Press Send again.';
      case 'resend_api_key_missing':
        return 'site-api cannot send email: RESEND_API_KEY is not set. Set the secret, then try again.';
      case 'notify_from_email_missing':
        return 'site-api cannot send email: NOTIFY_FROM_EMAIL is not set. Set it, then try again.';
      case 'broadcast_jobs_unavailable':
        return 'site-api has no BROADCAST_JOBS binding, so it cannot run a send. Deploy it with the binding, then try again.';
      default:
        break;
    }
    if (error.status === 404) return 'That broadcast does not exist. The link may be wrong.';
  }
  return describeError(error);
}
