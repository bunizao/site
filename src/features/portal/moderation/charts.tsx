import * as React from 'react';
import { cn } from '@/lib/utils';

/* One bar chart for both screens: hourly reactions and daily comments by
   status. Plain flex boxes, no chart library. Pointing at a column (mouse,
   pen, or a finger dragged sideways) puts its numbers in the readout line
   above; the line is always there, so nothing moves when it changes. */

export interface ChartColumn {
  key: string;
  /** Bottom to top, matching `series`. */
  values: number[];
}

export interface ChartSeries {
  label: string;
  /** A Tailwind background class. */
  fill: string;
}

const Bars = React.memo(function Bars({ columns, series, max }: { columns: ChartColumn[]; series: ChartSeries[]; max: number }) {
  return (
    <>
      {columns.map((column) => (
        <div key={column.key} className="flex h-full min-w-0 flex-1 flex-col-reverse">
          {column.values.map((value, index) =>
            value > 0 ? (
              <div
                key={series[index].label}
                className={cn('w-full first:rounded-b-[1px] last:rounded-t-[1px]', series[index].fill)}
                style={{ height: `${(value / max) * 100}%` }}
              />
            ) : null,
          )}
        </div>
      ))}
    </>
  );
});

export function BarChart({
  columns,
  series,
  height,
  label,
  summary,
  describe,
  axis,
}: {
  columns: ChartColumn[];
  series: ChartSeries[];
  height: number;
  /** Accessible name: what the chart shows, with its headline numbers. */
  label: string;
  /** The readout when nothing is pointed at. */
  summary: React.ReactNode;
  describe: (index: number) => React.ReactNode;
  axis: [string, string];
}) {
  const [active, setActive] = React.useState<number | null>(null);
  const area = React.useRef<HTMLDivElement>(null);
  const max = React.useMemo(
    () => Math.max(1, ...columns.map((column) => column.values.reduce((sum, value) => sum + value, 0))),
    [columns],
  );

  const pick = (event: React.PointerEvent<HTMLDivElement>): void => {
    const rect = area.current?.getBoundingClientRect();
    if (!rect || columns.length === 0) return;
    const index = Math.floor(((event.clientX - rect.left) / rect.width) * columns.length);
    setActive(Math.max(0, Math.min(columns.length - 1, index)));
  };

  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="flex h-5 min-w-0 items-center gap-3 truncate text-muted-foreground text-xs tabular-nums">
        {active === null ? summary : describe(active)}
      </figcaption>
      <div
        ref={area}
        role="img"
        aria-label={label}
        className="relative flex touch-pan-y items-end gap-px"
        style={{ height }}
        onPointerDown={pick}
        onPointerMove={pick}
        onPointerLeave={(event) => {
          // A finger lifting should leave its reading on screen.
          if (event.pointerType === 'mouse') setActive(null);
        }}
      >
        <Bars columns={columns} series={series} max={max} />
        {active !== null && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 rounded-[2px] bg-[hsl(var(--foreground)/0.1)]"
            style={{ left: `${(active / columns.length) * 100}%`, width: `${100 / columns.length}%` }}
          />
        )}
      </div>
      <div aria-hidden className="flex justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
        <span>{axis[0]}</span>
        <span>{axis[1]}</span>
      </div>
    </figure>
  );
}

export function Legend({ series }: { series: ChartSeries[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
      {series.map((entry) => (
        <li key={entry.label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-2 rounded-[2px]', entry.fill)} />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}
