import * as React from 'react';
import type { AdminBanKeyType, AdminSourceKeyType } from '@bunizao/contracts';
import { Ban, Copy, MessagesSquare, MoreHorizontal, Rows3 } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { Menu, MenuCreateHandle, MenuItem, MenuPopup, MenuTrigger } from '@/components/coss/menu';
import { toastManager } from '@/components/coss/toast';
import { cn } from '@/lib/utils';
import { HEAD, ROW, SMALL } from '../activity/table';
import { Link, navigate } from '../app/router';
import { formatCount, formatShare } from './format';
import { StatusDot, TOUCH_MENU, commentsHref, type Tone } from './ui';

/* A ranked table: one line per group, the bar drawn behind the label
   (Vercel-analytics style) so it costs no column, and the held share of
   that bar tinted. Numeric columns size to their content through subgrid,
   so the label keeps every pixel left; below 28rem of container width the
   numbers drop to a second line instead of squeezing the label. Labels wrap,
   never truncate, so there is no hidden text to recover. */

export interface InsightRowModel {
  id: string;
  label: string;
  /** Secondary text after the label, e.g. an ASN or a note. */
  sub?: string | null;
  /** Set for ids, hashes and IPs; words and domains stay sans. */
  mono?: boolean;
  subMono?: boolean;
  /** The comments this row stands for, when a key names them. */
  pivot?: { type: AdminSourceKeyType; value: string } | null;
  ban?: AdminBanKeyType | null;
  count: number;
  held?: number | null;
  heldRate?: number | null;
  sessions?: number | null;
  flag?: { tone: Tone; text: string } | null;
}

export interface InsightTableProps {
  rows: InsightRowModel[];
  labelHead: string;
  countHead: string;
  /** Show the held-rate column (comment tables; reactions are never held). */
  held?: boolean;
  sessions?: boolean;
  empty?: string;
  limit?: number;
  onBan?: (row: InsightRowModel) => void;
  /** Where a row's label goes; the matching comments unless a screen has
      a closer place (reactions pivot within reactions). */
  hrefFor?: (pivot: { type: AdminSourceKeyType; value: string }) => string;
}

const defaultHref = (pivot: { type: AdminSourceKeyType; value: string }): string => commentsHref(pivot.type, pivot.value);

// Full class names, so Tailwind can see them.
const TEMPLATES: Record<number, string> = {
  2: 'grid-cols-[minmax(0,1fr)_auto]',
  3: 'grid-cols-[minmax(0,1fr)_auto_auto]',
  4: 'grid-cols-[minmax(0,1fr)_auto_auto_auto]',
  5: 'grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]',
};

export const InsightTable = React.memo(function InsightTable({
  rows,
  labelHead,
  countHead,
  held = false,
  sessions = false,
  empty = 'Nothing in this window.',
  limit = 8,
  onBan,
  hrefFor = defaultHref,
}: InsightTableProps) {
  const [all, setAll] = React.useState(false);
  // One menu per table, opened by every row's trigger: a Base UI menu root
  // per row made each table slow to draw.
  const [menu] = React.useState(() => MenuCreateHandle<InsightRowModel>());
  const shown = all ? rows : rows.slice(0, limit);
  const max = rows.reduce((top, row) => Math.max(top, row.count), 0);
  const actions = rows.some((row) => row.pivot);
  const columns = 2 + (held ? 1 : 0) + (sessions ? 1 : 0) + (actions ? 1 : 0);

  if (rows.length === 0) return <p className="py-3 text-muted-foreground text-sm">{empty}</p>;

  return (
    <div className="@container">
      <div role="table" className={cn('grid text-sm @max-md:grid-cols-[minmax(0,1fr)_auto]', TEMPLATES[columns])}>
        <div role="row" className={cn('col-span-full grid grid-cols-subgrid items-center', HEAD)}>
          <span role="columnheader" className="pe-3">{labelHead}</span>
          <span role="columnheader" className="ps-4 text-end @max-md:hidden">{countHead}</span>
          {held && <span role="columnheader" className="ps-4 text-end @max-md:hidden">Held</span>}
          {sessions && <span role="columnheader" className="ps-4 text-end @max-md:hidden">Sessions</span>}
          {actions && <span role="columnheader" className="w-8 @max-md:hidden"><span className="sr-only">Actions</span></span>}
        </div>
        {shown.map((row) => (
          <Row key={row.id} row={row} max={max} held={held} sessions={sessions} actions={actions} countHead={countHead} menu={menu} hrefFor={hrefFor} />
        ))}
      </div>
      {actions && <RowMenu handle={menu} onBan={onBan} />}
      {rows.length > limit && (
        <Button size="sm" variant="ghost" className={cn(SMALL, 'mt-2 text-muted-foreground')} onClick={() => setAll((value) => !value)}>
          <Rows3 />
          {all ? `Show the top ${limit}` : `Show all ${rows.length}`}
        </Button>
      )}
    </div>
  );
});

type RowMenuHandle = ReturnType<typeof MenuCreateHandle<InsightRowModel>>;

