import * as React from 'react';
import { ArrowLeft, Save, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { adminApiEndpoint } from './api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type {
  DeliveryMode,
  NotifyChannel,
  SubscriberRecord,
  SubscriberStatus,
} from '@bunizao/contracts';

type AdminSubscriberRecord = Omit<SubscriberRecord, 'channels'> & {
  channels?: NotifyChannel[] | null;
};

interface SubscriberDraft {
  status: SubscriberStatus;
  deliveryMode: DeliveryMode;
  channels: NotifyChannel[];
  timezone: string;
  dailyHour: number;
}

interface AuditEntry {
  id: number;
  eventType: string;
  email: string;
  source: string;
  createdAt: string;
  userAgent?: string;
}

const CHANNEL_OPTIONS: Array<{
  value: NotifyChannel;
  label: string;
  description: string;
}> = [
  { value: 'blog', label: 'Blog', description: 'Long-form posts' },
  { value: 'mood', label: 'Mood', description: 'Mood feed updates' },
  { value: 'privacy', label: 'Privacy', description: 'Policy notices' },
  { value: 'announcement', label: 'Announcement', description: 'Site-wide notes' },
];
const DELIVERY_MODES: DeliveryMode[] = ['immediate', 'every_5h', 'daily'];

function isNotifyChannel(value: unknown): value is NotifyChannel {
  return typeof value === 'string' && CHANNEL_OPTIONS.some((option) => option.value === value);
}

function channelLabel(channel: NotifyChannel): string {
  return CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? channel;
}

function normalizeChannels(channels: AdminSubscriberRecord['channels']): NotifyChannel[] {
  return Array.isArray(channels) ? channels.filter(isNotifyChannel) : [];
}

function formatChannelList(channels: NotifyChannel[]): string {
  return channels.length ? channels.map(channelLabel).join(', ') : 'No sources';
}

