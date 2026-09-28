import * as React from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { BlogAnalyticsEventRecord } from '@bunizao/contracts';
import { useMediaQuery } from '@/components/coss/hooks/use-media-query';
import { Skeleton } from '@/components/coss/skeleton';
import { Spinner } from '@/components/coss/spinner';
import { cn } from '@/lib/utils';
import { href, mergeHistoryState, navigate, readHistoryState, setSearch, useLocation } from '../app/router';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { useSavedScroll, useScrollRestoration } from '../app/scroll';
import { GUTTER, LIST, LoadError, ROWS, Section, Segmented, SkeletonRows } from '../activity/table';
import { ArticlePanel } from './ArticlePanel';
import { DailyBars, denseDays } from './charts';
import {
  DEFAULT_RANGE,
  EVENT_CAP,
  RANGES,
  prefetchArticle,
  prefetchLatestVisits,
  prefetchPostTitles,
  prefetchSummary,
  readRange,
  useLatestVisits,
  usePostTitles,
  useSummary,
  type RangeDays,
} from './data';
import { countryName, formatCount, formatDuration, formatPercent, platformName, sourceName } from './format';
import { ArticleHeader, ArticleRow, ArticleSkeleton, Breakdown, KpiStrip, MoreRow, VisitHeader, VisitRow, articleHref, type BreakdownRow } from './tables';

/* /analytics and /analytics/:slug are one screen, so opening an article
   never unmounts the list: its scroll, its "show all" and its data stay
   put, and Back only closes the panel. */

const RANGE_OPTIONS = RANGES.map((days) => ({ value: days, label: `${days}d`, ariaLabel: `Last ${days} days` }));
const TOP_ARTICLES = 10;
const VISITS_SHOWN = 15;
/** History state on an article entry: the list entry it was opened from. */
const RETURN_KEY = 'analyticsReturn';

function slugFromPath(path: string): string | null {
  const match = /^\/analytics\/([^/]+)$/.exec(path);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

const DEVICE_LABELS: Record<string, string> = { mobile: 'Phone', tablet: 'Tablet', desktop: 'Desktop', other: 'Other' };
const deviceLabel = (key: string): string => DEVICE_LABELS[key] ?? 'Unknown';
const trackLabel = (key: string): string => key;
const EMPTY_EVENTS: BlogAnalyticsEventRecord[] = [];

function deviceRows(events: readonly BlogAnalyticsEventRecord[]): BreakdownRow[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = event.deviceType ?? 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, views]) => ({ key, views }));
}

