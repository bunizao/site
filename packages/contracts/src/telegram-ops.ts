import type {
  AdminSubscriberPatch,
  BroadcastInput,
  BroadcastPreviewResult,
  BroadcastRecord,
  BroadcastSendResult,
} from './admin';
import type {
  DeliveryMode,
  NotifyChannel,
  SubscriberRecord,
  SubscriberStatus,
} from './notify';

export const TELEGRAM_OPS_WEBHOOK_PATH = '/webhooks/telegram-ops' as const;

export const NOTIFY_GATE_PATH = '/admin/notify-gate' as const;
export const NOTIFY_GATE_RELEASE_PATH = `${NOTIFY_GATE_PATH}/release` as const;

export const NOTIFY_GATE_STATES = ['open', 'held'] as const;
export type NotifyGateState = (typeof NOTIFY_GATE_STATES)[number];

export const NOTIFY_GATE_DECISIONS = ['digest', 'individual', 'drop'] as const;
export type NotifyGateDecision = (typeof NOTIFY_GATE_DECISIONS)[number];

export interface NotifyGateConfig {
  thresholdCount: number;
  thresholdWindowMinutes: number;
  autoReleaseAfterHours: number;
}

export interface NotifyGateStatus {
  channel: NotifyChannel;
  state: NotifyGateState;
  heldSince: string | null;
  heldPostIds: string[];
  recentDispatchCount: number;
  config: NotifyGateConfig;
}

export interface NotifyGateReleaseInput {
  decision: NotifyGateDecision;
}

export interface NotifyGateReleaseResult {
  channel: NotifyChannel;
  decision: NotifyGateDecision;
  releasedPostIds: string[];
  actor: string;
  releasedAt: string;
}

export const TELEGRAM_OPS_BASE_PATH = '/admin/integrations/telegram-ops' as const;
export const TELEGRAM_OPS_OVERVIEW_PATH =
  `${TELEGRAM_OPS_BASE_PATH}/overview` as const;
export const TELEGRAM_OPS_EVENTS_PATH =
  `${TELEGRAM_OPS_BASE_PATH}/events` as const;
export const TELEGRAM_OPS_SUBSCRIBERS_PATH =
  `${TELEGRAM_OPS_BASE_PATH}/subscribers` as const;
export const TELEGRAM_OPS_BROADCASTS_PATH =
  `${TELEGRAM_OPS_BASE_PATH}/broadcasts` as const;
export const TELEGRAM_OPS_BROADCAST_PREVIEW_PATH =
  `${TELEGRAM_OPS_BROADCASTS_PATH}/preview` as const;
export const TELEGRAM_OPS_BROADCAST_SEND_PATH =
  `${TELEGRAM_OPS_BROADCASTS_PATH}/send` as const;
export const TELEGRAM_OPS_REMINDERS_PATH =
  `${TELEGRAM_OPS_BASE_PATH}/reminders` as const;
export const TELEGRAM_OPS_REMINDERS_DUE_PATH =
  `${TELEGRAM_OPS_REMINDERS_PATH}/due` as const;

export function telegramOpsEventPath(id: string): string {
  return `${TELEGRAM_OPS_EVENTS_PATH}/${encodeURIComponent(id)}`;
}

export function telegramOpsEventActionPath(
  id: string,
  action: 'publish' | 'cancel',
): string {
  return `${telegramOpsEventPath(id)}/${action}`;
}

export function telegramOpsSubscriberPath(emailHash: string): string {
  return `${TELEGRAM_OPS_SUBSCRIBERS_PATH}/${encodeURIComponent(emailHash)}`;
}

export function telegramOpsReminderDeliveredPath(eventId: string): string {
  return `${TELEGRAM_OPS_REMINDERS_PATH}/${encodeURIComponent(eventId)}/delivered`;
}

export const EVENT_STATUSES = ['draft', 'published', 'cancelled'] as const;
export const TELEGRAM_OPS_SUBSCRIBER_STATUSES = [
  'pending',
  'active',
  'unsubscribed',
] as const satisfies readonly SubscriberStatus[];
export const TELEGRAM_OPS_BROADCAST_CHANNELS = [
  'mood',
  'blog',
  'privacy',
  'announcement',
] as const satisfies readonly NotifyChannel[];
export const TELEGRAM_OPS_BROADCAST_DELIVERY_MODES = [
  'immediate',
  'every_5h',
  'daily',
] as const satisfies readonly DeliveryMode[];
export const TELEGRAM_OPS_BROADCAST_STATUSES = [
  'draft',
  'sending',
  'sent',
  'failed',
] as const satisfies readonly BroadcastRecord['status'][];

export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface AdminEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  location: string | null;
  notes: string | null;
  status: EventStatus;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventInput {
  title: string;
  startsAt: string;
  endsAt?: string | null;
  timezone: string;
  location?: string | null;
  notes?: string | null;
}

export type UpdateEventInput = Partial<CreateEventInput> & {
  version: number;
};

export interface EventActionInput {
  version: number;
}

export type TelegramOpsEvent = AdminEvent;
export type TelegramOpsSubscriberStatus = SubscriberStatus;
export type TelegramOpsNotifyChannel = NotifyChannel;
export type TelegramOpsDeliveryMode = DeliveryMode;
export type TelegramOpsSubscriber = SubscriberRecord;
export type TelegramOpsSubscriberPatch = AdminSubscriberPatch;
export type TelegramOpsBroadcast = BroadcastRecord;
export type TelegramOpsBroadcastAudience = BroadcastInput['audience'];
export type TelegramOpsBroadcastInput = BroadcastInput;
export type TelegramOpsBroadcastSendResult = BroadcastSendResult;

export interface TelegramOpsConfirmedBroadcastInput extends BroadcastInput {
  confirmed: true;
  audienceFingerprint: string;
}

export interface TelegramOpsBroadcastPreview extends BroadcastPreviewResult {
  audienceFingerprint: string;
}

export type TelegramOpsOverviewBroadcast = Pick<
  BroadcastRecord,
  | 'id'
  | 'subject'
  | 'status'
  | 'recipientCount'
  | 'sentCount'
  | 'failedCount'
  | 'createdAt'
  | 'sentAt'
>;

export interface TelegramOpsOverview {
  portalUrl: string;
  subscribers: {
    total: number;
    active: number;
    pending: number;
    unsubscribed: number;
  };
  broadcasts: {
    recentCount: number;
    last: TelegramOpsOverviewBroadcast | null;
  };
}

export interface TelegramOpsDueRemindersResult {
  events: AdminEvent[];
}

export interface TelegramOpsReminderDelivery {
  actor: string;
  eventId: string;
  deliveredAt: string;
}

export interface TelegramOpsReminderDeliveredResult {
  delivered: TelegramOpsReminderDelivery;
}
