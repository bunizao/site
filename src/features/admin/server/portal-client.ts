import {
  BLOG_ANALYTICS_ARTICLE_ENDPOINT,
  BLOG_ANALYTICS_EVENTS_DEFAULT_LIMIT,
  BLOG_ANALYTICS_EVENTS_ENDPOINT,
  BLOG_ANALYTICS_SUMMARY_ENDPOINT,
  type AuditEntry,
  type BlogAnalyticsArticleDetailResult,
  type BlogAnalyticsEventsResult,
  type BlogAnalyticsSummaryResult,
  type BroadcastRecord,
  type NotifyGateStatus,
  type SubscriberListResult,
} from '@bunizao/contracts';
import {
  createApiServiceRequest,
  getApiServiceBinding,
} from '@/lib/http/api-service-proxy';
import type { RuntimeEnvLocals } from '@/lib/runtime/env';

// Server-side reader for the admin portal. The portal pages render inside the
// public `site` worker; the data lives behind the private `site-api` worker.
// We reach it through the API service binding, forwarding the Cloudflare Access
// JWT so site-api authenticates the same admin identity.
export async function adminGet<T>(
  path: string,
  request: Request,
  locals: RuntimeEnvLocals | undefined,
): Promise<T> {
  const api = await getApiServiceBinding(locals);
  if (!api) throw new Error('api_binding_unavailable');

  const [pathname, query = ''] = path.split('?');
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = query;

  const headers = new Headers();
  const accessJwt = request.headers.get('cf-access-jwt-assertion');
  if (accessJwt) headers.set('cf-access-jwt-assertion', accessJwt);
  headers.set('accept', 'application/json');

  const response = await api.fetch(createApiServiceRequest(new Request(url, { headers })));
  if (!response.ok) throw new Error(`admin_get_failed_${response.status}`);
  return (await response.json()) as T;
}

export interface PortalOverview {
  subscriberStats: Pick<SubscriberListResult, 'total' | 'pendingCount' | 'activeCount' | 'unsubscribedCount'>;
  auditEvents: AuditEntry[];
  broadcasts: BroadcastRecord[];
}

export interface PortalAnalytics {
  summary: BlogAnalyticsSummaryResult;
  events: BlogAnalyticsEventsResult;
}

export async function loadPortalOverview(
  request: Request,
  locals: RuntimeEnvLocals | undefined,
): Promise<PortalOverview> {
  const [subs, audit, casts] = await Promise.all([
    adminGet<SubscriberListResult>('/api/admin/subscribers?limit=1', request, locals),
    adminGet<{ events: AuditEntry[] }>('/api/admin/audit?limit=12', request, locals),
    adminGet<{ broadcasts: BroadcastRecord[] }>('/api/admin/broadcasts?limit=5', request, locals),
  ]);

  return {
    subscriberStats: {
      total: subs.total,
      pendingCount: subs.pendingCount,
      activeCount: subs.activeCount,
      unsubscribedCount: subs.unsubscribedCount,
    },
    auditEvents: audit.events ?? [],
    broadcasts: casts.broadcasts ?? [],
  };
}

export async function loadBroadcast(
  id: string,
  request: Request,
  locals: RuntimeEnvLocals | undefined,
): Promise<BroadcastRecord | null> {
  try {
    const data = await adminGet<{ broadcast: BroadcastRecord }>(
      `/api/admin/broadcasts/${encodeURIComponent(id)}`,
      request,
      locals,
    );
    return data.broadcast ?? null;
  } catch {
    return null;
  }
}

export async function loadPortalAnalytics(
  request: Request,
  locals: RuntimeEnvLocals | undefined,
  options: { days?: number } = {},
): Promise<PortalAnalytics> {
  const summaryPath = options.days
    ? `${BLOG_ANALYTICS_SUMMARY_ENDPOINT}?days=${options.days}`
    : BLOG_ANALYTICS_SUMMARY_ENDPOINT;
  const [summary, events] = await Promise.all([
    adminGet<BlogAnalyticsSummaryResult>(summaryPath, request, locals),
    adminGet<BlogAnalyticsEventsResult>(
      `${BLOG_ANALYTICS_EVENTS_ENDPOINT}?limit=${BLOG_ANALYTICS_EVENTS_DEFAULT_LIMIT}`,
      request,
      locals,
    ),
  ]);

  return { summary, events };
}

export async function loadArticleAnalytics(
  slug: string,
  request: Request,
  locals: RuntimeEnvLocals | undefined,
  options: { days?: number } = {},
): Promise<BlogAnalyticsArticleDetailResult | null> {
  try {
    const query = options.days ? `?days=${options.days}` : '';
    return await adminGet<BlogAnalyticsArticleDetailResult>(
      `${BLOG_ANALYTICS_ARTICLE_ENDPOINT}/${encodeURIComponent(slug)}${query}`,
      request,
      locals,
    );
  } catch {
    return null;
  }
}

export async function loadNotifyGateStatus(
  request: Request,
  locals: RuntimeEnvLocals | undefined,
): Promise<NotifyGateStatus | null> {
  try {
    return await adminGet<NotifyGateStatus>('/api/admin/notify-gate', request, locals);
  } catch {
    return null;
  }
}
