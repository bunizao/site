import * as React from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { AdminCommentInsights, AdminCommentInsightsWindow, AdminCommentQuality } from '@bunizao/contracts';
import { Skeleton } from '@/components/coss/skeleton';
import { Spinner } from '@/components/coss/spinner';
import { cn } from '@/lib/utils';
import { HEAD, ROW } from '../activity/table';
import { setSearch, useLocation } from '../app/router';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { BanDialog, type BanTarget } from '../comments/BanDialog';
import { reasonLabel } from '../comments/model';
import { BarChart, Legend, type ChartSeries } from './charts';
import { prefetchCommentInsights, useCommentInsights, useCommentSummary, usePrefetchCommentInsights } from './data';
import {
  BAN_TYPE_LABELS,
  countryName,
  dayLabel,
  formatCount,
  formatShare,
  keyText,
  networkName,
  plural,
  shortDate,
  subnetName,
} from './format';
import { InsightTable, type InsightRowModel } from './InsightTable';
import { Segmented } from './segmented';
import { LoadError, SectionHeading } from './ui';

/* What the comment pipeline did over a window, as flat ranked tables. Every
   row that names a key opens the matching comments in one click; the row
   menu bans it. The window lives in the URL, is fetched on pointer-down,
   and while it loads the previous window stays on screen with a marker. */

const WINDOWS = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
] satisfies Array<{ value: AdminCommentInsightsWindow; label: string }>;

const WINDOW_DAYS: Record<AdminCommentInsightsWindow, number> = { '7d': 7, '30d': 30, '90d': 90 };

function readWindow(search: URLSearchParams): AdminCommentInsightsWindow {
  const value = search.get('window');
  return value === '7d' || value === '90d' ? value : '30d';
}

/** The window the URL names (see app/lazy-screen.ts). */
export function prefetch(client: QueryClient, search: URLSearchParams): Promise<unknown> {
  return prefetchCommentInsights(client, readWindow(search));
}

