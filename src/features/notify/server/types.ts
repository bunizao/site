export type SubscriberStatus = 'pending' | 'active' | 'unsubscribed';
export type DeliveryMode = 'immediate' | 'every_5h' | 'daily';
export type NotifyAuditEventType = 'subscribe_requested' | 'subscription_confirmed' | 'unsubscribed';

export interface SubscriberRecord {
  email: string;
  emailHash: string;
  status: SubscriberStatus;
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
