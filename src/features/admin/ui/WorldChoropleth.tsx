import * as React from 'react';
import type { BlogAnalyticsBreakdown } from '@bunizao/contracts';
import worldRaw from '@/features/admin/data/world-110m.geo.json';

// Self-contained choropleth: Natural Earth 110m (Douglas-Peucker simplified to
// ~73KB, ISO-A2 keyed, Antarctica dropped) projected with a hand-rolled
// equirectangular projection — no d3/topojson at runtime. The map is the
// visual; the ranked list beside it is the accessible, data-driven source of
// truth (city-states absent from 110m still appear there).

interface WorldFeature {
  properties: { iso: string; name: string; lx?: number; ly?: number };
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
}
const world = worldRaw as unknown as { features: WorldFeature[] };

// --- Projection -----------------------------------------------------------
// Plate carrée with equal pixels-per-degree on both axes (no vertical stretch).
// Viewport cropped to the populated latitude band so the poles don't waste space.
const VIEW_W = 800;
const LAT_TOP = 84;
const LAT_BOTTOM = -56;
const PPD = VIEW_W / 360;
const VIEW_H = Math.round((LAT_TOP - LAT_BOTTOM) * PPD);
const projX = (lon: number): number => (lon + 180) * PPD;
const projY = (lat: number): number => (LAT_TOP - lat) * PPD;

function ringPath(ring: number[][]): string {
  let d = '';
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i];
    d += `${i ? 'L' : 'M'}${projX(p[0]).toFixed(1)} ${projY(p[1]).toFixed(1)}`;
  }
  return `${d}Z`;
}
function geomPath(geom: WorldFeature['geometry']): string {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let d = '';
  for (const poly of polys) for (const ring of poly) d += ringPath(ring as number[][]);
  return d;
}

interface Shape {
  iso: string;
  name: string;
  d: string;
  ax: number;
  ay: number;
}
// Precompute once when the island's JS loads.
const SHAPES: Shape[] = world.features.map((f) => {
  const lon = typeof f.properties.lx === 'number' ? f.properties.lx : 0;
  const lat = typeof f.properties.ly === 'number' ? f.properties.ly : 0;
  return { iso: f.properties.iso, name: f.properties.name, d: geomPath(f.geometry), ax: projX(lon), ay: projY(lat) };
});
const GEO_ISO = new Set(SHAPES.map((s) => s.iso));

// --- Color scale ----------------------------------------------------------
// THE meaningful data-viz decision. A personal blog's traffic is dominated by
// one or two countries, so a *linear* views→intensity map paints everything but
// the leader near-invisible. `sqrt` compresses that head and keeps mid/low
// countries legible while preserving a sense of magnitude. Swap for Math.log
// (heavier compression) or a rank/quantile scale (maximum contrast, magnitude
// discarded) to taste.
function intensity(views: number, max: number): number {
  if (max <= 0) return 0;
  return Math.sqrt(views / max);
}
// Fixed accent hue (portal indigo), ramping lightness + saturation with intensity.
function fillFor(t: number): string {
  const light = 26 + t * 38;
  const sat = 46 + t * 22;
  return `hsl(234 ${sat.toFixed(0)}% ${light.toFixed(0)}%)`;
}

const numberFmt = new Intl.NumberFormat('en-US');
function readRate(reads: number, views: number): number {
  return views > 0 ? reads / views : 0;
}

interface CountryDatum extends BlogAnalyticsBreakdown {
  name: string;
  onMap: boolean;
}

export function WorldChoropleth({ countries }: { countries: BlogAnalyticsBreakdown[] }) {
  const [hover, setHover] = React.useState<string | null>(null);

  const { byIso, ranked, maxViews, totalViews } = React.useMemo(() => {
    const map = new Map<string, CountryDatum>();
    let peak = 0;
    let total = 0;
    for (const row of countries) {
      const iso = row.key?.toUpperCase();
      if (!iso) continue;
      const shape = SHAPES.find((s) => s.iso === iso);
      map.set(iso, {
        ...row,
        key: iso,
        name: row.label || shape?.name || iso,
        onMap: GEO_ISO.has(iso),
      });
      peak = Math.max(peak, row.views);
      total += row.views;
    }
    const list = [...map.values()].sort((a, b) => b.views - a.views);
    return { byIso: map, ranked: list, maxViews: peak, totalViews: total };
  }, [countries]);

  const active = hover ? byIso.get(hover) ?? null : null;
  const activeShape = hover ? SHAPES.find((s) => s.iso === hover) ?? null : null;

  if (ranked.length === 0) {
    return <div className="portal-empty">No geographic data in this range.</div>;
  }

  const legendStops = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="portal-geo">
      <div className="portal-geo-map">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="portal-geo-svg"
          role="img"
          aria-label={`World map: reader views across ${ranked.length} countries`}
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={() => setHover(null)}
        >
          {SHAPES.map((shape) => {
            const datum = byIso.get(shape.iso);
            const hovered = hover === shape.iso;
            const t = datum ? intensity(datum.views, maxViews) : 0;
            return (
              <path
                key={shape.iso}
                d={shape.d}
                className="portal-geo-country"
                data-active={datum ? 'true' : 'false'}
                data-hover={hovered ? 'true' : 'false'}
                // Inline style, not the `fill` attribute: a CSS `fill` rule on
                // .portal-geo-country would otherwise override the attribute and
                // flatten every country to the no-data gray. Inline style wins.
                style={datum ? { fill: fillFor(t) } : undefined}
                onMouseEnter={datum ? () => setHover(shape.iso) : undefined}
              />
            );
          })}
        </svg>

        {active && activeShape && (
          <div
            className="portal-geo-tip"
            style={{
              left: `${(activeShape.ax / VIEW_W) * 100}%`,
              top: `${(activeShape.ay / VIEW_H) * 100}%`,
            }}
          >
            <span className="portal-geo-tip-name">{active.name}</span>
            <span className="portal-geo-tip-row">
              <strong>{numberFmt.format(active.views)}</strong> views ·{' '}
              {Math.round(readRate(active.reads, active.views) * 100)}% read
            </span>
          </div>
        )}

        <div className="portal-geo-legend" aria-hidden="true">
          <span className="portal-geo-legend-cap">less</span>
          <span className="portal-geo-legend-ramp">
            {legendStops.map((t) => (
              <span key={t} style={{ background: fillFor(t) }} />
            ))}
          </span>
          <span className="portal-geo-legend-cap">more</span>
        </div>
      </div>

      <ol className="portal-geo-list">
        {ranked.map((c, i) => {
          const rate = readRate(c.reads, c.views);
          const share = totalViews > 0 ? c.views / totalViews : 0;
          const tone = rate >= 0.6 ? 'success' : rate >= 0.4 ? 'neutral' : 'muted';
          return (
            <li
              key={c.key}
              className="portal-geo-item"
              data-hover={hover === c.key ? 'true' : 'false'}
              onMouseEnter={() => setHover(c.key)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="portal-geo-rank">{i + 1}</span>
              <span className="portal-geo-name">
                {c.name}
                {!c.onMap && <span className="portal-geo-flag" title="Not shown on the map at this resolution">·</span>}
              </span>
              <span className="portal-geo-share">
                <span className="portal-geo-share-fill" style={{ width: `${Math.max(2, Math.round(share * 100))}%` }} />
              </span>
              <strong className="portal-geo-views">{numberFmt.format(c.views)}</strong>
              <span className="portal-geo-rate" data-tone={tone}>{Math.round(rate * 100)}%</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