export default function InsightsScreen() {
  const location = useLocation();
  const range = readWindow(location.search);
  const insights = useCommentInsights(range);
  const prefetch = usePrefetchCommentInsights();
  const [banTarget, setBanTarget] = React.useState<BanTarget | null>(null);
  const onBan = React.useCallback((row: InsightRowModel) => {
    if (!row.pivot || !row.ban) return;
    setBanTarget({ kind: 'source', type: row.pivot.type, value: row.pivot.value, ban: row.ban });
  }, []);

  const data = insights.data;
  // Eighteen tables are too much for the click's frame: the switch paints
  // first and the tables follow in an interruptible render. A new window
  // defers them all; an arrival with data in memory draws the overview and
  // the tables in view, and the rest below the fold a render later.
  const shown = React.useDeferredValue(data);
  const settled = React.useDeferredValue(true, false);
  const pending = insights.isPlaceholderData || shown !== data;

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <ScreenHeader title="Insights">
        <div className="ms-auto flex items-center gap-2">
          <span aria-live="polite" className="inline-flex w-5 justify-center">
            {pending && <Spinner className="size-3.5 text-muted-foreground" aria-label={`Loading ${WINDOW_DAYS[range]} days`} />}
          </span>
          <Segmented
            label="Window"
            value={range}
            options={WINDOWS}
            onIntent={prefetch}
            onChange={(value) => setSearch({ window: value === '30d' ? null : value })}
          />
        </div>
      </ScreenHeader>

      <div className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {insights.isError && !data ? (
          <LoadError what="Insights" error={insights.error} onRetry={() => void insights.refetch()} />
        ) : shown ? (
          <div aria-busy={pending || undefined} className="flex flex-col gap-10 px-4 pb-10 sm:gap-12 @2xl:px-6">
            <Overview data={shown} range={shown.window} />
            <Tables data={shown} onBan={onBan} inView={!settled} />
          </div>
        ) : (
          <InsightsSkeleton />
        )}
      </div>

      <BanDialog target={banTarget} open={banTarget !== null} onOpenChange={(open) => !open && setBanTarget(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview: KPIs and the daily chart
// ---------------------------------------------------------------------------

const STATUS_SERIES: ChartSeries[] = [
  { label: 'Published', fill: 'bg-[hsl(var(--muted-foreground))]' },
  { label: 'Held', fill: 'bg-[hsl(var(--portal-warning))]' },
  { label: 'Rejected', fill: 'bg-[hsl(var(--portal-danger))]' },
  { label: 'Deleted', fill: 'bg-[hsl(var(--foreground)/0.3)]' },
];

type Day = AdminCommentInsights['dailyByStatus'][number];

/** One row per day of the window, oldest first, zeros where nothing came. */
function fillDays(data: AdminCommentInsights, days: number): Day[] {
  const byDay = new Map(data.dailyByStatus.map((row) => [row.day, row]));
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(today - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10);
    return byDay.get(day) ?? { day, published: 0, held: 0, rejected: 0, deleted: 0 };
  });
}

function totals(rows: Day[]) {
  return rows.reduce(
    (sum, row) => ({
      published: sum.published + row.published,
      held: sum.held + row.held,
      rejected: sum.rejected + row.rejected,
      deleted: sum.deleted + row.deleted,
    }),
    { published: 0, held: 0, rejected: 0, deleted: 0 },
  );
}

const all = (sum: ReturnType<typeof totals>): number => sum.published + sum.held + sum.rejected + sum.deleted;

/** The later half of the window against the earlier half, in words. A
    percentage of a handful misleads, so small bases say the count. */
function change(before: number, after: number): string {
  if (before === 0 && after === 0) return 'none in either half';
  const diff = after - before;
  if (diff === 0) return 'same in both halves';
  if (before < 20) return `${formatCount(Math.abs(diff))} ${diff > 0 ? 'more' : 'fewer'} than the first half`;
  const percent = Math.round((diff / before) * 100);
  return `${percent > 0 ? 'up' : 'down'} ${Math.abs(percent)}%`;
}

const Overview = React.memo(function Overview({ data, range }: { data: AdminCommentInsights; range: AdminCommentInsightsWindow }) {
  const days = WINDOW_DAYS[range];
  const rows = React.useMemo(() => fillDays(data, days), [data, days]);
  const half = Math.floor(days / 2);
  const whole = totals(rows);
  const first = totals(rows.slice(days - 2 * half, days - half));
  const second = totals(rows.slice(days - half));
  const total = all(whole);
  const reversals = data.overturns.reduce((sum, row) => sum + row.falsePositives + row.falseNegatives, 0);
  const banHits = data.banHits.reduce((sum, row) => sum + row.hits, 0);

  const kpis: Array<{ label: string; value: string; detail: string }> = [
    { label: 'Comments', value: formatCount(total), detail: change(all(first), all(second)) },
    { label: 'Published', value: formatShare(total ? whole.published / total : null), detail: `${formatCount(whole.published)} · ${change(first.published, second.published)}` },
    { label: 'Held', value: formatShare(total ? whole.held / total : null), detail: `${formatCount(whole.held)} · ${change(first.held, second.held)}` },
    { label: 'Rejected', value: formatCount(whole.rejected), detail: change(first.rejected, second.rejected) },
    { label: 'Reversed by you', value: formatCount(reversals), detail: 'approved after hold, or hidden after publish' },
    { label: 'Ban hits', value: formatCount(banHits), detail: plural(data.banHits.length, 'ban') + ' matched' },
  ];

  const columns = React.useMemo(
    () => rows.map((row) => ({ key: row.day, values: [row.published, row.held, row.rejected, row.deleted] })),
    [rows],
  );
  const busiest = rows.reduce<Day | null>((top, row) => {
    const sum = row.published + row.held + row.rejected + row.deleted;
    return !top || sum > top.published + top.held + top.rejected + top.deleted ? row : top;
  }, null);

  return (
    <section aria-label="Overview" className="flex flex-col gap-4 pt-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 @xl:grid-cols-3 @5xl:grid-cols-6">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[13px] text-muted-foreground">{kpi.label}</dt>
            <dd className="font-medium text-xl tabular-nums">{kpi.value}</dd>
            <dd className="text-muted-foreground text-xs">{kpi.detail}</dd>
          </div>
        ))}
      </dl>
      <p className="-mt-1 text-muted-foreground text-xs">
        Since {shortDate(data.since)}. Changes compare the second half of the window with the first.
      </p>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-medium text-muted-foreground text-sm">Comments per day</h2>
          <Legend series={STATUS_SERIES} />
        </div>
        <BarChart
          columns={columns}
          series={STATUS_SERIES}
          height={96}
          label={`Comments per day over ${days} days: ${total} in total, ${whole.held} held and ${whole.rejected} rejected.`}
          summary={
            <>
              <span className="text-foreground">{plural(total, 'comment')}</span>
              {busiest && all(totals([busiest])) > 0 && (
                <span>busiest {dayLabel(busiest.day)} with {formatCount(all(totals([busiest])))}</span>
              )}
            </>
          }
          describe={(index) => {
            const row = rows[index];
            return (
              <>
                <span className="font-mono text-foreground">{dayLabel(row.day)}</span>
                <span>{formatCount(row.published)} published</span>
                <span>{formatCount(row.held)} held</span>
                <span>{formatCount(row.rejected)} rejected</span>
                <span className="max-sm:hidden">{formatCount(row.deleted)} deleted</span>
              </>
            );
          }}
          axis={[dayLabel(rows[0].day), 'today']}
        />
      </div>
    </section>
  );
});

