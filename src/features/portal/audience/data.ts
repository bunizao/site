import * as React from 'react';
import { infiniteQueryOptions, useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import type { AuditEntry, SubscriberListResult, SubscriberRecord } from '@bunizao/contracts';
import { toastManager } from '@/components/coss/toast';
import { ApiError, apiGet, apiSend, describeError } from '../app/api';
import { shareRowsById } from '../app/share-rows';
import { forgetUndo, registerUndo } from '../app/undo';
import { plural } from '../moderation/format';
import {
  ALL,
  applyPatch,
  matchesFilter,
  matchesQuery,
  normalizeQuery,
  restorePatch,
  type Filter,
  type StatusFilter,
  type SubscriberPatch,
} from './model';

/* Reads and writes for the subscriber screen.

   The whole list comes down once when it is small (up to LOCAL_CAP rows,
   in pages of 200), and then every filter, count, search and export is
   computed in the browser: a filter switch never waits on the network.
   Past the cap, each filter is its own server query. site-api's `total`
   and counts are global whatever the filter, so a page is the last one
   when it comes back short.

   Writes change the cache first and the server second. Rows are patched
   in place and never removed, so nothing moves under the pointer. */

export const PAGE = 200;
export const LOCAL_CAP = 2000;

export const subscriberKeys = {
  all: ['subscribers'] as const,
  lists: () => ['subscribers', 'list'] as const,
  list: (filter: Filter, search: string) =>
    ['subscribers', 'list', filter.status, filter.channel ?? '', filter.delivery ?? '', search] as const,
  counts: () => ['subscribers', 'counts'] as const,
  detail: (hash: string) => ['subscribers', 'detail', hash] as const,
};

type ListData = InfiniteData<SubscriberListResult, number>;
export interface SubscriberDetail {
  subscriber: SubscriberRecord;
  audit: AuditEntry[];
}

const shareRows = shareRowsById<SubscriberRecord>('rows', (row) => row.emailHash);

function listOptions(filter: Filter, search: string) {
  return infiniteQueryOptions({
    queryKey: subscriberKeys.list(filter, search),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      apiGet<SubscriberListResult>(
        'admin/subscribers',
        {
          status: filter.status,
          channel: filter.channel,
          deliveryMode: filter.delivery,
          search: search || null,
          limit: PAGE,
          offset: pageParam,
        },
        signal,
      ),
    getNextPageParam: (last, pages) => (last.rows.length === PAGE ? pages.length * PAGE : undefined),
    // Every list read counts the whole table in D1; a subscriber list does
    // not change behind the owner's back often enough to poll.
    staleTime: 60_000,
    // A new subscriber on top keeps every other row's object.
    structuralSharing: shareRows,
  });
}

export function useSubscriberList(filter: Filter, search: string, enabled = true) {
  return useInfiniteQuery({ ...listOptions(filter, search), enabled, refetchOnWindowFocus: false });
}

/** The first page of the unfiltered list, which decides the screen's mode
    and is all it draws first; the rest of a small list follows on mount.
    Cached pages are enough, however old (see app/lazy-screen.ts). */
export function prefetchSubscriberList(client: QueryClient): Promise<unknown> {
  return client.infiniteQuery({ ...listOptions(ALL, ''), staleTime: 'static' });
}

/** Rows of every loaded page, once each, in server order. */
export function flatten(data: { pages: readonly SubscriberListResult[] } | undefined): SubscriberRecord[] | undefined {
  if (!data) return undefined;
  const seen = new Set<string>();
  const rows: SubscriberRecord[] = [];
  for (const page of data.pages) {
    for (const row of page.rows) {
      if (seen.has(row.emailHash)) continue;
      seen.add(row.emailHash);
      rows.push(row);
    }
  }
  return rows;
}

/** Global counts and per-channel counts, without rows. */
export function useSubscriberCounts(enabled = true) {
  return useQuery({
    queryKey: subscriberKeys.counts(),
    queryFn: ({ signal }) => apiGet<SubscriberListResult>('admin/subscribers', { countsOnly: 1 }, signal),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function detailOptions(hash: string) {
  return {
    queryKey: subscriberKeys.detail(hash),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      apiGet<SubscriberDetail>(`admin/subscribers/${encodeURIComponent(hash)}`, undefined, signal),
    staleTime: 30_000,
  };
}

export function useSubscriberDetail(hash: string | null) {
  return useQuery({ ...detailOptions(hash ?? ''), enabled: Boolean(hash) });
}

/* Cache edits. */

function editLists(client: QueryClient, edit: (rows: SubscriberRecord[], key: readonly unknown[]) => SubscriberRecord[]): void {
  for (const [key, data] of client.getQueriesData<ListData>({ queryKey: subscriberKeys.lists() })) {
    if (!data) continue;
    let changed = false;
    const pages = data.pages.map((page, index) => {
      const rows = edit(page.rows, index === 0 ? key : []);
      if (rows === page.rows) return page;
      changed = true;
      return { ...page, rows };
    });
    if (changed) client.setQueryData<ListData>(key, { ...data, pages });
  }
}

/** Replace one subscriber everywhere it is cached, in place. */
export function patchCached(client: QueryClient, hash: string, update: (row: SubscriberRecord) => SubscriberRecord): void {
  editLists(client, (rows) => {
    const at = rows.findIndex((row) => row.emailHash === hash);
    if (at < 0) return rows;
    const next = rows.slice();
    next[at] = update(rows[at]);
    return next;
  });
  const detail = client.getQueryData<SubscriberDetail>(subscriberKeys.detail(hash));
  if (detail) client.setQueryData<SubscriberDetail>(subscriberKeys.detail(hash), { ...detail, subscriber: update(detail.subscriber) });
}

function filterOfKey(key: readonly unknown[]): { filter: Filter; search: string } {
  const [, , status, channel, delivery, search] = key as [string, string, StatusFilter, string, string, string];
  return {
    filter: { status, channel: (channel || null) as Filter['channel'], delivery: (delivery || null) as Filter['delivery'] },
    search: search ?? '',
  };
}

/** Put a new subscriber at the top of every list it belongs in. */
function insertCached(client: QueryClient, row: SubscriberRecord): void {
  editLists(client, (rows, key) => {
    if (key.length === 0 || rows.some((entry) => entry.emailHash === row.emailHash)) return rows;
    const { filter, search } = filterOfKey(key);
    if (!matchesFilter(row, filter) || !matchesQuery(row, normalizeQuery(search))) return rows;
    return [row, ...rows];
  });
}

function removeCached(client: QueryClient, hash: string): void {
  editLists(client, (rows) => (rows.some((row) => row.emailHash === hash) ? rows.filter((row) => row.emailHash !== hash) : rows));
}

/** The newest copy of a subscriber in any cache. */
export function findCached(client: QueryClient, hash: string): SubscriberRecord | null {
  for (const [, data] of client.getQueriesData<ListData>({ queryKey: subscriberKeys.lists() })) {
    for (const page of data?.pages ?? []) {
      const row = page.rows.find((entry) => entry.emailHash === hash);
      if (row) return row;
    }
  }
  return client.getQueryData<SubscriberDetail>(subscriberKeys.detail(hash))?.subscriber ?? null;
}

/* Requests. Writes to one subscriber go out one after another, so a quick
   second edit (or an undo) never races the first; many subscribers go out
   six at a time. */

const chains = new Map<string, Promise<unknown>>();

function enqueue<T>(hash: string, run: () => Promise<T>): Promise<T> {
  const next = (chains.get(hash) ?? Promise.resolve()).catch(() => {}).then(run);
  chains.set(hash, next);
  void next.finally(() => {
    if (chains.get(hash) === next) chains.delete(hash);
  }).catch(() => {});
  return next;
}

async function pool<T>(items: readonly T[], run: (item: T) => Promise<unknown>, limit = 6): Promise<Array<{ item: T; error: unknown }>> {
  const failures: Array<{ item: T; error: unknown }> = [];
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const item = items[cursor++];
      try {
        await run(item);
      } catch (error) {
        failures.push({ item, error });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return failures;
}

function sendPatch(hash: string, patch: SubscriberPatch, keepalive = false) {
  return enqueue(hash, () =>
    apiSend<{ subscriber: SubscriberRecord }>('PATCH', `admin/subscribers/${encodeURIComponent(hash)}`, patch, { keepalive }));
}

/** Copy for a failed subscriber write. Every line says what to do next. */
export function describeSubscriberError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'subscriber_exists') return 'That address is already on the list. Search for it to change it.';
    if (error.code === 'invalid_email') return 'That is not an email address. Check it for typos and try again.';
    if (error.code === 'subscriber_changed') return 'It changed on the server while you edited. The latest version is shown; make the change again if it still applies.';
    if (error.status === 404) return 'That subscriber is no longer on the list. Reload the list to see the current state.';
    if (error.code === 'subscriber_not_active') return 'Only active subscribers get the blog welcome. Set the status to Active first.';
    if (error.code === 'subscriber_not_blog') return 'The blog welcome needs the Blog channel. Turn Blog on first.';
  }
  return describeError(error);
}

export interface UpdateOptions {
  /** The toast title; the default says what changed. */
  label: string;
}

/** Change one or many subscribers, with an Undo that sends the old values
    back. The rows repaint in this frame; a failure puts them back (or, on a
    conflict, shows the server's copy) and says why. */
export function useUpdateSubscribers() {
  const client = useQueryClient();

  const settle = React.useCallback(
    (hashes: readonly string[]) => {
      void client.invalidateQueries({ queryKey: subscriberKeys.counts() });
      for (const hash of hashes) void client.invalidateQueries({ queryKey: subscriberKeys.detail(hash) });
    },
    [client],
  );

  const recover = React.useCallback(
    (failures: Array<{ item: SubscriberRecord; error: unknown }>, total: number) => {
      if (failures.length === 0) return;
      for (const { item, error } of failures) {
        if (error instanceof ApiError && error.code === 'subscriber_changed') {
          // Show what the server has now.
          void client.query({ ...detailOptions(item.emailHash), staleTime: 0 }).then(
            (fresh) => patchCached(client, item.emailHash, () => fresh.subscriber),
            () => {},
          );
        } else {
          patchCached(client, item.emailHash, () => item);
        }
      }
      toastManager.add({
        type: 'error',
        title: total > 1 ? `${failures.length} of ${total} subscribers were not changed` : 'The change was not saved',
        description: describeSubscriberError(failures[0].error),
      });
    },
    [client],
  );

  return React.useCallback(
    (rows: readonly SubscriberRecord[], patch: SubscriberPatch, { label }: UpdateOptions) => {
      if (rows.length === 0) return;
      const now = new Date().toISOString();
      const before = rows.map((row) => findCached(client, row.emailHash) ?? row);
      for (const row of before) patchCached(client, row.emailHash, (current) => applyPatch(current, patch, now));
      const hashes = before.map((row) => row.emailHash);

      const request = pool(before, (row) => sendPatch(row.emailHash, patch)).then((failures) => {
        recover(failures, before.length);
        settle(hashes);
        return failures;
      });

      let undone = false;
      const undo = (): void => {
        if (undone) return;
        undone = true;
        for (const row of before) patchCached(client, row.emailHash, () => row);
        void request.then((failed) => {
          const failedHashes = new Set(failed.map((entry) => entry.item.emailHash));
          const sent = before.filter((row) => !failedHashes.has(row.emailHash));
          return pool(sent, (row) => sendPatch(row.emailHash, restorePatch(row)));
        }).then((failures) => {
          recover(failures, before.length);
          settle(hashes);
        });
      };
      const toastId: string = toastManager.add({
        type: 'success',
        title: label,
        timeout: 5000,
        actionProps: { children: 'Undo', onClick: undo },
        onRemove: () => forgetUndo(toastId),
      });
      registerUndo(toastId, undo);
    },
    [client, recover, settle],
  );
}

/* Deletes wait out their undo window before anything is sent. site-api's
   delete is a soft one (the row becomes unsubscribed and the audit log says
   deleted), so meanwhile the rows show as Unsubscribed, and a closing tab
   sends what is pending. */

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
    for (const commit of new Set(pendingDeletes.values())) commit();
  });
}

