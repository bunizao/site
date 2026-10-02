import * as React from 'react';
import type { SubscriberRecord } from '@bunizao/contracts';
import { cn } from '@/lib/utils';
import { CELLS, LINE, SPACED } from '../activity/table';
import { stamp } from '../comments/model';
import { StatusDot, TOUCH_TARGET } from '../moderation/ui';
import { STATUS_LABELS, STATUS_TONE, channelsText, dateOnly, deliveryText, lastEvent } from './model';

/* One subscriber, one line (a table row from 768px) or two (a list item
   below). The checkbox is always there, not revealed on hover: a mouse,
   a finger and `x` all select the same way. Anywhere else opens the
   detail. */

/** Columns, narrowest container first. Hidden cells take no track.

    Set on each row, not inherited through a custom property from the list:
    opening the pane narrows the list across these breakpoints, and a
    changed inherited property restyles every cell of every row, 300 rows
    deep, where this restyles only the rows (about 10ms less at 4x CPU). */
export const SUB_GRID =
  'grid grid-cols-[2.5rem_minmax(0,1fr)_7.5rem_6.5rem_12rem] ' +
  '@min-[56rem]/log:grid-cols-[2.5rem_minmax(0,1fr)_7.5rem_10rem_6.5rem_12rem] ' +
  '@min-[68rem]/log:grid-cols-[2.5rem_minmax(0,1fr)_7.5rem_14rem_6.5rem_6.5rem_13rem]';
export const MID = 'hidden @min-[56rem]/log:block';
export const WIDE = 'hidden @min-[68rem]/log:block';

export interface SubscriberRowProps {
  row: SubscriberRecord;
  layout: 'table' | 'stack';
  active: boolean;
  checked: boolean;
  /** A delete waiting out its undo window: shown as its result. */
  deleting: boolean;
  tabbable: boolean;
  onOpen: (row: SubscriberRecord) => void;
  onCheck: (row: SubscriberRecord, checked: boolean, range: boolean) => void;
  onIntent: (row: SubscriberRecord) => void;
}

export const SubscriberRow = React.memo(function SubscriberRow({
  row,
  layout,
  active,
  checked,
  deleting,
  tabbable,
  onOpen,
  onCheck,
  onIntent,
}: SubscriberRowProps) {
  const status = deleting ? 'unsubscribed' : row.status;
  const gone = status === 'unsubscribed';
  const event = lastEvent(row);
  const eventText = deleting ? 'Deleting' : event.label;

  const open = (
    <button
      type="button"
      tabIndex={tabbable ? 0 : -1}
      data-row-button
      className="absolute inset-0 z-0 cursor-default outline-none transition-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-accent"
      aria-label={`${row.email}, ${STATUS_LABELS[status]}`}
      aria-current={active ? 'true' : undefined}
      onPointerDown={() => onIntent(row)}
      onClick={() => onOpen(row)}
    />
  );

  const box = (
    <input
      type="checkbox"
      checked={checked}
      aria-label={`Select ${row.email}`}
      className={cn(TOUCH_TARGET, 'z-10 size-4 cursor-pointer accent-[hsl(var(--portal-accent))]')}
      onChange={() => {}}
      onClick={(click) => onCheck(row, click.currentTarget.checked, click.shiftKey)}
    />
  );

  const rowClass = cn(
    'relative bg-background [content-visibility:auto]',
    SPACED,
    'data-active:bg-accent data-checked:bg-[hsl(var(--portal-accent)/0.12)]',
    'data-active:before:absolute data-active:before:inset-y-0 data-active:before:start-0 data-active:before:z-20 data-active:before:w-0.5 data-active:before:bg-[hsl(var(--portal-accent))]',
  );

  if (layout === 'stack') {
    return (
      <div
        role="listitem"
        data-row-id={row.emailHash}
        data-active={active || undefined}
        data-checked={checked || undefined}
        className={cn(rowClass, 'flex items-center gap-3 px-3 py-3 [contain-intrinsic-size:auto_64px]')}
      >
        {open}
        <span className="relative z-10 flex size-5 shrink-0 items-center justify-center">{box}</span>
        <div className="pointer-events-none relative min-w-0 flex-1 text-[13px] leading-5">
          <div className="flex items-center gap-2">
            <span className={cn('min-w-0 flex-1 truncate', gone ? 'text-muted-foreground' : 'text-foreground')}>
              {row.email}
            </span>
            <StatusDot tone={STATUS_TONE[status]} className="shrink-0 text-xs">{STATUS_LABELS[status]}</StatusDot>
          </div>
          <div className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
            <span className="min-w-0 flex-1 truncate">
              {channelsText(row.channels)} · {deliveryText(row)}
            </span>
            <span className="shrink-0 tabular-nums">
              {eventText} <span className="font-mono">{stamp(event.at)}</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="row"
      data-row-id={row.emailHash}
      data-active={active || undefined}
      data-checked={checked || undefined}
      className={cn(rowClass, SUB_GRID, LINE, CELLS, 'items-center text-[13px] leading-5 [contain-intrinsic-size:auto_44px]')}
    >
      {/* Not positioned, so the open button spans the whole row. Full row
          height, so the cell's clip leaves the box its touch target. */}
      <div role="cell" className="flex items-center justify-center self-stretch">
        {open}
        {box}
      </div>
      <div role="cell" className={cn('pointer-events-none relative', gone ? 'text-muted-foreground' : 'text-foreground')}>
        {row.email}
      </div>
      <div role="cell" className="pointer-events-none relative">
        <StatusDot tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</StatusDot>
      </div>
      <div role="cell" className={cn('pointer-events-none relative text-muted-foreground', MID)}>
        {channelsText(row.channels)}
      </div>
      <div role="cell" className="pointer-events-none relative text-muted-foreground">
        {deliveryText(row)}
      </div>
      <div role="cell" className={cn('pointer-events-none relative font-mono text-muted-foreground text-xs tabular-nums', WIDE)}>
        {dateOnly(row.createdAt)}
      </div>
      {/* The time never clips; a long label gives way first. */}
      <div role="cell" className="pointer-events-none relative flex items-baseline gap-1 text-muted-foreground">
        <span className="min-w-0 truncate">{eventText}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums">{stamp(event.at)}</span>
      </div>
    </div>
  );
});