// ---------------------------------------------------------------------------
// Ranked tables
// ---------------------------------------------------------------------------

const HINT_LABELS: Record<string, string> = {
  no_input_events: 'No input events',
  instant_compose: 'Written instantly',
  instant_tap: 'Tapped instantly',
  webdriver: 'Automated browser (webdriver)',
  headless_ua: 'Headless browser',
  hosting_asn: 'Hosting network',
  timezone_mismatch: 'Timezone differs from the IP',
};

function hintLabel(hint: string): string {
  if (HINT_LABELS[hint]) return HINT_LABELS[hint];
  const text = hint.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const EMAIL_KINDS: Record<AdminCommentInsights['email'][number]['kind'], string> = {
  without: 'No address',
  verified: 'Verified address',
  unverified: 'Unverified address',
  disposable: 'Disposable address',
};

function simple<T extends { count: number; held: number; heldRate: number }>(rows: T[], label: (row: T) => string): InsightRowModel[] {
  return rows.map((row, index) => ({ id: String(index), label: label(row), count: row.count, held: row.held, heldRate: row.heldRate }));
}

function buildTables(data: AdminCommentInsights) {
  return {
    networks: data.networks.map((row): InsightRowModel => ({
      id: `asn:${row.asn ?? 'none'}`,
      label: networkName(row.asn, row.asOrg),
      sub: row.asOrg && row.asn !== null ? `AS${row.asn}` : null,
      subMono: true,
      pivot: row.asn === null ? null : { type: 'asn', value: String(row.asn) },
      ban: 'asn',
      count: row.count,
      held: row.held,
      heldRate: row.heldRate,
      sessions: row.sessions,
    })),
    countries: data.countries.map((row): InsightRowModel => ({
      id: `country:${row.country ?? 'none'}`,
      label: countryName(row.country),
      count: row.count,
      held: row.held,
      heldRate: row.heldRate,
      sessions: row.sessions,
    })),
    subnets: data.subnets.map((row): InsightRowModel => ({
      id: `ip24:${row.ip24 ?? 'none'}`,
      label: subnetName(row.sampleIp),
      mono: true,
      pivot: row.ip24 ? { type: 'ip24', value: row.ip24 } : null,
      ban: 'ip24',
      count: row.count,
      held: row.held,
      heldRate: row.heldRate,
      sessions: row.sessions,
    })),
    devices: data.devices.map((row): InsightRowModel => ({
      id: `fp:${row.clientFp ?? 'none'}`,
      label: row.renderer ?? row.platform ?? 'No fingerprint',
      sub: [row.clientFp ? keyText('client_fp', row.clientFp) : null, row.screen].filter(Boolean).join(' · ') || null,
      pivot: row.clientFp ? { type: 'client_fp', value: row.clientFp } : null,
      ban: 'client_fp',
      count: row.count,
      held: row.held,
      heldRate: row.heldRate,
      sessions: row.sessions,
      // One device across many subnets is what a residential proxy pool looks like.
      flag: row.subnets >= 5 ? { tone: 'danger', text: `On ${row.subnets} subnets` } : null,
    })),
    browsers: data.browsers.map((row): InsightRowModel => ({
      id: `${row.browser}|${row.os}`,
      label: [row.browser, row.os].filter(Boolean).join(' on ') || 'Unknown browser',
      count: row.count,
      held: row.held,
      heldRate: row.heldRate,
      sessions: row.sessions,
    })),
    linkDomains: data.linkDomains.map((row): InsightRowModel => ({
      id: row.domain,
      label: row.domain,
      pivot: { type: 'domain', value: row.domain },
      ban: row.banned ? null : 'domain',
      count: row.count,
      held: row.held,
      heldRate: row.heldRate,
      sessions: row.sessions,
      flag: row.banned ? { tone: 'danger', text: 'Banned' } : null,
    })),
    emailDomains: data.emailDomains.map((row): InsightRowModel => ({
      id: row.domain,
      label: row.domain,
      sub: row.mxShare === null ? null : `${formatShare(row.mxShare)} with mail servers`,
      pivot: { type: 'email_domain', value: row.domain },
      ban: row.banned ? null : 'email_domain',
      count: row.count,
      held: row.held,
      heldRate: row.heldRate,
      sessions: row.sessions,
      flag: row.banned ? { tone: 'danger', text: 'Banned' } : null,
    })),
    duplicates: data.duplicates.map((row): InsightRowModel => ({
      id: row.bodyHash,
      label: row.sample,
      pivot: { type: 'body_hash', value: row.bodyHash },
      count: row.count,
      held: row.held,
      heldRate: row.heldRate,
      sessions: row.sessions,
    })),
    banHits: data.banHits.map((row): InsightRowModel => ({
      id: `${row.keyType}:${row.keyValue}`,
      label: keyText(row.keyType, row.keyValue),
      mono: true,
      sub: [BAN_TYPE_LABELS[row.keyType], row.note].filter(Boolean).join(' · '),
      pivot: { type: row.keyType, value: row.keyValue },
      count: row.hits,
    })),
    tls: data.tlsStacks.map((row): InsightRowModel => ({
      id: `${row.browser}|${row.ciphersSha1}`,
      label: row.browser ?? 'Unknown browser',
      sub: row.ciphersSha1 ? row.ciphersSha1.slice(0, 12) : 'no TLS fingerprint',
      subMono: Boolean(row.ciphersSha1),
      count: row.count,
      held: row.held,
      heldRate: row.heldRate,
    })),
    botHints: simple(data.botHints, (row) => hintLabel(row.hint)),
    vpnHints: simple(data.vpnHints, (row) => hintLabel(row.hint)),
    typing: simple(data.typing, (row) => row.bucket),
    dwell: simple(data.dwell, (row) => row.bucket),
    email: data.email.map((row): InsightRowModel => ({
      id: row.kind,
      label: EMAIL_KINDS[row.kind],
      count: row.count,
      held: row.held,
      heldRate: row.heldRate,
      flag: row.kind === 'disposable' && row.count > 0 ? { tone: 'warning', text: 'Throwaway inbox' } : null,
    })),
  };
}

function Block({ id, title, meta, children, wide }: { id: string; title: string; meta?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <section aria-labelledby={id} className={cn('min-w-0', wide && '@5xl:col-span-2')}>
      <SectionHeading id={id} meta={meta}>{title}</SectionHeading>
      {children}
    </section>
  );
}

const Tables = React.memo(function Tables({ data, onBan, inView }: {
  data: AdminCommentInsights;
  onBan: (row: InsightRowModel) => void;
  /** Only the first two rows of tables, the ones a 900px window shows. */
  inView: boolean;
}) {
  const tables = React.useMemo(() => buildTables(data), [data]);
  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-10 sm:gap-y-12 @5xl:grid-cols-2">
      <HeldReasons />
      <Block id="insights-networks" title="Networks" meta="Hosting networks rarely write real comments">
        <InsightTable rows={tables.networks} labelHead="Network" countHead="Comments" held sessions onBan={onBan} />
      </Block>
      <Block id="insights-countries" title="Countries">
        <InsightTable rows={tables.countries} labelHead="Country" countHead="Comments" held sessions />
      </Block>
      <Block id="insights-links" title="Link domains" meta="Registrable domain of each link">
        <InsightTable rows={tables.linkDomains} labelHead="Domain" countHead="Comments" held sessions onBan={onBan} empty="No links in this window." />
      </Block>
      {!inView && (<>
      <Block id="insights-email-domains" title="Email domains">
        <InsightTable rows={tables.emailDomains} labelHead="Domain" countHead="Comments" held sessions onBan={onBan} empty="No addresses in this window." />
      </Block>
      <Block id="insights-duplicates" title="Repeated text" meta="The same comment body sent more than once">
        <InsightTable rows={tables.duplicates} labelHead="Text" countHead="Copies" held sessions empty="No comment was sent twice." />
      </Block>
      <Block id="insights-subnets" title="Subnets">
        <InsightTable rows={tables.subnets} labelHead="Subnet" countHead="Comments" held sessions onBan={onBan} />
      </Block>
      <Block id="insights-devices" title="Devices" meta="By browser fingerprint">
        <InsightTable rows={tables.devices} labelHead="Device" countHead="Comments" held sessions onBan={onBan} />
      </Block>
      <Block id="insights-bans" title="Ban hits" meta="Writes stopped by each ban">
        <InsightTable rows={tables.banHits} labelHead="Ban" countHead="Hits" empty="No ban matched anything in this window." />
      </Block>
      <Block id="insights-reversals" title="Your reversals by week">
        <Reversals rows={data.overturns} />
      </Block>
      <Block id="insights-quality" title="Measured outcomes" wide meta="Recorded activity, not every visitor">
        <Quality quality={data.quality} />
      </Block>
      <Block id="insights-bot" title="Automation signs">
        <InsightTable rows={tables.botHints} labelHead="Sign" countHead="Comments" held empty="No automation signs in this window." />
      </Block>
      <Block id="insights-vpn" title="VPN signs" meta="Shown, not counted against the writer">
        <InsightTable rows={tables.vpnHints} labelHead="Sign" countHead="Comments" held empty="No VPN signs in this window." />
      </Block>
      <Block id="insights-typing" title="Typing rhythm" meta="Variation between keystrokes; very even is a script">
        <InsightTable rows={tables.typing} labelHead="Rhythm" countHead="Comments" held />
      </Block>
      <Block id="insights-dwell" title="Time on page before sending">
        <InsightTable rows={tables.dwell} labelHead="Time" countHead="Comments" held />
      </Block>
      <Block id="insights-email" title="Addresses">
        <InsightTable rows={tables.email} labelHead="Kind" countHead="Comments" held />
      </Block>
      <Block id="insights-browsers" title="Browsers">
        <InsightTable rows={tables.browsers} labelHead="Browser" countHead="Comments" held sessions />
      </Block>
      <Block id="insights-tls" title="TLS stacks" meta="A browser name that disagrees with its TLS is a script">
        <InsightTable rows={tables.tls} labelHead="Browser and cipher list" countHead="Comments" held />
      </Block>
      <TopPosts />
      </>)}
    </div>
  );
});

