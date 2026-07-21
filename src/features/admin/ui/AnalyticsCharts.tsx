import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  BlogAnalyticsDailyStats,
  NewsletterAnalyticsDailyStats,
  NewsletterAnalyticsTotals,
} from '@bunizao/contracts';

const AXIS_COLOR = 'hsl(233 8% 61%)';
const GRID_COLOR = 'hsl(240 5% 15%)';
const SERIES = {
  views: 'hsl(234 60% 62%)',
  reads: 'hsl(152 46% 50%)',
  uniqueVisitors: 'hsl(38 88% 58%)',
  sent: 'hsl(234 60% 62%)',
  opened: 'hsl(152 46% 50%)',
  clicked: 'hsl(38 88% 58%)',
} as const;

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(240 7% 8%)',
  border: '1px solid hsl(240 5% 15%)',
  borderRadius: 8,
  fontSize: 12,
} as const;

function formatDay(value: string): string {
  try {
    return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return value;
  }
}

export function TrafficChart({ daily }: { daily: BlogAnalyticsDailyStats[] }) {
  if (!daily.length) {
    return <div className="portal-empty">No daily rows in this range.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          {(['views', 'reads', 'uniqueVisitors'] as const).map((key) => (
            <linearGradient key={key} id={`traffic-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[key]} stopOpacity={0.32} />
              <stop offset="100%" stopColor={SERIES[key]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="day"
          tickFormatter={formatDay}
          stroke={AXIS_COLOR}
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(value) => formatDay(String(value))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="views"
          name="Views"
          stroke={SERIES.views}
          fill="url(#traffic-views)"
          strokeWidth={1.5}
        />
        <Area
          type="monotone"
          dataKey="reads"
          name="Reads"
          stroke={SERIES.reads}
          fill="url(#traffic-reads)"
          strokeWidth={1.5}
        />
        <Area
          type="monotone"
          dataKey="uniqueVisitors"
          name="Visitors"
          stroke={SERIES.uniqueVisitors}
          fill="url(#traffic-uniqueVisitors)"
          strokeWidth={1.5}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function NewsletterDailyChart({ daily }: { daily: NewsletterAnalyticsDailyStats[] }) {
  if (!daily.length) {
    return <div className="portal-empty">No newsletter activity in this range.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="day"
          tickFormatter={formatDay}
          stroke={AXIS_COLOR}
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(value) => formatDay(String(value))} cursor={{ fill: 'hsl(240 4% 14% / 0.6)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="sent" name="Sent" fill={SERIES.sent} radius={[3, 3, 0, 0]} />
        <Bar dataKey="opened" name="Opened" fill={SERIES.opened} radius={[3, 3, 0, 0]} />
        <Bar dataKey="clicked" name="Clicked" fill={SERIES.clicked} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function NewsletterFunnel({ totals }: { totals: NewsletterAnalyticsTotals }) {
  const stages = [
    { label: 'Sent', value: totals.sent, color: SERIES.sent },
    { label: 'Opened', value: totals.opened, color: SERIES.opened },
    { label: 'Clicked', value: totals.clicked, color: SERIES.clicked },
  ];
  const max = Math.max(1, ...stages.map((stage) => stage.value));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {stages.map((stage, index) => {
        const previous = index > 0 ? stages[index - 1].value : null;
        const rate = previous ? Math.round((stage.value / Math.max(1, previous)) * 100) : null;
        return (
          <div key={stage.label} style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: AXIS_COLOR }}>{stage.label}</span>
            <div style={{ height: 22, borderRadius: 6, background: 'hsl(240 5% 14%)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.max(2, Math.round((stage.value / max) * 100))}%`,
                  height: '100%',
                  borderRadius: 6,
                  background: stage.color,
                  opacity: 0.85,
                  transition: 'width 400ms cubic-bezier(0.2, 0, 0, 1)',
                }}
              />
            </div>
            <span className="portal-mono" style={{ fontSize: 12 }}>
              {stage.value.toLocaleString()}
              {rate !== null ? ` · ${rate}%` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
