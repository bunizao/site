import * as React from 'react';
import type { DeliveryMode, NotifyChannel, SubscriberRecord, SubscriberStatus } from '@bunizao/contracts';
import { ChevronDown, ChevronUp, Copy, Link2, Mail, MoreHorizontal, Trash2, UserMinus, X } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { Kbd } from '@/components/coss/kbd';
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/coss/menu';
import { Skeleton } from '@/components/coss/skeleton';
import { toastManager } from '@/components/coss/toast';
import { cn } from '@/lib/utils';
import { Segmented, SMALL } from '../activity/table';
import { href } from '../app/router';
import { absoluteTime, fullStamp } from '../comments/model';
import { HashValue, StatusDot, TOUCH_MENU, TOUCH_TARGET } from '../moderation/ui';
import { describeSubscriberError, useSubscriberDetail } from './data';
import {
  CHANNELS,
  CHANNEL_HINTS,
  CHANNEL_LABELS,
  DELIVERY_LABELS,
  DELIVERY_MODES,
  DELIVERY_SHORT,
  STATUS_LABELS,
  STATUS_TONE,
  auditLabel,
  auditSource,
  channelsText,
  deliveryText,
  hourText,
  pendingDeliveryText,
  type SubscriberPatch,
} from './model';

/* One subscriber, flat: a header line, the actions, the preferences you can
   change in place, every stored field written out, then the audit log as
   plain rows. It renders from the list row, so opening it never waits on
   the network; only History loads. */

const STATUSES: readonly SubscriberStatus[] = ['active', 'pending', 'unsubscribed'];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

let zones: string[] | null = null;
function timeZones(current: string | undefined): string[] {
  if (!zones) {
    try {
      zones = ['UTC', ...Intl.supportedValuesOf('timeZone').filter((zone) => zone !== 'UTC')];
    } catch {
      zones = ['UTC'];
    }
  }
  return current && !zones.includes(current) ? [current, ...zones] : zones;
}

export function copy(text: string, what: string): void {
  void navigator.clipboard?.writeText(text).then(
    () => toastManager.add({ title: `${what} copied`, timeout: 1500 }),
    () => toastManager.add({ type: 'error', title: 'Copy failed', description: 'Select the value and copy it by hand.' }),
  );
}

export function Section({ title, meta, children }: { title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="pt-7">
      <h3 className="flex items-baseline gap-2 pb-1 font-medium text-muted-foreground text-sm">
        {title}
        {meta && <span className="font-normal text-muted-foreground text-xs">{meta}</span>}
      </h3>
      {children}
    </section>
  );
}

export function Field({ label, children, mono, copyable }: { label: string; children: React.ReactNode; mono?: boolean; copyable?: string }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)_auto] items-start gap-x-3 py-2 text-[13px] leading-5 @max-[20rem]/pane:grid-cols-[minmax(0,1fr)_auto]">
      <dt className="text-muted-foreground @max-[20rem]/pane:col-span-2">{label}</dt>
      {/* The placeholder is words, not a value: it stays sans. */}
      <dd className={cn('min-w-0 break-words', empty ? 'text-muted-foreground' : 'text-foreground', mono && !empty && 'font-mono text-xs leading-5 tabular-nums')}>
        {empty ? 'Not recorded' : children}
      </dd>
      <dd className="flex items-center">
        {copyable && (
          <button
            type="button"
            aria-label={`Copy ${label.toLowerCase()}`}
            className="relative inline-flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:bg-accent pointer-coarse:after:absolute pointer-coarse:after:size-11"
            onClick={() => copy(copyable, label)}
          >
            <Copy className="size-3.5" aria-hidden />
          </button>
        )}
      </dd>
    </div>
  );
}

