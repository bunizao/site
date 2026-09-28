import * as React from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type {
  AdminReactionInsights,
  AdminReactionInsightsWindow,
  AdminReactionRecord,
  AdminSourceKeyType,
} from '@bunizao/contracts';
import { Ban, Filter, MessagesSquare, MoreHorizontal, Search, ShieldBan, X } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/coss/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/coss/input-group';
import { Kbd } from '@/components/coss/kbd';
import { Menu, MenuCreateHandle, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/coss/menu';
import { Skeleton } from '@/components/coss/skeleton';
import { Spinner } from '@/components/coss/spinner';
import { cn } from '@/lib/utils';
import { HEAD, LINE_PX, ROW, SMALL, SPACED, TABLE } from '../activity/table';
import { useHotkeys } from '../app/hotkeys';
import { Link, navigate, setSearch, useLocation } from '../app/router';
import { useSavedScroll, useScrollRestoration } from '../app/scroll';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { undoLast } from '../app/undo';
import { BanDialog, type BanTarget } from '../comments/BanDialog';
import { BarChart } from './charts';
import { prefetchReactions, useAddBan, useReactionInsights, useReactions, type BanDraft, type ReactionFilter } from './data';
import {
  clock,
  countryName,
  dayLabel,
  formatCount,
  fullTime,
  keyText,
  networkName,
  plural,
  sourceKeyLabel,
  subnetName,
} from './format';
import { InsightTable, type InsightRowModel } from './InsightTable';
import {
  KeyLink,
  LoadError,
  TOUCH_MENU,
  TOUCH_TARGET,
  SectionHeading,
  Segmented,
  StateTabs,
  StatusDot,
  commentsHref,
  matchesWords,
  useSearchText,
} from './ui';

/* Who reacted to what, newest first. The feed is the screen; the hourly
   band above it and the sources beside it answer "is this a burst, and
   from where". Every pivot is a URL, so Back undoes it, and while a new
   filter is fetching the rows already loaded are filtered in place, so the
   list never blanks. */

type Target = 'post' | 'comment';
type Pane = 'feed' | 'sources';

const WINDOWS = [
  { value: '48h', label: '48h' },
  { value: '7d', label: '7d' },
] satisfies Array<{ value: AdminReactionInsightsWindow; label: string }>;

const TARGETS = [
  { value: 'all', label: 'All' },
  { value: 'post', label: 'Posts' },
  { value: 'comment', label: 'Comments' },
] satisfies Array<{ value: Target | 'all'; label: string }>;

const PIVOT_KEYS = new Set<string>([
  'session', 'ip', 'ip24', 'fp', 'asn', 'client_fp', 'client_fp_stable', 'storage_id',
]);

function readRange(search: URLSearchParams): AdminReactionInsightsWindow {
  return search.get('window') === '7d' ? '7d' : '48h';
}

function readFilter(search: URLSearchParams): ReactionFilter {
  const target = search.get('target');
  const key = search.get('key');
  const value = search.get('value');
  const pivot = key && value && PIVOT_KEYS.has(key);
  return {
    target: target === 'post' || target === 'comment' ? target : null,
    targetId: search.get('targetId') || null,
    key: pivot ? (key as AdminSourceKeyType) : null,
    value: pivot ? value : null,
  };
}

function actorValue(row: AdminReactionRecord, key: AdminSourceKeyType): string | null {
  const { actor } = row;
  switch (key) {
    case 'session': return actor.keys.session || null;
    case 'ip': return actor.keys.ip;
    case 'ip24': return actor.keys.ip24;
    case 'fp': return actor.keys.fp;
    case 'client_fp': return actor.keys.clientFp;
    case 'client_fp_stable': return actor.keys.clientFpStable;
    case 'storage_id': return actor.keys.storageId;
    case 'asn': return actor.asn === null ? null : String(actor.asn);
    default: return null;
  }
}

/** The server's filter, applied to rows already on screen. */
function matchesFilter(row: AdminReactionRecord, filter: ReactionFilter): boolean {
  if (filter.target && row.targetType !== filter.target) return false;
  if (filter.targetId && row.targetId !== filter.targetId) return false;
  if (filter.key && filter.value) {
    if (filter.key === 'client_fp') return row.actor.keys.clientFp === filter.value || row.actor.keys.clientFpStable === filter.value;
    return actorValue(row, filter.key) === filter.value;
  }
  return true;
}

function fromText(row: AdminReactionRecord): string {
  const { actor } = row;
  const place = [actor.city, actor.country ? countryName(actor.country) : null].filter(Boolean).join(', ');
  return [networkName(actor.asn, actor.asOrg), place].filter(Boolean).join(' · ');
}

function targetText(row: AdminReactionRecord): string {
  const title = row.postTitle ?? 'Untitled post';
  return row.targetType === 'comment' ? `Comment on ${title}` : title;
}

function haystack(row: AdminReactionRecord): string {
  const { actor } = row;
  return [
    row.emoji, targetText(row), row.targetId, fromText(row), actor.asn ? `AS${actor.asn}` : '',
    actor.browser, actor.os, actor.keys.session, actor.keys.ip24, actor.ip,
  ].filter(Boolean).join(' ');
}

function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback((notify: () => void) => {
    const list = matchMedia(query);
    list.addEventListener('change', notify);
    return () => list.removeEventListener('change', notify);
  }, [query]);
  return React.useSyncExternalStore(subscribe, () => matchMedia(query).matches, () => false);
}

