import type {
  SiteAnalyticsReportResult,
  SiteAnalyticsReportName,
} from '@bunizao/contracts/analytics';
export function siteAnalyticsDemo(
  params: URLSearchParams,
): SiteAnalyticsReportResult {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
  }).format(new Date());
  const report = (params.get('report') ||
    'overview') as SiteAnalyticsReportName;
  const result: SiteAnalyticsReportResult = {
    report,
    from: params.get('from') || day,
    to: params.get('to') || day,
    timezone: 'Australia/Melbourne',
    sampled: false,
    visitors: 24,
    visitorBasis: 'distinct',
    pages: [],
    clicks: [],
    dimensions: [],
    traffic: [],
    events: [],
    nextCursor: null,
    rum: null,
    notices: ['Demo data. These numbers are not production measurements.'],
  };
  const metrics = {
    views: 42,
    engaged: 31,
    visitors: 24,
    sessions: 30,
    bounces: 5,
    entries: 30,
    exits: 30,
    reads: 10,
    completions: 8,
    clicks: 25,
    medianDwellMs: 12000,
    scrollDepth: 0.7,
    metric1: 2,
    metric2: 4,
  };
  const surface = params.get('surface') || 'home';
  if (report === 'overview' || report === 'pages')
    result.pages = [
      {
        day,
        surface:
          report === 'overview' && !params.get('surface') ? '*' : surface,
        entity: report === 'pages' ? '' : '*',
        ...metrics,
      },
    ];
  if (report === 'clicks')
    result.clicks = [
      {
        day,
        surface,
        entity: '',
        name: 'desk.panel',
        href: '#projects',
        clicks: 20,
        visitors: 14,
        medianTimeMs: 2500,
        clickThrough: 20 / 42,
      },
    ];
  if (report === 'sources' || report === 'audience')
    result.dimensions = [
      {
        day,
        surface: '*',
        dim: report === 'sources' ? 'ref_source' : 'country',
        key: report === 'sources' ? 'direct' : 'AU',
        views: 42,
        visitors: 24,
        engaged: 31,
        dwellMsSum: 1000000,
      },
    ];
  if (report === 'quality') {
    result.traffic = [
      { day, surface, class: 'human', reason: '', views: 42, visitors: 24 },
      {
        day,
        surface,
        class: 'bot',
        reason: 'webdriver',
        views: 2,
        visitors: 1,
      },
    ];
    result.rum = [{ surface: '/', loads: 43 }];
  }
  if (report === 'log' || report === 'visitor')
    result.events = [
      {
        viewId: '11111111-1111-4111-8111-111111111111',
        visitorId: 'demo-visitor-1',
        sessionId: '22222222-2222-4222-8222-222222222222',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        class: 'human',
        reason: '',
        weight: 1,
        page: {
          surface: 'home',
          entity: '',
          path: '/',
          locale: 'en',
          referrer: '',
          utm: ['', '', ''],
        },
        client: {
          tz: 'Australia/Melbourne',
          langs: ['en'],
          vw: 1440,
          vh: 900,
          dpr: 2,
          navType: 0,
          isEntry: true,
          isNewVisitor: false,
          webdriver: false,
        },
        progress: {
          dwellMs: 12000,
          scrollDepth: 0.8,
          interactions: 1,
          firstInputMs: 2500,
          hiddenCount: 1,
          metric1: 2,
          metric2: 1,
        },
        clicks: [
          {
            name: 'desk.panel',
            kind: 'panel',
            href: '#projects',
            region: 'desk',
            label: 'chip',
            position: -1,
            tMs: 2500,
          },
        ],
        clickCount: 1,
        country: 'AU',
        region: 'Victoria',
        city: 'Melbourne',
        ip: '192.0.2.1',
        ua: 'Demo browser',
        browser: 'chrome',
        os: 'macos',
        device: 'desktop',
        platform: 'chrome',
        network: 'Demo',
        refSource: 'direct',
        refHost: '',
      },
    ];
  return result;
}