function StatLine({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className={cn('flex flex-wrap gap-x-6 gap-y-1 py-2 text-sm', GUTTER)}>
      {items.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The range the URL names and the latest visits (see app/lazy-screen.ts).
    An open article loads beside the list, so it is not waited for. */
export function prefetch(client: QueryClient, search: URLSearchParams): Promise<unknown> {
  return Promise.all([prefetchSummary(client, readRange(search)), prefetchLatestVisits(client), prefetchPostTitles(client)]);
}

export default function AnalyticsScreen() {
  const location = useLocation();
  const days = readRange(location.search);
  const search = location.search.toString();
  const slug = slugFromPath(location.path);
  const wide = useMediaQuery('min-xl');
  const overlay = Boolean(slug) && !wide;
  const client = useQueryClient();

  const summary = useSummary(days);
  const visits = useLatestVisits();
  const titles = usePostTitles();
  const [allArticles, setAllArticles] = React.useState(false);
  const [visitsShown, setVisitsShown] = React.useState(VISITS_SHOWN);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  /* Sections below the first screen render in a background pass right after
     the screen appears. A Back that restores a scroll position needs them
     in the first frame, or the restore would land short. */
  const savedTop = useSavedScroll('analytics');
  const [restoring] = React.useState(() => savedTop !== null);
  const settled = React.useDeferredValue(true, restoring);
  useScrollRestoration(scrollRef, 'analytics', Boolean(summary.data) && settled);

  const setRange = (next: RangeDays): void =>
    setSearch({ days: next === DEFAULT_RANGE ? null : String(next) });

  const listPath = `/analytics${search ? `?${search}` : ''}`;

  // Stable across renders, so memoised rows skip work when a panel opens.
  const openRef = React.useRef<(next: string) => void>(() => {});
  openRef.current = (next: string) => {
    const target = articleHref(next, search);
    if (slug) {
      // Switching articles replaces the entry, so Back still means "list".
      navigate(target, { replace: true });
      return;
    }
    const from = window.location.pathname + window.location.search;
    navigate(target);
    mergeHistoryState({ [RETURN_KEY]: from });
  };
  const open = React.useCallback((next: string) => openRef.current(next), []);

  const lastSlug = React.useRef<string | null>(null);
  if (slug) lastSlug.current = slug;

  const close = React.useCallback(() => {
    if (readHistoryState()[RETURN_KEY] === href(listPath)) history.back();
    else navigate(listPath, { replace: true });
  }, [listPath]);

  // Back on the row that was open, for keyboard and screen reader users.
  React.useEffect(() => {
    if (slug || !lastSlug.current) return;
    const row = scrollRef.current?.querySelector<HTMLElement>(`[data-slug="${CSS.escape(lastSlug.current)}"]`);
    row?.focus({ preventScroll: true });
    lastSlug.current = null;
  }, [slug]);

  React.useEffect(() => {
    if (!slug) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [slug, close]);

  const intent = React.useCallback((next: string) => prefetchArticle(client, next, days), [client, days]);

  const data = summary.data;
  const articles = data?.articles ?? [];
  const shownArticles = allArticles ? articles : articles.slice(0, TOP_ARTICLES);
  const seed = slug ? (articles.find((row) => row.slug === slug) ?? null) : null;
  const events = visits.data?.events ?? EMPTY_EVENTS;
  const devices = React.useMemo(() => deviceRows(events), [events]);
  // The range the numbers on screen are for: the old one while a new one loads.
  const shownDays = data?.range.days ?? days;
  const points = React.useMemo(() => (data ? denseDays(data.daily, shownDays) : null), [data, shownDays]);
  const pending = summary.isPlaceholderData;

  return (
    <div className="flex h-svh flex-col">
      <ScreenHeader title="Analytics">
        <span className="ms-auto flex items-center gap-2">
          <span className="flex w-4 justify-center" aria-live="polite">
            {pending && <Spinner className="size-3 text-muted-foreground" aria-label="Updating" />}
          </span>
          <Segmented label="Range" value={days} options={RANGE_OPTIONS} onChange={setRange} />
        </span>
      </ScreenHeader>

      <div className="flex min-h-0 flex-1">
        <div
          ref={scrollRef}
          inert={overlay}
          className="@container min-w-0 flex-1 overflow-y-auto overscroll-contain"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 pb-10 sm:gap-12">
            {summary.isError && !data ? (
              <div className="pt-3">
                <LoadError what="analytics" error={summary.error} onRetry={() => void summary.refetch()} retrying={summary.isFetching} />
              </div>
            ) : (
              <>
                <div>
                  <KpiStrip totals={data?.totals ?? null} />
                  {data && data.totals.views >= EVENT_CAP && (
                    <p className={cn('pb-2 text-muted-foreground text-xs', GUTTER)}>
                      Counted from the newest {formatCount(EVENT_CAP)} visits in this range. Pick a shorter range for exact numbers.
                    </p>
                  )}
                  <div className={cn('pt-2', GUTTER)}>
                    {points ? (
                      <DailyBars points={points} />
                    ) : (
                      <div aria-hidden className="flex h-40 flex-col gap-2 py-1">
                        <Skeleton className="h-3 w-40" />
                        <Skeleton className="flex-1" />
                      </div>
                    )}
                  </div>
                </div>

                <Section title="Articles" meta={data ? `${formatCount(articles.length)} read in this range, by views` : null} headingId="articles">
                  <ArticleHeader />
                  {!data ? (
                    <ArticleSkeleton rows={TOP_ARTICLES} />
                  ) : articles.length === 0 ? (
                    <p className={cn('py-3 text-muted-foreground text-sm', GUTTER)}>
                      No article views in the last {days} days. Visits show up here a few seconds after a reader opens a post.
                    </p>
                  ) : (
                    <div className={LIST}>
                      <ul className={ROWS}>
                        {shownArticles.map((article) => (
                          <ArticleRow
                            key={article.slug}
                            article={article}
                            title={titles?.get(article.slug)}
                            search={search}
                            active={article.slug === slug}
                            onOpen={open}
                            onIntent={intent}
                          />
                        ))}
                      </ul>
                      {articles.length > TOP_ARTICLES && (
                        <MoreRow onClick={() => setAllArticles((value) => !value)}>
                          {allArticles ? `Show the top ${TOP_ARTICLES}` : `Show all ${formatCount(articles.length)}`}
                        </MoreRow>
                      )}
                    </div>
                  )}
                </Section>

                {settled && (
                  <div className="grid gap-x-8 gap-y-10 sm:gap-y-12 @3xl:grid-cols-2">
                    <Section title="Sources" headingId="sources">
                      {data ? <Breakdown rows={data.referrers} label={sourceName} /> : <SkeletonRows rows={5} widths={['w-1/3', 'w-8']} />}
                    </Section>
                    <Section title="Countries" headingId="countries">
                      {data ? <Breakdown rows={data.countries} label={countryName} /> : <SkeletonRows rows={5} widths={['w-1/3', 'w-8']} />}
                    </Section>
                    <Section title="Platforms" headingId="platforms">
                      {data ? <Breakdown rows={data.platforms} label={platformName} /> : <SkeletonRows rows={5} widths={['w-1/3', 'w-8']} />}
                    </Section>
                    <Section title="Devices" meta="latest 200 visits, any range" headingId="devices">
                      {visits.isError && !visits.data ? (
                        <LoadError what="devices" error={visits.error} onRetry={() => void visits.refetch()} retrying={visits.isFetching} />
                      ) : visits.data ? (
                        <Breakdown rows={devices} label={deviceLabel} unit="visits" />
                      ) : (
                        <SkeletonRows rows={4} widths={['w-1/3', 'w-8']} />
                      )}
                    </Section>
                  </div>
                )}
              </>
            )}

            {settled && (
              <>
                <Section title="Latest visits" meta="newest first, any range" headingId="visits">
                  <VisitHeader />
                  {visits.isPending ? (
                    <SkeletonRows rows={VISITS_SHOWN} widths={['w-10', 'w-2/5', 'w-16']} />
                  ) : visits.isError && !visits.data ? (
                    <LoadError what="the latest visits" error={visits.error} onRetry={() => void visits.refetch()} retrying={visits.isFetching} />
                  ) : events.length === 0 ? (
                    <p className={cn('py-3 text-muted-foreground text-sm', GUTTER)}>No visits yet.</p>
                  ) : (
                    <div className={LIST}>
                      <ol className={ROWS}>
                        {events.slice(0, visitsShown).map((visit) => (
                          <VisitRow key={visit.eventId} visit={visit} title={titles?.get(visit.slug)} search={search} onOpen={open} onIntent={intent} />
                        ))}
                      </ol>
                      {events.length > visitsShown && <MoreRow onClick={() => setVisitsShown((count) => count + 50)}>Show more</MoreRow>}
                    </div>
                  )}
                </Section>

                {data?.newsletter && (
                  <Section title="Newsletter" meta={`last ${days} days`} headingId="newsletter">
                    <StatLine
                      items={[
                        ['Sent', formatCount(data.newsletter.totals.sent)],
                        ['Opened', `${formatCount(data.newsletter.totals.opened)} (${formatPercent(data.newsletter.totals.openRate)})`],
                        ['Clicked', `${formatCount(data.newsletter.totals.clicked)} (${formatPercent(data.newsletter.totals.clickRate)})`],
                      ]}
                    />
                  </Section>
                )}

                {data?.listening && (
                  <Section title="Listening" meta={`last ${days} days`} headingId="listening">
                    <StatLine
                      items={[
                        ['Plays', formatCount(data.listening.totals.plays)],
                        ['Listeners', formatCount(data.listening.totals.uniqueListeners)],
                        ['Avg listen', formatDuration(data.listening.totals.avgListenedMs)],
                        ['Finished', formatPercent(data.listening.totals.completionRate)],
                      ]}
                    />
                    {data.listening.tracks.length > 0 && (
                      <div className="mt-2">
                        <Breakdown
                          rows={data.listening.tracks.map((track) => ({ key: [track.trackTitle, track.trackArtist].filter(Boolean).join(' · '), views: track.plays }))}
                          label={trackLabel}
                          limit={5}
                          unit="plays"
                        />
                      </div>
                    )}
                  </Section>
                )}
              </>
            )}
          </div>
        </div>

        {/* A permanent slot, so opening appends the panel into an empty box.
            Appended straight after the list, Chrome restyles the whole page
            (every element, not just the panel) on each open. */}
        <div className="contents">
          {slug && (
            <ArticlePanel
              key={overlay ? 'overlay' : 'side'}
              slug={slug}
              title={titles?.get(slug)}
              days={days}
              seed={seed}
              overlay={overlay}
              onClose={close}
            />
          )}
        </div>
      </div>
    </div>
  );
}
