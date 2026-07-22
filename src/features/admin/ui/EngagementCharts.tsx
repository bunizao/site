import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { BlogAnalyticsArticleStats, BlogAnalyticsBreakdown } from '@bunizao/contracts';

// Shares the AnalyticsCharts palette so the whole page reads as one system.
const AXIS_COLOR = 'hsl(233 8% 61%)';
const GRID_COLOR = 'hsl(240 5% 15%)';
const ACCENT = 'hsl(234 60% 62%)';
const READ = 'hsl(152 46% 50%)';
const FAINT = 'hsl(240 6% 22%)';
const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(240 7% 8%)',
  border: '1px solid hsl(240 5% 15%)',
  borderRadius: 8,
  fontSize: 12,
  color: 'hsl(0 0% 92%)',
} as const;

const numberFmt = new Intl.NumberFormat('en-US');
const rate = (reads: number, views: number): number => (views > 0 ? reads / views : 0);
function labelFor(value: string): string {
  return value.replace(/_/g, ' ');
}

// --- Source → read conversion --------------------------------------------
// Each source is a full-width bar of its views; the solid segment is the share
// that actually became reads. Long bars with a short solid head = high-volume,
// low-quality acquisition. This is the "funnel" read across sources at once.
export function SourceQualityChart({ referrers }: { referrers: BlogAnalyticsBreakdown[] }) {
  const data = React.useMemo(
    () =>
      [...referrers]
        .sort((a, b) => b.views - a.views)
        .slice(0, 8)
        .map((r) => ({
          label: labelFor(r.label ?? r.key),
          reads: r.reads,
          unread: Math.max(0, r.views - r.reads),
          views: r.views,
          rate: rate(r.reads, r.views),
        })),
    [referrers],
  );

  if (!data.length) return <div className="portal-empty">No referrer data in this range.</div>;

  const renderTip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ ...TOOLTIP_STYLE, padding: '8px 10px' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.label}</div>
        <div>{numberFmt.format(d.views)} views · {numberFmt.format(d.reads)} reads</div>
        <div style={{ color: READ }}>{Math.round(d.rate * 100)}% read-through</div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }} barCategoryGap={10}>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          stroke={AXIS_COLOR}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={72}
        />
        <Tooltip content={renderTip} cursor={{ fill: 'hsl(240 4% 14% / 0.5)' }} />
        <Bar dataKey="reads" name="Reads" stackId="v" fill={READ} radius={[3, 0, 0, 3]} />
        <Bar dataKey="unread" name="Unread" stackId="v" fill={FAINT} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// --- Engagement scatter ---------------------------------------------------
// Each article is a point: x = views (reach), y = read-through (quality), size
// = unique visitors. Top-right = the gems (widely read AND finished);
// bottom-right = high-traffic pages nobody finishes. The median read-through
// line splits winners from the rest.
export function EngagementScatter({ articles }: { articles: BlogAnalyticsArticleStats[] }) {
  const { points, median } = React.useMemo(() => {
    const pts = articles
      .filter((a) => a.views > 0)
      .map((a) => ({
        slug: a.slug,
        views: a.views,
        reads: a.reads,
        y: Math.round(rate(a.reads, a.views) * 100),
        z: Math.max(1, a.uniqueVisitors),
        completion: Math.round((a.completionRate ?? 0) * 100),
      }));
    const ys = pts.map((p) => p.y).sort((a, b) => a - b);
    const mid = ys.length
      ? ys.length % 2
        ? ys[(ys.length - 1) / 2]
        : Math.round((ys[ys.length / 2 - 1] + ys[ys.length / 2]) / 2)
      : 0;
    return { points: pts, median: mid };
  }, [articles]);

  if (!points.length) return <div className="portal-empty">No article data in this range.</div>;

  const renderTip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ ...TOOLTIP_STYLE, padding: '8px 10px', maxWidth: 220 }}>
        <div style={{ fontWeight: 600, marginBottom: 4, wordBreak: 'break-word' }}>{d.slug}</div>
        <div>{numberFmt.format(d.views)} views · {numberFmt.format(d.z)} visitors</div>
        <div style={{ color: READ }}>{d.y}% read-through · {d.completion}% completed</div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 12, right: 16, bottom: 4, left: -8 }}>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="views"
          name="Views"
          stroke={AXIS_COLOR}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="Read-through"
          unit="%"
          domain={[0, 100]}
          stroke={AXIS_COLOR}
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <ZAxis type="number" dataKey="z" range={[40, 460]} name="Visitors" />
        <Tooltip content={renderTip} cursor={{ strokeDasharray: '3 3', stroke: GRID_COLOR }} />
        <Scatter data={points} fill={ACCENT} fillOpacity={0.62} stroke={ACCENT} strokeOpacity={0.9}>
          {points.map((p) => (
            <Cell key={p.slug} fill={p.y >= median ? ACCENT : 'hsl(38 88% 58%)'} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}