function Reversals({ rows }: { rows: AdminCommentInsights['overturns'] }) {
  const shown = rows.filter((row) => row.falsePositives + row.falseNegatives > 0);
  if (shown.length === 0) return <p className="py-3 text-muted-foreground text-sm">You did not reverse an automatic decision in this window.</p>;
  return (
    <div role="table" className="grid grid-cols-[minmax(0,1fr)_auto_auto] text-sm">
      <div role="row" className={cn('col-span-full grid grid-cols-subgrid items-center', HEAD)}>
        <span role="columnheader" className="pe-3">Week of</span>
        <span role="columnheader" className="ps-4 text-end">Approved after hold</span>
        <span role="columnheader" className="ps-4 text-end">Hidden after publish</span>
      </div>
      {shown.map((row) => (
        <div key={row.week} role="row" className={cn('col-span-full grid grid-cols-subgrid items-center', ROW)}>
          <span role="cell" className="pe-3 font-mono text-[12px] tabular-nums">{dayLabel(row.week)}</span>
          <span role="cell" className="ps-4 text-end text-[13px] tabular-nums">{formatCount(row.falsePositives)}</span>
          <span role="cell" className="ps-4 text-end text-[13px] tabular-nums">{formatCount(row.falseNegatives)}</span>
        </div>
      ))}
    </div>
  );
}

