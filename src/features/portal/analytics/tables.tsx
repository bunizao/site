import * as React from 'react';
import type { BlogAnalyticsArticleStats, BlogAnalyticsEventRecord, BlogAnalyticsTotals } from '@bunizao/contracts';
import { Skeleton } from '@/components/coss/skeleton';
import { cn } from '@/lib/utils';
import { href } from '../app/router';
import { absoluteTime } from '../comments/model';
import { BLEED, GUTTER, HEAD, LIST, PRESSABLE, ROW, ROWS, SkeletonRows } from '../activity/table';
import { clockTime, countryName, dayMonth, formatCount, formatDuration, formatPercent, localDayKey, sourceName } from './format';

/* Analytics tables. Each one sits in an `@container`, so it lays out by the
   width it actually gets (beside the article panel, on a phone) rather than
   the window's: full columns when there is room, fewer numeric columns when
   there is less, and two lines per record on a phone. Text that has to be
   cut short opens in full one click away. */

// Counts, durations and shares are numbers, not ids: sans, aligned digits.
const NUM = 'text-end tabular-nums';
/** "Show all" under a list: one more row, pressed like the rows above it. */
export function MoreRow({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex w-full items-center text-muted-foreground text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset', ROW, BLEED, PRESSABLE)}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */

const KPI_LABELS = ['Visitors', 'Views', 'Reads', 'Avg read', 'Completion'] as const;

/* Rows and sections are memoised: opening an article or switching the
   range re-renders the screen, and only what changed should redo work. */

export const KpiStrip = React.memo(function KpiStrip({ totals, className }: { totals: BlogAnalyticsTotals | null; className?: string }) {
  const values: Array<[string, React.ReactNode]> = totals
    ? [
        [formatCount(totals.uniqueVisitors), null],
        [formatCount(totals.views), null],
        [
          formatCount(totals.reads),
          totals.views ? (
            <>
              {formatPercent(totals.reads / totals.views)}
              <span className="hidden @lg:inline"> of views</span>
            </>
          ) : null,
        ],
        [formatDuration(totals.avgReadMs), null],
        [formatPercent(totals.completionRate), null],
      ]
    : [];
  return (
    <dl className={cn('grid grid-cols-2 gap-x-6 gap-y-3 py-3 @sm:grid-cols-3 @3xl:grid-cols-5', GUTTER, className)}>
      {KPI_LABELS.map((label, index) => (
        <div key={label} className="min-w-0">
          <dt className="text-[13px] text-muted-foreground">{label}</dt>
          <dd className="flex h-7 items-baseline gap-2">
            {totals ? (
              <>
                <span className="text-xl tabular-nums">{values[index][0]}</span>
                {values[index][1] && <span className="whitespace-nowrap text-muted-foreground text-xs">{values[index][1]}</span>}
              </>
            ) : (
              <Skeleton className="mt-1.5 h-5 w-16" />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
});

/* ------------------------------------------------------------------ */

export interface BreakdownRow {
  key: string;
  views: number;
}

/** Label, count and share, with a faint bar behind the label for the eye.
    The share is printed, so the bar is never the only way to read it. */
export const Breakdown = React.memo(function Breakdown({
  rows,
  label,
  limit = 8,
  sort = true,
  unit = 'views',
}: {
  rows: readonly BreakdownRow[];
  label: (key: string) => string;
  limit?: number;
  sort?: boolean;
  unit?: string;
}) {
  const [all, setAll] = React.useState(false);
  const total = rows.reduce((sum, row) => sum + row.views, 0);
  const ordered = sort ? [...rows].sort((a, b) => b.views - a.views) : rows;
  const shown = all ? ordered : ordered.slice(0, limit);

  if (rows.length === 0) {
    return <p className={cn('py-2 text-muted-foreground text-sm', GUTTER)}>No {unit} in this range.</p>;
  }

  return (
    <div className={LIST}>
      <ul className={ROWS}>
        {shown.map((row) => {
          const share = total ? row.views / total : 0;
          const text = label(row.key);
          return (
            <li key={row.key} className={cn('flex items-center', ROW, BLEED)}>
              <div className="relative grid flex-1 grid-cols-[minmax(0,1fr)_4rem_3rem] items-center gap-x-3 py-1 text-sm">
                {/* The share across the whole row, behind the text. */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 start-0 rounded-sm bg-[hsl(var(--portal-accent)/0.12)]"
                  style={{ width: `${Math.max(share * 100, 0.5)}%` }}
                />
                <span className="relative min-w-0 truncate ps-1.5" title={text}>{text}</span>
                <span className={cn(NUM, 'relative')}>
                  {formatCount(row.views)}
                  <span className="sr-only"> {unit}</span>
                </span>
                <span className={cn(NUM, 'relative pe-1.5 text-muted-foreground')}>{formatPercent(share)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {ordered.length > limit && (
        <MoreRow onClick={() => setAll((value) => !value)}>{all ? 'Show fewer' : `Show all ${ordered.length}`}</MoreRow>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ */

/* Article · Visitors · Views · Reads · Avg read · Done. From 36rem the
   table keeps Views, Reads and Avg read; from 48rem it has all six. Below
   36rem a record is the title and one line of numbers under it. */
const ARTICLE_GRID =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 @xl:grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)] @3xl:grid-cols-[minmax(0,1fr)_repeat(5,4.5rem)]';

export function ArticleHeader() {
  return (
    <div aria-hidden className={cn(ARTICLE_GRID, GUTTER, HEAD, 'hidden @xl:grid')}>
      <span>Article</span>
      <span className="hidden text-end @3xl:block">Visitors</span>
      <span className="text-end">Views</span>
      <span className="text-end">Reads</span>
      <span className="text-end">Avg read</span>
      <span className="hidden text-end @3xl:block">Completion</span>
    </div>
  );
}

export interface OpenHandlers {
  /** Plain click on a row: open it in place. Modified clicks stay links. */
  onOpen: (slug: string) => void;
  /** Pointer or focus intent: fetch ahead of the click. */
  onIntent: (slug: string) => void;
}

function openOnPlainClick(event: React.MouseEvent<HTMLAnchorElement>, open: () => void): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  open();
}

export function articleHref(slug: string, search: string): string {
  return `/analytics/${encodeURIComponent(slug)}${search ? `?${search}` : ''}`;
}

/** A post by its title, cut to one line; the hover names both the title and
    the slug, and the row opens the article, where the title wraps in full. */
function PostName({ slug, title, className }: { slug: string; title: string | undefined; className?: string }) {
  return (
    <span className={cn('min-w-0 truncate', className)} title={title ? `${title}\n${slug}` : slug}>
      {title ?? slug}
    </span>
  );
}

export const ArticleRow = React.memo(function ArticleRow({
  article,
  title,
  search,
  active,
  onOpen,
  onIntent,
}: { article: BlogAnalyticsArticleStats; title: string | undefined; search: string; active: boolean } & OpenHandlers) {
  const intent = () => onIntent(article.slug);
  return (
    <li>
      <a
        href={href(articleHref(article.slug, search))}
        data-astro-prefetch="false"
        data-slug={article.slug}
        aria-current={active ? 'true' : undefined}
        onClick={(event) => openOnPlainClick(event, () => onOpen(article.slug))}
        onPointerEnter={intent}
        onPointerDown={intent}
        onFocus={intent}
        className={cn(
          ARTICLE_GRID,
          BLEED,
          ROW,
          'gap-y-1 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset @xl:py-0',
          active ? 'bg-accent' : PRESSABLE,
        )}
      >
        <PostName slug={article.slug} title={title} />
        <span className={cn(NUM, 'hidden @3xl:block')}>{formatCount(article.uniqueVisitors)}</span>
        <span className={NUM}>
          {formatCount(article.views)}
          <span className="sr-only @xl:hidden"> views</span>
        </span>
        <span className={cn(NUM, 'hidden @xl:block')}>{formatCount(article.reads)}</span>
        <span className={cn(NUM, 'hidden text-muted-foreground @xl:block')}>{formatDuration(article.avgReadMs)}</span>
        <span className={cn(NUM, 'hidden text-muted-foreground @3xl:block')}>{formatPercent(article.completionRate)}</span>
        <span className="col-span-2 text-muted-foreground text-xs tabular-nums @xl:hidden">
          {formatCount(article.reads)} reads · {formatDuration(article.avgReadMs)} avg · {formatPercent(article.completionRate)} finished
        </span>
      </a>
    </li>
  );
});

export function ArticleSkeleton({ rows }: { rows: number }) {
  return <SkeletonRows rows={rows} widths={['w-2/5', 'w-10']} />;
}

/* ------------------------------------------------------------------ */

/* When · Article · Country · Source · Read · Scroll · IP from 48rem; below
   that, the article and time on one line and the rest under it. */
const VISIT_GRID =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 @3xl:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,8rem)_minmax(0,7rem)_3.5rem_3rem_minmax(0,8.5rem)]';

function when(iso: string): string {
  return localDayKey(iso) === localDayKey(new Date().toISOString()) ? clockTime(iso) : dayMonth(iso);
}

export function VisitHeader() {
  return (
    <div aria-hidden className={cn(VISIT_GRID, GUTTER, HEAD, 'hidden @3xl:grid')}>
      <span>When</span>
      <span>Article</span>
      <span>Country</span>
      <span>Source</span>
      <span className="text-end">Read</span>
      <span className="text-end">Scroll</span>
      <span className="text-end">IP</span>
    </div>
  );
}

export const VisitRow = React.memo(function VisitRow({
  visit,
  title,
  search,
  onOpen,
  onIntent,
}: { visit: BlogAnalyticsEventRecord; title: string | undefined; search: string } & OpenHandlers) {
  const intent = () => onIntent(visit.slug);
  const place = [visit.city, countryName(visit.country)].filter(Boolean).join(', ');
  const scroll = formatPercent(visit.scrollDepth);
  return (
    <li>
      <a
        href={href(articleHref(visit.slug, search))}
        data-astro-prefetch="false"
        onClick={(event) => openOnPlainClick(event, () => onOpen(visit.slug))}
        onPointerEnter={intent}
        onPointerDown={intent}
        onFocus={intent}
        className={cn(
          VISIT_GRID,
          BLEED,
          ROW,
          PRESSABLE,
          'gap-y-1 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset @3xl:py-0',
        )}
      >
        <time
          dateTime={visit.openedAt}
          title={absoluteTime(visit.openedAt)}
          className="order-2 text-end font-mono text-muted-foreground text-xs tabular-nums @3xl:order-none @3xl:text-start"
        >
          {when(visit.openedAt)}
        </time>
        <PostName slug={visit.slug} title={title} className="order-1 @3xl:order-none" />
        <span className="hidden min-w-0 truncate text-muted-foreground @3xl:block" title={place}>{countryName(visit.country)}</span>
        <span className="hidden min-w-0 truncate text-muted-foreground @3xl:block">{sourceName(visit.refSource)}</span>
        <span className={cn(NUM, 'hidden @3xl:block')}>{formatDuration(visit.dwellMs)}</span>
        <span className={cn(NUM, 'hidden text-muted-foreground @3xl:block')}>{scroll}</span>
        <span className={cn(NUM, 'hidden min-w-0 truncate font-mono text-muted-foreground text-xs @3xl:block')} title={visit.ip ?? undefined}>
          {visit.ip ?? '–'}
        </span>
        <span className="order-3 col-span-2 min-w-0 text-muted-foreground text-xs @3xl:hidden">
          {countryName(visit.country)} · {sourceName(visit.refSource)} ·{' '}
          <span className="tabular-nums">
            {formatDuration(visit.dwellMs)} · {scroll}
          </span>
          {visit.ip && <span className="tabular-nums"> · {visit.ip}</span>}
        </span>
      </a>
    </li>
  );
});
