import * as React from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import {
  SITE_ANALYTICS_SURFACES,
  type ListeningAnalyticsSummary,
  type NewsletterAnalyticsSummary,
  type SiteAnalyticsReportResult,
} from '@bunizao/contracts/analytics';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { setSearch, useLocation } from '../app/router';
import { apiGet } from '../app/api';
import {
  GUTTER,
  LoadError,
  Section,
  Segmented,
  SkeletonRows,
} from '../activity/table';
import { DEFAULT_RANGE, RANGES, readRange } from './data';
import {
  readReport,
  useSiteReport,
  prefetchSiteReport,
  reportRange,
} from './site-data';
import { formatCount, formatDuration, formatPercent } from './format';
import { OWNER_KEY } from '@/lib/analytics/beacon';

const TABS = [
  ['overview', 'Site'],
  ['pages', 'Pages'],
  ['clicks', 'Clicks'],
  ['sources', 'Sources'],
  ['audience', 'Audience'],
  ['quality', 'Quality'],
  ['log', 'Log'],
  ['listening', 'Listening'],
  ['newsletter', 'Newsletter'],
] as const;
const RANGE_OPTIONS = RANGES.map((value) => ({
  value,
  label: `${value}d`,
  ariaLabel: `Last ${value} days`,
}));
function OwnerToggle() {
  const [excluded, setExcluded] = React.useState(() => {
    try {
      return localStorage.getItem(OWNER_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [error, setError] = React.useState('');
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex min-h-11 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={excluded}
          onChange={(event) => {
            try {
              if (event.target.checked) localStorage.setItem(OWNER_KEY, '1');
              else localStorage.removeItem(OWNER_KEY);
              setExcluded(event.target.checked);
              setError('');
            } catch {
              setError(
                'This browser blocks local storage. The preference could not be saved.',
              );
            }
          }}
        />
        Don’t count this browser
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
type Row = { key: string; cells: React.ReactNode[] };
function ReportTable({ headings, rows }: { headings: string[]; rows: Row[] }) {
  if (!rows.length)
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No recorded data in this range.
      </p>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {headings.map((heading) => (
              <th
                key={heading}
                scope="col"
                className="h-11 whitespace-nowrap px-3 font-medium text-muted-foreground"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="h-12 hover:bg-muted/40">
              {row.cells.map((cell, index) => (
                <td
                  key={headings[index]}
                  className={`max-w-80 px-3 py-2 tabular-nums ${headings[index] === 'Day' ? 'whitespace-nowrap' : 'break-words'}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function pageActivity(surface: string, one: number, two: number): string {
  if (surface === 'home')
    return `${one.toFixed(1)} panels · ${two.toFixed(1)} distinct`;
  if (surface === 'blog_post')
    return `Heading ${one.toFixed(1)} of ${two.toFixed(1)}`;
  if (surface === 'mood_feed')
    return `${one.toFixed(1)} feed pages · ${two.toFixed(1)} days deep`;
  if (surface === 'mood_post')
    return `${one.toFixed(1)} slides · ${two.toFixed(1)} comments`;
  return '—';
}
function reportRows(
  data: SiteAnalyticsReportResult,
  selectVisitor: (visitor: string) => void,
): { headings: string[]; rows: Row[] } {
  if (data.report === 'overview' || data.report === 'pages')
    return {
      headings: [
        'Day',
        'Page',
        'Views',
        'Engaged',
        'Median dwell',
        'Scroll',
        'Reads',
        'Completed',
        'Clicks / view',
        'Average page activity',
      ],
      rows: data.pages.map((row) => ({
        key: JSON.stringify([row.day, row.surface, row.entity]),
        cells: [
          row.day,
          `${row.surface === '*' ? 'Whole site' : row.surface}${row.entity && row.entity !== '*' ? ` / ${row.entity}` : ''}`,
          formatCount(row.views),
          formatPercent(row.views ? row.engaged / row.views : 0),
          formatDuration(row.medianDwellMs),
          formatPercent(row.scrollDepth),
          formatCount(row.reads),
          formatCount(row.completions),
          row.views ? (row.clicks / row.views).toFixed(2) : '0',
          pageActivity(row.surface, row.metric1, row.metric2),
        ],
      })),
    };
  if (data.report === 'clicks')
    return {
      headings: [
        'Day',
        'Surface',
        'Action',
        'Destination',
        'Clicks',
        'Daily visitors',
        'Clicks / view',
        'Median time',
      ],
      rows: data.clicks.map((row) => ({
        key: JSON.stringify([
          row.day,
          row.surface,
          row.entity,
          row.name,
          row.href,
        ]),
        cells: [
          row.day,
          `${row.surface} / ${row.entity}`,
          row.name,
          row.href || '—',
          formatCount(row.clicks),
          formatCount(row.visitors),
          row.clickThrough.toFixed(2),
          row.medianTimeMs === null ? '—' : formatDuration(row.medianTimeMs),
        ],
      })),
    };
  if (data.report === 'sources' || data.report === 'audience')
    return {
      headings: [
        'Day',
        'Dimension',
        'Value',
        'Views',
        'Daily visitors',
        'Engaged',
      ],
      rows: data.dimensions.map((row) => ({
        key: JSON.stringify([row.day, row.surface, row.dim, row.key]),
        cells: [
          row.day,
          row.dim,
          row.key,
          formatCount(row.views),
          formatCount(row.visitors),
          formatPercent(row.views ? row.engaged / row.views : 0),
        ],
      })),
    };
  if (data.report === 'quality')
    return {
      headings: [
        'Day',
        'Surface',
        'Class',
        'Reason',
        'Views',
        'Daily visitors',
      ],
      rows: data.traffic.map((row) => ({
        key: JSON.stringify([row.day, row.surface, row.class, row.reason]),
        cells: [
          row.day,
          row.surface,
          row.class,
          row.reason || 'No self-declaration',
          formatCount(row.views),
          formatCount(row.visitors),
        ],
      })),
    };
  return {
    headings: ['Started', 'Page', 'Class', 'Dwell', 'Visitor', 'Details'],
    rows: data.events.map((row) => ({
      key: row.viewId,
      cells: [
        new Date(row.startedAt).toLocaleString('en-AU', {
          timeZone: 'Australia/Melbourne',
        }),
        row.page.path,
        `${row.class}${row.reason ? ` / ${row.reason}` : ''}`,
        formatDuration(row.progress.dwellMs),
        <button
          key="visitor"
          className="min-h-11 underline underline-offset-4"
          onClick={() => selectVisitor(row.visitorId)}
        >
          {row.visitorId.slice(0, 12)}
        </button>,
        <details key="details">
          <summary className="min-h-11 cursor-pointer content-center">
            View details
          </summary>
          <dl className="py-3 text-xs">
            <dt>IP / place</dt>
            <dd>
              {[row.ip, row.country, row.region, row.city]
                .filter(Boolean)
                .join(' · ') || 'Unknown'}
            </dd>
            <dt>User agent</dt>
            <dd>{row.ua || 'Unknown'}</dd>
            <dt>Network evidence</dt>
            <dd>{row.network || 'Unknown'}</dd>
            <dt>Clicks</dt>
            <dd>
              <ul>
                {row.clicks.map((click) => (
                  <li key={`${click.tMs}:${click.name}`}>
                    {click.name} · {click.href || click.label} ·{' '}
                    {formatDuration(click.tMs)}
                  </li>
                ))}
              </ul>
            </dd>
          </dl>
        </details>,
      ],
    })),
  };
}
function SiteReport({
  data,
  selectVisitor,
  surface,
}: {
  data: SiteAnalyticsReportResult;
  selectVisitor: (visitor: string) => void;
  surface: string;
}) {
  const table = reportRows(data, selectVisitor),
    wholeSite = data.pages.filter((row) => row.surface === (surface || '*'));
  const views = wholeSite.reduce((sum, row) => sum + row.views, 0),
    engaged = wholeSite.reduce((sum, row) => sum + row.engaged, 0);
  const sessions = wholeSite.reduce((sum, row) => sum + row.sessions, 0),
    bounces = wholeSite.reduce((sum, row) => sum + row.bounces, 0);
  return (
    <>
      {data.notices.map((notice) => (
        <p key={notice} role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ))}
      {data.sampled && (
        <p className="text-sm text-muted-foreground">
          WAE sampled this range. Views, visitors and clicks are observed unique
          records. WAE sampled checkpoints, so dwell, scroll and action
          sequences can miss updates. Raw write budgets use sampling weights.
        </p>
      )}
      {data.report === 'overview' && (
        <dl className="grid grid-cols-2 gap-4 py-3 sm:grid-cols-4">
          {[
            ['Engaged views', formatCount(engaged)],
            ['All human views', formatCount(views)],
            [
              data.visitorBasis === 'sum_monthly'
                ? 'Monthly visitor sum'
                : data.visitorBasis === 'sampled_distinct'
                  ? 'Observed sampled visitors'
                  : 'Visitors',
              data.visitors === null
                ? 'Unavailable'
                : formatCount(data.visitors),
            ],
            [
              'Daily-session bounce rate',
              formatPercent(sessions ? bounces / sessions : 0),
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="pt-1 text-xl tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <ReportTable {...table} />
      {data.report === 'quality' && data.rum && (
        <Section
          title="Cloudflare RUM page loads"
          meta="Compare matching surfaces; embed views stay separate"
          headingId="rum"
        >
          <ReportTable
            headings={[
              'Surface',
              'Human views',
              'RUM page loads',
              'Human / RUM',
            ]}
            rows={data.rum.map((row) => {
              const human = data.traffic
                .filter((v) => v.surface === row.surface && v.class === 'human')
                .reduce((sum, v) => sum + v.views, 0);
              return {
                key: row.surface,
                cells: [
                  row.surface,
                  formatCount(human),
                  formatCount(row.loads),
                  row.loads ? (human / row.loads).toFixed(2) : 'Unavailable',
                ],
              };
            })}
          />
        </Section>
      )}
      {data.nextCursor && (
        <button
          className="min-h-11 text-sm underline underline-offset-4"
          onClick={() => setSearch({ cursor: data.nextCursor })}
        >
          Next 50 visits
        </button>
      )}
    </>
  );
}
function Supplement({
  report,
  days,
}: {
  report: 'listening' | 'newsletter';
  days: number;
}) {
  const query = useQuery<
    ListeningAnalyticsSummary | NewsletterAnalyticsSummary
  >({
    queryKey: ['analytics', report, days],
    queryFn: ({ signal }) =>
      report === 'listening'
        ? apiGet<ListeningAnalyticsSummary>(
            'v2/analytics/listening',
            { days },
            signal,
          )
        : apiGet<NewsletterAnalyticsSummary>(
            'analytics/newsletter/summary',
            { days },
            signal,
          ),
    staleTime: 60000,
  });
  if (query.isError)
    return (
      <LoadError
        what={report}
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  if (!query.data) return <SkeletonRows rows={5} widths={['w-1/3', 'w-12']} />;
  if (report === 'listening') {
    const data = query.data as ListeningAnalyticsSummary;
    return (
      <ReportTable
        headings={[
          'Track',
          'Artist',
          'Plays',
          'Listeners',
          'Average listen',
          'Finished',
        ]}
        rows={data.tracks.map((row) => ({
          key: JSON.stringify([row.trackId, row.trackTitle, row.trackArtist]),
          cells: [
            row.trackTitle,
            row.trackArtist || '—',
            formatCount(row.plays),
            formatCount(row.uniqueListeners),
            formatDuration(row.avgListenedMs),
            formatPercent(row.completionRate),
          ],
        }))}
      />
    );
  }
  const data = query.data as NewsletterAnalyticsSummary;
  return (
    <ReportTable
      headings={[
        'Campaign',
        'Sent',
        'Opened',
        'Clicked',
        'Open rate',
        'Click rate',
      ]}
      rows={data.campaigns.map((row) => ({
        key: row.campaignId,
        cells: [
          row.campaignId,
          formatCount(row.sent),
          formatCount(row.opened),
          formatCount(row.clicked),
          formatPercent(row.openRate),
          formatPercent(row.clickRate),
        ],
      }))}
    />
  );
}
export function prefetch(
  client: QueryClient,
  search: URLSearchParams,
): Promise<unknown> {
  return prefetchSiteReport(client, search);
}
export default function AnalyticsScreen() {
  const location = useLocation(),
    report = readReport(location.search),
    days = readRange(location.search),
    surface = location.search.get('surface') || '';
  const range = reportRange(days);
  const supplement = report === 'listening' || report === 'newsletter';
  const query = useSiteReport(location.search, !supplement);
  const selectVisitor = (visitor: string) =>
    setSearch({ report: 'visitor', visitor, cursor: null });
  return (
    <div className="flex h-svh flex-col">
      <ScreenHeader title="Analytics">
        <div className="ms-auto">
          <Segmented
            label="Range"
            value={days}
            options={RANGE_OPTIONS}
            onChange={(next) =>
              setSearch({
                days: next === DEFAULT_RANGE ? null : String(next),
                cursor: null,
                from: null,
                to: null,
              })
            }
          />
        </div>
      </ScreenHeader>
      <nav
        aria-label="Analytics reports"
        className={`flex shrink-0 gap-1 overflow-x-auto py-2 ${GUTTER}`}
      >
        {TABS.map(([value, label]) => (
          <button
            key={value}
            aria-current={
              report === value || (value === 'log' && report === 'visitor')
                ? 'page'
                : undefined
            }
            className={`min-h-11 shrink-0 rounded-md px-3 text-sm ${report === value ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() =>
              setSearch({
                report: value === 'overview' ? null : value,
                cursor: null,
                visitor: null,
              })
            }
          >
            {label}
          </button>
        ))}
      </nav>
      <main className={`min-h-0 flex-1 overflow-y-auto pb-8 ${GUTTER}`}>
        <div className="mx-auto max-w-6xl space-y-4">
          <OwnerToggle />
          {!supplement && (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label>
                Surface{' '}
                <select
                  aria-label="Surface"
                  className="min-h-11 bg-transparent px-2"
                  value={surface}
                  onChange={(event) =>
                    setSearch({
                      surface: event.target.value || null,
                      cursor: null,
                    })
                  }
                >
                  <option value="">Whole site</option>
                  {SITE_ANALYTICS_SURFACES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              {['log', 'visitor'].includes(report) && (
                <label>
                  Class{' '}
                  <select
                    aria-label="Traffic class"
                    className="min-h-11 bg-transparent px-2"
                    value={location.search.get('class') || ''}
                    onChange={(event) =>
                      setSearch({
                        class: event.target.value || null,
                        cursor: null,
                      })
                    }
                  >
                    <option value="">All classes</option>
                    {['human', 'bot', 'owner'].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              )}
              <form
                key={location.search.toString()}
                className="flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const fields = new FormData(event.currentTarget);
                  setSearch({
                    from: String(fields.get('from')),
                    to: String(fields.get('to')),
                    entity: String(fields.get('entity')) || null,
                    cursor: null,
                  });
                }}
              >
                <label>
                  From{' '}
                  <input
                    type="date"
                    name="from"
                    className="min-h-11 bg-transparent px-2"
                    defaultValue={location.search.get('from') || range.from}
                    max={range.to}
                    required
                  />
                </label>
                <label>
                  To{' '}
                  <input
                    type="date"
                    name="to"
                    className="min-h-11 bg-transparent px-2"
                    defaultValue={location.search.get('to') || range.to}
                    max={range.to}
                    required
                  />
                </label>
                <label>
                  Entity{' '}
                  <input
                    name="entity"
                    maxLength={96}
                    className="min-h-11 w-40 bg-transparent px-2"
                    defaultValue={location.search.get('entity') || ''}
                    placeholder="Post or document id"
                  />
                </label>
                <button
                  className="min-h-11 rounded-md bg-muted px-3"
                  type="submit"
                >
                  Apply
                </button>
              </form>
              <span className="text-muted-foreground">
                Melbourne calendar days · embed visitors reported separately
              </span>
            </div>
          )}
          {supplement ? (
            <Supplement report={report} days={days} />
          ) : query.isError ? (
            <LoadError
              what="site analytics"
              error={query.error}
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          ) : query.data ? (
            <SiteReport
              data={query.data}
              selectVisitor={selectVisitor}
              surface={surface}
            />
          ) : (
            <SkeletonRows rows={10} widths={['w-1/3', 'w-12']} />
          )}
        </div>
      </main>
    </div>
  );
}
