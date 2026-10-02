import * as React from 'react';
import type { AdminBan, AdminBannedReader } from '@bunizao/contracts';
import { Button } from '@/components/coss/button';
import { Kbd } from '@/components/coss/kbd';
import { Skeleton } from '@/components/coss/skeleton';
import { cn } from '@/lib/utils';
import { HEAD, ROW, SMALL, SPACED, TABLE } from '../activity/table';
import { describeError, isMissingRoute } from '../app/api';
import { useHotkeys } from '../app/hotkeys';
import { Link } from '../app/router';
import { stamp } from '../comments/model';
import { useLiftBans } from './data';
import { expiryState, fullTime, plural } from './format';
import { useRestoreReader, useRevokedReaders } from './readers-data';
import { LoadError, StatusDot, TOUCH_TARGET, commentsHref } from './ui';

/* The Bans screen's Readers view: every reader a ban signed out for good,
   newest first, with Restore on each row. Nothing re-revokes a reader on
   its own, so Restore asks once, in the row (R, then Enter). A restored
   row stays in place, marked, until the view is left. An email ban from
   the same act outlives the restore and would still refuse their
   comments, so the row shows it with its own Lift. */

const GRID =
  'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 @2xl:gap-x-6 @2xl:grid-cols-[minmax(8rem,0.8fr)_minmax(0,1.2fr)_6.5rem_minmax(0,1fr)_12rem]';

function rowId(readerId: string): string {
  return `reader-${readerId}`;
}

