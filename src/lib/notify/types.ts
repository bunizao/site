export type SubscriberStatus = 'pending' | 'active' | 'unsubscribed';

export interface SubscriberRecord {
  email: string;
  emailHash: string;
  status: SubscriberStatus;
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

export interface SubscribeResult {
  status: 'confirmation_sent' | 'already_subscribed';
  email: string;
}

export interface ConfirmResult {
  status: 'subscribed';
  email: string;
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
