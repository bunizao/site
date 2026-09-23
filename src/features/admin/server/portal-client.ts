import {
  BLOG_ANALYTICS_ARTICLE_ENDPOINT,
  BLOG_ANALYTICS_EVENTS_DEFAULT_LIMIT,
  BLOG_ANALYTICS_EVENTS_ENDPOINT,
  BLOG_ANALYTICS_SUMMARY_ENDPOINT,
  type AdminBanListResult,
  type AdminCommentInsights,
  type AdminCommentInsightsWindow,
  type AdminCommentRecord,
  type AdminReactionInsights,
  type AdminReactionInsightsWindow,
  type AdminReactionListResult,
  type AdminSourceKeyType,
  type AdminSourceProfile,
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

/* Comment moderation shapes.

   The row itself now comes from `@bunizao/contracts/admin`: the actor block
   is forty fields deep and shared with the reactions list and the source
   profile, and a hand-copied mirror of it here would drift on the first
   column anyone adds. The summary below stays local -- it is assembled by
   the portal route in site-api and belongs to nothing else. */

export type PortalCommentStatus = 'held' | 'published' | 'rejected' | 'deleted';

export type PortalComment = AdminCommentRecord;

export interface PortalCommentSummary {
  byStatus: Record<PortalCommentStatus, number>;
  today: number;
  oldestHeldAt: string | null;
  reasons: Array<{ reason: string; count: number }>;
  topPosts: Array<{ postId: string; count: number; title: string | null; slug: string | null }>;
  daily: Array<{ date: string; count: number }>;
}

export interface PortalComments {
  summary: PortalCommentSummary;
  comments: PortalComment[];
  total: number;
  nextOffset: number | null;
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

export async function loadPortalComments(
  request: Request,
  locals: RuntimeEnvLocals | undefined,
  options: {
    status?: PortalCommentStatus | 'all';
    limit?: number;
    /** Pivot: show only rows whose `key` equals `value`. */
    key?: AdminSourceKeyType;
    value?: string;
  } = {},
): Promise<PortalComments> {
  const query = new URLSearchParams({
    status: options.status ?? 'held',
    limit: String(options.limit ?? 25),
  });
  if (options.key && options.value) {
    query.set('key', options.key);
    query.set('value', options.value);
  }
  return adminGet<PortalComments>(`/api/admin/comments?${query}`, request, locals);
}

/** The reactions list, which the queue has no equivalent of: a heart carries
    no body to judge, so these rows are read for their actor block alone. */
export async function loadPortalReactions(
  request: Request,
  locals: RuntimeEnvLocals | undefined,
  options: { limit?: number; offset?: number; key?: AdminSourceKeyType; value?: string } = {},
): Promise<AdminReactionListResult> {
  const query = new URLSearchParams({
    limit: String(options.limit ?? 50),
    offset: String(options.offset ?? 0),
  });
  if (options.key && options.value) {
    query.set('key', options.key);
    query.set('value', options.value);
  }
  return adminGet<AdminReactionListResult>(`/api/admin/reactions?${query}`, request, locals);
}

/** Everything about one key in one response. Throws like the others; the
    page turns a failure into a 404-shaped notice rather than a stack. */
export function loadSourceProfile(
  type: AdminSourceKeyType,
  value: string,
  request: Request,
  locals: RuntimeEnvLocals | undefined,
): Promise<AdminSourceProfile> {
  return adminGet<AdminSourceProfile>(
    `/api/admin/sources/${encodeURIComponent(type)}/${encodeURIComponent(value)}`,
    request,
    locals,
  );
}

export function loadCommentInsights(
  request: Request,
  locals: RuntimeEnvLocals | undefined,
  window: AdminCommentInsightsWindow = '30d',
): Promise<AdminCommentInsights> {
  return adminGet<AdminCommentInsights>(`/api/admin/comments/insights?window=${window}`, request, locals);
}

export function loadReactionInsights(
  request: Request,
  locals: RuntimeEnvLocals | undefined,
  window: AdminReactionInsightsWindow = '7d',
): Promise<AdminReactionInsights> {
  return adminGet<AdminReactionInsights>(`/api/admin/reactions/insights?window=${window}`, request, locals);
}

export function loadBans(
  request: Request,
  locals: RuntimeEnvLocals | undefined,
): Promise<AdminBanListResult> {
  return adminGet<AdminBanListResult>('/api/admin/bans', request, locals);
}

/* The blog activity log: the same private read model as the comment queue
   above, and declared here for the same reason. site-api's mirror is
   `src/features/comments/server/activity-log.ts`. */

export const ACTIVITY_EVENTS = [
  'comment.create',
  'comment.edit',
  'comment.remove',
  'comment.moderate',
  'comment.approve',
  'comment.hide',
  'comment.delete',
  'reaction.add',
  'reaction.remove',
] as const;
export type PortalActivityEvent = (typeof ACTIVITY_EVENTS)[number];

export type PortalActivityFamily = 'comments' | 'reactions';

export interface PortalActivityEntry {
  id: string;
  createdAt: string;
  event: PortalActivityEvent;
  actor: 'reader' | 'model' | 'owner';
  source: 'web' | 'portal' | 'telegram' | 'cron';
  targetType: 'comment' | 'post';
  targetId: string;
  postId: string | null;
  postTitle: string | null;
  postSlug: string | null;
  displayName: string | null;
  readerId: string | null;
  anonymous: boolean;
  emoji: string | null;
  status: string | null;
  reason: string | null;
  note: string | null;
}

export interface PortalActivitySummary {
  byEvent: Record<PortalActivityEvent, number>;
  today: number;
  reactionsNet: number;
  daily: Array<{ date: string; comments: number; reactions: number }>;
}

export interface PortalActivity {
  summary: PortalActivitySummary;
  entries: PortalActivityEntry[];
  total: number;
  nextOffset: number | null;
}

export async function loadPortalActivity(
  request: Request,
  locals: RuntimeEnvLocals | undefined,
  options: {
    family?: PortalActivityFamily | 'all';
    targetType?: 'comment' | 'post';
    targetId?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<PortalActivity> {
  const query = new URLSearchParams({
    family: options.family ?? 'all',
    limit: String(options.limit ?? 50),
    offset: String(options.offset ?? 0),
  });
  if (options.targetType) query.set('targetType', options.targetType);
  if (options.targetId) query.set('targetId', options.targetId);
  return adminGet<PortalActivity>(`/api/admin/activity?${query}`, request, locals);
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