export function useDeleteSubscribers() {
  const client = useQueryClient();
  return React.useCallback(
    (rows: readonly SubscriberRecord[]) => {
      if (rows.length === 0) return;
      const hashes = rows.map((row) => row.emailHash);
      const commit = (): void => {
        if (!hashes.some((hash) => pendingDeletes.has(hash))) return;
        for (const hash of hashes) pendingDeletes.delete(hash);
        const now = new Date().toISOString();
        for (const hash of hashes) patchCached(client, hash, (row) => ({ ...row, status: 'unsubscribed', updatedAt: now }));
        emitPending();
        void pool(rows, (row) =>
          enqueue(row.emailHash, () => apiSend<null>('DELETE', `admin/subscribers/${encodeURIComponent(row.emailHash)}`, undefined, { keepalive: true })),
        ).then((failures) => {
          for (const { item } of failures) patchCached(client, item.emailHash, () => item);
          if (failures.length > 0) {
            toastManager.add({
              type: 'error',
              title: rows.length > 1 ? `${failures.length} of ${rows.length} were not deleted` : 'The subscriber was not deleted',
              description: describeSubscriberError(failures[0].error),
            });
          }
          void client.invalidateQueries({ queryKey: subscriberKeys.counts() });
          for (const hash of hashes) void client.invalidateQueries({ queryKey: subscriberKeys.detail(hash) });
        });
      };
      for (const hash of hashes) pendingDeletes.set(hash, commit);
      emitPending();

      let undone = false;
      const undo = (): void => {
        undone = true;
        for (const hash of hashes) pendingDeletes.delete(hash);
        emitPending();
      };
      const toastId: string = toastManager.add({
        title: rows.length === 1 ? `Deleted ${rows[0].email}` : `Deleted ${plural(rows.length, 'subscriber', 'subscribers')}`,
        description: 'They get no more email. Press Z or Undo within 6 seconds to keep them.',
        timeout: 6000,
        actionProps: { children: 'Undo', onClick: undo },
        onRemove: () => {
          forgetUndo(toastId);
          if (!undone) commit();
        },
      });
      registerUndo(toastId, undo);
    },
    [client],
  );
}

