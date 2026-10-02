import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatCount, utcDayLabel } from './format';

/* Two small charts, drawn with divs: a sparkline for Home and a daily bar
   chart for Analytics. No chart library -- neither needs axes, zoom or
   animation, and a div bar lays out in the same pass as the text beside it. */

/** Tiny bar trend. The last bar is today so far, drawn hollow so it does not
    read as a drop. `null` values are days the data does not cover. */
export function Sparkline({ values, label, className }: { values: ReadonlyArray<number | null>; label: string; className?: string }) {
  const max = Math.max(1, ...values.map((value) => value ?? 0));
  return (
    <span role="img" aria-label={label} className={cn('flex h-5 w-[5.25rem] shrink-0 items-end gap-px', className)}>
      {values.map((value, index) => {
        const last = index === values.length - 1;
        return (
          <span
            key={index}
            className={cn(
              'flex-1 rounded-[1px]',
              value === null ? 'h-px bg-border' : last ? 'border border-muted-foreground' : 'bg-muted-foreground',
            )}
            style={value === null ? undefined : { height: value ? `${Math.max(8, (value / max) * 100)}%` : '1px' }}
          />
        );
      })}
    </span>
  );
}

export interface DailyPoint {
  day: string;
  views: number;
  reads: number;
}

/** Views per UTC day with reads inside each bar. Hover, tap or the arrow
    keys pick a day; the readout above names it in words and numbers, so
    nothing depends on telling two shades apart. */
export const DailyBars = React.memo(function DailyBars({ points, className }: { points: readonly DailyPoint[]; className?: string }) {
  const [active, setActive] = React.useState<number | null>(null);
  const max = Math.max(1, ...points.map((point) => point.views));
  const shown = points[active ?? points.length - 1];

  const pick = (event: React.PointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.floor(((event.clientX - rect.left) / rect.width) * points.length);
    setActive(Math.min(points.length - 1, Math.max(0, index)));
  };

  return (
    <div className={className}>
      <div className="flex h-6 items-baseline gap-3 whitespace-nowrap text-[13px]" aria-live="polite">
        {shown ? (
          <>
            <span className="min-w-0 truncate text-muted-foreground">{utcDayLabel(shown.day)}{active === null && points.length > 0 ? ' (today so far)' : ''}</span>
            <span className="tabular-nums">{formatCount(shown.views)} views</span>
            <span className="text-muted-foreground tabular-nums">{formatCount(shown.reads)} reads</span>
          </>
        ) : (
          <span className="text-muted-foreground">No days in range</span>
        )}
        {/* The readout names views and reads in words; the key is extra. */}
        <span className="ms-auto hidden items-center gap-3 text-muted-foreground text-xs @xl:flex" aria-hidden>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-[2px] bg-[hsl(var(--portal-accent)/0.35)]" />Views</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-[2px] bg-[hsl(var(--portal-accent))]" />Reads</span>
        </span>
      </div>
      <div
        role="group"
        tabIndex={0}
        aria-label="Daily views and reads. Use the arrow keys to read one day."
        onPointerMove={(event) => event.pointerType === 'mouse' && pick(event)}
        onPointerDown={pick}
        onPointerLeave={(event) => event.pointerType === 'mouse' && setActive(null)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const from = active ?? points.length - 1;
          setActive(Math.min(points.length - 1, Math.max(0, from + (event.key === 'ArrowRight' ? 1 : -1))));
        }}
        onBlur={() => setActive(null)}
        className="mt-1 flex h-28 touch-pan-y items-end gap-px rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {points.map((point, index) => (
          <div
            key={point.day}
            className={cn('relative flex h-full flex-1 items-end', active === index && 'bg-accent')}
          >
            <div
              className="flex w-full flex-col justify-end rounded-t-[2px] bg-[hsl(var(--portal-accent)/0.35)]"
              style={{ height: point.views ? `${Math.max(2, (point.views / max) * 100)}%` : '1px' }}
            >
              <div
                className="w-full rounded-t-[2px] bg-[hsl(var(--portal-accent))]"
                style={{ height: point.views ? `${(point.reads / point.views) * 100}%` : 0 }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-muted-foreground text-xs tabular-nums" aria-hidden>
        <span>{points[0] ? utcDayLabel(points[0].day) : ''}</span>
        <span>{points.length > 0 ? utcDayLabel(points[points.length - 1].day) : ''}</span>
      </div>
      {/* The same numbers for screen readers, right after the chart: one
          line per day. A list, not a table: a table costs four times the
          elements to lay out, and the chart is laid out on every open. */}
      <ol aria-label="Views and reads per day, UTC" className="sr-only">
        {points.map((point) => (
          <li key={point.day}>{`${point.day}: ${point.views} views, ${point.reads} reads`}</li>
        ))}
      </ol>
    </div>
  );
});

/** Fill site-api's sparse `daily` (only days with rows) out to every UTC day
    from the first day of the range to today. */
export function denseDays(daily: ReadonlyArray<DailyPoint>, days: number, now = Date.now()): DailyPoint[] {
  const byDay = new Map(daily.map((point) => [point.day, point]));
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  // The range starts `days * 24h` ago, which lands inside a UTC day, so it
  // spans `days + 1` calendar days counting today.
  return Array.from({ length: days + 1 }, (_, index) => {
    const day = new Date(today.getTime() - (days - index) * 86_400_000).toISOString().slice(0, 10);
    const point = byDay.get(day);
    return { day, views: point?.views ?? 0, reads: point?.reads ?? 0 };
  });
}