/** A control row inside Preferences: a label, then the control. */
function Setting({ label, children, id }: { label: string; children: React.ReactNode; id?: string }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 py-1.5 text-[13px] @max-[25rem]/pane:flex-col @max-[25rem]/pane:items-stretch @max-[25rem]/pane:py-2.5">
      <span id={id} className="w-[8.5rem] shrink-0 text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

const SELECT =
  'h-8 rounded-md border border-input bg-popover px-2 font-mono text-[13px] text-foreground tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11 dark:bg-input/32';

/** The time zone picker. Its 400-odd options are built on first focus or
    press, not on every open of the panel: that list was most of the cost
    of moving between subscribers. */
function ZoneSelect({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
  const [full, setFull] = React.useState(false);
  const options = full ? timeZones(value) : [value];
  return (
    <select
      aria-label="Digest time zone"
      className={cn(SELECT, 'min-w-0 max-w-full flex-1 font-sans')}
      value={value}
      onFocus={() => setFull(true)}
      onPointerDown={() => setFull(true)}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((zone) => (
        <option key={zone} value={zone}>{zone}</option>
      ))}
    </select>
  );
}

function History({ hash }: { hash: string }) {
  const detail = useSubscriberDetail(hash);
  if (detail.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading history" className="flex flex-col">
        {[0, 1, 2].map((index) => (
          <div key={index} className="grid h-9 grid-cols-[9.5rem_minmax(0,1fr)] items-center gap-x-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    );
  }
  if (detail.isError) {
    return (
      <p role="alert" className="py-1.5 text-[13px] text-muted-foreground">
        History did not load. {describeSubscriberError(detail.error)}{' '}
        <button type="button" className={cn(TOUCH_TARGET, 'text-foreground underline underline-offset-2')} onClick={() => void detail.refetch()}>
          Try again
        </button>
      </p>
    );
  }
  const audit = detail.data.audit;
  if (audit.length === 0) return <p className="py-2 text-[13px] text-muted-foreground">Nothing recorded yet.</p>;
  return (
    <ol className="flex flex-col">
      {audit.map((entry) => (
        <li key={entry.id} className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-x-3 py-2 text-[13px] leading-5">
          <time className="font-mono text-muted-foreground text-xs leading-5 tabular-nums" dateTime={entry.createdAt} title={absoluteTime(entry.createdAt)}>
            {fullStamp(entry.createdAt)}
          </time>
          <span className="min-w-0 break-words">
            {auditLabel(entry.eventType, entry.source)}
            <span className="text-muted-foreground"> · {auditSource(entry.source)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export interface SubscriberDetailProps {
  row: SubscriberRecord;
  variant: 'panel' | 'drawer';
  position: { index: number; total: number } | null;
  deleting: boolean;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  onUpdate: (row: SubscriberRecord, patch: SubscriberPatch, label: string) => void;
  onDelete: (row: SubscriberRecord) => void;
  onBlogWelcome: (row: SubscriberRecord) => Promise<void>;
}

export function SubscriberDetail({
  row,
  variant,
  position,
  deleting,
  onPrev,
  onNext,
  onClose,
  onUpdate,
  onDelete,
  onBlogWelcome,
}: SubscriberDetailProps) {
  const drawer = variant === 'drawer';
  const status: SubscriberStatus = deleting ? 'unsubscribed' : row.status;
  const pendingChange = pendingDeliveryText(row);
  const [welcoming, setWelcoming] = React.useState(false);
  const canWelcome = row.status === 'active' && row.channels.includes('blog') && !deleting;

  // Another row in the same pane starts at the top. Not on mount: the pane
  // is new, so already there, and writing scrollTop forces a layout of the
  // whole screen inside the commit that opens it.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const lastRow = React.useRef(row.emailHash);
  React.useLayoutEffect(() => {
    if (lastRow.current === row.emailHash) return;
    lastRow.current = row.emailHash;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [row.emailHash]);

  const setStatus = (next: SubscriberStatus): void => {
    if (next === row.status) return;
    onUpdate(row, { status: next }, `${row.email} is now ${STATUS_LABELS[next].toLowerCase()}`);
  };
  const toggleChannel = (channel: NotifyChannel): void => {
    const on = row.channels.includes(channel);
    const channels = on ? row.channels.filter((entry) => entry !== channel) : CHANNELS.filter((entry) => entry === channel || row.channels.includes(entry));
    if (channels.length === 0) return;
    onUpdate(row, { channels }, `${CHANNEL_LABELS[channel]} ${on ? 'off' : 'on'} for ${row.email}`);
  };
  const setDelivery = (mode: DeliveryMode): void => {
    if (mode === row.deliveryMode) return;
    onUpdate(row, { deliveryMode: mode }, `${row.email} now gets ${DELIVERY_LABELS[mode].toLowerCase()}`);
  };

  const welcome = (): void => {
    setWelcoming(true);
    void onBlogWelcome(row).finally(() => setWelcoming(false));
  };

  const actions = (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 px-4',
        drawer ? 'border-t py-2.5 pb-[max(env(safe-area-inset-bottom),0.625rem)] [&>button]:h-11 [&>button]:flex-1' : 'h-11 border-b',
      )}
    >
      {status !== 'unsubscribed' && (
        <Button size="sm" className={SMALL} variant="outline" aria-keyshortcuts="U" onClick={() => setStatus('unsubscribed')}>
          <UserMinus />
          Unsubscribe
          <Kbd className="pointer-coarse:hidden">U</Kbd>
        </Button>
      )}
      {/* A phone's drawer has room for one labelled action; welcome moves to the menu. */}
      {canWelcome && (
        <Button size="sm" variant="ghost" loading={welcoming} onClick={welcome} className={cn(SMALL, drawer ? 'max-sm:hidden' : undefined)}>
          <Mail />
          Send blog welcome
        </Button>
      )}
      <Menu>
        <MenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label="More actions" className={drawer ? 'w-11 flex-none!' : 'ms-auto'} />}>
          <MoreHorizontal />
        </MenuTrigger>
        <MenuPopup align="end" className={TOUCH_MENU}>
          {canWelcome && drawer && (
            <MenuItem className="sm:hidden" disabled={welcoming} onClick={welcome}>
              <Mail />
              Send blog welcome
            </MenuItem>
          )}
          <MenuItem onClick={() => copy(row.email, 'Email')}>
            <Copy />
            Copy email
          </MenuItem>
          <MenuItem onClick={() => copy(new URL(href(`/subscribers/${row.emailHash}`), location.origin).toString(), 'Portal link')}>
            <Link2 />
            Copy portal link
          </MenuItem>
          <MenuSeparator />
          <MenuItem variant="destructive" disabled={deleting} onClick={() => onDelete(row)}>
            <Trash2 />
            Delete
            <Kbd className="ms-auto pointer-coarse:hidden">D</Kbd>
          </MenuItem>
        </MenuPopup>
      </Menu>
    </div>
  );

  return (
    <article aria-labelledby={`sub-${row.emailHash}`} className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        {drawer && (
          <Button size="icon-sm" variant="ghost" aria-label="Close" className="-ms-2 pointer-coarse:-ms-3.5 pointer-coarse:size-11" onClick={onClose}>
            <X />
          </Button>
        )}
        <h2 id={`sub-${row.emailHash}`} className="min-w-0 truncate font-medium font-mono text-[13px]" title={row.email}>
          {row.email}
        </h2>
        <StatusDot tone={STATUS_TONE[status]} className="shrink-0 text-[13px]">{STATUS_LABELS[status]}</StatusDot>
        <span className="ms-auto flex shrink-0 items-center">
          {position && (
            <span className="me-1 min-w-[4.5ch] text-end text-muted-foreground text-xs tabular-nums">
              {position.index + 1}/{position.total}
            </span>
          )}
          <Button size="icon-sm" variant="ghost" aria-label="Previous subscriber (K)" className="pointer-coarse:size-11" disabled={!onPrev} onClick={onPrev ?? undefined}>
            <ChevronUp />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Next subscriber (J)" className="pointer-coarse:size-11" disabled={!onNext} onClick={onNext ?? undefined}>
            <ChevronDown />
          </Button>
          {!drawer && (
            <Button size="icon-sm" variant="ghost" aria-label="Close (Esc)" className="pointer-coarse:size-11" onClick={onClose}>
              <X />
            </Button>
          )}
        </span>
      </header>

      {!drawer && actions}

      <div ref={scrollRef} className="@container/pane min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pt-1 pb-8">
        <Section title="Preferences" meta="Saved as you change them">
          <div>
            <Setting label="Status">
              <Segmented
                label="Status"
                value={status}
                options={STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }))}
                onChange={setStatus}
              />
            </Setting>
            <Setting label="Channels" id={`channels-${row.emailHash}`}>
              <div role="group" aria-labelledby={`channels-${row.emailHash}`} className="flex flex-wrap gap-1.5">
                {CHANNELS.map((channel) => {
                  const on = row.channels.includes(channel);
                  const last = on && row.channels.length === 1;
                  return (
                    <button
                      key={channel}
                      type="button"
                      aria-pressed={on}
                      disabled={last}
                      title={last ? 'A subscriber needs at least one channel. Unsubscribe instead.' : CHANNEL_HINTS[channel]}
                      onClick={() => toggleChannel(channel)}
                      className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11',
                        on ? 'border-[hsl(var(--portal-accent)/0.6)] bg-[hsl(var(--portal-accent)/0.14)] text-foreground' : 'text-muted-foreground hover:text-foreground active:bg-accent',
                        last && 'cursor-not-allowed',
                      )}
                    >
                      <span aria-hidden className={cn('size-1.5 rounded-full', on ? 'bg-[hsl(var(--portal-accent))]' : 'bg-transparent ring-1 ring-muted-foreground')} />
                      {CHANNEL_LABELS[channel]}
                    </button>
                  );
                })}
              </div>
            </Setting>
            <Setting label="Delivery">
              <Segmented
                label="Delivery"
                value={row.deliveryMode ?? ('' as DeliveryMode)}
                options={DELIVERY_MODES.map((value) => ({ value, label: DELIVERY_SHORT[value], ariaLabel: DELIVERY_LABELS[value] }))}
                onChange={setDelivery}
              />
            </Setting>
            {row.deliveryMode === 'daily' && (
              <Setting label="Digest time">
                <select
                  aria-label="Digest hour"
                  className={SELECT}
                  value={row.dailyHour ?? 9}
                  onChange={(event) => {
                    const hour = Number(event.target.value);
                    onUpdate(row, { deliveryMode: 'daily', dailyHour: hour, timezone: row.timezone ?? 'UTC' }, `Digest for ${row.email} at ${hourText(hour)}`);
                  }}
                >
                  {HOURS.map((hour) => (
                    <option key={hour} value={hour}>{hourText(hour)}</option>
                  ))}
                </select>
                <ZoneSelect
                  key={row.emailHash}
                  value={row.timezone ?? 'UTC'}
                  onChange={(timezone) =>
                    onUpdate(row, { deliveryMode: 'daily', dailyHour: row.dailyHour ?? 9, timezone }, `Digest for ${row.email} in ${timezone}`)
                  }
                />
              </Setting>
            )}
            {pendingChange && (
              <Setting label="Requested">
                <span className="text-foreground">{pendingChange}</span>
              </Setting>
            )}
          </div>
        </Section>

        <Section title="Record">
          <dl>
            <Field label="Email" mono copyable={row.email}>{row.email}</Field>
            <Field label="Status">{STATUS_LABELS[status]}</Field>
            <Field label="Channels">{channelsText(row.channels)}</Field>
            <Field label="Delivery">
              {row.deliveryMode ? `${DELIVERY_LABELS[row.deliveryMode]}${row.deliveryMode === 'daily' ? ` at ${hourText(row.dailyHour)} ${row.timezone ?? 'UTC'}` : ''}` : deliveryText(row)}
            </Field>
            <Field label="Joined" mono>{fullStamp(row.createdAt)}</Field>
            <Field label="Confirmed" mono>{fullStamp(row.confirmedAt ?? null)}</Field>
            <Field label="Confirmation sent" mono>{fullStamp(row.lastConfirmSentAt ?? null)}</Field>
            <Field label="Last emailed" mono>
              {row.lastNotifiedAt ? `${fullStamp(row.lastNotifiedAt)}${row.lastNotifiedPostId ? ` · ${row.lastNotifiedPostId}` : ''}` : null}
            </Field>
            <Field label="Updated" mono>{fullStamp(row.updatedAt)}</Field>
            <Field label="Email hash" mono copyable={row.emailHash}>
              {row.emailHash && <HashValue key={row.emailHash} value={row.emailHash} />}
            </Field>
          </dl>
        </Section>

        <Section title="History" meta="Newest first">
          <History hash={row.emailHash} />
        </Section>
      </div>

      {drawer && actions}
    </article>
  );
}