/** Add one subscriber the way the site form would: active, Blog and Mood,
    each email as it happens. The row is on screen before the request
    leaves; a refusal takes it back out and says why. */
export function useCreateSubscriber() {
  const client = useQueryClient();
  return React.useCallback(
    (email: string, hash: string): Promise<SubscriberRecord> => {
      const now = new Date().toISOString();
      const draft: SubscriberRecord = {
        email,
        emailHash: hash,
        status: 'active',
        channels: ['blog', 'mood'],
        deliveryMode: 'immediate',
        createdAt: now,
        updatedAt: now,
        confirmedAt: now,
      };
      insertCached(client, draft);
      return enqueue(hash, () =>
        apiSend<{ subscriber: SubscriberRecord }>('POST', 'admin/subscribers', {
          email,
          status: draft.status,
          channels: draft.channels,
          deliveryMode: draft.deliveryMode,
        }),
      ).then(
        ({ subscriber }) => {
          patchCached(client, hash, () => subscriber);
          void client.invalidateQueries({ queryKey: subscriberKeys.counts() });
          return subscriber;
        },
        (error: unknown) => {
          removeCached(client, hash);
          throw error;
        },
      );
    },
    [client],
  );
}

export function useBlogWelcome() {
  const client = useQueryClient();
  return React.useCallback(
    (row: SubscriberRecord) =>
      apiSend<{ status: string }>('POST', `admin/subscribers/${encodeURIComponent(row.emailHash)}/blog-welcome`).then(
        () => {
          toastManager.add({ type: 'success', title: `Blog welcome sent to ${row.email}`, timeout: 4000 });
          void client.invalidateQueries({ queryKey: subscriberKeys.detail(row.emailHash) });
        },
        (error: unknown) => {
          toastManager.add({ type: 'error', title: 'The blog welcome was not sent', description: describeSubscriberError(error) });
        },
      ),
    [client],
  );
}

/** Every row of a filter: the loaded ones plus any further pages of the
    server list they came from (`nextOffset` null when it is complete). */
export async function collectForExport(
  filter: Filter,
  search: string,
  loaded: readonly SubscriberRecord[],
  nextOffset: number | null,
  onProgress: (count: number) => void,
): Promise<SubscriberRecord[]> {
  const rows = [...loaded];
  if (nextOffset === null) return rows;
  const seen = new Set(rows.map((row) => row.emailHash));
  let offset = nextOffset;
  for (;;) {
    const page = await apiGet<SubscriberListResult>('admin/subscribers', {
      status: filter.status,
      channel: filter.channel,
      deliveryMode: filter.delivery,
      search: search || null,
      limit: PAGE,
      offset,
    });
    for (const row of page.rows) {
      if (seen.has(row.emailHash)) continue;
      seen.add(row.emailHash);
      rows.push(row);
    }
    onProgress(rows.length);
    if (page.rows.length < PAGE) return rows;
    offset += PAGE;
  }
}
