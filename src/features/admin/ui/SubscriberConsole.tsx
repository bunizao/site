import * as React from 'react';
import {
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Pencil,
  Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { adminApiEndpoint } from './api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  DeliveryMode,
  NotifyChannel,
  SubscriberRecord,
  SubscriberStatus,
} from '@bunizao/contracts';

interface ListResponse {
  rows: SubscriberRecord[];
  total: number;
  pendingCount: number;
  activeCount: number;
  unsubscribedCount: number;
}

const CHANNEL_OPTIONS: NotifyChannel[] = ['mood', 'blog', 'privacy', 'announcement'];
const DELIVERY_MODES: DeliveryMode[] = ['immediate', 'every_5h', 'daily'];

const STATUS_VARIANT: Record<SubscriberStatus, 'success' | 'warning' | 'secondary'> = {
  active: 'success',
  pending: 'warning',
  unsubscribed: 'secondary',
};

interface FormState {
  open: boolean;
  mode: 'create' | 'edit';
  email: string;
  status: SubscriberStatus;
  channels: NotifyChannel[];
  deliveryMode: DeliveryMode;
  timezone: string;
  dailyHour: number;
  emailHash?: string;
}

function emptyForm(): FormState {
  return {
    open: false,
    mode: 'create',
    email: '',
    status: 'active',
    channels: ['mood'],
    deliveryMode: 'immediate',
    timezone: 'UTC',
    dailyHour: 9,
  };
}