/* Ported from the old CommentQuality cards: the same measurements and the
   same caveats, as one metric table. */
function Quality({ quality }: { quality?: AdminCommentQuality }) {
  if (!quality) return <p className="py-3 text-muted-foreground text-sm">Quality measurements are not available from this server yet.</p>;
  const { moderation, requests, clientReports, available } = quality;
  const ratio = (part: number, whole: number, unit: string) => `${formatCount(part)} of ${plural(whole, unit)}`;
  const metrics: Array<{ group: string; label: string; value: string; note?: string; missing?: boolean }> = [
    {
      group: 'Held comments you approved',
      label: 'Approved after review',
      value: available.moderation ? ratio(moderation.released, moderation.reviewed, 'reviewed') : '–',
      note: available.moderation
        ? `${formatShare(moderation.releasedShare)} of reviewed; ${formatCount(moderation.held)} held in the cohort. Approval is a review outcome, not proof the hold was wrong.`
        : 'Not collected yet.',
    },
    {
      group: 'Submissions the server saw',
      label: 'Failed requests',
      value: available.requests ? ratio(requests.failures, requests.attempts, 'attempt') : '–',
      note: available.requests ? `${formatShare(requests.failureShare)}, retries included.` : 'Not collected yet.',
    },
    {
      group: 'Submissions the server saw',
      label: 'Failed while signed in',
      value: available.requests ? ratio(requests.authenticatedFailures, requests.authenticatedAttempts, 'attempt') : '–',
      note: available.requests ? `${formatShare(requests.authenticatedFailureShare)}. Signed in does not mean benign.` : undefined,
    },
    {
      group: 'What browsers reported',
      label: 'Failure reports',
      value: available.clientReports ? ratio(clientReports.failures, clientReports.reports, 'report') : '–',
      note: available.clientReports
        ? `${formatCount(clientReports.networkFailures)} network failures. Unverified, and a dead network sends no report.`
        : 'Not collected yet.',
    },
    {
      group: 'What browsers reported',
      label: 'Challenged by Turnstile',
      value: available.clientReports ? ratio(clientReports.challengedAttempts, clientReports.reports, 'report') : '–',
      note: available.clientReports ? `${formatCount(clientReports.repeatedChallenges)} challenged more than once.` : undefined,
    },
  ];

  return (
    <div className="flex flex-col">
      <div role="table" className="grid grid-cols-[minmax(0,1fr)_auto] text-sm @3xl:grid-cols-[12rem_minmax(0,1fr)_auto]">
        {metrics.map((metric) => (
          <div key={metric.label} role="row" className="col-span-full grid grid-cols-subgrid items-baseline gap-y-1 py-3">
            <span role="rowheader" className="col-start-1 pe-3 @3xl:col-start-1">
              {metric.label}
              <span className="block text-muted-foreground text-xs @3xl:hidden">{metric.group}</span>
            </span>
            <span role="cell" className="col-span-full row-start-2 text-muted-foreground text-xs @3xl:col-span-1 @3xl:col-start-2 @3xl:row-start-1">
              {metric.note}
            </span>
            <span role="cell" className="col-start-2 row-start-1 ps-4 text-end text-[13px] tabular-nums @3xl:col-start-3">{metric.value}</span>
          </div>
        ))}
      </div>
      {requests.outcomes.length > 0 && available.requests && (
        <div role="table" aria-label="Request outcomes" className="mt-6 grid grid-cols-[minmax(0,1fr)_auto] text-sm">
          <div role="row" className={cn('col-span-full grid grid-cols-subgrid items-center', HEAD)}>
            <span role="columnheader">Request outcome</span>
            <span role="columnheader" className="ps-4 text-end">Requests</span>
          </div>
          {requests.outcomes.map((row) => (
            <div key={`${row.kind}:${row.outcome}`} role="row" className={cn('col-span-full grid grid-cols-subgrid items-center py-2.5', ROW)}>
              <span role="cell" className="min-w-0 break-words">
                <span className="text-muted-foreground">{row.kind === 'comment' ? 'Comment' : 'Reaction'} · </span>
                {row.outcome.replace(/_/g, ' ')}
              </span>
              <span role="cell" className="ps-4 text-end text-[13px] tabular-nums">{formatCount(row.count)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="pt-2 text-muted-foreground text-xs">
        {quality.collectedSince ? `Collected since ${shortDate(quality.collectedSince)}.` : 'The collection start is not known.'}
      </p>
    </div>
  );
}

/* Reasons and top posts come from the queue summary, which is all-time:
   site-api has no window for it yet. */
function HeldReasons() {
  const summary = useCommentSummary();
  const rows = React.useMemo(
    () => (summary.data?.reasons ?? [])
      .filter((row) => row.reason !== 'ok')
      .map((row): InsightRowModel => ({ id: row.reason, label: reasonLabel(row.reason) ?? row.reason, count: row.count })),
    [summary.data],
  );
  return (
    <Block id="insights-reasons" title="Why comments were held" meta="All time">
      {summary.isPending ? (
        <TableSkeleton rows={5} />
      ) : summary.isError ? (
        <LoadError className="px-0" what="Held reasons" error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <InsightTable rows={rows} labelHead="Reason" countHead="Comments" empty="Nothing has been held yet." />
      )}
    </Block>
  );
}

function TopPosts() {
  const summary = useCommentSummary();
  const rows = React.useMemo(
    () => (summary.data?.topPosts ?? []).map((row): InsightRowModel => ({
      id: row.postId,
      label: row.title ?? row.slug ?? row.postId,
      count: row.count,
    })),
    [summary.data],
  );
  return (
    <Block id="insights-posts" title="Most discussed posts" meta="All time">
      {summary.isPending ? (
        <TableSkeleton rows={5} />
      ) : summary.isError ? (
        <LoadError className="px-0" what="Top posts" error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <InsightTable rows={rows} labelHead="Post" countHead="Comments" empty="No post has comments yet." />
      )}
    </Block>
  );
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden className="flex flex-col">
      <div className={HEAD} />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex h-11 items-center justify-between gap-3">
          <Skeleton className="h-3.5" style={{ width: `${70 - index * 9}%` }} />
          <Skeleton className="h-3 w-8" />
        </div>
      ))}
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading insights" className="flex flex-col gap-10 px-4 pb-10 sm:gap-12 @2xl:px-6">
      <div className="flex flex-col gap-4 pt-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 @xl:grid-cols-3 @5xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-6 w-14" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
        <Skeleton className="h-3 w-80 max-w-full" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-[96px] w-full" />
      </div>
      <div className="grid grid-cols-1 gap-x-10 gap-y-10 sm:gap-y-12 @5xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index}>
            <div className="mb-2 flex min-h-8 items-center"><Skeleton className="h-3.5 w-28" /></div>
            <TableSkeleton rows={6} />
          </div>
        ))}
      </div>
    </div>
  );
}
