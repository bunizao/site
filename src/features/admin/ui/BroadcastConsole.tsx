import * as React from 'react';
import { Eye, Send, RefreshCw } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
  Badge,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Skeleton,
} from '@/components/coss';
import { adminApiEndpoint } from './api';
import type {
  BroadcastPreviewChannelCounts,
  DeliveryMode,
  NotifyChannel,
  SubscriberStatus,
} from '@bunizao/contracts';

interface BroadcastSummary {
  id: string;
  subject: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: 'draft' | 'sending' | 'sent' | 'failed';
  createdAt: string;
  sentAt: string | null;
  audience: { status: SubscriberStatus | 'active'; channels: NotifyChannel[]; deliveryModes?: DeliveryMode[] };
}

interface BroadcastPreviewState {
  html: string;
  recipientCount: number | null;
  channelCounts: BroadcastPreviewChannelCounts;
  previewing: boolean;
  error: string | null;
}

type BroadcastPreviewAction =
  | { type: 'clear' }
  | { type: 'start' }
  | { type: 'success'; html: string; recipientCount: number; channelCounts: BroadcastPreviewChannelCounts }
  | { type: 'error'; message: string };

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
const DEFAULT_NEWSLETTER_CHANNELS: NotifyChannel[] = ['blog', 'mood'];
const EMPTY_PREVIEW_STATE: BroadcastPreviewState = {
  html: '',
  recipientCount: null,
  channelCounts: {},
  previewing: false,
  error: null,
};
const STATUS_OPTIONS: Array<{ label: string; value: SubscriberStatus | 'active' }> = [
  { label: 'Active', value: 'active' },
  { label: 'Pending', value: 'pending' },
];

function isNotifyChannel(value: unknown): value is NotifyChannel {
  return typeof value === 'string' && CHANNEL_OPTIONS.some((option) => option.value === value);
}

function channelLabel(channel: NotifyChannel): string {
  return CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? channel;
}

function normalizeChannels(channels: NotifyChannel[] | undefined): NotifyChannel[] {
  return Array.isArray(channels) ? channels.filter(isNotifyChannel) : [];
}

