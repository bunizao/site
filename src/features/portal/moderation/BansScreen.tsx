import * as React from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { AdminBan, AdminBanKeyType, AdminBanOperation } from '@bunizao/contracts';
import { ArrowDownWideNarrow, History, Plus, Search, ShieldOff } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/coss/alert-dialog';
import { Button } from '@/components/coss/button';
import { useMediaQuery } from '@/components/coss/hooks/use-media-query';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/coss/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/coss/input-group';
import { Kbd } from '@/components/coss/kbd';
import { Menu, MenuGroup, MenuGroupLabel, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/components/coss/menu';
import { Skeleton } from '@/components/coss/skeleton';
import { toastManager } from '@/components/coss/toast';
import { cn } from '@/lib/utils';
import { HEAD, ROW, SMALL, SPACED, TABLE } from '../activity/table';
import { describeError } from '../app/api';
import { useHotkeys, type HotkeyMap } from '../app/hotkeys';
import { navigate, setSearch, useLocation } from '../app/router';
import { useScrollRestoration } from '../app/scroll';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { undoLast } from '../app/undo';
import { ManualBanDialog } from './ManualBanDialog';
import { prefetchRevokedReaders, useRevokedReaders } from './readers-data';
import { RevokedReaders } from './RevokedReaders';
import {
  isRestorable,
  prefetchBans,
  useAddBan,
  useBanOperations,
  useBans,
  useLiftBans,
  useRestoreOperation,
  type BanDraft,
} from './data';
import {
  BAN_TYPES,
  BAN_TYPE_LABELS,
  ago,
  banId,
  expiryState,
  expiryText,
  formatCount,
  fullTime,
  keyText,
  plural,
  shortDate,
} from './format';
import { KeyLink, LoadError, StateTabs, StatusDot, TOUCH_MENU, TOUCH_TARGET, commentsHref, matchesWords, useSearchText } from './ui';

/* The ban list, flat: one line per ban, Lift on every row, undo in the
   toast and in place of the row. Everything is filtered in the browser from
   one request (site-api returns at most 500 rows), so search answers each
   keystroke. A lifted row stays where it was, struck through, until you
   switch view, so nothing below it moves under your pointer. */

type View = 'active' | 'expired' | 'history' | 'readers';
type Sort = 'newest' | 'hits' | 'expiring';

const VIEWS: View[] = ['active', 'expired', 'history', 'readers'];
const SORTS: Array<{ value: Sort; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'hits', label: 'Most hits' },
  { value: 'expiring', label: 'Ending soonest' },
];
const SOURCE_LABELS: Record<AdminBan['source'], string> = { portal: 'Portal', telegram: 'Telegram', script: 'Script' };

/* Stacked below 42rem of list width; a table above it, gaining the Added
   and Source columns at 64rem. The meta group is its own flex line when
   stacked and dissolves into table cells (`contents`) when wide. */
const ROW_GRID =
  'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 @2xl:gap-x-6 @2xl:grid-cols-[minmax(10rem,1fr)_minmax(0,1.3fr)_3.5rem_8.5rem_4.75rem] @5xl:grid-cols-[minmax(12rem,1fr)_minmax(0,1.4fr)_3.5rem_4.5rem_8.5rem_4.75rem_4.75rem]';

function readView(search: URLSearchParams): View {
  const view = search.get('view');
  return (VIEWS as string[]).includes(view ?? '') ? (view as View) : 'active';
}

function readSort(search: URLSearchParams): Sort {
  const sort = search.get('sort');
  return SORTS.some((option) => option.value === sort) ? (sort as Sort) : 'newest';
}

function readType(search: URLSearchParams): AdminBanKeyType | null {
  const type = search.get('type');
  return (BAN_TYPES as string[]).includes(type ?? '') ? (type as AdminBanKeyType) : null;
}

