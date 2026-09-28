import * as React from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { Menu, MenuGroup, MenuGroupLabel, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/components/coss/menu';
import { Spinner } from '@/components/coss/spinner';
import type { PortalActivityEvent } from '@/features/admin/server/portal-client';
import { cn } from '@/lib/utils';
import { setSearch, useLocation } from '../app/router';
import { useSavedScroll, useScrollRestoration } from '../app/scroll';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { shortHandle } from '../comments/model';
import { formatCount } from '../analytics/format';
import { ActivityDays, ActivityHeader } from './ActivityLog';
import {
  flattenFeed,
  freshEntries,
  prefetchActivityFeed,
  readActivityFilter,
  useActivityFeed,
  useActivityHead,
  useApplyFresh,
  type ActivityFamily,
  type ActivityFilter,
} from './data';
import { EVENT_LABELS } from './model';
import { Dot, GUTTER, LINE_PX, LoadError, Segmented, SkeletonRows, SMALL } from './table';

const FAMILIES: ReadonlyArray<{ value: ActivityFamily; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'comments', label: 'Comments' },
  { value: 'reactions', label: 'Likes' },
];

const EVENT_GROUPS: ReadonlyArray<{ label: string; events: PortalActivityEvent[] }> = [
  { label: 'Readers', events: ['comment.create', 'comment.edit', 'comment.remove', 'reaction.add', 'reaction.remove'] },
  { label: 'Moderation', events: ['comment.moderate', 'comment.approve', 'comment.hide', 'comment.delete'] },
];

function isFiltered(filter: ActivityFilter): boolean {
  return filter.family !== 'all' || Boolean(filter.event || filter.readerId || filter.targetId || filter.targetType);
}

/** The shortest a log row gets (one 44px line), so a row count from it over-fills. */
const SHORTEST_ROW_PX = LINE_PX;

const CLEAR_ALL = { family: null, event: null, readerId: null, targetId: null, targetType: null };