function formatChannelList(channels: NotifyChannel[]): string {
  return channels.length ? channels.map(channelLabel).join(', ') : 'No sources';
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const STATUS_VARIANTS: Record<BroadcastSummary['status'], 'success' | 'warning' | 'secondary' | 'destructive'> = {
  sent: 'success',
  sending: 'warning',
  draft: 'secondary',
  failed: 'destructive',
};

function previewReducer(
  state: BroadcastPreviewState,
  action: BroadcastPreviewAction,
): BroadcastPreviewState {
  switch (action.type) {
    case 'clear':
      return EMPTY_PREVIEW_STATE;
    case 'start':
      return { ...state, previewing: true, error: null };
    case 'success':
      return {
        html: action.html,
        recipientCount: action.recipientCount,
        channelCounts: action.channelCounts,
        previewing: false,
        error: null,
      };
    case 'error':
      return { ...state, previewing: false, error: action.message };
  }
}

export default function BroadcastConsole() {
  const [history, setHistory] = React.useState<BroadcastSummary[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [audienceStatus, setAudienceStatus] = React.useState<'active' | 'pending'>('active');
  const [audienceChannels, setAudienceChannels] = React.useState<NotifyChannel[]>(DEFAULT_NEWSLETTER_CHANNELS);
  const [preview, dispatchPreview] = React.useReducer(previewReducer, EMPTY_PREVIEW_STATE);
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<{ id: string; sent: number; failed: number } | null>(null);
  const previewHtml = preview.html;
  const recipientCount = preview.recipientCount;
  const recipientChannelCounts = preview.channelCounts;
  const previewing = preview.previewing;
  const visibleError = error ?? preview.error;

  const loadHistory = React.useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch(adminApiEndpoint('/broadcasts'));
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const data = (await response.json()) as { broadcasts: BroadcastSummary[] };
      setHistory(data.broadcasts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  React.useEffect(() => {
    let cancelled = false;
    if (!subject.trim() || !body.trim() || !audienceChannels.length) {
      dispatchPreview({ type: 'clear' });
      return () => {};
    }
    const id = window.setTimeout(async () => {
      dispatchPreview({ type: 'start' });
      try {
        const response = await fetch(adminApiEndpoint('/broadcasts/preview'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject,
            body,
            audience: { status: audienceStatus, channels: audienceChannels },
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `HTTP ${response.status}`);
        }
        const data = (await response.json()) as {
          html: string;
          recipientCount: number;
          channelCounts?: BroadcastPreviewChannelCounts;
        };
        if (!cancelled) {
          dispatchPreview({
            type: 'success',
            html: data.html,
            recipientCount: data.recipientCount,
            channelCounts: data.channelCounts ?? {},
          });
        }
      } catch (err) {
        if (!cancelled) dispatchPreview({ type: 'error', message: err instanceof Error ? err.message : 'unknown' });
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [subject, body, audienceStatus, audienceChannels]);

  function toggleChannel(channel: NotifyChannel) {
    setAudienceChannels((prev) => {
      const next = prev.includes(channel)
        ? prev.filter((c) => c !== channel)
        : [...prev, channel];
      return next;
    });
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      const response = await fetch(adminApiEndpoint('/broadcasts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          body,
          audience: { status: audienceStatus, channels: audienceChannels },
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const data = (await response.json()) as {
        id: string;
        recipientCount: number;
        sentCount: number;
        failedCount: number;
      };
      setLastResult({ id: data.id, sent: data.sentCount, failed: data.failedCount });
      setSubject('');
      setBody('');
      setSendDialogOpen(false);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-6 min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compose</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bc-subject">Subject</Label>
              <Input id="bc-subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="New post or mood roundup" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bc-body">Body</Label>
              <Textarea
                id="bc-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={12}
                placeholder={`Hi,\n\nA new update is live. The highlights are below.\n\n- New blog post\n- New mood entry\n\n[Read it on buxx.me](https://buxx.me)\n\nThanks,\nbuxx.me`}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Markdown supported. Bare URLs are auto-linked. Pure HTML is also accepted.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Audience status</Label>
                <Select value={audienceStatus} onValueChange={(value) => setAudienceStatus(value as 'active' | 'pending')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Resolved recipients</Label>
                <div className="h-9 flex items-center px-3 rounded-md border border-border bg-background text-sm">
                  {previewing ? (
                    <span className="flex items-center gap-2 text-muted-foreground"><RefreshCw className="size-3.5 animate-spin" /> Resolving…</span>
                  ) : recipientCount === null ? (
                    <span className="text-muted-foreground">Type a subject and body to preview</span>
                  ) : (
                    <span className="font-medium">{recipientCount} subscriber{recipientCount === 1 ? '' : 's'}</span>
                  )}
                </div>
                {CHANNEL_OPTIONS.some((channel) => recipientChannelCounts[channel.value] !== undefined) && (
                  <div className="portal-meta mt-1 flex flex-wrap gap-2">
                    {CHANNEL_OPTIONS.map((channel) => {
                      const count = recipientChannelCounts[channel.value];
                      if (count === undefined) return null;
                      return (
                        <span key={channel.value} data-admin-recipient-source-count={channel.value}>
                          {channel.label} <span className="text-foreground">{count}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Audience sources</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CHANNEL_OPTIONS.map((channel) => {
                  const id = `bc-channel-${channel.value}`;
                  const checked = audienceChannels.includes(channel.value);
                  return (
                    <label key={channel.value} htmlFor={id} className="flex items-start gap-2 px-3 py-2 rounded-md border border-border bg-background text-sm cursor-pointer hover:bg-accent">
                      <Checkbox id={id} checked={checked} onCheckedChange={() => toggleChannel(channel.value)} className="mt-0.5" />
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
              {visibleError && (
                <div className="text-sm text-destructive">{visibleError}</div>
              )}
              <div className="ml-auto flex items-center gap-2">
                {lastResult && (
                  <span className="text-xs text-muted-foreground">
                    Last: {lastResult.sent} sent · {lastResult.failed} failed
                  </span>
                )}
                <Button
                  disabled={!subject.trim() || !body.trim() || !audienceChannels.length || recipientCount === null || recipientCount === 0 || previewing}
                  onClick={() => setSendDialogOpen(true)}
                >
                  <Send className="size-4" /> Send broadcast
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Eye className="size-4" /> Live preview</CardTitle>
          </CardHeader>
          <CardContent>
            {previewHtml ? (
              <iframe
                title="Broadcast preview"
                sandbox=""
                style={{
                  width: '100%',
                  height: '480px',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  background: '#fff',
                }}
                srcDoc={previewHtml}
              />
            ) : (
              <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                Preview appears once subject and body are filled in.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-12 w-full" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">No broadcasts yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead className="w-20">Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((bc) => (
                    <TableRow key={bc.id}>
                      <TableCell>
                        <a className="hover:underline" href={`/dev/portal/broadcasts/${bc.id}`} data-astro-prefetch="false">{bc.subject}</a>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={STATUS_VARIANTS[bc.status]} className="text-[10px] py-0">{bc.status}</Badge>
                          <span className="portal-meta">{bc.sentCount}/{bc.recipientCount} · {bc.failedCount} failed</span>
                        </div>
                        <div className="portal-meta mt-1">
                          Sources: {formatChannelList(normalizeChannels(bc.audience.channels))}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground align-top whitespace-nowrap">
                        {formatDate(bc.sentAt || bc.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send broadcast to {recipientCount ?? '—'} subscribers?</AlertDialogTitle>
            <AlertDialogDescription>
              Audience: status <span className="font-medium">{audienceStatus}</span>, sources {formatChannelList(audienceChannels)}. This sends real email through Resend and cannot be undone. Idempotency keys prevent duplicate sends within the same broadcast id.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={sending}
              onClick={() => void send()}
            >
              {sending ? 'Sending…' : 'Send now'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