function Row({ row, max, held, sessions, actions, countHead, menu, hrefFor }: {
  row: InsightRowModel;
  max: number;
  held: boolean;
  sessions: boolean;
  actions: boolean;
  countHead: string;
  menu: RowMenuHandle;
  hrefFor: (pivot: { type: AdminSourceKeyType; value: string }) => string;
}) {
  const width = max > 0 ? (row.count / max) * 100 : 0;
  const heldShare = row.heldRate ?? (row.held !== null && row.held !== undefined && row.count > 0 ? row.held / row.count : 0);
  const heldText = held ? formatShare(row.heldRate ?? null) : null;
  const heavy = held && heldShare >= 0.5 && row.count >= 3;

  const label = (
    <>
      <span className={cn('break-words', row.mono && 'font-mono text-[12px] tabular-nums')}>{row.label}</span>
      {row.sub && <span className={cn('ms-1.5 text-muted-foreground', row.subMono ? 'font-mono text-[12px] tabular-nums' : 'text-xs')}>{row.sub}</span>}
    </>
  );

  return (
    <div role="row" className={cn('col-span-full grid grid-cols-subgrid items-center', ROW)}>
      <span role="cell" className="relative min-w-0 py-3 pe-3">
        {/* The bar: volume, with the held part tinted. */}
        <span aria-hidden className="absolute inset-y-2.5 start-0 -ms-1 overflow-hidden rounded-[3px] bg-[hsl(var(--muted)/0.45)] @max-md:top-auto @max-md:bottom-1.5 @max-md:ms-0 @max-md:h-1 @max-md:bg-[hsl(var(--muted))]" style={{ width: `calc(${width}% + 0.25rem)` }}>
          {held && heldShare > 0 && (
            <span className="absolute inset-y-0 start-0 bg-[hsl(var(--portal-danger)/0.28)] @max-md:bg-[hsl(var(--portal-danger)/0.8)]" style={{ width: `${heldShare * 100}%` }} />
          )}
        </span>
        <span className="relative flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {row.pivot ? (
            <Link
              to={hrefFor(row.pivot)}
              title={row.pivot.value}
              className="relative min-w-0 rounded-sm pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:-translate-y-1/2 underline-offset-[3px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {label}
            </Link>
          ) : (
            <span className="min-w-0">{label}</span>
          )}
          {row.flag && <StatusDot tone={row.flag.tone} className="text-xs">{row.flag.text}</StatusDot>}
          {heavy && !row.flag && <StatusDot tone="danger" className="text-xs">Mostly held</StatusDot>}
        </span>
        {/* Narrow containers: the numbers as a sentence under the label. */}
        <span className="relative mt-1 hidden text-muted-foreground text-xs tabular-nums @max-md:block">
          {formatCount(row.count)} {countHead.toLowerCase()}
          {heldText && ` · ${heldText} held`}
          {sessions && row.sessions !== null && row.sessions !== undefined && ` · ${formatCount(row.sessions)} sessions`}
        </span>
      </span>
      <span role="cell" className="ps-4 text-end text-[13px] tabular-nums @max-md:hidden">{formatCount(row.count)}</span>
      {held && <span role="cell" className="ps-4 text-end text-[13px] text-muted-foreground tabular-nums @max-md:hidden">{heldText}</span>}
      {sessions && (
        <span role="cell" className="ps-4 text-end text-[13px] text-muted-foreground tabular-nums @max-md:hidden">
          {row.sessions === null || row.sessions === undefined ? '–' : formatCount(row.sessions)}
        </span>
      )}
      {actions ? (
        <span role="cell" className="flex justify-end ps-1">
          {row.pivot ? (
            <MenuTrigger handle={menu} payload={row} render={<Button size="icon-xs" variant="ghost" aria-label={`More for ${row.label}`} />}>
              <MoreHorizontal />
            </MenuTrigger>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

/** The table's one menu, filled from the row whose trigger opened it. */
function RowMenu({ handle, onBan }: { handle: RowMenuHandle; onBan?: (row: InsightRowModel) => void }) {
  return (
    <Menu handle={handle}>
      {({ payload: row }) => row?.pivot && <RowMenuPopup row={row} pivot={row.pivot} onBan={onBan} />}
    </Menu>
  );
}

function RowMenuPopup({ row, pivot, onBan }: {
  row: InsightRowModel;
  pivot: NonNullable<InsightRowModel['pivot']>;
  onBan?: (row: InsightRowModel) => void;
}) {
  return (
    <MenuPopup align="end" className={TOUCH_MENU}>
      <MenuItem onClick={() => navigate(commentsHref(pivot.type, pivot.value))}>
        <MessagesSquare />
        Comments sharing it
      </MenuItem>
      <MenuItem
        onClick={() => {
          void navigator.clipboard?.writeText(pivot.value);
          toastManager.add({ title: 'Copied', description: pivot.value, timeout: 2000 });
        }}
      >
        <Copy />
        Copy the full value
      </MenuItem>
      {row.ban && onBan && (
        <MenuItem variant="destructive" onClick={() => onBan(row)}>
          <Ban />
          Ban…
        </MenuItem>
      )}
    </MenuPopup>
  );
}
