import * as React from 'react';
import {
  ChevronRight,
  CircleCheck,
  CircleDashed,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
  type LucideIcon,
} from 'lucide-react';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/coss';
import { cn } from '@/lib/utils';
import type { BlogAnalyticsEventRecord, BlogAnalyticsEventsResult } from '@bunizao/contracts';

// Same-origin static route (see src/pages/dev/portal/api/analytics-events.ts).
// Not the admin proxy prefix — this one is public within the portal's own
// Cloudflare Access gate, not `/api/admin/*`.
const EVENTS_ENDPOINT = '/dev/portal/api/analytics-events';
const POLL_INTERVAL_MS = 10_000;

interface Props {
  events: BlogAnalyticsEventRecord[];
  limit: number;
}

function deviceIcon(type: string | null): LucideIcon {
  if (type === 'mobile') return Smartphone;
  if (type === 'tablet') return Tablet;
  return Monitor;
}

function labelFor(value: string | null | undefined): string {
  if (!value) return 'unknown';
  return value.replace(/_/g, ' ');
}

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return value;
  }
}

function formatTime(value: Date): string {
  return value.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatMs(value: number): string {
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

// IPv6 addresses can run 30+ characters; keep the column narrow and let the
// full value live in the title attribute (and the expanded row, unmangled).
function truncateMiddle(value: string, head = 10, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function geoLabel(event: BlogAnalyticsEventRecord): string {
  if (!event.country) return '—';
  return event.city ? `${event.country} · ${event.city}` : event.country;
}

function uniqueValues(events: BlogAnalyticsEventRecord[], pick: (event: BlogAnalyticsEventRecord) => string | null): string[] {
  const set = new Set<string>();
  for (const event of events) {
    const value = pick(event);
    if (value) set.add(value);
  }
  return [...set].sort();
}

function matchesFilter(event: BlogAnalyticsEventRecord, needle: string): boolean {
  const haystack = [event.slug, event.ip, event.ua, event.country, event.city]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

interface ChipProps {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}

function FilterChip({ active, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-2.5 py-1 capitalize transition-colors',
        active
          ? 'border-primary/60 bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
      )}
    >
      {children}
    </button>
  );
}

interface DetailFieldProps {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
  /** Span the full detail grid — for values long enough to wrap (UA, referrer). */
  wide?: boolean;
}

// Labels use the portal's single micro-label class; values inherit their size
// from the .portal-detail container so nothing here names a size of its own.
function DetailField({ label, children, mono, wide }: DetailFieldProps) {
  return (
    <div className={cn('min-w-0', wide && 'col-span-2 sm:col-span-3 lg:col-span-4')}>
      <div className="portal-eyebrow">{label}</div>
      <div className={cn('mt-0.5 break-words text-foreground', mono && 'portal-mono')}>{children}</div>
    </div>
  );
}

function EventDetail({ event }: { event: BlogAnalyticsEventRecord }) {
  return (
    <div className="portal-detail grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4">
      <DetailField label="User agent" mono wide>
        <span className="whitespace-pre-wrap break-all">{event.ua ?? '—'}</span>
      </DetailField>
      <DetailField label="ASN">{event.asn ? `AS${event.asn}${event.asOrg ? ` · ${event.asOrg}` : ''}` : '—'}</DetailField>
      <DetailField label="Colo">{event.colo ?? '—'}</DetailField>
      <DetailField label="Language">{event.lang ?? '—'}</DetailField>
      <DetailField label="Ref source">{labelFor(event.refSource)}</DetailField>
      <DetailField label="Referrer" wide>
        <span className="break-all">{event.referrer ?? '—'}</span>
      </DetailField>
      <DetailField label="Visitor ID" mono>{event.visitorId}</DetailField>
      <DetailField label="Session ID" mono>{event.sessionId ?? '—'}</DetailField>
      <DetailField label="Event ID" mono>{event.eventId}</DetailField>
    </div>
  );
}

export default function EventLog({ events: initialEvents, limit }: Props) {
  const [events, setEvents] = React.useState(initialEvents);
  const [filterText, setFilterText] = React.useState('');
  const [platformFilter, setPlatformFilter] = React.useState<string | null>(null);
  const [deviceFilter, setDeviceFilter] = React.useState<string | null>(null);
  const [expandedSet, setExpandedSet] = React.useState<Set<string>>(() => new Set());
  const [autoRefresh, setAutoRefresh] = React.useState(false);
  const [lastRefreshed, setLastRefreshed] = React.useState<Date | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [refreshError, setRefreshError] = React.useState<string | null>(null);

  function toggleRow(eventId: string) {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`${EVENTS_ENDPOINT}?limit=${limit}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as BlogAnalyticsEventsResult;
      setEvents(data.events ?? []);
      setLastRefreshed(new Date());
      setRefreshError(null);
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'refresh_failed');
    } finally {
      setRefreshing(false);
    }
  }, [limit]);

  React.useEffect(() => {
    if (!autoRefresh) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    // Refresh immediately on toggle-on, then poll.
    tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, refresh]);

  const platforms = React.useMemo(() => uniqueValues(events, (e) => e.platform), [events]);
  const devices = React.useMemo(() => uniqueValues(events, (e) => e.deviceType), [events]);

  const filtered = React.useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    return events.filter((event) => {
      if (platformFilter && event.platform !== platformFilter) return false;
      if (deviceFilter && event.deviceType !== deviceFilter) return false;
      if (needle && !matchesFilter(event, needle)) return false;
      return true;
    });
  }, [events, filterText, platformFilter, deviceFilter]);

  const COLUMN_COUNT = 9;

  return (
    <div className="flex flex-col gap-3">
      <div className="portal-controls flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={filterText}
          onChange={(event) => setFilterText(event.target.value)}
          placeholder="Filter by slug, IP, UA, or country"
          aria-label="Filter events"
          className="h-8 min-w-[220px] flex-1 rounded-md border border-border bg-background px-2.5 text-[length:inherit] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        {platforms.map((platform) => (
          <FilterChip
            key={`platform-${platform}`}
            active={platformFilter === platform}
            onClick={() => setPlatformFilter((prev) => (prev === platform ? null : platform))}
          >
            {labelFor(platform)}
          </FilterChip>
        ))}
        {devices.map((device) => (
          <FilterChip
            key={`device-${device}`}
            active={deviceFilter === device}
            onClick={() => setDeviceFilter((prev) => (prev === device ? null : device))}
          >
            {labelFor(device)}
          </FilterChip>
        ))}

        <button
          type="button"
          onClick={() => setAutoRefresh((prev) => !prev)}
          aria-pressed={autoRefresh}
          className={cn(
            'ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-medium transition-colors',
            autoRefresh
              ? 'border-success/40 bg-success/10 text-success-foreground'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          {autoRefresh ? (
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
          ) : (
            <RefreshCw className={cn('size-3', refreshing && 'animate-spin')} />
          )}
          {autoRefresh ? 'Live' : 'Auto-refresh'}
        </button>
        {lastRefreshed && (
          <span className="portal-mono text-muted-foreground">Updated {formatTime(lastRefreshed)}</span>
        )}
      </div>

      {refreshError && (
        <p className="portal-controls text-destructive-foreground">Refresh failed: {refreshError}</p>
      )}

      <Table variant="card">
        <TableHeader>
          <TableRow>
            <TableHead aria-hidden="true" className="w-6" />
            <TableHead>Time</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Browser / OS</TableHead>
            <TableHead>Platform</TableHead>
            <TableHead>Geo</TableHead>
            <TableHead>IP</TableHead>
            <TableHead className="text-right">Dwell</TableHead>
            <TableHead className="text-right">Scroll</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className="py-8 text-center text-muted-foreground">
                {events.length === 0 ? 'No raw events yet.' : 'No events match these filters.'}
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((event) => {
              const DeviceIcon = deviceIcon(event.deviceType);
              const isExpanded = expandedSet.has(event.eventId);
              const detailId = `event-detail-${event.eventId}`;
              return (
                <React.Fragment key={event.eventId}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => toggleRow(event.eventId)}
                  >
                    <TableCell>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={detailId}
                        aria-label={isExpanded ? 'Collapse event details' : 'Expand event details'}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          toggleRow(event.eventId);
                        }}
                        className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ChevronRight className={cn('size-3.5 transition-transform', isExpanded && 'rotate-90')} />
                      </button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(event.openedAt)}
                    </TableCell>
                    <TableCell>
                      <a
                        href={`/dev/portal/analytics/${encodeURIComponent(event.slug)}`}
                        className="portal-mono"
                        data-astro-prefetch="false"
                        onClick={(linkEvent) => linkEvent.stopPropagation()}
                      >
                        {event.slug}
                      </a>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <DeviceIcon className="size-3.5 text-muted-foreground" />
                        {event.browser ?? 'unknown'} · {event.os ?? 'unknown'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" size="sm">{labelFor(event.platform)}</Badge>
                    </TableCell>
                    <TableCell>{geoLabel(event)}</TableCell>
                    <TableCell>
                      {event.ip ? (
                        <span className="portal-mono" title={event.ip}>{truncateMiddle(event.ip)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatMs(event.dwellMs)}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {Math.round(event.scrollDepth * 100)}%
                        {event.completed ? (
                          <CircleCheck className="size-3.5 text-success" aria-label="Completed" />
                        ) : (
                          <CircleDashed className="size-3.5 text-muted-foreground" aria-label="Not completed" />
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow id={detailId} className="bg-muted/30">
                      <TableCell colSpan={COLUMN_COUNT} className="p-0">
                        <EventDetail event={event} />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
