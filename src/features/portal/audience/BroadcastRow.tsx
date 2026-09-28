import * as React from 'react';
import type { BroadcastRecord } from '@bunizao/contracts';
import { cn } from '@/lib/utils';
import { CELLS, LINE, SPACED } from '../activity/table';
import { stamp } from '../comments/model';
import { formatCount } from '../moderation/format';
import { StatusDot } from '../moderation/ui';
import { STATE_LABELS, STATE_TONE, audienceText, broadcastState, percent } from './broadcast-model';

/* One broadcast, one line (a table row from 768px) or two (a list item
   below). The whole row opens the detail. */

/** Columns, narrowest container first. Hidden cells take no track. */
export const BC_COLUMNS =
  '[--bc-cols:minmax(0,1fr)_7.5rem_9.5rem_7rem] ' +
  '@min-[56rem]/log:[--bc-cols:minmax(0,1fr)_7.5rem_12rem_9.5rem_4.5rem_7rem] ' +
  '@min-[68rem]/log:[--bc-cols:minmax(0,1fr)_7.5rem_12rem_6rem_9.5rem_4.5rem_7rem]';

export const BC_GRID = 'grid grid-cols-(--bc-cols)';
export const BC_MID = 'hidden @min-[56rem]/log:block';
export const BC_WIDE = 'hidden @min-[68rem]/log:block';

/** The share of recipients attempted, in the accent colour. The width
    eases across the 2s poll so it reads as motion, not jumps. */
export function SendBar({ row, className }: { row: BroadcastRecord; className?: string }) {
  const value = percent(row);
  return (
    <span
      role="progressbar"
      aria-label="Send progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={cn('block h-1 overflow-hidden rounded-full bg-[hsl(var(--muted))]', className)}
    >
      <span
        className="block h-full rounded-full bg-[hsl(var(--portal-accent))] transition-[width] duration-[1900ms] ease-linear motion-reduce:transition-none"
        style={{ width: `${value}%` }}
      />
    </span>
  );
}

export interface BroadcastRowProps {
  row: BroadcastRecord;
  layout: 'table' | 'stack';
  active: boolean;
  tabbable: boolean;
  onOpen: (row: BroadcastRecord) => void;
}

export const BroadcastRow = React.memo(function BroadcastRow({ row, layout, active, tabbable, onOpen }: BroadcastRowProps) {
  const state = broadcastState(row);
  const sending = state === 'sending';

  const open = (
    <button
      type="button"
      tabIndex={tabbable ? 0 : -1}
      data-row-button
      className="absolute inset-0 z-0 cursor-default outline-none transition-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-accent"
      aria-label={`${row.subject}, ${STATE_LABELS[state]}`}
      aria-current={active ? 'true' : undefined}
      onClick={() => onOpen(row)}
    />
  );

  const rowClass = cn(
    'relative bg-background [content-visibility:auto]',
    SPACED,
    'data-active:bg-accent',
    'data-active:before:absolute data-active:before:inset-y-0 data-active:before:start-0 data-active:before:z-20 data-active:before:w-0.5 data-active:before:bg-[hsl(var(--portal-accent))]',
  );

  const status = (
    <StatusDot tone={STATE_TONE[state]}>
      {STATE_LABELS[state]}
      {sending && <span className="text-muted-foreground tabular-nums">{percent(row)}%</span>}
    </StatusDot>
  );

  if (layout === 'stack') {
    return (
      <div
        role="listitem"
        data-row-id={row.id}
        data-active={active || undefined}
        className={cn(rowClass, 'px-3 py-3 [contain-intrinsic-size:auto_64px]')}
      >
        {open}
        <div className="pointer-events-none relative text-[13px] leading-5">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-foreground">{row.subject}</span>
            <span className="shrink-0 text-xs">{status}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
            <span className="min-w-0 flex-1 truncate">{audienceText(row.audience)}</span>
            <span className="shrink-0 tabular-nums">
              {formatCount(row.sentCount)}/{formatCount(row.recipientCount)} · <time className="font-mono" dateTime={row.createdAt}>{stamp(row.createdAt)}</time>
            </span>
          </div>
          {sending && <SendBar row={row} className="mt-1.5" />}
        </div>
      </div>
    );
  }

  return (
    <div
      role="row"
      data-row-id={row.id}
      data-active={active || undefined}
      className={cn(rowClass, BC_GRID, LINE, CELLS, 'items-center text-[13px] leading-5 [contain-intrinsic-size:auto_44px]')}
    >
      {/* Not positioned, so the open button spans the whole row. */}
      <div role="cell">
        {open}
        <span className="pointer-events-none relative text-foreground">{row.subject}</span>
      </div>
      <div role="cell" className="pointer-events-none relative">{status}</div>
      <div role="cell" className={cn('pointer-events-none relative text-muted-foreground', BC_MID)}>{audienceText(row.audience)}</div>
      <div role="cell" className={cn('pointer-events-none relative text-end text-muted-foreground tabular-nums', BC_WIDE)}>
        {formatCount(row.recipientCount)}
      </div>
      <div role="cell" className="pointer-events-none relative flex items-center gap-2 tabular-nums">
        <span className="min-w-[4ch] text-end">{formatCount(row.sentCount)}</span>
        {sending ? (
          <SendBar row={row} className="flex-1" />
        ) : (
          <span className="text-muted-foreground @min-[68rem]/log:hidden">of {formatCount(row.recipientCount)}</span>
        )}
      </div>
      <div
        role="cell"
        className={cn('pointer-events-none relative text-end tabular-nums', BC_MID, row.failedCount > 0 ? 'text-foreground' : 'text-muted-foreground')}
      >
        {formatCount(row.failedCount)}
      </div>
      <div role="cell" className="pointer-events-none relative font-mono text-muted-foreground text-xs tabular-nums">
        <time dateTime={row.createdAt}>{stamp(row.createdAt)}</time>
      </div>
    </div>
  );
});
