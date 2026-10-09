import type {
  SiteAnalyticsCollectInput,
  SiteAnalyticsSurface,
} from '@bunizao/contracts/analytics';

export interface AnalyticsPage {
  surface: SiteAnalyticsSurface;
  entity?: string;
  locale?: string;
}
export function inferAnalyticsPage(path: string): AnalyticsPage {
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) return { surface: 'home' };
  if (path === '/404') return { surface: 'not_found', entity: path };
  if (parts[0] === 'blog') {
    if (parts.length === 1) return { surface: 'blog_index' };
    if (parts[1] === 'tags') return { surface: 'blog_tags' };
    if (parts[1] === 'tag')
      return { surface: 'blog_tag', entity: parts.slice(2).join('/') };
    return { surface: 'blog_post', entity: parts.at(-1) };
  }
  if (parts[0] === 'mood')
    return {
      surface:
        parts.length === 1
          ? 'mood_feed'
          : parts[1] === 'embed'
            ? 'mood_embed'
            : 'mood_post',
      entity: parts[1] === 'embed' ? '' : (parts[1] ?? ''),
    };
  if (parts[0] === 'docs' || parts[0] === 'components')
    return { surface: parts[0], entity: parts.slice(1).join('/') };
  if (parts[0] === 'reader')
    return { surface: 'reader', entity: parts[1] ?? '' };
  if (path === '/subscribe/manage') return { surface: 'subscribe_manage' };
  if (['legacy', 'projects', 'message', 'privacy'].includes(parts[0]))
    return { surface: parts[0] as SiteAnalyticsSurface };
  return { surface: 'other' };
}
export function analyticsEnabled(path: string): boolean {
  return !/^\/(dev|lab)(\/|$)/.test(path);
}
export function cleanAnalyticsUrl(
  value: string,
  origin: string,
  outboundHost = false,
): string {
  if (!value) return '';
  try {
    const url = new URL(value, origin);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.origin === origin
      ? url.pathname
      : `${outboundHost ? url.host : url.origin}${url.pathname}`;
  } catch {
    return '';
  }
}
export function readAnalyticsPage(
  doc: Document,
  location: Location,
): SiteAnalyticsCollectInput['page'] {
  const data = doc.body.dataset;
  return {
    surface: (data.analyticsSurface ?? 'other') as SiteAnalyticsSurface,
    entity: (
      data.analyticsEntity ??
      (data.analyticsSurface === 'mood_feed'
        ? new URLSearchParams(location.search).get('tag')
        : '') ??
      ''
    ).slice(0, 96),
    path: location.pathname.slice(0, 256),
    locale: (data.analyticsLocale || doc.documentElement.lang || 'en').slice(
      0,
      16,
    ),
    referrer: cleanAnalyticsUrl(doc.referrer, location.origin).slice(0, 256),
    utm: ['utm_source', 'utm_medium', 'utm_campaign'].map((key) =>
      (new URLSearchParams(location.search).get(key) || '').slice(0, 64),
    ) as [string, string, string],
  };
}