function reactionsHref(patch: Record<string, string | null>): string {
  const search = new URLSearchParams(location.search);
  for (const [name, value] of Object.entries(patch)) {
    if (value === null) search.delete(name);
    else search.set(name, value);
  }
  const text = search.toString();
  return `/comments/reactions${text ? `?${text}` : ''}`;
}

const pivotHref = (pivot: { type: AdminSourceKeyType; value: string }): string =>
  reactionsHref({ key: pivot.type, value: pivot.value, targetId: null, target: null, q: null });

/** The feed and the insights window the URL names (see app/lazy-screen.ts). */
export function prefetch(client: QueryClient, search: URLSearchParams): Promise<unknown> {
  return prefetchReactions(client, readFilter(search), readRange(search));
}

export default function ReactionsScreen() {
  const location = useLocation();
  const filter = readFilter(location.search);
  // Stable identity per URL, so the query key and memo below only change
  // when the filter does.
  const filterKey = JSON.stringify(filter);
  const stableFilter = React.useMemo(() => filter, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const range = readRange(location.search);
  const pane: Pane = location.search.get('pane') === 'sources' ? 'sources' : 'feed';
  // From 96rem the sources sit beside the feed and the switch is gone.
  const sourcesBeside = useMediaQuery('(min-width: 96rem)');
  // From 1280px the switch and the feed's tools share the header row.
  const oneRow = useMediaQuery('(min-width: 1280px)');
  const showSources = pane === 'sources' && !sourcesBeside;
  const [query, setQuery] = useSearchText(location.search.get('q') ?? '', (value) => setSearch({ q: value || null }));

  const list = useReactions(stableFilter);
  const insights = useReactionInsights(range);

  const loaded = React.useMemo(() => list.data?.pages.flatMap((page) => page.reactions) ?? [], [list.data]);
  const previewing = list.isPlaceholderData;
  const rows = React.useMemo(() => {
    let result = previewing ? loaded.filter((row) => matchesFilter(row, stableFilter)) : loaded;
    if (query) result = result.filter((row) => matchesWords(haystack(row), query));
    return result;
  }, [loaded, previewing, stableFilter, query]);
  const total = previewing ? null : (list.data?.pages[0]?.total ?? null);

  const [banTarget, setBanTarget] = React.useState<BanTarget | null>(null);
  const addBan = useAddBan(
    React.useCallback((draft: BanDraft) => setBanTarget({ kind: 'source', type: draft.type, value: draft.value, ban: draft.type }), []),
  );
  const banSession = React.useCallback(
    (row: AdminReactionRecord) => {
      if (!row.actor.keys.session) return;
      addBan({ type: 'session', value: row.actor.keys.session, note: `Reaction ${row.emoji} on ${targetText(row)}`, days: 7 });
    },
    [addBan],
  );
  const openBan = React.useCallback((row: AdminReactionRecord) => setBanTarget({ kind: 'actor', actor: row.actor }), []);

  // The first frame draws the rows the viewport can show (a page of
  // reactions is 50, the view fits about 16 at 900px), and the rest follow
  // in a deferred render. A window's height of rows is margin enough: the
  // header, toolbar and summary above the feed take nearly 300px of it.
  // A Back that restores a scroll position draws down to it.
  const savedTop = useSavedScroll('reactions');
  const [firstRows] = React.useState(() => Math.ceil(((savedTop ?? 0) + window.innerHeight) / SHORTEST_ROW_PX));
  const settled = React.useDeferredValue(true, false);
  const drawn = settled ? rows : rows.slice(0, firstRows);
  // One menu for every row: a Base UI menu root per row was most of the
  // cost of drawing the feed.
  const [rowMenu] = React.useState(() => MenuCreateHandle<AdminReactionRecord>());

  const scroller = React.useRef<HTMLDivElement>(null);
  useScrollRestoration(scroller, 'reactions', list.isSuccess);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  // Infinite load: a sentinel near the end asks for the next page. The
  // button under it does the same when the observer cannot run.
  const sentinel = React.useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  React.useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { root: scroller.current, rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, showSources]);

  const cursorIndex = cursor ? rows.findIndex((row) => row.id === cursor) : -1;
  const move = (delta: number): void => {
    if (rows.length === 0) return;
    const from = cursorIndex === -1 ? (delta > 0 ? -1 : rows.length) : cursorIndex;
    const next = rows[Math.max(0, Math.min(rows.length - 1, from + delta))];
    setCursor(next.id);
    document.getElementById(`reaction-${next.id}`)?.scrollIntoView({ block: 'nearest' });
  };
  const atCursor = cursorIndex >= 0 ? rows[cursorIndex] : null;

  useHotkeys({
    '/': () => searchRef.current?.focus(),
    j: () => move(1),
    arrowdown: () => move(1),
    k: () => move(-1),
    arrowup: () => move(-1),
    b: () => atCursor && openBan(atCursor),
    s: () => atCursor?.actor.keys.session && navigate(pivotHref({ type: 'session', value: atCursor.actor.keys.session })),
    z: () => undoLast(),
    '1': () => setSearch({ target: null, targetId: null }),
    '2': () => setSearch({ target: 'post', targetId: null }),
    '3': () => setSearch({ target: 'comment', targetId: null }),
    escape: () => {
      if (document.activeElement === searchRef.current) searchRef.current?.blur();
      else setCursor(null);
    },
  });

  const clearAll = (): void => {
    setQuery('');
    navigate('/comments/reactions');
  };

  const targetTitle = stableFilter.targetId
    ? (loaded.find((row) => row.targetId === stableFilter.targetId) ?? null)
    : null;
  const insightTarget = stableFilter.targetId
    ? insights.data?.targets.find((entry) => entry.targetId === stableFilter.targetId)
    : undefined;


  // Beside the sources there is nothing to switch to: the feed's size stands alone.
  const tabs = sourcesBeside ? (
    <span className="shrink-0 font-medium text-[13px]">
      Feed
      {total !== null && <span className="ms-1.5 text-muted-foreground text-xs tabular-nums">{formatCount(total)}</span>}
    </span>
  ) : (
    <StateTabs
      label="Reaction views"
      value={pane}
      // Keys 1–3 pick All, Posts, Comments.
      numbered={false}
      onChange={(value) => setSearch({ pane: value === 'feed' ? null : value }, { push: true })}
      options={[
        { value: 'feed', label: 'Feed', count: total },
        { value: 'sources', label: 'Sources' },
      ]}
    />
  );

  const updating = previewing || (list.isFetching && !list.isFetchingNextPage && !list.isPending);
  const tools = (
    <>
      <Segmented
        label="Reactions on"
        value={stableFilter.target ?? 'all'}
        options={TARGETS}
        onChange={(value) => setSearch({ target: value === 'all' ? null : value, targetId: null })}
        className={cn('ms-auto', showSources && 'hidden')}
      />
      <InputGroup
        className={cn('h-8 min-w-0 pointer-coarse:h-11 max-sm:mb-1 max-sm:basis-full sm:w-64', showSources && 'hidden')}
      >
        <InputGroupAddon>
          <Search aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          ref={searchRef}
          className="pointer-coarse:*:h-10.5!"
          type="search"
          aria-label="Search loaded reactions"
          placeholder="Search emoji, post, network"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'ArrowDown') {
              event.preventDefault();
              event.currentTarget.blur();
              if (rows[0]) setCursor(rows[0].id);
            }
          }}
        />
        {/* The feed's own fetch shows at the end of the field, so no slot is
            held for it beside the switch: on a phone the switch and the
            target picker share one line only without it. */}
        <InputGroupAddon align="inline-end" aria-live="polite" className={cn(!updating && 'max-sm:hidden')}>
          {updating ? <Spinner className="size-3.5 text-muted-foreground" aria-label="Updating" /> : <Kbd aria-hidden>/</Kbd>}
        </InputGroupAddon>
      </InputGroup>
    </>
  );

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <ScreenHeader title="Reactions">
        {oneRow && (
          <div className="ms-3 flex min-w-0 flex-1 items-center gap-2">
            {tabs}
            {tools}
          </div>
        )}
        <div className="ms-auto flex shrink-0 items-center gap-2">
          <span aria-live="polite" className="inline-flex w-5 justify-center">
            {insights.isPlaceholderData && <Spinner className="size-3.5 text-muted-foreground" aria-label="Loading the summary" />}
          </span>
          <span className="text-muted-foreground text-xs max-sm:sr-only">Summary</span>
          <Segmented
            label="Summary window"
            value={range}
            options={WINDOWS}
            onChange={(value) => setSearch({ window: value === '48h' ? null : value })}
          />
        </div>
      </ScreenHeader>

      {!oneRow && (
        <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-1 sm:px-4">
          {tabs}
          {tools}
        </div>
      )}

      {(stableFilter.key || stableFilter.targetId) && !showSources && (
        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-1.5 text-sm">
          <Filter aria-hidden className="size-3.5 text-muted-foreground" />
          {stableFilter.key && stableFilter.value && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className="text-muted-foreground">From {sourceKeyLabel(stableFilter.key).toLowerCase()}</span>
              <span className="font-mono text-[12px] tabular-nums" title={stableFilter.value}>
                {keyText(stableFilter.key, stableFilter.value)}
              </span>
              <Button size="icon-xs" variant="ghost" aria-label="Remove this filter" onClick={() => setSearch({ key: null, value: null })}>
                <X />
              </Button>
            </span>
          )}
          {stableFilter.targetId && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className="text-muted-foreground">On</span>
              <span className="min-w-0 break-words">
                {targetTitle ? targetText(targetTitle) : insightTarget?.postTitle ?? stableFilter.targetId}
              </span>
              <Button size="icon-xs" variant="ghost" aria-label="Remove this filter" onClick={() => setSearch({ targetId: null })}>
                <X />
              </Button>
            </span>
          )}
          {stableFilter.key && stableFilter.value && (
            <Link
              to={commentsHref(stableFilter.key, stableFilter.value)}
              className={cn(TOUCH_TARGET, 'ms-auto inline-flex items-center gap-1.5 rounded-sm text-muted-foreground text-xs underline underline-offset-[3px] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring')}
            >
              <MessagesSquare aria-hidden className="size-3.5" />
              Their comments
            </Link>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div ref={scroller} className="@container min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          {showSources ? (
            <div className="px-4 pb-6"><Sources query={insights} range={range} /></div>
          ) : (
            <>
              <Summary query={insights} range={range} />
              {list.isPending ? (
                <FeedSkeleton />
              ) : list.isError && !list.data ? (
                <LoadError what="Reactions" error={list.error} onRetry={() => void list.refetch()} />
              ) : rows.length === 0 ? (
                <FeedEmpty
                  filtered={Boolean(stableFilter.key || stableFilter.targetId || stableFilter.target)}
                  query={query}
                  loaded={loaded.length}
                  more={Boolean(hasNextPage)}
                  onClearQuery={() => setQuery('')}
                  onClearAll={clearAll}
                  onMore={() => void fetchNextPage()}
                  pending={previewing}
                />
              ) : (
                <div role="table" className={TABLE} aria-label="Reactions, newest first" aria-busy={previewing || undefined}>
                  <FeedHead />
                  {drawn.map((row) => (
                    <ReactionRow key={row.id} row={row} active={row.id === cursor} menu={rowMenu} />
                  ))}
                </div>
              )}
              {list.data && !previewing && loaded.length > 0 && (
                <div ref={sentinel} className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 text-muted-foreground text-xs">
                  <span>
                    {query
                      ? `Search covers the ${formatCount(loaded.length)} loaded of ${formatCount(total ?? loaded.length)}.`
                      : hasNextPage
                        ? `${formatCount(loaded.length)} of ${formatCount(total ?? 0)} loaded.`
                        : rows.length > 0 ? `All ${formatCount(loaded.length)} loaded.` : null}
                  </span>
                  {hasNextPage && (
                    <Button size="sm" className={SMALL} variant="outline" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                      Load more
                    </Button>
                  )}
                </div>
              )}
              {list.isError && list.data && (
                <LoadError what="The next page" error={list.error} onRetry={() => void fetchNextPage()} />
              )}
            </>
          )}
        </div>
        {/* Only where it shows: hidden, it would still draw four tables. */}
        {sourcesBeside && (
          <aside aria-label="Where reactions come from" className="w-[24rem] shrink-0 overflow-y-auto overscroll-contain border-l px-4 pb-6">
            <Sources query={insights} range={range} />
          </aside>
        )}
      </div>

      <RowMenu handle={rowMenu} onBanSession={banSession} onBan={openBan} />

      <BanDialog target={banTarget} open={banTarget !== null} onOpenChange={(open) => !open && setBanTarget(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary: the hourly band and any post drawing a crowd
// ---------------------------------------------------------------------------

const HOUR = 3_600_000;
const CHART_SERIES = [{ label: 'Reactions', fill: 'bg-[hsl(var(--muted-foreground))]' }];

function hourKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 13);
}

