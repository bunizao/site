export type SubscriberStatus = 'pending' | 'active' | 'unsubscribed';
export type DeliveryMode = 'immediate' | 'every_5h' | 'daily';
export type NotifyChannel = 'mood' | 'blog' | 'privacy' | 'announcement';
export type NotifyAuditEventType =
  | 'subscribe_requested'
  | 'subscription_confirmed'
  | 'unsubscribed'
  | 'email_change_requested'
  | 'email_changed'
  | 'admin_create'
  | 'admin_update'
  | 'admin_delete'
  | 'admin_resend_confirm'
  | 'broadcast_sent';

export const NOTIFY_CHANNELS: readonly NotifyChannel[] = ['mood', 'blog', 'privacy', 'announcement'];

export interface SubscriberRecord {
  email: string;
  emailHash: string;
  status: SubscriberStatus;
  channels: NotifyChannel[];
  deliveryMode?: DeliveryMode;
  timezone?: string;
  dailyHour?: number;
  pendingDeliveryMode?: DeliveryMode;
  pendingTimezone?: string;
  pendingDailyHour?: number;
  lastNotifiedAt?: string;
  lastNotifiedPostId?: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  lastConfirmSentAt?: string;
}

export interface RetryRecord {
  postId: string;
  email: string;
  emailHash: string;
  subscriberCreatedAt: string;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  lastError: string;
}

export interface SentRecord {
  postId: string;
  emailHash: string;
  sentAt: string;
  resendId?: string;
}

export interface NotifyAuditRecord {
  eventType: NotifyAuditEventType;
  email: string;
  emailHash: string;
  source: string;
  userAgent?: string;
  ipHash?: string;
  tokenHash?: string;
  createdAt: string;
}

export interface SubscribeResult {
  status: 'confirmation_sent' | 'already_subscribed';
  email: string;
  deliveryMode: DeliveryMode;
}

export interface ConfirmResult {
  status: 'subscribed';
  email: string;
  deliveryMode: DeliveryMode;
  /** Short-lived manage-page grant. Confirming is itself proof of the address,
      so the reader is handed the panel instead of a second round trip. Secret:
      never log it and never put it in a JSON response. */
  manageToken: string;
}

export interface UnsubscribeResult {
  status: 'unsubscribed';
  email: string;
}

export interface DispatchResult {
  postId: string;
  subscribers: number;
  sent: number;
  skipped: number;
  failed: number;
  skippedReason?: string;
}

export interface RetryProcessResult {
  scanned: number;
  processed: number;
  sent: number;
  dropped: number;
  failed: number;
}

export interface ScheduledDispatchResult {
  postId: string;
  scanned: number;
  due: number;
  sent: number;
  skipped: number;
  failed: number;
  skippedReason?: string;
}