function formatDate(value: string | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export default function SubscriberDetail({ emailHash }: { emailHash: string }) {
  const [subscriber, setSubscriber] = React.useState<AdminSubscriberRecord | null>(null);
  const [audit, setAudit] = React.useState<AuditEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [sendingWelcome, setSendingWelcome] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [welcomeSentAt, setWelcomeSentAt] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [draft, setDraft] = React.useState<SubscriberDraft | null>(null);

  const load = React.useCallback(async () => {
    if (!emailHash) {
      setError('hash_required');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(adminApiEndpoint(`/subscribers/${emailHash}`));
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const data = (await response.json()) as { subscriber: AdminSubscriberRecord; audit: AuditEntry[] };
      setSubscriber(data.subscriber);
      setAudit(data.audit);
      setDraft({
        status: data.subscriber.status,
        deliveryMode: data.subscriber.deliveryMode ?? 'immediate',
        channels: normalizeChannels(data.subscriber.channels),
        timezone: data.subscriber.timezone ?? 'UTC',
        dailyHour: data.subscriber.dailyHour ?? 9,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setLoading(false);
    }
  }, [emailHash]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function toggleChannel(channel: NotifyChannel) {
    setDraft((prev) => {
      if (!prev) return prev;
      const has = prev.channels.includes(channel);
      const next = has ? prev.channels.filter((c) => c !== channel) : [...prev.channels, channel];
      return { ...prev, channels: next };
    });
  }

  function updateDraft(patch: Partial<SubscriberDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function save() {
    if (!draft || !draft.channels.length) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        status: draft.status,
        channels: draft.channels,
        deliveryMode: draft.deliveryMode,
        timezone: draft.deliveryMode === 'daily' ? draft.timezone || 'UTC' : null,
        dailyHour: draft.deliveryMode === 'daily' ? draft.dailyHour : null,
      };
      const response = await fetch(adminApiEndpoint(`/subscribers/${emailHash}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const data = (await response.json()) as { subscriber: AdminSubscriberRecord };
      setSubscriber(data.subscriber);
      setSavedAt(new Date().toISOString());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setSaving(false);
    }
  }

  async function destroy() {
    setSaving(true);
    try {
      const response = await fetch(adminApiEndpoint(`/subscribers/${emailHash}`), { method: 'DELETE' });
      if (!response.ok && response.status !== 204) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      window.location.href = '/dev/portal/subscribers';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
      setSaving(false);
      setConfirmDelete(false);
    }
  }

  async function sendBlogWelcome() {
    setSendingWelcome(true);
    setError(null);
    try {
      const response = await fetch(adminApiEndpoint(`/subscribers/${emailHash}/blog-welcome`), {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setWelcomeSentAt(new Date().toISOString());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setSendingWelcome(false);
    }
  }

  if (loading || !subscriber || !draft) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  const subscriberChannels = normalizeChannels(subscriber.channels);
  const canSendBlogWelcome = subscriber.status === 'active' && subscriberChannels.includes('blog');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <a href="/dev/portal/subscribers" data-astro-prefetch="false"><ArrowLeft className="size-3.5" /> Back to subscribers</a>
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">{error}</div>
      )}

      <SubscriberSummaryCard subscriber={subscriber} channels={subscriberChannels} />

      <ManualSendsCard
        canSendBlogWelcome={canSendBlogWelcome}
        sendingWelcome={sendingWelcome}
        welcomeSentAt={welcomeSentAt}
        onSendBlogWelcome={sendBlogWelcome}
      />

      <PreferencesCard
        draft={draft}
        savedAt={savedAt}
        saving={saving}
        onDraftChange={updateDraft}
        onRequestDelete={() => setConfirmDelete(true)}
        onSave={save}
        onToggleChannel={toggleChannel}
      />

      <AuditTimelineCard audit={audit} />

      <ConfirmDeleteDialog
        email={subscriber.email}
        open={confirmDelete}
        saving={saving}
        onOpenChange={setConfirmDelete}
        onConfirm={destroy}
      />
    </div>
  );
}

function SubscriberSummaryCard({
  subscriber,
  channels,
}: {
  subscriber: AdminSubscriberRecord;
  channels: NotifyChannel[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{subscriber.email}</CardTitle>
            <div className="font-mono text-[11px] text-muted-foreground mt-1">{subscriber.emailHash}</div>
          </div>
          <Badge variant={subscriber.status === 'active' ? 'success' : subscriber.status === 'pending' ? 'warning' : 'secondary'}>
            {subscriber.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div className="text-muted-foreground">Created</div>
        <div>{formatDate(subscriber.createdAt)}</div>
        <div className="text-muted-foreground">Updated</div>
        <div>{formatDate(subscriber.updatedAt)}</div>
        <div className="text-muted-foreground">Confirmed</div>
        <div>{formatDate(subscriber.confirmedAt)}</div>
        <div className="text-muted-foreground">Last notified</div>
        <div>{formatDate(subscriber.lastNotifiedAt)}</div>
        <div className="text-muted-foreground">Sources</div>
        <div>{formatChannelList(channels)}</div>
      </CardContent>
    </Card>
  );
}

function ManualSendsCard({
  canSendBlogWelcome,
  sendingWelcome,
  welcomeSentAt,
  onSendBlogWelcome,
}: {
  canSendBlogWelcome: boolean;
  sendingWelcome: boolean;
  welcomeSentAt: string | null;
  onSendBlogWelcome: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Manual sends</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-medium">Blog welcome</div>
          <div className="text-xs text-muted-foreground">
            Send the 無人之境 welcome email now for active blog subscribers.
          </div>
          {welcomeSentAt && (
            <div className="text-xs text-muted-foreground">Sent {formatDate(welcomeSentAt)}</div>
          )}
        </div>
        <Button onClick={onSendBlogWelcome} disabled={sendingWelcome || !canSendBlogWelcome}>
          <Send className="size-4" /> {sendingWelcome ? 'Sending...' : 'Send now'}
        </Button>
      </CardContent>
    </Card>
  );
}

function PreferencesCard({
  draft,
  savedAt,
  saving,
  onDraftChange,
  onRequestDelete,
  onSave,
  onToggleChannel,
}: {
  draft: SubscriberDraft;
  savedAt: string | null;
  saving: boolean;
  onDraftChange: (patch: Partial<SubscriberDraft>) => void;
  onRequestDelete: () => void;
  onSave: () => void;
  onToggleChannel: (channel: NotifyChannel) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Preferences</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={draft.status} onValueChange={(value) => onDraftChange({ status: value as SubscriberStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Delivery mode</Label>
            <Select value={draft.deliveryMode} onValueChange={(value) => onDraftChange({ deliveryMode: value as DeliveryMode })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DELIVERY_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {draft.deliveryMode === 'daily' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <Input value={draft.timezone} onChange={(event) => onDraftChange({ timezone: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Daily hour</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={draft.dailyHour}
                onChange={(event) => onDraftChange({ dailyHour: Number(event.target.value) })}
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Newsletter sources</Label>
          <div className="grid grid-cols-2 gap-2">
            {CHANNEL_OPTIONS.map((channel) => {
              const id = `subscribed-channel-${channel.value}`;
              const checked = draft.channels.includes(channel.value);
              return (
                <label key={channel.value} htmlFor={id} className="flex items-start gap-2 px-3 py-2 rounded-md border border-border bg-background text-sm cursor-pointer hover:bg-accent">
                  <Checkbox id={id} checked={checked} onCheckedChange={() => onToggleChannel(channel.value)} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block">{channel.label}</span>
                    <span className="block text-xs text-muted-foreground">{channel.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Choose at least one source. Blog and Mood are content newsletters; Privacy and Announcement are operational mail.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <Button variant="destructive" onClick={onRequestDelete} disabled={saving}>
            <Trash2 className="size-4" /> Unsubscribe
          </Button>
          <div className="flex items-center gap-3">
            {savedAt && <span className="text-xs text-muted-foreground">Saved {formatDate(savedAt)}</span>}
            <Button onClick={onSave} disabled={saving || draft.channels.length === 0}>
              <Save className="size-4" /> Save changes
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AuditTimelineCard({ audit }: { audit: AuditEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Audit timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {audit.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">No audit events yet.</div>
        ) : (
          <ul className="space-y-3">
            {audit.map((entry) => (
              <li key={entry.id} className="grid grid-cols-[160px_1fr_auto] items-center gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
                <span className="font-mono text-xs text-muted-foreground">{entry.eventType}</span>
                <span className="text-sm text-foreground truncate">{entry.source}</span>
                <span className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ConfirmDeleteDialog({
  email,
  open,
  saving,
  onOpenChange,
  onConfirm,
}: {
  email: string;
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsubscribe {email}?</AlertDialogTitle>
          <AlertDialogDescription>
            This sets the status to unsubscribed. The record stays in the database for audit and idempotency.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={saving}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            Unsubscribe
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