export function RevokedReaders({ bans }: { bans: readonly AdminBan[] | undefined }) {
  const list = useRevokedReaders();
  const lift = useLiftBans();

  // Restored rows keep their place, and their data, until the view is left.
  const [restored, setRestored] = React.useState<Map<string, AdminBannedReader>>(() => new Map());
  const loaded = list.data;
  const mark = React.useCallback(
    (readerId: string, done: boolean) => {
      setRestored((current) => {
        const next = new Map(current);
        const reader = loaded?.find((entry) => entry.readerId === readerId) ?? current.get(readerId);
        if (done && reader) next.set(readerId, reader);
        else next.delete(readerId);
        return next;
      });
    },
    [loaded],
  );
  const restore = useRestoreReader(mark);

  const rows = React.useMemo(() => {
    if (!loaded) return [];
    const present = new Set(loaded.map((reader) => reader.readerId));
    const gone = [...restored.values()].filter((reader) => !present.has(reader.readerId));
    return [...loaded, ...gone].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [loaded, restored]);

  // Email bans that still refuse a reader, by email hash.
  const emailBans = React.useMemo(() => {
    const byHash = new Map<string, AdminBan>();
    for (const ban of bans ?? []) {
      if (ban.keyType === 'email' && expiryState(ban.expiresAt) !== 'expired') byHash.set(ban.keyValue, ban);
    }
    return byHash;
  }, [bans]);

  const [cursor, setCursor] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);

  const cursorIndex = cursor ? rows.findIndex((reader) => reader.readerId === cursor) : -1;
  const move = (delta: number): void => {
    if (rows.length === 0) return;
    const from = cursorIndex === -1 ? (delta > 0 ? -1 : rows.length) : cursorIndex;
    const next = rows[Math.max(0, Math.min(rows.length - 1, from + delta))];
    setCursor(next.readerId);
    setConfirming(null);
    document.getElementById(rowId(next.readerId))?.scrollIntoView({ block: 'nearest' });
  };

  const confirm = React.useCallback(
    (reader: AdminBannedReader) => {
      setConfirming(null);
      setCursor(reader.readerId);
      void restore(reader);
    },
    [restore],
  );

  useHotkeys({
    j: () => move(1),
    arrowdown: () => move(1),
    k: () => move(-1),
    arrowup: () => move(-1),
    r: () => {
      const reader = cursorIndex >= 0 ? rows[cursorIndex] : null;
      if (reader && !restored.has(reader.readerId)) setConfirming(reader.readerId);
    },
    // Page keys take Enter from a focused button or link (the Bans screen
    // binds Enter too), so it is passed on here; with nothing focused it
    // answers the open question.
    enter: () => {
      const focused = document.activeElement;
      if ((focused instanceof HTMLButtonElement || focused instanceof HTMLAnchorElement) && focused.closest('[data-readers]')) {
        focused.click();
        return;
      }
      const reader = confirming ? rows.find((entry) => entry.readerId === confirming) : null;
      if (reader) confirm(reader);
    },
    escape: () => setConfirming(null),
  });

  if (!loaded) {
    if (!list.isError) return <SkeletonRows />;
    return isMissingRoute(list.error) ? (
      <p role="status" className="px-4 py-6 text-[13px] text-muted-foreground">
        Blocked reader accounts need the updated site-api, which is not deployed yet. Nothing was changed.
      </p>
    ) : (
      <LoadError what="Blocked reader accounts" error={list.error} onRetry={() => void list.refetch()} />
    );
  }

  return (
    <div data-readers>
      <p className="px-4 py-3 text-[13px] text-muted-foreground leading-5">
        Reader accounts a ban blocked. Restore signs one back in on its next visit, and cannot be undone here: only a new
        ban blocks it again. Key bans from the same ban stay, and removed comments come back only through Removals.
      </p>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-muted-foreground">No blocked reader accounts. A ban blocks one when “Ban their reader account too” is on.</p>
      ) : (
        <div role="table" className={TABLE} aria-label="Revoked readers" aria-rowcount={rows.length}>
          <div role="row" className={cn(GRID, HEAD, 'sticky top-0 z-10 hidden items-center bg-background px-3 @2xl:grid')}>
            <span role="columnheader">Reader</span>
            <span role="columnheader">Email</span>
            <span role="columnheader">Revoked</span>
            <span role="columnheader">Still refused by</span>
            <span role="columnheader"><span className="sr-only">Action</span></span>
          </div>
          {rows.map((reader) => (
            <ReaderRow
              key={reader.readerId}
              reader={reader}
              emailBan={emailBans.get(reader.emailHash) ?? null}
              restored={restored.has(reader.readerId)}
              confirming={confirming === reader.readerId}
              active={cursor === reader.readerId}
              onAsk={() => {
                setCursor(reader.readerId);
                setConfirming(reader.readerId);
              }}
              onCancel={() => setConfirming(null)}
              onConfirm={() => confirm(reader)}
              onLiftBan={(ban) => lift([ban])}
            />
          ))}
          <p className="px-3 py-3 text-muted-foreground text-xs">
            {plural(loaded.length, 'blocked reader account')}. {list.isError ? `The list did not refresh. ${describeError(list.error)}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

function ReaderRow({ reader, emailBan, restored, confirming, active, onAsk, onCancel, onConfirm, onLiftBan }: {
  reader: AdminBannedReader;
  emailBan: AdminBan | null;
  restored: boolean;
  confirming: boolean;
  active: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onLiftBan: (ban: AdminBan) => void;
}) {
  const name = reader.displayName ?? 'No name';
  return (
    <div
      role="row"
      id={rowId(reader.readerId)}
      data-active={active || undefined}
      className={cn(GRID, ROW, SPACED, 'items-center px-3 py-2.5 data-active:bg-accent @2xl:py-1')}
    >
      <span role="cell" className="col-start-1 row-start-1 flex min-w-0 items-baseline gap-2">
        <Link
          to={commentsHref('email', reader.emailHash)}
          title="Every comment from this address"
          className={cn(
            TOUCH_TARGET,
            'truncate rounded-sm text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring',
            !reader.displayName && 'text-muted-foreground',
            restored && 'text-muted-foreground',
          )}
        >
          {name}
        </Link>
      </span>
      <span role="cell" className="col-start-1 row-start-2 min-w-0 truncate font-mono text-[12px] text-muted-foreground tabular-nums @2xl:col-start-2 @2xl:row-start-1">
        {reader.email}
      </span>
      <span role="cell" className="hidden font-mono text-[12px] text-muted-foreground tabular-nums @2xl:block" title={fullTime(reader.updatedAt)}>
        <time dateTime={reader.updatedAt}>{stamp(reader.updatedAt)}</time>
      </span>
      <span role="cell" className="col-start-1 row-start-3 flex min-w-0 items-center gap-2 text-xs @2xl:col-start-4 @2xl:row-start-1">
        {emailBan ? (
          <>
            <StatusDot tone="warning" className="text-foreground">Email ban</StatusDot>
            <Button size="sm" variant="ghost" className={cn(SMALL, TOUCH_TARGET)} aria-label={`Lift the email ban on ${name}`} onClick={() => onLiftBan(emailBan)}>
              Lift
            </Button>
          </>
        ) : (
          <span className="text-muted-foreground @max-2xl:hidden">No email ban</span>
        )}
      </span>
      <span role="cell" className="col-start-2 row-span-3 row-start-1 flex items-center justify-end gap-1.5 self-center @2xl:col-[-2/-1] @2xl:row-span-1">
        {restored ? (
          <StatusDot tone="neutral" className="text-[13px]">Restored</StatusDot>
        ) : confirming ? (
          <>
            <Button size="sm" variant="ghost" className={SMALL} onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" autoFocus className={SMALL} aria-label={`Confirm: restore ${name}`} onClick={onConfirm}>
              Restore
              <Kbd className="pointer-coarse:hidden">↵</Kbd>
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" className={SMALL} aria-keyshortcuts="R" onClick={onAsk}>
            Restore…
          </Button>
        )}
      </span>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div aria-busy="true" aria-label="Loading revoked readers" className={TABLE}>
      <div className="h-[65px]" />
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className={cn(GRID, ROW, SPACED, 'items-center px-3 py-2.5 @2xl:py-1')}>
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="col-start-1 row-start-2 h-3 w-48 max-w-full @2xl:col-start-2 @2xl:row-start-1" />
          <Skeleton className="hidden h-3 w-20 @2xl:block" />
          <Skeleton className="hidden h-3 w-24 @2xl:block" />
          <Skeleton className="col-start-2 row-span-3 row-start-1 h-8 w-20 justify-self-end @2xl:col-[-2/-1] @2xl:row-span-1" />
        </div>
      ))}
    </div>
  );
}