function formatDate(value: string | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export default function SubscriberConsole() {
  const [data, setData] = React.useState<ListResponse>({
    rows: [],
    total: 0,
    pendingCount: 0,
    activeCount: 0,
    unsubscribedCount: 0,
  });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<SubscriberStatus | 'all'>('all');
  const [channelFilter, setChannelFilter] = React.useState<NotifyChannel | 'all'>('all');
  const [deliveryFilter, setDeliveryFilter] = React.useState<DeliveryMode | 'all'>('all');
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [form, setForm] = React.useState<FormState>(emptyForm());
  const [submitting, setSubmitting] = React.useState(false);
  const [deleteCandidate, setDeleteCandidate] = React.useState<SubscriberRecord | null>(null);

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search.trim()), 220);
    return () => window.clearTimeout(id);
  }, [search]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (channelFilter !== 'all') params.set('channel', channelFilter);
      if (deliveryFilter !== 'all') params.set('deliveryMode', deliveryFilter);
      if (debounced) params.set('search', debounced);
      params.set('limit', '100');
      const response = await fetch(`${adminApiEndpoint('/subscribers')}?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as ListResponse;
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown_error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, channelFilter, deliveryFilter, debounced]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setForm({ ...emptyForm(), open: true, mode: 'create' });
  }

  function openEdit(record: SubscriberRecord) {
    setForm({
      open: true,
      mode: 'edit',
      email: record.email,
      status: record.status,
      channels: record.channels.length ? record.channels : ['mood'],
      deliveryMode: record.deliveryMode ?? 'immediate',
      timezone: record.timezone ?? 'UTC',
      dailyHour: record.dailyHour ?? 9,
      emailHash: record.emailHash,
    });
  }

  function closeForm() {
    setForm((prev) => ({ ...prev, open: false }));
  }

  function toggleChannel(channel: NotifyChannel) {
    setForm((prev) => {
      const has = prev.channels.includes(channel);
      const next = has
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel];
      return {
        ...prev,
        channels: next.length ? next : ['mood'],
      };
    });
  }

  async function submitForm(event: { preventDefault(): void }) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        email: form.email.trim(),
        status: form.status,
        channels: form.channels,
        deliveryMode: form.deliveryMode,
        timezone: form.deliveryMode === 'daily' ? form.timezone || 'UTC' : undefined,
        dailyHour: form.deliveryMode === 'daily' ? form.dailyHour : undefined,
      };

      const url =
        form.mode === 'create'
          ? adminApiEndpoint('/subscribers')
          : adminApiEndpoint(`/subscribers/${form.emailHash}`);
      const method = form.mode === 'create' ? 'POST' : 'PATCH';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteCandidate) return;
    setSubmitting(true);
    try {
      const response = await fetch(adminApiEndpoint(`/subscribers/${deleteCandidate.emailHash}`), {
        method: 'DELETE',
      });
      if (!response.ok && response.status !== 204) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setDeleteCandidate(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by email"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={(value) => setChannelFilter(value as typeof channelFilter)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            {CHANNEL_OPTIONS.map((channel) => (
              <SelectItem key={channel} value={channel}>{channel}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={deliveryFilter} onValueChange={(value) => setDeliveryFilter(value as typeof deliveryFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any delivery</SelectItem>
            {DELIVERY_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>{mode}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={openCreate} className="ml-auto">
          <Plus className="size-4" /> Add subscriber
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>Total <span className="text-foreground font-medium">{data.total}</span></span>
        <span>· Active <span className="text-foreground font-medium">{data.activeCount}</span></span>
        <span>· Pending <span className="text-foreground font-medium">{data.pendingCount}</span></span>
        <span>· Unsubscribed <span className="text-foreground font-medium">{data.unsubscribedCount}</span></span>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Channels</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  {Array.from({ length: 6 }).map((__, idx) => (
                    <TableCell key={idx}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                  No subscribers match these filters.
                </TableCell>
              </TableRow>
            ) : (
              data.rows.map((row) => (
                <TableRow key={row.emailHash}>
                  <TableCell>
                    <a className="text-foreground hover:underline" href={`/dev/portal/subscribers/${row.emailHash}`} data-astro-prefetch="false">{row.email}</a>
                    <div className="font-mono text-[10px] text-muted-foreground mt-0.5 truncate max-w-[200px]" title={row.emailHash}>
                      {row.emailHash.slice(0, 12)}…
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.channels.map((channel) => (
                        <Badge key={channel} variant="outline" className="text-[10px] py-0">{channel}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.deliveryMode || '—'}
                    {row.deliveryMode === 'daily' && (
                      <div className="text-muted-foreground">{row.timezone} · {row.dailyHour}h</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(row.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEdit(row)}>
                          <Pencil className="size-3.5" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            window.location.href = `/dev/portal/subscribers/${row.emailHash}`;
                          }}
                        >
                          <Mail className="size-3.5" /> Open detail
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => setDeleteCandidate(row)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-3.5" /> Unsubscribe
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={form.open} onOpenChange={(open) => (open ? null : closeForm())}>
        <DialogContent>
          <form onSubmit={submitForm} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{form.mode === 'create' ? 'Add subscriber' : 'Edit subscriber'}</DialogTitle>
              <DialogDescription>
                {form.mode === 'create'
                  ? 'Manually create a subscriber and choose their channel preferences.'
                  : 'Update channels, status, or delivery cadence.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="subscriber-email">Email</Label>
              <Input
                id="subscriber-email"
                type="email"
                required
                disabled={form.mode === 'edit'}
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as SubscriberStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Delivery mode</Label>
                <Select value={form.deliveryMode} onValueChange={(value) => setForm((prev) => ({ ...prev, deliveryMode: value as DeliveryMode }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DELIVERY_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.deliveryMode === 'daily' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="subscriber-tz">Timezone</Label>
                  <Input
                    id="subscriber-tz"
                    value={form.timezone}
                    onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subscriber-hour">Daily hour</Label>
                  <Input
                    id="subscriber-hour"
                    type="number"
                    min={0}
                    max={23}
                    value={form.dailyHour}
                    onChange={(event) => setForm((prev) => ({ ...prev, dailyHour: Number(event.target.value) }))}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Channels</Label>
              <div className="grid grid-cols-2 gap-2">
                {CHANNEL_OPTIONS.map((channel) => {
                  const id = `channel-${channel}`;
                  const checked = form.channels.includes(channel);
                  return (
                    <label
                      key={channel}
                      htmlFor={id}
                      className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background text-sm cursor-pointer hover:bg-accent"
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={() => toggleChannel(channel)}
                      />
                      <span>{channel}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Mood is the only channel sending today. Others are reserved for future blog/announcement notifications.</p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm} disabled={submitting}>Cancel</Button>
              <Button type="submit" disabled={submitting || !form.email.trim()}>
                {form.mode === 'create' ? 'Create' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => (open ? null : setDeleteCandidate(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsubscribe this email?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCandidate?.email} will be marked as unsubscribed and stop receiving any further notifications. The record itself is kept for audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              Unsubscribe
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
