import { useQuery, type QueryClient } from '@tanstack/react-query';
import {
  SITE_ANALYTICS_REPORTS,
  type SiteAnalyticsReportName,
  type SiteAnalyticsReportResult,
} from '@bunizao/contracts/analytics';
import { apiGet } from '../app/api';
import { readRange } from './data';
export function reportRange(days: number): { from: string; to: string } {
  const to = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const from = new Date(Date.parse(`${to}T12:00:00Z`) - (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
  return { from, to };
}
export function readReport(
  search: URLSearchParams,
): SiteAnalyticsReportName | 'listening' | 'newsletter' {
  const report = search.get('report') || 'overview';
  return [...SITE_ANALYTICS_REPORTS, 'listening', 'newsletter'].includes(report)
    ? (report as ReturnType<typeof readReport>)
    : 'overview';
}
export function siteOptions(search: URLSearchParams) {
  const report = readReport(search),
    defaultRange = reportRange(readRange(search));
  const range = {
    from: search.get('from') || defaultRange.from,
    to: search.get('to') || defaultRange.to,
  };
  const params = {
    report,
    ...range,
    surface: search.get('surface') || undefined,
    entity: search.get('entity') ?? undefined,
    class: search.get('class') || undefined,
    visitor: search.get('visitor') || undefined,
    cursor: search.get('cursor') || undefined,
  };
  return {
    queryKey: ['analytics', 'site', params],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      apiGet<SiteAnalyticsReportResult>('analytics/site', params, signal),
    staleTime: 60000,
  };
}
export function useSiteReport(search: URLSearchParams, enabled = true) {
  return useQuery({ ...siteOptions(search), enabled });
}
export function prefetchSiteReport(
  client: QueryClient,
  search: URLSearchParams,
): Promise<unknown> {
  if (['listening', 'newsletter'].includes(readReport(search)))
    return Promise.resolve();
  return client.query(siteOptions(search));
}
