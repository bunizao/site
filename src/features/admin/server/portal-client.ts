import {
  BLOG_ANALYTICS_EVENTS_DEFAULT_LIMIT,
  BLOG_ANALYTICS_EVENTS_ENDPOINT,
  BLOG_ANALYTICS_SUMMARY_ENDPOINT,
  CV_ADMIN_BASE_PATH,
  type AuditEntry,
  type BlogAnalyticsEventsResult,
  type BlogAnalyticsSummaryResult,
  type BroadcastRecord,
  type CvLang,
  type CvPdfCacheStatus,
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
async function adminGet<T>(
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

export async function adminPost<T>(
  path: string,
  request: Request,
  locals: RuntimeEnvLocals | undefined,
  body?: unknown,
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
  headers.set('content-type', 'application/json');

  const response = await api.fetch(createApiServiceRequest(new Request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  })));
  if (!response.ok) throw new Error(`admin_post_failed_${response.status}`);
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

export type PortalCvAccessRequestStatus = 'pending' | 'approved' | 'rejected';

export interface PortalCvAccessRequest {
  id: string;
  email: string;
  intent: string;
  lang: CvLang;
  status: PortalCvAccessRequestStatus;
  createdAt: string;
  decidedAt: string | null;
}

export interface PortalCvAccess {
  requests: PortalCvAccessRequest[];
  pdfCache: PortalCvPdfCache;
}

export type PortalCvPdfCache = CvPdfCacheStatus & { error?: string };

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
): Promise<PortalAnalytics> {
  const [summary, events] = await Promise.all([
    adminGet<BlogAnalyticsSummaryResult>(BLOG_ANALYTICS_SUMMARY_ENDPOINT, request, locals),
    adminGet<BlogAnalyticsEventsResult>(
      `${BLOG_ANALYTICS_EVENTS_ENDPOINT}?limit=${BLOG_ANALYTICS_EVENTS_DEFAULT_LIMIT}`,
      request,
      locals,
    ),
  ]);

  return { summary, events };
}

export async function loadPortalCv(
  request: Request,
  locals: RuntimeEnvLocals | undefined,
): Promise<PortalCvAccess> {
  const requests = await adminGet<Pick<PortalCvAccess, 'requests'>>(
    `${CV_ADMIN_BASE_PATH}/requests`,
    request,
    locals,
  );
  const pdfCache = await adminGet<{ pdfCache: PortalCvPdfCache }>(
    `${CV_ADMIN_BASE_PATH}/pdf-cache`,
    request,
    locals,
  ).then((result) => result.pdfCache).catch((error) => ({
    available: false,
    keys: [],
    error: error instanceof Error ? error.message : 'unknown',
  }));

  return { requests: requests.requests, pdfCache };
}

export async function approvePortalCvRequest(
  request: Request,
  locals: RuntimeEnvLocals | undefined,
  id: string,
): Promise<{ request: PortalCvAccessRequest }> {
  return adminPost<{ request: PortalCvAccessRequest }>(
    `${CV_ADMIN_BASE_PATH}/requests/${encodeURIComponent(id)}/approve`,
    request,
    locals,
  );
}

export async function rejectPortalCvRequest(
  request: Request,
  locals: RuntimeEnvLocals | undefined,
  id: string,
): Promise<{ request: PortalCvAccessRequest }> {
  return adminPost<{ request: PortalCvAccessRequest }>(
    `${CV_ADMIN_BASE_PATH}/requests/${encodeURIComponent(id)}/reject`,
    request,
    locals,
  );
}

export async function mintPortalCvOwnerLink(
  request: Request,
  locals: RuntimeEnvLocals | undefined,
): Promise<{ url: string }> {
  return adminPost<{ url: string }>(`${CV_ADMIN_BASE_PATH}/owner-link`, request, locals);
}
