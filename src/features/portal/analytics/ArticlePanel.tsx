import * as React from 'react';
import { ArrowLeft, ArrowUpRight, X } from 'lucide-react';
import type { BlogAnalyticsTotals } from '@bunizao/contracts';
import { Button } from '@/components/coss/button';
import { Skeleton } from '@/components/coss/skeleton';
import { cn } from '@/lib/utils';
import { GUTTER, LoadError, Section, SkeletonRows, SMALL, Updating } from '../activity/table';
import { DailyBars, denseDays } from './charts';
import { useArticle } from './data';
import { countryName, platformName, sourceName } from './format';
import { Breakdown, KpiStrip } from './tables';

/* One article, beside the list from 1280px and over it below that. The
   numbers the list already has fill in first; the rest follows. */

const SCROLL_LABELS: Record<string, string> = {
  '0-25%': 'Under a quarter',
  '25-50%': 'A quarter to half',
  '50-75%': 'Half to three quarters',
  '75-90%': 'Most of it',
  '90-100%': 'To the end',
};

const scrollLabel = (key: string): string => SCROLL_LABELS[key] ?? key;

export function ArticlePanel({
  slug,
  title,
  days,
  seed,
  overlay,
  onClose,
}: {
  slug: string;
  /** The post's title, when the Ghost list has it. */
  title: string | undefined;
  days: number;
  /** The article's row from the summary, shown while the detail loads. */
  seed: BlogAnalyticsTotals | null;
  /** Covering the list (below 1280px) rather than beside it. */
  overlay: boolean;
  onClose: () => void;
}) {
  const article = useArticle(slug, days);
  const data = article.data;
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  // A new article moves focus to its name, so a screen reader hears it and
  // Tab continues inside the panel.
  React.useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [slug]);

  const totals = data?.totals ?? seed;
  const points = React.useMemo(() => (data ? denseDays(data.daily, data.range.days) : null), [data]);
  const scrollRows = React.useMemo(() => data?.scrollBuckets.map((row) => ({ key: row.bucket, views: row.count })), [data]);
  const settled = React.useDeferredValue(true, false);
  const empty = data && data.totals.views === 0;

  return (
    <aside
      aria-label="Article analytics"
      className={cn(
        'flex min-h-0 flex-col bg-background',
        overlay ? 'fixed inset-0 z-40' : 'w-[28rem] shrink-0 border-s',
      )}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close the article (Esc)" className="pointer-coarse:size-11">
          {overlay ? <ArrowLeft aria-hidden /> : <X aria-hidden />}
        </Button>
        <span className="text-[13px] text-muted-foreground">Article</span>
        <Updating active={article.isPlaceholderData || (article.isFetching && !data)} label="Loading" />
        <Button
          size="sm"
          variant="ghost"
          className={cn(SMALL, 'ms-auto')}
          render={<a href={`/blog/${encodeURIComponent(slug)}/`} target="_blank" rel="noreferrer" />}
        >
          Open post
          <span className="sr-only">(opens the public site)</span>
          <ArrowUpRight aria-hidden />
        </Button>
      </div>

      <div className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className={cn('pt-3 font-medium text-[15px] outline-none [overflow-wrap:anywhere]', GUTTER)}
        >
          {title ?? slug}
        </h2>
        <p className={cn('text-muted-foreground text-xs [overflow-wrap:anywhere]', GUTTER)}>
          {title && `${slug} · `}Last {days} days
        </p>

        {(totals || !article.isError) && <KpiStrip totals={totals} />}

        {article.isError && !data ? (
          <LoadError what="this article" error={article.error} onRetry={() => void article.refetch()} retrying={article.isFetching} />
        ) : empty ? (
          <p className={cn('py-3 text-muted-foreground text-sm', GUTTER)}>
            No visits to this article in the last {days} days. Try a longer range above.
          </p>
        ) : (
          <div className="flex flex-col gap-8">
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
            <Section title="How far readers scrolled" headingId="panel-scroll">
              {data ? (
                <Breakdown rows={scrollRows ?? []} label={scrollLabel} sort={false} unit="visits" />
              ) : (
                <SkeletonRows rows={5} widths={['w-1/3', 'w-8']} />
              )}
            </Section>
            {/* Below the first screen: drawn in a background render right
                after the panel appears, so opening costs one screenful. */}
            {settled && (
              <>
                <Section title="Sources" headingId="panel-sources">
                  {data ? <Breakdown rows={data.referrers} label={sourceName} limit={6} /> : <SkeletonRows rows={4} widths={['w-1/3', 'w-8']} />}
                </Section>
                <Section title="Countries" headingId="panel-countries">
                  {data ? <Breakdown rows={data.countries} label={countryName} limit={6} /> : <SkeletonRows rows={4} widths={['w-1/3', 'w-8']} />}
                </Section>
                <Section title="Platforms" headingId="panel-platforms">
                  {data ? <Breakdown rows={data.platforms} label={platformName} limit={6} /> : <SkeletonRows rows={4} widths={['w-1/3', 'w-8']} />}
                </Section>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
