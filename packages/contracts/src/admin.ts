import type {
  DeliveryMode,
  NotifyAuditEventType,
  NotifyChannel,
  SubscriberRecord,
  SubscriberStatus,
} from './notify';

export interface SubscriberChannelCount {
  total: number;
  pendingCount: number;
  activeCount: number;
  unsubscribedCount: number;
}

export type SubscriberChannelCounts = Record<NotifyChannel, SubscriberChannelCount>;
export type BroadcastPreviewChannelCounts = Partial<Record<NotifyChannel, number>>;

export interface SubscriberFilter {
  status?: SubscriberStatus | 'all';
  channel?: NotifyChannel;
  deliveryMode?: DeliveryMode;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface SubscriberListResult {
  rows: SubscriberRecord[];
  total: number;
  pendingCount: number;
  activeCount: number;
  unsubscribedCount: number;
  channelCounts?: SubscriberChannelCounts;
}

export interface AuditEntry {
  id: number;
  eventType: NotifyAuditEventType;
  email: string;
  emailHash: string;
  source: string;
  createdAt: string;
  userAgent?: string;
}

export interface AdminSubscriberInput {
  email: string;
  status: SubscriberStatus;
  channels: NotifyChannel[];
  deliveryMode: DeliveryMode;
  timezone?: string;
  dailyHour?: number;
}

export interface AdminSubscriberPatch {
  status?: SubscriberStatus;
  channels?: NotifyChannel[];
  deliveryMode?: DeliveryMode;
  timezone?: string | null;
  dailyHour?: number | null;
}

export interface BroadcastAudience {
  status: SubscriberStatus | 'active';
  channels: NotifyChannel[];
  deliveryModes?: DeliveryMode[];
}

export interface BroadcastInput {
  subject: string;
  body: string;
  audience: BroadcastAudience;
}

export interface BroadcastRecord {
  id: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  audience: BroadcastAudience;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: 'draft' | 'sending' | 'sent' | 'failed';
  createdAt: string;
  sentAt: string | null;
  sentBy: string;
}

export interface BroadcastPreviewResult {
  subject: string;
  html: string;
  text: string;
  recipientCount: number;
  channelCounts?: BroadcastPreviewChannelCounts;
}

export interface BroadcastSendResult {
  id: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: BroadcastRecord['status'];
}
