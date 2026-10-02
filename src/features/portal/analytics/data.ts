import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query';
import {
  BLOG_ANALYTICS_RANGE_OPTIONS,
  type BlogAnalyticsArticleDetailResult,
  type BlogAnalyticsEventsResult,
  type BlogAnalyticsSummaryResult,
} from '@bunizao/contracts';
import { apiGet } from '../app/api';
import { ghostPostsOptions } from '../tools/data';

export type RangeDays = (typeof BLOG_ANALYTICS_RANGE_OPTIONS)[number];

export const RANGES: readonly RangeDays[] = BLOG_ANALYTICS_RANGE_OPTIONS;
export const DEFAULT_RANGE: RangeDays = 30;

/** site-api reads at most this many events per range, newest first. */
export const EVENT_CAP = 10_000;

export function readRange(search: URLSearchParams): RangeDays {
  const days = Number(search.get('days'));
  return (RANGES as readonly number[]).includes(days) ? (days as RangeDays) : DEFAULT_RANGE;
}

export const analyticsKeys = {
  summary: (days: number) => ['analytics', 'summary', days] as const,
  article: (slug: string, days: number) => ['analytics', 'article', slug, days] as const,
  events: ['analytics', 'events'] as const,
};

const STALE_MS = 60_000;

/** The range summary. Home's views pulse reads the default range from the
    same cache entry. A new range keeps the old numbers up until it lands. */
function summaryOptions(days: number) {
  return {
    queryKey: analyticsKeys.summary(days),
    queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<BlogAnalyticsSummaryResult>('analytics/summary', { days }, signal),
    staleTime: STALE_MS,
  };
}

export function useSummary(days: number) {
  return useQuery({ ...summaryOptions(days), placeholderData: keepPreviousData });
}

export function prefetchSummary(client: QueryClient, days: number): Promise<unknown> {
  return client.query({ ...summaryOptions(days), staleTime: 'static' });
}

function fetchArticle(slug: string, days: number, signal?: AbortSignal) {
  return apiGet<BlogAnalyticsArticleDetailResult>(`analytics/article/${encodeURIComponent(slug)}`, { days }, signal);
}

/** One article. A range change keeps the same article's old numbers up; a
    different article never borrows another one's. */
export function useArticle(slug: string | null, days: number) {
  return useQuery({
    queryKey: analyticsKeys.article(slug ?? '', days),
    queryFn: ({ signal }) => fetchArticle(slug as string, days, signal),
    enabled: Boolean(slug),
    placeholderData: (previous) => (previous?.slug === slug ? previous : undefined),
    staleTime: STALE_MS,
  });
}

/** Called on pointer intent, so the article is usually in hand by the click. */
export function prefetchArticle(client: QueryClient, slug: string, days: number): void {
  client
    .query({
      queryKey: analyticsKeys.article(slug, days),
      queryFn: ({ signal }) => fetchArticle(slug, days, signal),
      staleTime: STALE_MS,
    })
    .catch(() => {}); // The article's own query reports a failure when it opens.
}

/** The latest visits, newest first -- also the only source for devices. */
const visitsOptions = {
  queryKey: analyticsKeys.events,
  queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<BlogAnalyticsEventsResult>('analytics/events', { limit: 200 }, signal),
  staleTime: 30_000,
};

export function useLatestVisits() {
  return useQuery(visitsOptions);
}

export function prefetchLatestVisits(client: QueryClient): Promise<unknown> {
  return client.query({ ...visitsOptions, staleTime: 'static' });
}

/* Analytics only knows slugs; the titles come from the Ghost post list the
   tool screens already read. A slug missing from it (an old post past the
   list's newest 100, or Ghost not answering) shows as the slug. */

const TITLES_STALE_MS = 5 * 60_000;

function titlesBySlug(list: { posts: ReadonlyArray<{ slug: string; title: string }> }): ReadonlyMap<string, string> {
  return new Map(list.posts.map((post) => [post.slug, post.title]));
}

export function usePostTitles(): ReadonlyMap<string, string> | undefined {
  return useQuery({ ...ghostPostsOptions, refetchInterval: false, staleTime: TITLES_STALE_MS, select: titlesBySlug }).data;
}

/** Never fails: the screen draws slugs until titles arrive. */
export function prefetchPostTitles(client: QueryClient): Promise<unknown> {
  return client.query({ ...ghostPostsOptions, staleTime: 'static' }).catch(() => undefined);
}
