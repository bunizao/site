import type {
  AdminCommentRecord,
  BlogAnalyticsEventsResult,
  BlogAnalyticsSummaryResult,
} from '@bunizao/contracts';

/* Shapes the portal reads from site-api's admin routes that no contract
   package exports. The portal fetches them itself (src/features/portal);
   this module only names them, for it and for the demo fixtures. */

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
