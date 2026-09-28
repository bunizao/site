import type * as React from 'react';
import { Button } from '@/components/coss/button';
import { Skeleton } from '@/components/coss/skeleton';
import { Spinner } from '@/components/coss/spinner';
import { cn } from '@/lib/utils';
import { describeError } from '../app/api';

/* The flat log look every list screen shares with Home: a muted 14px
   heading, then rows. No cards, no boxes, no zebra, no rule between rows.
   Status is a dot plus a word; the word carries the meaning, and the dot
   takes a colour only for the state that needs you.

   The portal's density is set here, not per screen: a record is one 44px
   line under a mouse or a finger, a cell keeps 12px either side, and rows
   part by 4px of space. A hovered or selected row is a rounded pill, as on
   Home. */

export const GUTTER = 'px-4 sm:px-6';

/** One record per row, 44px. */
export const ROW = 'min-h-11';

/** A one-line table row of exactly ROW's height, and that height in
    pixels for sizing a first render to the viewport. */
export const LINE = 'h-11';
export const LINE_PX = 44;

/** A full-width table stands 4px in from the screen's edges, so a row's
    pill clears them, and each row keeps 4px below it. A row's text lands
    16px in, level with the bars above: 4px here plus the cell's 12px. */
export const TABLE = 'px-1';
export const SPACED = 'mb-1 rounded-lg';

/** A list in the page gutter, laid out like Home's: each row bleeds its
    pill 12px past the text column, so its text lines up with the heading. */
export const ROWS = 'flex flex-col gap-1';
export const LIST = cn(ROWS, GUTTER);
export const BLEED = '-mx-3 rounded-lg px-3';

/** The cells of a one-line table row: 12px either side, one line each. */
export const CELLS = '[&>[role=cell]]:truncate [&>[role=cell]]:px-3';

/** A column header row. Its faint line is the only one in a list, kept
    because rows scroll under a sticky header. */
export const HEAD = 'h-9 border-b border-[hsl(var(--portal-rule))] text-muted-foreground text-xs';

/** A small control, as on Home: 32px with 14px text at every width, and
    44px under a finger. Goes on every size="sm" button. */
export const SMALL = 'h-8 text-sm sm:h-8 pointer-coarse:h-11';

/** Pressed state that shows on the first frame of a press, touch included. */
export const PRESSABLE = 'hover:bg-accent/60 active:bg-accent';

export type Tone = 'attention' | 'danger' | 'ok' | 'accent' | 'neutral';

const TONE_CLASS: Record<Tone, string> = {
  attention: 'bg-warning',
  danger: 'bg-[hsl(var(--portal-danger))]',
  ok: 'bg-success',
  accent: 'bg-[hsl(var(--portal-accent))]',
  neutral: 'bg-muted-foreground',
};

export function Dot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', TONE_CLASS[tone], className)} />;
}

export function Section({
  title,
  meta,
  action,
  children,
  className,
  headingId,
}: {
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headingId?: string;
}) {
  return (
    <section aria-labelledby={headingId} className={className}>
      <div className={cn('mb-2 flex min-h-8 items-center gap-3', GUTTER)}>
        <h2 id={headingId} className="font-medium text-muted-foreground text-sm">{title}</h2>
        {meta && <span className="min-w-0 truncate text-[13px] text-muted-foreground">{meta}</span>}
        {action && <span className="ms-auto flex shrink-0 items-center gap-1">{action}</span>}
      </div>
      {children}
    </section>
  );
}

/** A failed read, in place of the rows it would have filled. */
export function LoadError({
  what,
  error,
  onRetry,
  retrying,
  className,
}: {
  what: string;
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm', ROW, GUTTER, className)}>
      <Dot tone="danger" />
      <span className="font-medium">Could not load {what}.</span>
      {/* Takes its own line when the row is too narrow to share. */}
      <span className="min-w-[14rem] flex-1 text-muted-foreground">{describeError(error)}</span>
      <Button size="sm" className={SMALL} variant="outline" onClick={onRetry} loading={retrying}>
        Try again
      </Button>
    </div>
  );
}

/** Placeholder rows at the final row height, so data lands without a shift. */
export function SkeletonRows({ rows, widths = ['w-12', 'w-24', 'w-2/5'], className }: { rows: number; widths?: string[]; className?: string }) {
  return (
    <div aria-hidden className={cn(LIST, className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={cn('flex items-center gap-4', ROW, BLEED)}>
          {widths.map((width, column) => (
            <Skeleton key={column} className={cn('h-3', width, column === widths.length - 1 && 'ms-auto')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A refresh in flight while older numbers stay on screen. Reserves its
    width either way so nothing beside it moves. */
export function Updating({ active, label = 'Updating' }: { active: boolean; label?: string }) {
  return (
    <span className="inline-flex w-20 items-center gap-1.5 text-muted-foreground text-xs" aria-live="polite">
      {active && (
        <>
          <Spinner className="size-3" />
          {label}
        </>
      )}
    </span>
  );
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('font-mono tabular-nums', className)}>{children}</span>;
}

/** A row of mutually exclusive buttons: ranges, families. The pressed one
    changes on the first frame; data catches up behind it. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  /** `ariaLabel` spells out a short label ("7d" as "Last 7 days"). */
  options: ReadonlyArray<{ value: T; label: string; ariaLabel?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex h-8 shrink-0 items-stretch rounded-md border p-0.5 pointer-coarse:h-[46px] pointer-coarse:p-0">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            aria-label={option.ariaLabel}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-[5px] px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:px-3.5',
              selected ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground active:bg-accent',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
