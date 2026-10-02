import * as React from 'react';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
// Types only: portal-client is server code and must stay out of the bundle.
import type { PortalActivity, PortalActivityEntry, PortalActivityEvent } from '@/features/admin/server/portal-client';
import { apiGet } from '../app/api';
import { shareRowsById } from '../app/share-rows';
import { EVENT_LABELS } from './model';

export type ActivityFamily = 'all' | 'comments' | 'reactions';

export interface ActivityFilter {
  family: ActivityFamily;
  event: PortalActivityEvent | null;
  readerId: string | null;
  targetId: string | null;
  targetType: 'comment' | 'post' | null;
}

/** The unfiltered feed. Home reads the same cache entry, so opening
    Activity from Home paints at once. */
export const ALL_ACTIVITY: ActivityFilter = { family: 'all', event: null, readerId: null, targetId: null, targetType: null };

export function readActivityFilter(search: URLSearchParams): ActivityFilter {
  const family = search.get('family');
  const event = search.get('event');
  const targetType = search.get('targetType');
  return {
    family: family === 'comments' || family === 'reactions' ? family : 'all',
    event: Object.hasOwn(EVENT_LABELS, event ?? '') ? (event as PortalActivityEvent) : null,
    readerId: search.get('readerId') || null,
    targetId: search.get('targetId') || null,
    targetType: targetType === 'comment' || targetType === 'post' ? targetType : null,
  };
}

export const activityKeys = {
  all: ['activity'] as const,
  feed: (filter: ActivityFilter) => ['activity', 'feed', filter] as const,
  head: (filter: ActivityFilter) => ['activity', 'head', filter] as const,
};

const PAGE_SIZE = 50;
const HEAD_SIZE = 20;

function params(filter: ActivityFilter, limit: number, offset: number) {
  return {
    family: filter.event ? null : filter.family,
    event: filter.event,
    readerId: filter.readerId,
    targetId: filter.targetId,
    targetType: filter.targetType,
    limit,
    offset,
  };
}

type FeedData = InfiniteData<PortalActivity, number>;

const shareEntries = shareRowsById<PortalActivityEntry>('entries', (entry) => entry.id);

/** The feed. It never refetches on its own -- new entries arrive through
    `useActivityHead` and are applied when the reader is not looking at the
    rows they would move. `live: false` (Home) lets a return visit refresh. */
function feedOptions(filter: ActivityFilter) {
  return {
    queryKey: activityKeys.feed(filter),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }: { pageParam: number; signal: AbortSignal }) =>
      apiGet<PortalActivity>('admin/activity', params(filter, PAGE_SIZE, pageParam), signal),
    getNextPageParam: (last: PortalActivity) => last.nextOffset ?? undefined,
    // New entries applied on top keep every other row's object.
    structuralSharing: shareEntries,
  };
}

export function prefetchActivityFeed(client: QueryClient, filter: ActivityFilter): Promise<unknown> {
  return client.infiniteQuery({ ...feedOptions(filter), staleTime: 'static' });
}

export function useActivityFeed(filter: ActivityFilter, { live }: { live: boolean }) {
  return useInfiniteQuery({
    ...feedOptions(filter),
    placeholderData: keepPreviousData,
    refetchOnMount: !live,
    refetchOnWindowFocus: !live,
  });
}

/** The newest entries, polled while the tab is visible. Once a minute: a
    blog's activity does not arrive faster than that. site-api caches the
    summary each poll carries, and an older site-api re-counts the whole
    log for it on every poll. */
export function useActivityHead(filter: ActivityFilter, enabled: boolean) {
  return useQuery({
    queryKey: activityKeys.head(filter),
    queryFn: ({ signal }) => apiGet<PortalActivity>('admin/activity', params(filter, HEAD_SIZE, 0), signal),
    enabled,
    staleTime: 0,
    refetchInterval: 60_000,
  });
}

/** Entries in `head` newer than the feed's first row and not in it yet.
    `overflow` means the head was all new, so more may be missing. */
export function freshEntries(feed: readonly PortalActivityEntry[], head: readonly PortalActivityEntry[] | undefined) {
  if (!head || feed.length === 0) return { entries: [] as PortalActivityEntry[], overflow: false };
  const shown = new Set(feed.map((entry) => entry.id));
  const newest = feed[0].createdAt;
  const entries = head.filter((entry) => !shown.has(entry.id) && entry.createdAt >= newest);
  return { entries, overflow: entries.length === head.length && head.length >= HEAD_SIZE };
}

/** Put fresh entries on top of the cached feed. Offsets of later pages go
    stale by the same count; `flattenFeed` drops the overlap by id. */
export function useApplyFresh(filter: ActivityFilter) {
  const client = useQueryClient();
  return React.useCallback(
    (fresh: ReturnType<typeof freshEntries>) => {
      const key = activityKeys.feed(filter);
      if (fresh.overflow) {
        void client.resetQueries({ queryKey: key, exact: true });
        return;
      }
      client.setQueryData<FeedData>(key, (data) => {
        if (!data || data.pages.length === 0) return data;
        const [first, ...rest] = data.pages;
        return {
          ...data,
          pages: [{ ...first, entries: [...fresh.entries, ...first.entries], total: first.total + fresh.entries.length }, ...rest],
        };
      });
    },
    [client, filter],
  );
}

export function flattenFeed(data: InfiniteData<PortalActivity, unknown> | undefined): PortalActivityEntry[] {
  if (!data) return [];
  const seen = new Set<string>();
  const rows: PortalActivityEntry[] = [];
  for (const page of data.pages) {
    for (const entry of page.entries) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      rows.push(entry);
    }
  }
  return rows;
}
