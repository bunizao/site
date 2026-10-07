import {
  SITE_ANALYTICS_COLLECT_ENDPOINT,
  SITE_ANALYTICS_SESSION_IDLE_MS,
  type SiteAnalyticsClick,
  type SiteAnalyticsCollectInput,
} from '@bunizao/contracts/analytics';
import { analyticsEnabled, cleanAnalyticsUrl, readAnalyticsPage } from './page';

const VISITOR_KEY = 'buxx:blog-analytics:visitor-id';
const SESSION_KEY = 'buxx:analytics:session';
export const OWNER_KEY = 'buxx:analytics:owner';
function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage may be unavailable. */
  }
}
export function resolveSession(
  now: number,
  value: string | null,
  createId = () => crypto.randomUUID(),
): { id: string; isEntry: boolean } {
  try {
    const session = JSON.parse(value || 'null');
    if (
      session &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        session.id,
      ) &&
      Number.isFinite(session.last) &&
      now >= session.last &&
      now - session.last <= SITE_ANALYTICS_SESSION_IDLE_MS
    )
      return { id: session.id, isEntry: false };
  } catch {
    /* Invalid storage starts a new session. */
  }
  return { id: createId(), isEntry: true };
}
export function resolveClick(
  event: Event,
  origin: string,
  elapsed: number,
): SiteAnalyticsClick | null {
  const target = event.target instanceof Element ? event.target : null;
  const control = target?.closest<HTMLElement>(
    '[data-track], a[href], button, [role="button"], summary',
  );
  if (
    !control ||
    control.closest('[data-track-ignore]') ||
    target?.closest(
      'input:not([type="submit"]):not([type="button"]):not([data-pref]), textarea, select, [contenteditable="true"]',
    )
  )
    return null;
  if (
    control.matches('[data-track-manual], [data-command-item]') ||
    (control.matches('[data-open], [data-tab-select]') &&
      !(event as MouseEvent).metaKey &&
      !(event as MouseEvent).ctrlKey &&
      !(event as MouseEvent).shiftKey &&
      !(event as MouseEvent).altKey)
  )
    return null;
  const href =
    control.getAttribute('href') ||
    control.dataset.href ||
    control.dataset.trackHref;
  const list = control.closest('[data-track-list]');
  const region = control.closest<HTMLElement>(
    '[data-track-region], header, nav, main, footer, aside',
  );
  let kind: SiteAnalyticsClick['kind'] = 'button';
  if (href) {
    try {
      kind =
        new URL(href, origin).origin === origin
          ? 'link_internal'
          : 'link_outbound';
    } catch {
      return null;
    }
  }
  return {
    name: (control.dataset.track || (href ? 'link' : 'button')).slice(0, 64),
    kind,
    href: href ? cleanAnalyticsUrl(href, origin, true).slice(0, 256) : '',
    region: (
      region?.dataset.trackRegion ||
      region?.tagName.toLowerCase() ||
      ''
    ).slice(0, 48),
    label: (/^\/(subscribe\/manage|reader)(\/|$)/.test(location.pathname)
      ? control.dataset.trackLabel || ''
      : control.getAttribute('aria-label') || control.textContent || ''
    )
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 60),
    position: control.dataset.trackPosition
      ? Number(control.dataset.trackPosition)
      : list
        ? Array.from(
            list.querySelectorAll(
              '[data-track], a[href], button, [role="button"]',
            ),
          ).indexOf(control)
        : -1,
    tMs: Math.max(0, Math.round(elapsed)),
  };
}
export function startAnalytics(): (() => void) | undefined {
  if (
    !['buxx.me', 'www.buxx.me'].includes(location.hostname) ||
    !analyticsEnabled(location.pathname) ||
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl
  )
    return;
  if ((document as Document & { prerendering?: boolean }).prerendering) {
    document.addEventListener('prerenderingchange', () => startAnalytics(), {
      once: true,
    });
    return;
  }
  const abort = new AbortController();
  const on = (target: EventTarget, name: string, handler: EventListener) =>
    target.addEventListener(name, handler, {
      capture: true,
      passive: true,
      signal: abort.signal,
    });
  const page = readAnalyticsPage(document, location);
  const existing = stored(VISITOR_KEY);
  const visitorId =
    existing && existing.length >= 8 && existing.length <= 64
      ? existing
      : crypto.randomUUID();
  store(VISITOR_KEY, visitorId);
  let session = resolveSession(Date.now(), stored(SESSION_KEY));
  const touchSession = () =>
    store(SESSION_KEY, JSON.stringify({ id: session.id, last: Date.now() }));
  touchSession();
  let viewId = crypto.randomUUID(),
    seq = 0,
    started = performance.now();
  let visibleSince: number | null =
    document.visibilityState === 'visible' ? started : null;
  let dwell = 0,
    depth = 0,
    interactions = 0,
    firstInput = -1,
    hidden = 0;
  let metric1 = 0,
    metric2 = 0,
    panels = new Set<string>();
  let clicks: SiteAnalyticsClick[] = [],
    lastKey = '',
    timer: ReturnType<typeof setTimeout> | undefined;
  let pending:
    | { body: string; key: string; count: number; seq: number; viewId: string }
    | undefined;
  let needsSend = false;
  let newVisitor = !existing;
  let navType =
    ({ navigate: 0, reload: 1, back_forward: 2, prerender: 0 } as const)[
      (
        performance.getEntriesByType(
          'navigation',
        )[0] as PerformanceNavigationTiming
      )?.type
    ] ?? 0;
  let restored = false;
  const scroller = () =>
    document.querySelector<HTMLElement>('[data-page-scroller]') ||
    document.documentElement;
  const refresh = () => {
    const el = scroller(),
      range = el.scrollHeight - el.clientHeight;
    depth = Math.max(
      depth,
      range <= 0 ? 1 : Math.min(1, Math.max(0, el.scrollTop / range)),
    );
    if (page.surface === 'mood_feed') {
      const now = new Date(),
        today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      for (const group of document.querySelectorAll<HTMLElement>(
        '.mood-date-group[data-date]',
      )) {
        const rect = group.getBoundingClientRect(),
          day = Date.parse(`${group.dataset.date}T00:00:00Z`);
        if (rect.top <= innerHeight && rect.bottom >= 0 && Number.isFinite(day))
          metric2 = Math.max(metric2, Math.round((today - day) / 86400000));
      }
    }
    if (page.surface === 'blog_post') {
      const headings = Array.from(
        document.querySelectorAll('.blog-prose h2, .blog-prose h3'),
      );
      metric2 = headings.length;
      headings.forEach((heading, i) => {
        if (heading.getBoundingClientRect().top <= innerHeight / 2)
          metric1 = Math.max(metric1, i + 1);
      });
    }
  };
  const capture = () => {
    if (visibleSince !== null) {
      const now = performance.now();
      dwell = Math.min(7_200_000, dwell + now - visibleSince);
      visibleSince = now;
    }
    refresh();
  };
  const send = () => {
    capture();
    if (pending) {
      needsSend = true;
      transmit(pending);
      return;
    }
    const progress = {
      dwellMs: Math.round(dwell),
      scrollDepth: Math.round(depth * 1000) / 1000,
      interactions,
      firstInputMs: firstInput,
      hiddenCount: hidden,
      metric1,
      metric2,
    };
    const key = JSON.stringify([progress, stored(OWNER_KEY)]);
    if ((lastKey === key && !clicks.length) || seq > 255) return;
    const batch = clicks.slice(0, 10);
    const payload: SiteAnalyticsCollectInput = {
      v: 1,
      viewId,
      visitorId,
      sessionId: session.id,
      seq,
      ...(stored(OWNER_KEY) === '1' ? { owner: true } : {}),
      page,
      client: {
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone.slice(0, 64),
        langs: navigator.languages.slice(0, 3).map((x) => x.slice(0, 16)),
        vw: innerWidth,
        vh: innerHeight,
        dpr: devicePixelRatio,
        navType: restored ? 3 : navType,
        isEntry: session.isEntry,
        isNewVisitor: newVisitor,
        webdriver: navigator.webdriver === true,
      },
      progress,
      clicks: batch,
    };
    let body = JSON.stringify(payload);
    while (new Blob([body]).size > 8192 && batch.length > 1) {
      batch.pop();
      body = JSON.stringify(payload);
    }
    pending = { body, key, count: batch.length, seq, viewId };
    transmit(pending);
  };
  const transmit = (snapshot: NonNullable<typeof pending>) => {
    const accepted = () => {
      if (
        pending !== snapshot ||
        viewId !== snapshot.viewId ||
        seq !== snapshot.seq
      )
        return;
      clicks.splice(0, snapshot.count);
      seq++;
      lastKey = snapshot.key;
      touchSession();
      pending = undefined;
      clearTimeout(timer);
      timer = undefined;
      if (clicks.length || needsSend) timer = setTimeout(send, 0);
      needsSend = false;
    };
    const failed = () => {
      if (pending === snapshot) pending = undefined;
    };
    try {
      if (
        navigator.sendBeacon?.(
          SITE_ANALYTICS_COLLECT_ENDPOINT,
          new Blob([snapshot.body], { type: 'application/json' }),
        )
      ) {
        accepted();
        return;
      }
      void fetch(SITE_ANALYTICS_COLLECT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: snapshot.body,
        credentials: 'same-origin',
        keepalive: true,
      })
        .then((response) => {
          if (response.ok) accepted();
          else failed();
        })
        .catch(failed);
    } catch {
      failed();
    }
  };
  const queue = (click: SiteAnalyticsClick) => {
    clicks.push(click);
    if (clicks.length >= 10) send();
    else if (!timer && document.visibilityState === 'visible')
      timer = setTimeout(send, 10_000);
    if (clicks.length > 100) clicks.splice(100);
  };
  on(document, 'click', (event) => {
    if (!event.isTrusted) return;
    const click = resolveClick(
      event,
      location.origin,
      performance.now() - started,
    );
    if (click) queue(click);
  });
  on(document, 'auxclick', (event) => {
    if (!event.isTrusted || (event as MouseEvent).button !== 1) return;
    const click = resolveClick(
      event,
      location.origin,
      performance.now() - started,
    );
    if (click?.kind.startsWith('link')) queue(click);
  });
  for (const name of ['pointerdown', 'keydown', 'touchstart', 'wheel'])
    on(document, name, (event) => {
      if (!event.isTrusted) return;
      interactions++;
      if (firstInput < 0)
        firstInput = Math.round(performance.now() - (restored ? started : 0));
    });
  let pendingScroll = false;
  on(document, 'scroll', () => {
    if (!pendingScroll) {
      pendingScroll = true;
      requestAnimationFrame(() => {
        pendingScroll = false;
        refresh();
      });
    }
  });
  on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      capture();
      visibleSince = null;
      hidden++;
      clearTimeout(timer);
      timer = undefined;
      send();
    } else {
      visibleSince = performance.now();
      if (clicks.length && !timer) timer = setTimeout(send, 10_000);
    }
  });
  on(window, 'pagehide', () => {
    capture();
    visibleSince = null;
    send();
    clearTimeout(timer);
    timer = undefined;
  });
  on(window, 'pageshow', (event) => {
    if (!(event as PageTransitionEvent).persisted) return;
    viewId = crypto.randomUUID();
    seq = 0;
    started = performance.now();
    dwell = depth = interactions = hidden = metric1 = metric2 = 0;
    firstInput = -1;
    clicks = [];
    lastKey = '';
    pending = undefined;
    needsSend = false;
    panels = new Set();
    restored = true;
    newVisitor = false;
    session = resolveSession(Date.now(), stored(SESSION_KEY));
    touchSession();
    visibleSince = document.visibilityState === 'visible' ? started : null;
    send();
  });
  on(document, 'change', (event) => {
    const target = event.target as HTMLElement;
    if (event.isTrusted && target?.matches('[data-pref]'))
      queue({
        name: 'reader.pref',
        kind: 'button',
        href: '',
        region: 'main',
        label: target.dataset.pref || '',
        position: -1,
        tMs: Math.round(performance.now() - started),
      });
  });
  on(document, 'timeline-wheel:gesture', (event) => {
    const detail = (event as CustomEvent<{ label: string; position: number }>)
      .detail;
    if (detail)
      queue({
        name: 'mood.wheel',
        kind: 'button',
        href: '',
        region: 'timeline',
        label: detail.label,
        position: detail.position,
        tMs: Math.round(performance.now() - started),
      });
  });
  on(document, 'analytics:panel', (event) => {
    const detail = (event as CustomEvent<{ id: string; source?: string }>)
      .detail;
    if (!detail?.id) return;
    metric1++;
    panels.add(detail.id);
    metric2 = panels.size;
    queue({
      name: 'desk.panel',
      kind: 'panel',
      href: `#${detail.id}`,
      region: 'desk',
      label: detail.source || 'hash',
      position: -1,
      tMs: Math.round(performance.now() - started),
    });
  });
  on(document, 'analytics:metric', (event) => {
    const detail = (
      event as CustomEvent<{ metric: 1 | 2; value: number; add?: boolean }>
    ).detail;
    if (!detail || !Number.isFinite(detail.value)) return;
    if (detail.metric === 1)
      metric1 = detail.add
        ? metric1 + detail.value
        : Math.max(metric1, detail.value);
    if (detail.metric === 2)
      metric2 = detail.add
        ? metric2 + detail.value
        : Math.max(metric2, detail.value);
  });
  on(document, 'analytics:click', (event) => {
    const detail = (event as CustomEvent<SiteAnalyticsClick>).detail;
    if (detail)
      queue({ ...detail, tMs: Math.round(performance.now() - started) });
  });
  send();
  return () => {
    clearTimeout(timer);
    abort.abort();
  };
}