function hourLabel(key: string): string {
  const date = new Date(`${key}:00:00Z`);
  return `${date.toLocaleDateString('en', { month: 'short', day: 'numeric' })} ${String(date.getHours()).padStart(2, '0')}:00`;
}

/** A target with at least 10 reactions averaging 4 or more per subnet.
    Readers rarely share a subnet, so organic targets sit near 1 to 2; a
    run from one rented /24 still shows at 4 after ordinary readers
    dilute it, where 8 needed the run to be nearly all of the target. */
function crowded(insights: AdminReactionInsights) {
  return insights.targets.filter((entry) => entry.reactions >= 10 && entry.reactions / Math.max(1, entry.subnets) >= 4);
}

const Summary = React.memo(function Summary({ query, range }: {
  query: ReturnType<typeof useReactionInsights>;
  range: AdminReactionInsightsWindow;
}) {
  const data = query.data;
  const hours = range === '48h' ? 48 : 168;

  const columns = React.useMemo(() => {
    if (!data) return [];
    const byHour = new Map(data.hourly.map((entry) => [entry.hour, entry]));
    const end = Math.floor(Date.now() / HOUR) * HOUR;
    return Array.from({ length: hours }, (_, index) => {
      const key = hourKey(end - (hours - 1 - index) * HOUR);
      return { key, values: [byHour.get(key)?.reactions ?? 0] };
    });
  }, [data, hours]);

  if (query.isError && !data) {
    return <LoadError className="border-b" what="The hourly summary" error={query.error} onRetry={() => void query.refetch()} />;
  }

  const reactions = data?.hourly.reduce((sum, entry) => sum + entry.reactions, 0) ?? 0;
  const peak = data?.hourly.reduce<(typeof data.hourly)[number] | null>((top, entry) => (!top || entry.reactions > top.reactions ? entry : top), null) ?? null;
  const hot = data ? crowded(data) : [];
  const describe = (index: number): React.ReactNode => {
    const column = columns[index];
    const entry = data?.hourly.find((row) => row.hour === column.key);
    return (
      <>
        <span className="font-mono text-foreground">{hourLabel(column.key)}</span>
        <span>{plural(entry?.reactions ?? 0, 'reaction')}</span>
        {entry && <span>{plural(entry.sessions, 'session')} · {plural(entry.subnets, 'subnet')}</span>}
      </>
    );
  };

  return (
    <section aria-label="Reactions per hour" aria-busy={query.isPlaceholderData || undefined} className="border-border border-b px-4 pt-3 pb-4">
      {data ? (
        <BarChart
          columns={columns}
          series={CHART_SERIES}
          height={48}
          label={`Reactions per hour over the last ${range === '48h' ? '48 hours' : '7 days'}: ${reactions} in total${peak ? `, at most ${peak.reactions} in one hour` : ''}.`}
          summary={
            <>
              <span className="text-foreground">{plural(reactions, 'reaction')}</span>
              <span>in {range === '48h' ? '48 hours' : '7 days'}</span>
              {peak && peak.reactions > 0 && (
                <span>peak {formatCount(peak.reactions)} at <span className="font-mono">{hourLabel(peak.hour)}</span></span>
              )}
            </>
          }
          describe={describe}
          axis={[columns[0] ? dayLabel(columns[0].key.slice(0, 10)) : '', 'now']}
        />
      ) : (
        <div aria-hidden className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-4 w-full opacity-0" />
        </div>
      )}
      {hot.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          {hot.map((entry) => (
            <li key={`${entry.targetType}:${entry.targetId}`} className="flex flex-wrap items-baseline gap-x-2">
              <StatusDot tone="warning">Crowded</StatusDot>
              <Link
                to={reactionsHref({ targetId: entry.targetId, target: entry.targetType, key: null, value: null, q: null })}
                className={cn(TOUCH_TARGET, 'min-w-0 break-words rounded-sm underline-offset-[3px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring')}
              >
                {entry.targetType === 'comment' ? `Comment on ${entry.postTitle ?? 'a post'}` : (entry.postTitle ?? entry.targetId)}
              </Link>
              <span className="text-[13px] text-muted-foreground tabular-nums">
                {plural(entry.reactions, 'reaction')} from {plural(entry.subnets, 'subnet')}, {plural(entry.fps, 'network signature')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

/* Stacked below 48rem of feed width; a log table above it. The meta group
   dissolves into cells (`contents`) when wide, and every cell names its
   own column there, so the order in the source can stay reading order. */
/** A row's ROW height. */
const SHORTEST_ROW_PX = LINE_PX;

/** The keys are where a row came from, not what it is: muted until pointed at. */
const KEY_MUTED = 'text-muted-foreground hover:text-foreground';

const FEED_GRID =
  'grid grid-cols-[1.75rem_minmax(0,1fr)_auto] gap-x-3 @3xl:grid-cols-[6rem_1.75rem_minmax(0,1.3fr)_minmax(0,1fr)_7rem_5.5rem_2rem] @3xl:gap-x-6';

function FeedHead() {
  return (
    <div role="row" className={cn(FEED_GRID, HEAD, 'sticky top-0 z-10 hidden items-center bg-background px-3 @3xl:grid')}>
      <span role="columnheader">Time</span>
      <span role="columnheader"><span className="sr-only">Emoji</span></span>
      <span role="columnheader">On</span>
      <span role="columnheader">From</span>
      <span role="columnheader">Session</span>
      <span role="columnheader">Subnet</span>
      <span role="columnheader"><span className="sr-only">Actions</span></span>
    </div>
  );
}

type RowMenuHandle = ReturnType<typeof MenuCreateHandle<AdminReactionRecord>>;

const ReactionRow = React.memo(function ReactionRow({ row, active, menu }: {
  row: AdminReactionRecord;
  active: boolean;
  menu: RowMenuHandle;
}) {
  const { actor } = row;
  return (
    <div
      role="row"
      id={`reaction-${row.id}`}
      data-active={active || undefined}
      className={cn(FEED_GRID, ROW, SPACED, 'items-center px-3 py-2.5 data-active:bg-accent @3xl:py-1')}
    >
      <span role="cell" className="col-start-1 row-span-2 row-start-1 self-start text-center text-lg leading-7 @3xl:col-start-2 @3xl:row-span-1 @3xl:self-center @3xl:text-base">
        {row.emoji}
      </span>
      <span role="cell" className="col-start-2 row-start-1 min-w-0 break-words text-sm @3xl:col-start-3 @3xl:truncate @3xl:text-[13px]">
        <Link
          to={reactionsHref({ targetId: row.targetId, target: row.targetType, key: null, value: null, q: null })}
          title={row.targetType === 'comment' ? `Only reactions on comment ${row.targetId}` : 'Only reactions on this post'}
          className={cn(TOUCH_TARGET, 'rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring')}
        >
          {row.targetType === 'comment' && <span className="text-muted-foreground">Comment on </span>}
          {row.postTitle ?? 'Untitled post'}
        </Link>
      </span>
      <span className="col-start-2 row-start-2 flex min-w-0 flex-wrap items-baseline gap-x-2 text-muted-foreground text-xs @3xl:contents">
        <span role="cell" className="font-mono text-[12px] tabular-nums @3xl:col-start-1 @3xl:row-start-1" title={fullTime(row.createdAt)}>
          {clock(row.createdAt)}
        </span>
        <span role="cell" className="min-w-0 break-words @3xl:col-start-4 @3xl:row-start-1 @3xl:truncate @3xl:text-[13px]">
          {fromText(row)}
        </span>
        <span role="cell" className="whitespace-nowrap @3xl:col-start-5 @3xl:row-start-1">
          {actor.keys.session ? <KeyLink type="session" value={actor.keys.session} label="Session" className={KEY_MUTED} /> : '–'}
          {actor.sessionNew && <span className="ms-1.5 text-muted-foreground text-xs" title="This reaction started the session">new</span>}
        </span>
        <span role="cell" className="@3xl:col-start-6 @3xl:row-start-1">
          {actor.keys.ip24 ? <KeyLink type="ip24" value={actor.keys.ip24} label="Subnet" className={KEY_MUTED} /> : '–'}
        </span>
      </span>
      <span role="cell" className="col-start-3 row-span-2 row-start-1 flex justify-end @3xl:col-start-7 @3xl:row-span-1">
        <MenuTrigger
          handle={menu}
          payload={row}
          render={<Button size="icon-sm" variant="ghost" aria-label={`Actions for the ${row.emoji} reaction at ${clock(row.createdAt)}`} />}
        >
          <MoreHorizontal />
        </MenuTrigger>
      </span>
    </div>
  );
});

/** The menu every row's trigger opens, filled from the row that opened it. */
function RowMenu({ handle, onBanSession, onBan }: {
  handle: RowMenuHandle;
  onBanSession: (row: AdminReactionRecord) => void;
  onBan: (row: AdminReactionRecord) => void;
}) {
  return (
    <Menu handle={handle}>
      {({ payload: row }) => row && <RowMenuPopup row={row} onBanSession={onBanSession} onBan={onBan} />}
    </Menu>
  );
}

function RowMenuPopup({ row, onBanSession, onBan }: {
  row: AdminReactionRecord;
  onBanSession: (row: AdminReactionRecord) => void;
  onBan: (row: AdminReactionRecord) => void;
}) {
  const { actor } = row;
  const pivots: Array<{ type: AdminSourceKeyType; value: string | null; label: string }> = [
    { type: 'session', value: actor.keys.session || null, label: 'This session' },
    { type: 'ip24', value: actor.keys.ip24, label: 'This subnet' },
    { type: 'asn', value: actor.asn === null ? null : String(actor.asn), label: `This network (${networkName(actor.asn, actor.asOrg)})` },
    { type: 'client_fp', value: actor.keys.clientFp, label: 'This device' },
  ];
  return (
    <MenuPopup align="end" className={cn('min-w-60', TOUCH_MENU)}>
      <MenuGroup>
        <MenuGroupLabel>Reactions from</MenuGroupLabel>
        {pivots.filter((pivot) => pivot.value).map((pivot) => (
          <MenuItem key={pivot.type} onClick={() => navigate(pivotHref({ type: pivot.type, value: pivot.value! }))}>
            <Filter />
            {pivot.label}
          </MenuItem>
        ))}
      </MenuGroup>
      {actor.keys.session && (
        <MenuItem onClick={() => navigate(commentsHref('session', actor.keys.session))}>
          <MessagesSquare />
          Comments from this session
        </MenuItem>
      )}
      <MenuSeparator />
      {actor.keys.session && (
        <MenuItem variant="destructive" onClick={() => onBanSession(row)}>
          <ShieldBan />
          Ban this session for 30 days
        </MenuItem>
      )}
      <MenuItem variant="destructive" onClick={() => onBan(row)}>
        <Ban />
        Ban other keys…
      </MenuItem>
    </MenuPopup>
  );
}

function FeedSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading reactions" className={TABLE}>
      <div className={cn('hidden @3xl:block', HEAD)} />
      {Array.from({ length: 14 }, (_, index) => (
        <div key={index} className={cn(FEED_GRID, ROW, SPACED, 'items-center px-3 py-2.5 @3xl:py-1')}>
          <Skeleton className="col-start-1 row-span-2 row-start-1 size-5 self-start @3xl:col-start-2 @3xl:row-span-1 @3xl:self-center" />
          <Skeleton className="col-start-2 row-start-1 h-3.5 w-48 max-w-full @3xl:col-start-3" />
          <span className="col-start-2 row-start-2 flex gap-2 pt-1 @3xl:contents">
            <Skeleton className="h-3 w-20 @3xl:col-start-1 @3xl:row-start-1" />
            <Skeleton className="h-3 w-32 @3xl:col-start-4 @3xl:row-start-1" />
            <Skeleton className="hidden h-3 w-14 @3xl:col-start-5 @3xl:row-start-1 @3xl:block" />
            <Skeleton className="hidden h-3 w-14 @3xl:col-start-6 @3xl:row-start-1 @3xl:block" />
          </span>
          <span className="col-start-3 row-span-2 row-start-1 size-7 @3xl:col-start-7 @3xl:row-span-1" />
        </div>
      ))}
    </div>
  );
}

function FeedEmpty({ filtered, query, loaded, more, pending, onClearQuery, onClearAll, onMore }: {
  filtered: boolean;
  query: string;
  loaded: number;
  more: boolean;
  pending: boolean;
  onClearQuery: () => void;
  onClearAll: () => void;
  onMore: () => void;
}) {
  if (pending) {
    return <p className="px-4 py-10 text-center text-muted-foreground text-sm">Looking for matching reactions…</p>;
  }
  if (query && loaded > 0) {
    return (
      <Empty className="py-14">
        <EmptyHeader>
          <EmptyTitle>None of the {formatCount(loaded)} loaded reactions match “{query}”</EmptyTitle>
          <EmptyDescription>Search looks at the emoji, the post, the network and place, and the key values.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <Button size="sm" className={SMALL} variant="outline" onClick={onClearQuery}>Clear search</Button>
          {more && <Button size="sm" className={SMALL} variant="ghost" onClick={onMore}>Load more and search again</Button>}
        </EmptyContent>
      </Empty>
    );
  }
  if (filtered) {
    return (
      <Empty className="py-14">
        <EmptyHeader>
          <EmptyTitle>No reactions match this filter</EmptyTitle>
          <EmptyDescription>Reactions are kept for 90 days. The key may only have written comments.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" className={SMALL} variant="outline" onClick={onClearAll}>Show every reaction</Button>
        </EmptyContent>
      </Empty>
    );
  }
  return (
    <Empty className="py-14">
      <EmptyHeader>
        <EmptyTitle>No reactions yet</EmptyTitle>
        <EmptyDescription>When readers react to a post or a comment, each one shows up here with where it came from.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

// ---------------------------------------------------------------------------
// Sources: the same window as the summary, grouped
// ---------------------------------------------------------------------------

const Sources = React.memo(function Sources({ query, range }: {
  query: ReturnType<typeof useReactionInsights>;
  range: AdminReactionInsightsWindow;
}) {
  const data = query.data;
  const tables = React.useMemo(() => (data ? sourceTables(data) : null), [data]);

  if (query.isError && !data) {
    return <LoadError what="Sources" error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (!tables) {
    return (
      <div aria-busy="true" aria-label="Loading sources" className="flex flex-col gap-2 pt-3">
        {Array.from({ length: 4 }, (_, section) => (
          <div key={section} className="flex flex-col gap-2 pb-4">
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-7 w-full" />)}
          </div>
        ))}
      </div>
    );
  }

  const span = range === '48h' ? 'Last 48 hours' : 'Last 7 days';
  return (
    <div aria-busy={query.isPlaceholderData || undefined} className="flex flex-col gap-10 sm:gap-12">
      <section aria-labelledby="sources-networks">
        <SectionHeading id="sources-networks" meta={span}>Networks</SectionHeading>
        <InsightTable rows={tables.networks} labelHead="Network" countHead="Reactions" sessions hrefFor={pivotHref} limit={6} />
      </section>
      <section aria-labelledby="sources-subnets">
        <SectionHeading id="sources-subnets" meta="Busy subnets are the usual sign of stuffing">Subnets</SectionHeading>
        <InsightTable rows={tables.subnets} labelHead="Subnet" countHead="Reactions" sessions hrefFor={pivotHref} limit={6} />
      </section>
      <section aria-labelledby="sources-devices">
        <SectionHeading id="sources-devices">Devices</SectionHeading>
        <InsightTable rows={tables.devices} labelHead="Device" countHead="Reactions" sessions hrefFor={pivotHref} limit={6} />
      </section>
      <section aria-labelledby="sources-countries">
        <SectionHeading id="sources-countries">Countries</SectionHeading>
        <InsightTable rows={tables.countries} labelHead="Country" countHead="Reactions" sessions limit={6} />
      </section>
    </div>
  );
});

function sourceTables(data: AdminReactionInsights): Record<'networks' | 'subnets' | 'devices' | 'countries', InsightRowModel[]> {
  return {
    networks: data.networks.map((row) => ({
      id: `asn:${row.asn ?? 'none'}`,
      label: networkName(row.asn, row.asOrg),
      sub: row.asOrg && row.asn !== null ? `AS${row.asn}` : null,
      subMono: true,
      pivot: row.asn === null ? null : { type: 'asn', value: String(row.asn) },
      ban: 'asn',
      count: row.count,
      sessions: row.sessions,
    })),
    subnets: data.subnets.map((row) => ({
      id: `ip24:${row.ip24 ?? 'none'}`,
      label: subnetName(row.sampleIp),
      mono: true,
      pivot: row.ip24 ? { type: 'ip24', value: row.ip24 } : null,
      ban: 'ip24',
      count: row.count,
      sessions: row.sessions,
      flag: row.count >= 10 && row.sessions <= 2 ? { tone: 'warning', text: 'Few sessions' } : null,
    })),
    devices: data.devices.map((row) => ({
      id: `fp:${row.clientFp ?? 'none'}`,
      label: row.clientFp ? keyText('client_fp', row.clientFp) : 'No fingerprint',
      mono: Boolean(row.clientFp),
      sub: [row.platform, row.screen].filter(Boolean).join(' · ') || null,
      pivot: row.clientFp ? { type: 'client_fp', value: row.clientFp } : null,
      ban: 'client_fp',
      count: row.count,
      sessions: row.sessions,
      flag: row.subnets >= 5 ? { tone: 'warning', text: `On ${row.subnets} subnets` } : null,
    })),
    countries: data.countries.map((row) => ({
      id: `country:${row.country ?? 'none'}`,
      label: countryName(row.country),
      count: row.count,
      sessions: row.sessions,
    })),
  };
}