function compare(sort: Sort): (a: AdminBan, b: AdminBan) => number {
  if (sort === 'hits') return (a, b) => b.hits - a.hits || b.createdAt.localeCompare(a.createdAt);
  if (sort === 'expiring') {
    return (a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999') || b.createdAt.localeCompare(a.createdAt);
  }
  return (a, b) => b.createdAt.localeCompare(a.createdAt);
}

function haystack(ban: AdminBan): string {
  return `${BAN_TYPE_LABELS[ban.keyType]} ${ban.keyType} ${ban.keyValue} ${keyText(ban.keyType, ban.keyValue)} ${ban.note ?? ''} ${SOURCE_LABELS[ban.source]}`;
}

/** Both ban lists and the blocked readers, whose count is on a tab (see
    app/lazy-screen.ts). */
export function prefetch(client: QueryClient): Promise<unknown> {
  return Promise.all([prefetchBans(client), prefetchRevokedReaders(client)]);
}

export default function BansScreen() {
  const location = useLocation();
  const view = readView(location.search);
  const sort = readSort(location.search);
  const type = readType(location.search);
  const wide = useMediaQuery('(min-width: 1280px)');
  const [query, setQuery] = useSearchText(location.search.get('q') ?? '', (value) => setSearch({ q: value || null }));

  const bans = useBans();
  const operations = useBanOperations();
  const readers = useRevokedReaders();
  const lift = useLiftBans();

  // Lifted rows keep their place until the view changes.
  const [lifted, setLifted] = React.useState<Map<string, { ban: AdminBan; undo: () => void }>>(() => new Map());
  const [liftedView, setLiftedView] = React.useState(view);
  if (liftedView !== view) {
    setLiftedView(view);
    setLifted(new Map());
  }
  const liftedRef = React.useRef(lifted);
  liftedRef.current = lifted;

  const [manual, setManual] = React.useState<{ open: boolean; draft: BanDraft | null }>({ open: false, draft: null });
  const [cursor, setCursor] = React.useState<string | null>(null);

  const all = bans.data;
  const now = Date.now();
  const counts = React.useMemo(() => {
    let expired = 0;
    for (const ban of all ?? []) if (expiryState(ban.expiresAt, now) === 'expired') expired += 1;
    return { active: (all?.length ?? 0) - expired, expired };
    // `now` moves every render; the split only needs to follow the data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all]);

  // While searching, the view tabs count matches, so a ban in the other
  // view shows up as you type instead of hiding behind a tab.
  const filtered = Boolean(query || type);
  const matches = React.useMemo(() => {
    if (!all || !filtered) return null;
    const at = Date.now();
    let active = 0;
    let expired = 0;
    for (const ban of all) {
      if ((type && ban.keyType !== type) || (query && !matchesWords(haystack(ban), query))) continue;
      if (expiryState(ban.expiresAt, at) === 'expired') expired += 1;
      else active += 1;
    }
    return { active, expired };
  }, [all, filtered, type, query]);

  const rows = React.useMemo(() => {
    // The Readers view has rows, and keys, of its own.
    if (!all || view === 'readers') return [];
    const present = new Set(all.map(banId));
    const pool = [...all, ...[...lifted.values()].map((entry) => entry.ban).filter((ban) => !present.has(banId(ban)))];
    const at = Date.now();
    return pool
      .filter((ban) => (expiryState(ban.expiresAt, at) === 'expired') === (view === 'expired'))
      .filter((ban) => (!type || ban.keyType === type) && (!query || matchesWords(haystack(ban), query)))
      .sort(compare(sort));
  }, [all, lifted, view, type, query, sort]);

  const present = React.useMemo(() => new Set((all ?? []).map(banId)), [all]);

  const onLift = React.useCallback(
    (ban: AdminBan) => {
      const undo = lift([ban]);
      setLifted((current) => new Map(current).set(banId(ban), { ban, undo }));
    },
    [lift],
  );
  const onUndo = React.useCallback((id: string) => {
    liftedRef.current.get(id)?.undo();
    setLifted((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);

  const liftAllExpired = (): void => {
    const expired = rows.filter((ban) => present.has(banId(ban)));
    if (expired.length === 0) return;
    const undo = lift(expired);
    setLifted((current) => {
      const next = new Map(current);
      // One undo restores the whole batch; any row's Undo runs it once.
      for (const ban of expired) next.set(banId(ban), { ban, undo });
      return next;
    });
  };

  const openManual = React.useCallback((draft: BanDraft | null = null) => setManual({ open: true, draft }), []);
  const addBan = useAddBan(React.useCallback((draft: BanDraft) => openManual(draft), [openManual]));
  const existing = React.useCallback(
    (kind: AdminBanKeyType, value: string) => all?.find((ban) => ban.keyType === kind && ban.keyValue === value),
    [all],
  );
  const viewRef = React.useRef(view);
  viewRef.current = view;
  const submitManual = React.useCallback((draft: BanDraft): void => {
    setManual({ open: false, draft: null });
    addBan(draft);
    if (viewRef.current !== 'active') setSearch({ view: null });
    setCursor(`${draft.type}:${draft.value}`);
    requestAnimationFrame(() => document.getElementById(`ban-${draft.type}:${draft.value}`)?.scrollIntoView({ block: 'nearest' }));
  }, [addBan]);
  const onManualOpenChange = React.useCallback((open: boolean) => setManual((current) => ({ ...current, open })), []);
  const openNew = React.useCallback(() => openManual(), [openManual]);

  const scroller = React.useRef<HTMLDivElement>(null);
  useScrollRestoration(scroller, 'bans', view === 'history' ? operations.isSuccess : bans.isSuccess);
  const switchView = (next: View): void => {
    setSearch({ view: next === 'active' ? null : next }, { push: true });
    setCursor(null);
    scroller.current?.scrollTo({ top: 0 });
  };

  const searchRef = React.useRef<HTMLInputElement>(null);
  const cursorIndex = cursor ? rows.findIndex((ban) => banId(ban) === cursor) : -1;
  const move = (delta: number): void => {
    if (rows.length === 0) return;
    const from = cursorIndex === -1 ? (delta > 0 ? -1 : rows.length) : cursorIndex;
    const next = rows[Math.max(0, Math.min(rows.length - 1, from + delta))];
    setCursor(banId(next));
    document.getElementById(`ban-${banId(next)}`)?.scrollIntoView({ block: 'nearest' });
  };
  const atCursor = cursorIndex >= 0 ? rows[cursorIndex] : null;

  // The row keys belong to the Readers list in its view. A bound key is
  // always taken (hotkeys.ts), so they are left out here, not made no-ops.
  const rowKeys: HotkeyMap = view === 'readers' ? {} : {
    j: () => move(1),
    arrowdown: () => move(1),
    k: () => move(-1),
    arrowup: () => move(-1),
    l: () => {
      if (!atCursor) return;
      if (present.has(banId(atCursor))) onLift(atCursor);
    },
    enter: () => atCursor && navigate(commentsHref(atCursor.keyType, atCursor.keyValue)),
    escape: () => {
      if (document.activeElement === searchRef.current) searchRef.current?.blur();
      else setCursor(null);
    },
  };
  useHotkeys({
    '/': () => searchRef.current?.focus(),
    n: () => openManual(),
    z: () => undoLast(),
    ...rowKeys,
    ...Object.fromEntries(VIEWS.map((entry, index) => [String(index + 1), () => switchView(entry)])),
  });

  const restorable = (operations.data ?? []).filter((operation) => isRestorable(operation)).length;

  const tabs = (
    <StateTabs
      label="Ban views"
      value={view}
      onChange={switchView}
      options={[
        { value: 'active', label: 'Active', count: all ? (matches ?? counts).active : null },
        { value: 'expired', label: 'Expired', count: all ? (matches ?? counts).expired : null },
        { value: 'history', label: 'Removals', count: operations.data ? restorable : null },
        { value: 'readers', label: 'Readers', count: readers.data ? readers.data.length : null },
      ]}
    />
  );

  // Search and filters exist for the two ban lists only.
  const tools = (
    <>
      {(view === 'active' || view === 'expired') && (
        <div className={cn('flex min-w-0 flex-1 items-center justify-end gap-2', !wide && 'max-sm:basis-full max-sm:pb-1')}>
          <InputGroup className={cn('h-8 min-w-0 flex-1 pointer-coarse:h-11', wide ? 'max-w-52 min-[1440px]:max-w-64' : 'sm:max-w-72')}>
            <InputGroupAddon>
              <Search aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              ref={searchRef}
              className="pointer-coarse:*:h-10.5!"
              type="search"
              aria-label="Search bans"
              placeholder="Search value, note, type"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === 'ArrowDown') {
                  event.preventDefault();
                  event.currentTarget.blur();
                  if (rows[0]) setCursor(banId(rows[0]));
                }
              }}
            />
            <InputGroupAddon align="inline-end" className="max-sm:hidden">
              <Kbd>/</Kbd>
            </InputGroupAddon>
          </InputGroup>
          <FilterMenu type={type} sort={sort} bans={all ?? []} />
        </div>
      )}
      {view === 'expired' && counts.expired > 0 && (
        <Button size="sm" variant="outline" className={cn(SMALL, 'max-sm:hidden')} onClick={liftAllExpired}>
          Clear expired
        </Button>
      )}
    </>
  );

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <ScreenHeader title="Bans">
        {wide && (
          <div className="ms-3 flex min-w-0 flex-1 items-center gap-2">
            {tabs}
            {tools}
          </div>
        )}
        <Button size="sm" className={cn(SMALL, 'ms-auto')} onClick={openNew} aria-keyshortcuts="N">
          <Plus />
          Ban a key
          <Kbd className="max-sm:hidden">N</Kbd>
        </Button>
      </ScreenHeader>

      {!wide && (
        <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-1 sm:flex-nowrap sm:px-4">
          {/* Scrolls sideways on the smallest phones; the padding holds the 44px touch areas, so it never scrolls down. */}
          <div className="flex max-w-full overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{tabs}</div>
          {tools}
        </div>
      )}

      <div ref={scroller} className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain" data-slot="bans-scroll">
        {view === 'history' ? (
          <Operations query={operations} />
        ) : view === 'readers' ? (
          <RevokedReaders bans={all} />
        ) : bans.isPending ? (
          <SkeletonRows />
        ) : bans.isError ? (
          <LoadError what="The ban list" error={bans.error} onRetry={() => void bans.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyBans view={view} query={query} type={type} total={all?.length ?? 0} elsewhere={matches ? (view === 'expired' ? matches.active : matches.expired) : 0} onElsewhere={() => switchView(view === 'expired' ? 'active' : 'expired')} onNew={() => openManual()} onClear={() => {
            setQuery('');
            setSearch({ q: null, type: null });
          }} />
        ) : (
          <div role="table" className={TABLE} aria-label={view === 'expired' ? 'Expired bans' : 'Active bans'} aria-rowcount={rows.length}>
            <HeaderRow sort={sort} />
            {rows.map((ban) => {
              const id = banId(ban);
              return (
                <BanRow
                  key={id}
                  ban={ban}
                  lifted={!present.has(id)}
                  active={id === cursor}
                  onLift={onLift}
                  onUndo={onUndo}
                />
              );
            })}
            <p className="px-3 py-3 text-muted-foreground text-xs">
              {query || type ? `${rows.length} of ${view === 'expired' ? counts.expired : counts.active} match.` : `${plural(rows.length, 'ban')}.`}
              {' '}Hits count comments and reactions in the last 90 days.
            </p>
          </div>
        )}
      </div>

      <ManualBanDialog
        open={manual.open}
        initial={manual.draft}
        existing={existing}
        onOpenChange={onManualOpenChange}
        onSubmit={submitManual}
      />
    </div>
  );
}

function FilterMenu({ type, sort, bans }: { type: AdminBanKeyType | null; sort: Sort; bans: AdminBan[] }) {
  const byType = React.useMemo(() => {
    const counts = new Map<AdminBanKeyType, number>();
    for (const ban of bans) counts.set(ban.keyType, (counts.get(ban.keyType) ?? 0) + 1);
    return counts;
  }, [bans]);
  const label = type ? BAN_TYPE_LABELS[type] : 'All keys';
  return (
    <Menu>
      <MenuTrigger render={<Button size="sm" variant="outline" className={cn(SMALL, 'shrink-0', type && 'border-foreground/40')} />}>
        <ArrowDownWideNarrow />
        <span className="max-sm:sr-only">{label}</span>
      </MenuTrigger>
      <MenuPopup align="end" className={cn('min-w-56', TOUCH_MENU)}>
        <MenuGroup>
          <MenuGroupLabel>Key type</MenuGroupLabel>
          <MenuRadioGroup value={type ?? 'all'} onValueChange={(value) => setSearch({ type: value === 'all' ? null : (value as string) })}>
            <MenuRadioItem value="all">All keys</MenuRadioItem>
            {BAN_TYPES.filter((kind) => byType.has(kind) || kind === type).map((kind) => (
              <MenuRadioItem key={kind} value={kind}>
                <span className="flex w-full items-center justify-between gap-4">
                  {BAN_TYPE_LABELS[kind]}
                  <span className="text-muted-foreground text-xs tabular-nums">{byType.get(kind) ?? 0}</span>
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>Order</MenuGroupLabel>
          <MenuRadioGroup value={sort} onValueChange={(value) => setSearch({ sort: value === 'newest' ? null : (value as string) })}>
            {SORTS.map((option) => (
              <MenuRadioItem key={option.value} value={option.value}>{option.label}</MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

function SortHead({ label, value, sort, className }: { label: string; value: Sort; sort: Sort; className?: string }) {
  return (
    <span role="columnheader" aria-sort={sort === value ? 'descending' : 'none'} className={className}>
      <button
        type="button"
        className={cn(TOUCH_TARGET, 'rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:text-foreground', sort === value && 'text-foreground')}
        onClick={() => setSearch({ sort: value === 'newest' || sort === value ? null : value })}
      >
        {label}
        {sort === value && <span aria-hidden> ↓</span>}
      </button>
    </span>
  );
}

function HeaderRow({ sort }: { sort: Sort }) {
  return (
    <div role="row" className={cn(ROW_GRID, HEAD, 'sticky top-0 z-10 hidden items-center bg-background px-3 @2xl:grid')}>
      <span role="columnheader">Key</span>
      <span role="columnheader">Note</span>
      <SortHead label="Hits" value="hits" sort={sort} className="text-end" />
      <SortHead label="Added" value="newest" sort={sort} className="hidden text-end @5xl:block" />
      <SortHead label="Expires" value="expiring" sort={sort} />
      <span role="columnheader" className="hidden @5xl:block">Source</span>
      <span role="columnheader"><span className="sr-only">Action</span></span>
    </div>
  );
}

const BanRow = React.memo(function BanRow({ ban, lifted, active, onLift, onUndo }: {
  ban: AdminBan;
  lifted: boolean;
  active: boolean;
  onLift: (ban: AdminBan) => void;
  onUndo: (id: string) => void;
}) {
  const id = banId(ban);
  const state = expiryState(ban.expiresAt);
  return (
    <div
      role="row"
      id={`ban-${id}`}
      data-active={active || undefined}
      className={cn(ROW_GRID, ROW, SPACED, 'items-center px-3 py-2.5 data-active:bg-accent @2xl:py-1')}
    >
      <span role="cell" className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className={cn('text-muted-foreground text-xs', lifted && 'line-through')}>{BAN_TYPE_LABELS[ban.keyType]}</span>
        {lifted ? (
          <span className="font-mono text-[12px] text-muted-foreground tabular-nums line-through">{keyText(ban.keyType, ban.keyValue)}</span>
        ) : (
          <KeyLink type={ban.keyType} value={ban.keyValue} label={BAN_TYPE_LABELS[ban.keyType]} className="min-w-0 break-words" />
        )}
      </span>

      <span role="cell" className={cn('col-start-1 row-start-2 min-w-0 break-words text-sm @2xl:col-start-2 @2xl:row-start-1', !ban.note && !lifted && 'max-@2xl:hidden')}>
        {lifted ? <StatusDot tone="neutral" className="text-muted-foreground">Lifted. Undo puts it back as it was.</StatusDot> : ban.note}
      </span>

      <span className="col-start-1 row-start-3 flex flex-wrap items-center gap-x-3 text-muted-foreground text-xs @2xl:contents">
        <span role="cell" className="text-[13px] tabular-nums @2xl:text-end" title="Comments and reactions matched in the last 90 days">
          <span className="@2xl:hidden">Hits </span>
          <span className={ban.hits > 0 ? 'text-foreground' : undefined}>{formatCount(ban.hits)}</span>
        </span>
        <span role="cell" className="font-mono text-[12px] tabular-nums @2xl:hidden @5xl:block @5xl:text-end" title={fullTime(ban.createdAt)}>
          <span className="@2xl:hidden">Added </span>
          {ago(ban.createdAt)}
        </span>
        <span role="cell" className="whitespace-nowrap text-xs" title={ban.expiresAt ? fullTime(ban.expiresAt) : 'No end date'}>
          <Expiry ban={ban} state={state} />
        </span>
        <span role="cell" className="text-xs @2xl:hidden @5xl:block">{SOURCE_LABELS[ban.source]}</span>
      </span>

      <span role="cell" className="col-start-2 row-span-3 row-start-1 flex justify-end self-center @2xl:col-[-2/-1] @2xl:row-span-1">
        {lifted ? (
          <Button size="sm" className={SMALL} variant="outline" onClick={() => onUndo(id)}>Undo</Button>
        ) : (
          <Button size="sm" variant="ghost" className={cn(SMALL, 'text-muted-foreground hover:text-foreground')} aria-label={`Lift the ban on ${BAN_TYPE_LABELS[ban.keyType]} ${ban.keyValue}`} onClick={() => onLift(ban)}>
            Lift
          </Button>
        )}
      </span>
    </div>
  );
});

function Expiry({ ban, state }: { ban: AdminBan; state: ReturnType<typeof expiryState> }) {
  if (state === 'never') return <span className="text-foreground">Never</span>;
  const date = <span className="ms-1.5 font-mono text-[12px] text-muted-foreground tabular-nums">{shortDate(ban.expiresAt!)}</span>;
  if (state === 'expired') {
    return <span className="text-muted-foreground">Ended {expiryText(ban.expiresAt)}{date}</span>;
  }
  return (
    <span className="inline-flex items-baseline">
      {state === 'soon' ? (
        <StatusDot tone="warning" className="text-foreground">Ends {expiryText(ban.expiresAt)}</StatusDot>
      ) : (
        <span className="text-foreground">{expiryText(ban.expiresAt)}</span>
      )}
      {date}
    </span>
  );
}

function SkeletonRows() {
  return (
    <div aria-busy="true" aria-label="Loading bans" className={TABLE}>
      <div className={cn('hidden @2xl:block', HEAD)} />
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index} className={cn(ROW_GRID, ROW, SPACED, 'items-center px-3 py-2.5 @2xl:py-1')}>
          <Skeleton className="h-3.5 w-40 max-w-full" />
          <Skeleton className="col-start-1 row-start-2 h-3 w-48 max-w-full @2xl:col-start-2 @2xl:row-start-1" />
          <span className="col-start-1 row-start-3 @2xl:contents">
            <Skeleton className="h-3 w-8 @2xl:ms-auto" />
            <Skeleton className="hidden h-3 w-8 @5xl:ms-auto @5xl:block" />
            <Skeleton className="hidden h-3 w-24 @2xl:block" />
            <Skeleton className="hidden h-3 w-14 @5xl:block" />
          </span>
          <Skeleton className="col-start-2 row-span-3 row-start-1 h-8 w-12 justify-self-end @2xl:col-[-2/-1] @2xl:row-span-1" />
        </div>
      ))}
    </div>
  );
}

function EmptyBans({ view, query, type, total, elsewhere, onElsewhere, onNew, onClear }: {
  view: View;
  query: string;
  type: AdminBanKeyType | null;
  total: number;
  /** Matches in the other view (active or expired). */
  elsewhere: number;
  onElsewhere: () => void;
  onNew: () => void;
  onClear: () => void;
}) {
  if (query || type) {
    const other = view === 'expired' ? 'active' : 'expired';
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyTitle>{query ? `No ${view} ban matches “${query}”` : `No ${view} ${BAN_TYPE_LABELS[type!].toLowerCase()} bans`}</EmptyTitle>
          <EmptyDescription>
            {elsewhere > 0
              ? `${elsewhere === 1 ? 'One' : formatCount(elsewhere)} ${other} ${elsewhere === 1 ? 'ban does' : 'bans do'}.`
              : 'Search looks at the value, the note and the key type. Hashes match on any part.'}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row flex-wrap justify-center gap-2">
          {elsewhere > 0 && <Button size="sm" className={SMALL} onClick={onElsewhere}>Show {other} matches</Button>}
          <Button size="sm" className={SMALL} variant="outline" onClick={onClear}>Clear search and filter</Button>
        </EmptyContent>
      </Empty>
    );
  }
  if (view === 'expired') {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyTitle>No expired bans</EmptyTitle>
          <EmptyDescription>Bans that reach their end date stop matching and wait here until you clear them.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldOff />
        </EmptyMedia>
        <EmptyTitle>No active bans</EmptyTitle>
        <EmptyDescription>
          {total > 0 ? 'Every ban on the list has ended.' : 'Ban a writer from a comment, or add a key here by hand.'}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" className={SMALL} onClick={onNew}>
          <Plus />
          Ban a key
        </Button>
      </EmptyContent>
    </Empty>
  );
}

// ---------------------------------------------------------------------------
// Removals: bans that also removed a source's comments and reactions
// ---------------------------------------------------------------------------

const OP_GRID =
  'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 @2xl:gap-x-6 @2xl:grid-cols-[5.5rem_minmax(0,1.2fr)_minmax(9rem,0.8fr)_minmax(12rem,1fr)_6rem]';

function Operations({ query }: { query: ReturnType<typeof useBanOperations> }) {
  const [confirm, setConfirm] = React.useState<AdminBanOperation | null>(null);

  if (query.isPending) return <SkeletonRows />;
  if (query.isError) return <LoadError what="The removal history" error={query.error} onRetry={() => void query.refetch()} />;
  const operations = query.data;
  if (operations.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History />
          </EmptyMedia>
          <EmptyTitle>No ban has removed anything</EmptyTitle>
          <EmptyDescription>
            When a ban also removes a source’s last 90 days, it is listed here and can be put back for 30 days.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <div role="table" className={TABLE} aria-label="Removals by ban">
        <div role="row" className={cn(OP_GRID, HEAD, 'sticky top-0 z-10 hidden items-center bg-background px-3 @2xl:grid')}>
          <span role="columnheader">When</span>
          <span role="columnheader">Keys</span>
          <span role="columnheader">Removed</span>
          <span role="columnheader">Status</span>
          <span role="columnheader"><span className="sr-only">Action</span></span>
        </div>
        {operations.map((operation) => (
          <OperationRow key={operation.id} operation={operation} onRestore={setConfirm} />
        ))}
        <p className="px-3 py-3 text-muted-foreground text-xs">
          Restoring puts content back; it does not lift the ban. The last 50 removals are kept.
        </p>
      </div>
      <RestoreDialog operation={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

function removedText(counts: { comments: number; reactions: number }): string {
  const parts = [];
  if (counts.comments > 0) parts.push(plural(counts.comments, 'comment'));
  if (counts.reactions > 0) parts.push(plural(counts.reactions, 'reaction'));
  return parts.join(', ') || 'nothing';
}

function OperationRow({ operation, onRestore }: { operation: AdminBanOperation; onRestore: (operation: AdminBanOperation) => void }) {
  const restorable = isRestorable(operation);
  const skipped = operation.skipped.comments + operation.skipped.reactions;
  return (
    <div role="row" className={cn(OP_GRID, ROW, SPACED, 'items-center px-3 py-3')}>
      <span role="cell" className="col-start-1 row-start-1 font-mono text-[12px] tabular-nums" title={fullTime(operation.createdAt)}>
        {shortDate(operation.createdAt)}
        <span className="ms-2 font-sans text-muted-foreground text-xs @2xl:hidden">by {operation.source}</span>
      </span>
      <span role="cell" className="col-start-1 row-start-2 flex min-w-0 flex-col gap-0.5 @2xl:col-start-2 @2xl:row-start-1">
        <span className="flex flex-wrap gap-x-3 gap-y-0.5">
          {operation.keys.map((key) => (
            <span key={`${key.type}:${key.value}`} className="inline-flex items-baseline gap-1.5">
              <span className="text-muted-foreground text-xs">{BAN_TYPE_LABELS[key.type]}</span>
              <KeyLink type={key.type} value={key.value} label={BAN_TYPE_LABELS[key.type]} />
            </span>
          ))}
        </span>
        {operation.note && <span className="break-words text-muted-foreground text-xs">{operation.note}</span>}
      </span>
      <span role="cell" className="col-start-1 row-start-3 text-sm @2xl:col-start-3 @2xl:row-start-1">
        <span className="text-muted-foreground @2xl:hidden">Removed </span>
        {removedText(operation.purged)}
      </span>
      <span role="cell" className="col-start-1 row-start-4 text-xs @2xl:col-start-4 @2xl:row-start-1">
        {operation.restoredAt ? (
          <StatusDot tone="neutral" className="whitespace-normal">
            Restored {shortDate(operation.restoredAt)}: {removedText(operation.restored)} back
            {skipped > 0 && `, ${formatCount(skipped)} skipped as deleted again`}
          </StatusDot>
        ) : restorable ? (
          <StatusDot tone="accent" className="whitespace-normal" >
            Restorable until {shortDate(operation.restorableUntil)} ({expiryText(operation.restorableUntil)})
          </StatusDot>
        ) : (
          <StatusDot tone="neutral" className="whitespace-normal text-muted-foreground">
            Restore window ended {shortDate(operation.restorableUntil)}
          </StatusDot>
        )}
      </span>
      <span role="cell" className="col-start-2 row-span-4 row-start-1 flex justify-end self-center @2xl:col-start-5 @2xl:row-span-1">
        {restorable && (
          <Button size="sm" className={SMALL} variant="outline" onClick={() => onRestore(operation)}>Restore…</Button>
        )}
      </span>
    </div>
  );
}

/* The one confirm on this screen: a restore writes back up to 500 rows in
   one go and has no undo of its own. */
function RestoreDialog({ operation, onClose }: { operation: AdminBanOperation | null; onClose: () => void }) {
  const restore = useRestoreOperation();
  const [shown, setShown] = React.useState(operation);
  if (operation && operation !== shown) setShown(operation);

  const run = (): void => {
    if (!operation) return;
    restore.mutate(operation.id, {
      onSuccess: ({ operation: done }) => {
        const skipped = done.skipped.comments + done.skipped.reactions;
        toastManager.add({
          type: 'success',
          title: `Restored ${removedText(done.restored)}`,
          description: skipped > 0
            ? `${formatCount(skipped)} skipped because they were deleted again since. The ban is still in place.`
            : 'The ban is still in place. Lift it from Active if it was a mistake.',
        });
        onClose();
      },
    });
  };

  return (
    <AlertDialog
      open={Boolean(operation)}
      onOpenChange={(open) => {
        if (!open && !restore.isPending) {
          restore.reset();
          onClose();
        }
      }}
    >
      <AlertDialogPopup className="duration-150 motion-reduce:transition-none">
        {shown && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Restore {removedText(shown.purged)}?</AlertDialogTitle>
              <AlertDialogDescription>
                They go back where they were before the ban on {shortDate(shown.createdAt)}. Anything deleted again
                since then is skipped. The ban itself stays.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {restore.isError && (
              <p role="alert" className="px-6 pb-2 text-sm">
                <StatusDot tone="danger" className="whitespace-normal">{describeError(restore.error)}</StatusDot>
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel variant="ghost" disabled={restore.isPending}>Cancel</AlertDialogCancel>
              <Button loading={restore.isPending} onClick={run}>Restore</Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogPopup>
    </AlertDialog>
  );
}