function EventMenu({ value }: { value: PortalActivityEvent | null }) {
  return (
    <Menu>
      <MenuTrigger render={<Button size="sm" variant="outline" className={SMALL} />}>
        <span className="text-muted-foreground">Event</span>
        <span className="max-w-40 truncate">{value ? EVENT_LABELS[value] : 'Any'}</span>
        <ChevronDown aria-hidden />
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuRadioGroup
          value={value ?? 'any'}
          onValueChange={(next: string) => setSearch({ event: next === 'any' ? null : next, family: null })}
        >
          <MenuRadioItem value="any" className="pointer-coarse:min-h-11">Any event</MenuRadioItem>
          {EVENT_GROUPS.map((group) => (
            <MenuGroup key={group.label}>
              <MenuSeparator />
              <MenuGroupLabel>{group.label}</MenuGroupLabel>
              {group.events.map((event) => (
                <MenuRadioItem key={event} value={event} className="pointer-coarse:min-h-11">
                  {EVENT_LABELS[event]}
                </MenuRadioItem>
              ))}
            </MenuGroup>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

function Chip({ label, value, onClear }: { label: string; value: string; onClear: () => void }) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-md border ps-2.5 text-sm pointer-coarse:h-11">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs tabular-nums">{value}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear the ${label.toLowerCase()} filter`}
        className="flex h-full w-7 items-center justify-center rounded-e-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:bg-accent pointer-coarse:w-11"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}

/** The feed the URL names (see app/lazy-screen.ts). */
export function prefetch(client: QueryClient, search: URLSearchParams): Promise<unknown> {
  return prefetchActivityFeed(client, readActivityFilter(search));
}

export default function ActivityScreen() {
  const location = useLocation();
  const filter = React.useMemo(() => readActivityFilter(location.search), [location.search]);
  const filterKey = JSON.stringify(filter);
  const filtered = isFiltered(filter);

  const feed = useActivityFeed(filter, { live: true });
  const entries = React.useMemo(() => flattenFeed(feed.data), [feed.data]);
  /* The first frame draws the rows that can be on screen and the rest
     follows in a background render, so arriving costs a screenful, not a
     page. A Back that restores a scroll position draws down to it. */
  const savedTop = useSavedScroll('activity');
  const [firstRows] = React.useState(() => Math.ceil(((savedTop ?? 0) + window.innerHeight * 1.25) / SHORTEST_ROW_PX));
  const shown = React.useDeferredValue(entries, entries.slice(0, firstRows));
  const complete = shown.length === entries.length;
  const current = Boolean(feed.data) && !feed.isPlaceholderData;
  const head = useActivityHead(filter, current);
  const fresh = React.useMemo(
    () => (current ? freshEntries(entries, head.data?.entries) : { entries: [], overflow: false }),
    [current, entries, head.data],
  );
  const applyFresh = useApplyFresh(filter);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  useScrollRestoration(scrollRef, 'activity', Boolean(feed.data));

  // A new filter is a new list: start it at the top.
  const lastFilter = React.useRef(filterKey);
  React.useLayoutEffect(() => {
    if (lastFilter.current === filterKey) return;
    lastFilter.current = filterKey;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [filterKey]);

  /* New entries go straight in only when nothing would move under the
     reader: the list is at the top, the pointer is elsewhere and the last
     scroll has settled. Otherwise they wait behind the pill. */
  const pointerOver = React.useRef(false);
  const scrolledAt = React.useRef(0);
  const [, rerender] = React.useReducer((count: number) => count + 1, 0);
  React.useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const onScroll = (): void => {
      scrolledAt.current = Date.now();
      if (element.scrollTop < 4) rerender();
    };
    const enter = (): void => { pointerOver.current = true; };
    const leave = (): void => { pointerOver.current = false; rerender(); };
    element.addEventListener('scroll', onScroll, { passive: true });
    element.addEventListener('pointerenter', enter);
    element.addEventListener('pointerleave', leave);
    return () => {
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('pointerenter', enter);
      element.removeEventListener('pointerleave', leave);
    };
  }, []);

  React.useEffect(() => {
    if (fresh.entries.length === 0) return;
    const element = scrollRef.current;
    const idle = element && element.scrollTop < 4 && !pointerOver.current && Date.now() - scrolledAt.current > 1_500;
    if (idle) applyFresh(fresh);
  });

  const showFresh = (): void => {
    applyFresh(fresh);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  // Load older entries as the end comes into view.
  const { hasNextPage, isFetchingNextPage, fetchNextPage, isError: feedFailed } = feed;
  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || !current || !complete) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage && !feedFailed) void fetchNextPage();
      },
      { root: scrollRef.current, rootMargin: '600px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, feedFailed, current, complete, entries.length]);

  const total = feed.data?.pages[0]?.total ?? null;
  const onReader = React.useCallback((readerId: string) => setSearch({ readerId }), []);

  return (
    <div className="flex h-svh flex-col">
      <ScreenHeader title="Activity">
        <span className="ms-auto flex items-center gap-2 text-muted-foreground text-xs">
          {head.isError ? (
            <>
              <Dot tone="danger" />
              <span>Live updates failed, retrying</span>
            </>
          ) : (
            <>
              <Dot tone={current ? 'ok' : 'neutral'} />
              <span>Live</span>
            </>
          )}
        </span>
      </ScreenHeader>

      <div className={cn('flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b py-2', GUTTER)}>
        <Segmented
          label="Kind"
          value={filter.event ? ('none' as ActivityFamily) : filter.family}
          options={FAMILIES}
          onChange={(family) => setSearch({ family: family === 'all' ? null : family, event: null })}
        />
        <EventMenu value={filter.event} />
        {filter.readerId && <Chip label="Reader" value={shortHandle(filter.readerId)} onClear={() => setSearch({ readerId: null })} />}
        {filter.targetId && (
          <Chip
            label={filter.targetType === 'post' ? 'Post' : 'Comment'}
            value={shortHandle(filter.targetId)}
            onClear={() => setSearch({ targetId: null, targetType: null })}
          />
        )}
        <span className="ms-auto flex items-center gap-2 text-muted-foreground text-xs tabular-nums">
          {feed.isPlaceholderData && <Spinner className="size-3" aria-label="Updating" />}
          {total !== null && `${formatCount(total)} ${total === 1 ? 'entry' : 'entries'}`}
        </span>
      </div>

      <div ref={scrollRef} className="@container relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ActivityHeader sticky />

        {fresh.entries.length > 0 && (
          <div className="pointer-events-none sticky top-10 z-20 flex h-0 justify-center">
            <button
              type="button"
              onClick={showFresh}
              className="pointer-events-auto mt-1 h-8 rounded-full bg-primary px-3.5 font-medium text-primary-foreground text-sm shadow-lg/10 outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-primary/85 pointer-coarse:h-11"
            >
              {fresh.overflow ? `${fresh.entries.length}+` : fresh.entries.length} new
            </button>
          </div>
        )}

        {feed.isPending ? (
          <SkeletonRows rows={16} widths={['w-10', 'w-24', 'w-20', 'w-2/5']} />
        ) : feed.isError && !feed.data ? (
          <LoadError what="the activity log" error={feed.error} onRetry={() => void feed.refetch()} retrying={feed.isFetching} />
        ) : entries.length === 0 ? (
          <div className={cn('flex flex-col items-start gap-3 py-10', GUTTER)}>
            <p className="font-medium text-sm">{filtered ? 'Nothing matches these filters.' : 'No activity yet.'}</p>
            <p className="max-w-md text-muted-foreground text-sm">
              {filtered
                ? 'Try a wider filter, or clear them to see everything.'
                : 'Comments, automatic verdicts, your moderation and likes show up here as they happen.'}
            </p>
            {filtered && (
              <Button size="sm" className={SMALL} variant="outline" onClick={() => setSearch(CLEAR_ALL)}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <ActivityDays entries={shown} onReader={onReader} />
            <div ref={sentinelRef} className={cn('flex min-h-12 items-center gap-3 text-muted-foreground text-sm', GUTTER)}>
              {feed.isFetchNextPageError ? (
                <LoadError
                  className="flex-1 px-0 sm:px-0"
                  what="older entries"
                  error={feed.error}
                  onRetry={() => void feed.fetchNextPage()}
                  retrying={feed.isFetchingNextPage}
                />
              ) : feed.hasNextPage ? (
                <Button size="sm" className={SMALL} variant="ghost" onClick={() => void feed.fetchNextPage()} loading={feed.isFetchingNextPage}>
                  Load older entries
                </Button>
              ) : (
                <span>Start of the log.</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
