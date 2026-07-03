import * as React from 'react';
import { Eye, Send, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Skeleton } from '@/components/ui/skeleton';
import type {
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

const CHANNEL_OPTIONS: NotifyChannel[] = ['mood', 'blog', 'privacy', 'announcement'];
const STATUS_OPTIONS: Array<{ label: string; value: SubscriberStatus | 'active' }> = [
  { label: 'Active', value: 'active' },
  { label: 'Pending', value: 'pending' },
];

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

export default function BroadcastConsole() {
  const [history, setHistory] = React.useState<BroadcastSummary[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [audienceStatus, setAudienceStatus] = React.useState<'active' | 'pending'>('active');
  const [audienceChannels, setAudienceChannels] = React.useState<NotifyChannel[]>(['mood']);
  const [previewHtml, setPreviewHtml] = React.useState<string>('');
  const [recipientCount, setRecipientCount] = React.useState<number | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<{ id: string; sent: number; failed: number } | null>(null);

  const loadHistory = React.useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch('/api/admin/broadcasts');
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
      setPreviewHtml('');
      setRecipientCount(null);
      return () => {};
    }
    const id = window.setTimeout(async () => {
      setPreviewing(true);
      try {
        const response = await fetch('/api/admin/broadcasts/preview', {
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
        const data = (await response.json()) as { html: string; recipientCount: number };
        if (!cancelled) {
          setPreviewHtml(data.html);
          setRecipientCount(data.recipientCount);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'unknown');
      } finally {
        if (!cancelled) setPreviewing(false);
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
      return next.length ? next : ['mood'];
    });
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/broadcasts', {
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
              <Input id="bc-subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Privacy policy update" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bc-body">Body</Label>
              <Textarea
                id="bc-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={12}
                placeholder={`Hi,\n\nWe updated the privacy policy. The changes are summarized below.\n\n- Updated cookie list\n- Renamed analytics provider\n\n[Read the full policy](https://buxx.me/privacy)\n\nThanks,\nbuxx.me`}
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
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Audience channels</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CHANNEL_OPTIONS.map((channel) => {
                  const id = `bc-channel-${channel}`;
                  const checked = audienceChannels.includes(channel);
                  return (
                    <label key={channel} htmlFor={id} className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background text-sm cursor-pointer hover:bg-accent">
                      <Checkbox id={id} checked={checked} onCheckedChange={() => toggleChannel(channel)} />
                      <span>{channel}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Subscribers must have at least one selected channel to receive this broadcast.</p>
            </div>

            <div className="flex items-center justify-between">
              {error && (
                <div className="text-sm text-destructive">{error}</div>
              )}
              <div className="ml-auto flex items-center gap-2">
                {lastResult && (
                  <span className="text-xs text-muted-foreground">
                    Last: {lastResult.sent} sent · {lastResult.failed} failed
                  </span>
                )}
                <Button
                  disabled={!subject.trim() || !body.trim() || !audienceChannels.length || recipientCount === 0 || previewing}
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
                          <span className="text-[11px] text-muted-foreground">{bc.sentCount}/{bc.recipientCount} · {bc.failedCount} failed</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground align-top whitespace-nowrap">
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
              Audience: status <span className="font-medium">{audienceStatus}</span>, channels {audienceChannels.join(', ')}. This sends real email through Resend and cannot be undone. Idempotency keys prevent duplicate sends within the same broadcast id.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={sending}
              onClick={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              {sending ? 'Sending…' : 'Send now'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
