import * as React from 'react';
import {
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Pencil,
  Mail,
} from 'lucide-react';
import {
  Button,
  Input,
  Card,
  Badge,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Label,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
} from '@/components/coss';
import { adminApiEndpoint } from './api';
import type {
  DeliveryMode,
  NotifyChannel,
  SubscriberChannelCounts,
  SubscriberRecord,
  SubscriberStatus,
} from '@bunizao/contracts';

type AdminSubscriberRecord = Omit<SubscriberRecord, 'channels'> & {
  channels?: NotifyChannel[] | null;
};

interface ListResponse {
  rows: AdminSubscriberRecord[];
  total: number;
  pendingCount: number;
  activeCount: number;
  unsubscribedCount: number;
  channelCounts?: SubscriberChannelCounts;
}

interface ListState {
  data: ListResponse;
  loading: boolean;
  error: string | null;
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
const DEFAULT_NEWSLETTER_CHANNELS: NotifyChannel[] = ['blog', 'mood'];
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

interface FiltersState {
  status: SubscriberStatus | 'all';
  source: NotifyChannel | 'all';
  delivery: DeliveryMode | 'all';
}

type FiltersAction =
  | { type: 'status'; value: FiltersState['status'] }
  | { type: 'source'; value: FiltersState['source'] }
  | { type: 'delivery'; value: FiltersState['delivery'] };

const DEFAULT_FILTERS: FiltersState = {
  status: 'all',
  source: 'all',
  delivery: 'all',
};

const INITIAL_LIST_STATE: ListState = {
  data: {
    rows: [],
    total: 0,
    pendingCount: 0,
    activeCount: 0,
    unsubscribedCount: 0,
  },
  loading: true,
  error: null,
};

type ListAction =
  | { type: 'startLoad' }
  | { type: 'loadSuccess'; data: ListResponse }
  | { type: 'loadError'; error: string }
  | { type: 'setError'; error: string | null };

function emptyForm(): FormState {
  return {
    open: false,
    mode: 'create',
    email: '',
    status: 'active',
    channels: DEFAULT_NEWSLETTER_CHANNELS,
    deliveryMode: 'immediate',
    timezone: 'UTC',
    dailyHour: 9,
  };
}

function isNotifyChannel(value: unknown): value is NotifyChannel {
  return typeof value === 'string' && CHANNEL_OPTIONS.some((option) => option.value === value);
}

function getChannelOption(channel: NotifyChannel) {
  return CHANNEL_OPTIONS.find((option) => option.value === channel);
}

function channelLabel(channel: NotifyChannel): string {
  return getChannelOption(channel)?.label ?? channel;
}

function normalizeChannels(channels: AdminSubscriberRecord['channels']): NotifyChannel[] {
  return Array.isArray(channels) ? channels.filter(isNotifyChannel) : [];
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

function filtersReducer(state: FiltersState, action: FiltersAction): FiltersState {
  switch (action.type) {
    case 'status':
      return { ...state, status: action.value };
    case 'source':
      return { ...state, source: action.value };
    case 'delivery':
      return { ...state, delivery: action.value };
  }
}

function listReducer(state: ListState, action: ListAction): ListState {
  switch (action.type) {
    case 'startLoad':
      return { ...state, loading: true, error: null };
    case 'loadSuccess':
      return { data: action.data, loading: false, error: null };
    case 'loadError':
      return { ...state, loading: false, error: action.error };
    case 'setError':
      return { ...state, error: action.error };
  }
}

interface SubscriberFiltersProps {
  search: string;
  filters: FiltersState;
  onSearchChange(value: string): void;
  onFilterChange(action: FiltersAction): void;
  onCreate(): void;
}

function SubscriberFilters({
  search,
  filters,
  onSearchChange,
  onFilterChange,
  onCreate,
}: SubscriberFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by email"
          className="pl-9"
        />
      </div>
      <Select
        value={filters.status}
        onValueChange={(value) => onFilterChange({ type: 'status', value: value as FiltersState['status'] })}
      >
        <SelectTrigger aria-label="Status filter" className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filters.source}
        onValueChange={(value) => onFilterChange({ type: 'source', value: value as FiltersState['source'] })}
      >
        <SelectTrigger aria-label="Source filter" className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sources</SelectItem>
          {CHANNEL_OPTIONS.map((channel) => (
            <SelectItem key={channel.value} value={channel.value}>{channel.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.delivery}
        onValueChange={(value) => onFilterChange({ type: 'delivery', value: value as FiltersState['delivery'] })}
      >
        <SelectTrigger aria-label="Delivery filter" className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any delivery</SelectItem>
          {DELIVERY_MODES.map((mode) => (
            <SelectItem key={mode} value={mode}>{mode}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={onCreate} className="ml-auto">
        <Plus className="size-4" /> Add subscriber
      </Button>
    </div>
  );
}

function SubscriberSummary({ data }: { data: ListResponse }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span>Total <span className="text-foreground font-medium">{data.total}</span></span>
      <span>· Active <span className="text-foreground font-medium">{data.activeCount}</span></span>
      <span>· Pending <span className="text-foreground font-medium">{data.pendingCount}</span></span>
      <span>· Unsubscribed <span className="text-foreground font-medium">{data.unsubscribedCount}</span></span>
    </div>
  );
}

function SubscriberSourceCounts({ channelCounts }: { channelCounts?: SubscriberChannelCounts }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {CHANNEL_OPTIONS.map((channel) => {
        const count = channelCounts?.[channel.value]?.total;
        return (
          <span
            key={channel.value}
            data-admin-source-count={channel.value}
            className="rounded-md border border-border bg-card px-2.5 py-1 text-muted-foreground"
          >
            {channel.label}{' '}
            <span className="font-medium text-foreground">{count ?? '—'}</span>
          </span>
        );
      })}
      {!channelCounts && (
        <span className="py-1 text-muted-foreground">Source counts unavailable from backend.</span>
      )}
    </div>
  );
}

interface SubscriberTableProps {
  data: ListResponse;
  loading: boolean;
  onEdit(record: AdminSubscriberRecord): void;
  onDelete(record: AdminSubscriberRecord): void;
}

function SubscriberTable({ data, loading, onEdit, onDelete }: SubscriberTableProps) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Sources</TableHead>
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
              <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                No subscribers match these filters.
              </TableCell>
            </TableRow>
          ) : (
            data.rows.map((row) => {
              const channels = normalizeChannels(row.channels);
              return (
                <TableRow key={row.emailHash}>
                  <TableCell>
                    <a className="text-foreground hover:underline" href={`/dev/portal/subscribers/${row.emailHash}`}>{row.email}</a>
                    <div className="portal-meta font-mono mt-0.5 truncate max-w-[200px]" title={row.emailHash}>
                      {row.emailHash.slice(0, 12)}…
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1" data-admin-row-sources={row.emailHash}>
                      {channels.length ? (
                        channels.map((channel) => (
                          <Badge key={channel} variant="outline" className="text-[10px] py-0">{channelLabel(channel)}</Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">No sources</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.deliveryMode || '—'}
                    {row.deliveryMode === 'daily' && (
                      <div className="text-muted-foreground">{row.timezone} · {row.dailyHour}h</div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(row.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(row)}>
                          <Pencil className="size-3.5" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            window.location.href = `/dev/portal/subscribers/${row.emailHash}`;
                          }}
                        >
                          <Mail className="size-3.5" /> Open detail
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(row)}
                          variant="destructive"
                        >
                          <Trash2 className="size-3.5" /> Unsubscribe
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

interface SubscriberFormDialogProps {
  form: FormState;
  submitting: boolean;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onClose(): void;
  onSubmit(event: { preventDefault(): void }): void;
  onToggleChannel(channel: NotifyChannel): void;
}

function SubscriberFormDialog({
  form,
  submitting,
  setForm,
  onClose,
  onSubmit,
  onToggleChannel,
}: SubscriberFormDialogProps) {
  return (
    <Dialog open={form.open} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{form.mode === 'create' ? 'Add subscriber' : 'Edit subscriber'}</DialogTitle>
            <DialogDescription>
              {form.mode === 'create'
                ? 'Create a subscriber for blog and mood newsletters, then adjust sources as needed.'
                : 'Update sources, status, or delivery cadence.'}
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
            <Label>Newsletter sources</Label>
            <div className="grid grid-cols-2 gap-2">
              {CHANNEL_OPTIONS.map((channel) => {
                const id = `channel-${channel.value}`;
                const checked = form.channels.includes(channel.value);
                return (
                  <label
                    key={channel.value}
                    htmlFor={id}
                    className="flex items-start gap-2 px-3 py-2 rounded-md border border-border bg-background text-sm cursor-pointer hover:bg-accent"
                  >
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={() => onToggleChannel(channel.value)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block">{channel.label}</span>
                      <span className="block text-xs text-muted-foreground">{channel.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Choose at least one source. Blog and Mood are the content newsletters; Privacy and Announcement remain available for operational mail.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting || !form.email.trim() || form.channels.length === 0}>
              {form.mode === 'create' ? 'Create' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteSubscriberDialogProps {
  candidate: AdminSubscriberRecord | null;
  submitting: boolean;
  onClose(): void;
  onConfirm(): void;
}

function DeleteSubscriberDialog({
  candidate,
  submitting,
  onClose,
  onConfirm,
}: DeleteSubscriberDialogProps) {
  return (
    <AlertDialog
      open={Boolean(candidate)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsubscribe this email?</AlertDialogTitle>
          <AlertDialogDescription>
            {candidate?.email} will be marked as unsubscribed and stop receiving blog, mood, and operational notifications. The record itself is kept for audit.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting}
            onClick={onConfirm}
          >
            Unsubscribe
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function SubscriberList() {
  const [{ data, loading, error }, dispatchList] = React.useReducer(listReducer, INITIAL_LIST_STATE);
  const [filters, dispatchFilters] = React.useReducer(filtersReducer, DEFAULT_FILTERS);
  const [search, setSearch] = React.useState('');
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = React.useState(false);
  const [deleteCandidate, setDeleteCandidate] = React.useState<AdminSubscriberRecord | null>(null);
  const debouncedSearchRef = React.useRef('');
  const searchTimerRef = React.useRef<number | null>(null);

  const load = React.useCallback(async () => {
    dispatchList({ type: 'startLoad' });
    try {
      const params = new URLSearchParams();
      if (filters.status !== 'all') params.set('status', filters.status);
      if (filters.source !== 'all') params.set('channel', filters.source);
      if (filters.delivery !== 'all') params.set('deliveryMode', filters.delivery);
      if (debouncedSearchRef.current) params.set('search', debouncedSearchRef.current);
      params.set('limit', '100');
      const response = await fetch(`${adminApiEndpoint('/subscribers')}?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as ListResponse;
      dispatchList({ type: 'loadSuccess', data: payload });
    } catch (err) {
      dispatchList({ type: 'loadError', error: err instanceof Error ? err.message : 'unknown_error' });
    }
  }, [filters.status, filters.source, filters.delivery]);

  const loadRef = React.useRef(load);

  React.useEffect(() => {
    loadRef.current = load;
  }, [load]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const clearSearchTimer = React.useCallback(() => {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => clearSearchTimer, [clearSearchTimer]);

  function handleSearchChange(value: string) {
    setSearch(value);
    clearSearchTimer();
    searchTimerRef.current = window.setTimeout(() => {
      searchTimerRef.current = null;
      const nextSearch = value.trim();
      if (debouncedSearchRef.current === nextSearch) return;
      debouncedSearchRef.current = nextSearch;
      void loadRef.current();
    }, 220);
  }

  function openCreate() {
    setForm({ ...emptyForm(), open: true, mode: 'create' });
  }

  function openEdit(record: AdminSubscriberRecord) {
    setForm({
      open: true,
      mode: 'edit',
      email: record.email,
      status: record.status,
      channels: normalizeChannels(record.channels),
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
      const next = prev.channels.includes(channel)
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel];
      return { ...prev, channels: next };
    });
  }

  async function submitForm(event: { preventDefault(): void }) {
    event.preventDefault();
    if (!form.channels.length) return;
    setSubmitting(true);
    dispatchList({ type: 'setError', error: null });
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
      dispatchList({ type: 'setError', error: err instanceof Error ? err.message : 'unknown_error' });
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
      dispatchList({ type: 'setError', error: err instanceof Error ? err.message : 'unknown_error' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SubscriberFilters
        search={search}
        filters={filters}
        onSearchChange={handleSearchChange}
        onFilterChange={dispatchFilters}
        onCreate={openCreate}
      />

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
          {error}
        </div>
      )}

      <SubscriberSummary data={data} />
      <SubscriberSourceCounts channelCounts={data.channelCounts} />
      <SubscriberTable
        data={data}
        loading={loading}
        onEdit={openEdit}
        onDelete={setDeleteCandidate}
      />
      <SubscriberFormDialog
        form={form}
        submitting={submitting}
        setForm={setForm}
        onClose={closeForm}
        onSubmit={(event) => {
          void submitForm(event);
        }}
        onToggleChannel={toggleChannel}
      />
      <DeleteSubscriberDialog
        candidate={deleteCandidate}
        submitting={submitting}
        onClose={() => setDeleteCandidate(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </div>
  );
}
