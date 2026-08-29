interface DebugRecord {
  at: number;
  kind: string;
  message: string;
}

interface DebugMetrics {
  cls: number;
  droppedFrames: number;
  largestFrameGap: number;
  longTasks: number;
  lcp: number;
  slowResources: number;
  scrollCalls: number;
}

interface PerformanceDebugApi {
  snapshot(): { metrics: DebugMetrics; records: DebugRecord[] };
  text(): string;
}

declare global {
  interface Window {
    __BUXX_PERF_DEBUG__?: PerformanceDebugApi;
  }
}

const MAX_RECORDS = 2000;
const MAX_VISIBLE_RECORDS = 80;
const SLOW_RESOURCE_MS = 800;
const JANK_FRAME_MS = 50;

// Groups each record kind into a color family for the log view.
// critical = errors/CLS, warning = jank signals, measure = timing data,
// layout = size/viewport churn, quiet = low-signal chatter.
type RecordCategory = 'critical' | 'warning' | 'measure' | 'layout' | 'quiet';
const KIND_CATEGORY: Record<string, RecordCategory> = {
  error: 'critical',
  cls: 'critical',
  'image-warning': 'warning',
  'frame-gap': 'warning',
  'long-task': 'warning',
  lcp: 'measure',
  navigation: 'measure',
  resource: 'measure',
  interaction: 'measure',
  image: 'measure',
  resize: 'layout',
  viewport: 'layout',
  scroll: 'quiet',
  'scroll-call': 'quiet',
  font: 'quiet',
  panel: 'quiet',
  support: 'quiet',
};

function number(value: number | undefined, digits = 1): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function nodeName(node: Node | null | undefined): string {
  if (!(node instanceof Element)) return 'unknown';
  if (node instanceof HTMLElement && node.dataset.moodId) return `[mood=${node.dataset.moodId}]`;
  if (node.id) return `#${node.id}`;
  const classes = Array.from(node.classList).slice(0, 3).join('.');
  return `${node.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
}

function resourceName(value: string): string {
  try {
    const url = new URL(value, window.location.href);
    if (url.protocol === 'data:') return `data:${url.pathname.split(',')[0]}`;
    if (url.protocol === 'blob:') return 'blob:';
    return `${url.origin === window.location.origin ? '' : url.host}${url.pathname}`;
  } catch {
    return value.split('?')[0]?.slice(-120) || 'unknown';
  }
}

function errorMessage(value: string): string {
  return value
    .replace(/https?:\/\/[^\s)]+/g, (url) => resourceName(url))
    .replace(/([?&](?:token|code|key|signature|sig)=)[^\s&]+/gi, '$1[redacted]')
    .slice(0, 240);
}

function scrollArguments(args: unknown[]): string {
  const first = args[0];
  if (typeof first === 'object' && first !== null) {
    const options = first as { behavior?: unknown; block?: unknown; left?: unknown; top?: unknown };
    return JSON.stringify({
      ...(typeof options.top === 'number' ? { top: Number(options.top.toFixed(2)) } : {}),
      ...(typeof options.left === 'number' ? { left: Number(options.left.toFixed(2)) } : {}),
      ...(typeof options.block === 'string' ? { block: options.block } : {}),
      ...(typeof options.behavior === 'string' ? { behavior: options.behavior } : {}),
    });
  }
  return JSON.stringify(args.slice(0, 2));
}

// CLS thresholds follow web-vitals: good <= 0.1, needs-improvement <= 0.25, poor above.
function clsTone(value: number): 'good' | 'warn' | 'bad' {
  if (value <= 0.1) return 'good';
  if (value <= 0.25) return 'warn';
  return 'bad';
}

// LCP thresholds follow web-vitals: good <= 2500ms, needs-improvement <= 4000ms, poor above.
function lcpTone(value: number): 'good' | 'warn' | 'bad' | '' {
  if (!value) return '';
  if (value <= 2500) return 'good';
  if (value <= 4000) return 'warn';
  return 'bad';
}

export function initPerformanceDebugPanel(): void {
  if (window.__BUXX_PERF_DEBUG__) return;

  const startedAt = performance.now();
  const records: DebugRecord[] = [];
  const metrics: DebugMetrics = {
    cls: 0,
    droppedFrames: 0,
    largestFrameGap: 0,
    longTasks: 0,
    lcp: 0,
    slowResources: 0,
    scrollCalls: 0,
  };
  let paused = false;
  let collapsed = false;
  let renderFrame = 0;

  const host = document.createElement('aside');
  host.dataset.performanceDebug = '';
  host.setAttribute('aria-label', 'Performance diagnostics');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .panel {
        --c-critical: #ff6b6b;
        --c-warning: #f5a623;
        --c-measure: #57c7ff;
        --c-layout: #b39ddb;
        --c-quiet: #6b7280;
        position: fixed; left: 8px; right: 8px; bottom: calc(8px + env(safe-area-inset-bottom, 0px));
        z-index: 2147483647; overflow: hidden;
        border: 1px solid rgba(255, 255, 255, .1);
        border-radius: 10px;
        background: rgba(8, 10, 12, .94);
        color: #c7ccd4;
        box-shadow: 0 10px 34px rgba(0, 0, 0, .45);
        font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-variant-numeric: tabular-nums;
      }
      .bar { display: flex; align-items: center; gap: 6px 8px; padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,.1); }
      .title { color: #e8eaed; font-weight: 700; white-space: nowrap; letter-spacing: .01em; }
      .summary { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; min-width: 0; flex: 1; }
      .chip { display: inline-flex; align-items: baseline; gap: 4px; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); white-space: nowrap; }
      .chip-label { color: #8a94a6; font-size: 9.5px; text-transform: uppercase; letter-spacing: .02em; }
      .chip-value { color: #d7dadd; font-weight: 600; }
      .chip[data-tone="good"] { background: rgba(74,222,128,.08); border-color: rgba(74,222,128,.4); }
      .chip[data-tone="good"] .chip-value { color: #4ade80; }
      .chip[data-tone="warn"] { background: rgba(245,166,35,.09); border-color: rgba(245,166,35,.45); }
      .chip[data-tone="warn"] .chip-value { color: #f5a623; }
      .chip[data-tone="bad"] { background: rgba(255,107,107,.1); border-color: rgba(255,107,107,.5); }
      .chip[data-tone="bad"] .chip-value { color: #ff6b6b; }
      button { appearance: none; min-height: 40px; min-width: 40px; padding: 4px 10px; border: 1px solid rgba(255,255,255,.14); border-radius: 6px; background: #14181b; color: #d7dadd; font: inherit; font-weight: 600; cursor: pointer; }
      button:hover { background: #1a2024; border-color: rgba(255,255,255,.22); }
      button:active { background: #20272b; }
      button:focus-visible { outline: 2px solid rgba(87,199,255,.6); outline-offset: 1px; }
      button[aria-pressed="true"] { background: rgba(245,166,35,.15); border-color: rgba(245,166,35,.55); color: #ffd28a; }
      .log { max-height: min(38vh, 300px); margin: 0; padding: 4px 4px 8px; overflow: auto; overflow-wrap: anywhere; user-select: text; -webkit-overflow-scrolling: touch; }
      .row { display: flex; align-items: flex-start; gap: 8px; padding: 2px 8px; border-left: 3px solid transparent; }
      .row[data-category="critical"] { border-left-color: var(--c-critical); background: rgba(255,107,107,.05); }
      .row[data-category="critical"] .badge { color: var(--c-critical); }
      .row[data-category="critical"] .msg { color: #f2b8b5; }
      .row[data-category="warning"] { border-left-color: var(--c-warning); }
      .row[data-category="warning"] .badge { color: var(--c-warning); }
      .row[data-category="measure"] { border-left-color: var(--c-measure); }
      .row[data-category="measure"] .badge { color: var(--c-measure); }
      .row[data-category="layout"] { border-left-color: var(--c-layout); }
      .row[data-category="layout"] .badge { color: var(--c-layout); }
      .row[data-category="quiet"] .badge { color: var(--c-quiet); }
      .row[data-category="quiet"] .msg { color: #7d8590; }
      .badge { flex: 0 0 78px; overflow: hidden; color: #9aa3af; font-size: 9px; font-weight: 700; text-overflow: ellipsis; text-transform: uppercase; letter-spacing: .02em; white-space: nowrap; }
      .time { flex: 0 0 56px; color: #8a94a6; text-align: right; }
      .msg { flex: 1 1 auto; min-width: 0; color: #c7ccd4; white-space: pre-wrap; overflow-wrap: anywhere; }
      .panel.collapsed .log { display: none; }
      .panel.collapsed .bar { border-bottom: 0; }
      @media (max-width: 560px) {
        .title { display: none; }
        .chip-label { font-size: 9px; }
        button { padding-inline: 8px; }
        .badge { flex-basis: 66px; font-size: 8.5px; }
        .time { flex-basis: 48px; }
      }
    </style>
    <section class="panel">
      <div class="bar">
        <span class="title">Performance audit</span>
        <div class="summary" aria-label="Metrics summary">
          <span class="chip" data-metric="cls"><span class="chip-label">CLS</span><span class="chip-value" data-field="cls"></span></span>
          <span class="chip" data-metric="lcp"><span class="chip-label">LCP</span><span class="chip-value" data-field="lcp"></span></span>
          <span class="chip"><span class="chip-label">long</span><span class="chip-value" data-field="long"></span></span>
          <span class="chip"><span class="chip-label">jank</span><span class="chip-value" data-field="jank"></span></span>
          <span class="chip"><span class="chip-label">slow</span><span class="chip-value" data-field="slow"></span></span>
          <span class="chip"><span class="chip-label">scroll</span><span class="chip-value" data-field="scroll"></span></span>
        </div>
        <button type="button" data-action="pause" aria-pressed="false">Pause</button>
        <button type="button" data-action="clear">Clear</button>
        <button type="button" data-action="copy">Copy</button>
        <button type="button" data-action="collapse" aria-label="Collapse panel">−</button>
      </div>
      <div class="log" role="log" aria-live="polite"></div>
    </section>
  `;
  document.body.appendChild(host);

  const panel = shadow.querySelector<HTMLElement>('.panel');
  const log = shadow.querySelector<HTMLElement>('.log');
  const pauseButton = shadow.querySelector<HTMLButtonElement>('[data-action="pause"]');
  const copyButton = shadow.querySelector<HTMLButtonElement>('[data-action="copy"]');
  const collapseButton = shadow.querySelector<HTMLButtonElement>('[data-action="collapse"]');
  const clsChip = shadow.querySelector<HTMLElement>('[data-metric="cls"]');
  const lcpChip = shadow.querySelector<HTMLElement>('[data-metric="lcp"]');
  const clsValue = shadow.querySelector<HTMLElement>('[data-field="cls"]');
  const lcpValue = shadow.querySelector<HTMLElement>('[data-field="lcp"]');
  const longValue = shadow.querySelector<HTMLElement>('[data-field="long"]');
  const jankValue = shadow.querySelector<HTMLElement>('[data-field="jank"]');
  const slowValue = shadow.querySelector<HTMLElement>('[data-field="slow"]');
  const scrollValue = shadow.querySelector<HTMLElement>('[data-field="scroll"]');
  if (
    !panel || !log || !pauseButton || !copyButton || !collapseButton ||
    !clsChip || !lcpChip || !clsValue || !lcpValue || !longValue || !jankValue || !slowValue || !scrollValue
  ) return;

  // Plain-text summary line used only by text() — the bug-report format must stay byte-identical.
  const summaryText = (): string => [
    `CLS ${metrics.cls.toFixed(3)}`,
    `LCP ${metrics.lcp ? `${Math.round(metrics.lcp)}ms` : '-'}`,
    `long ${metrics.longTasks}`,
    `jank ${metrics.droppedFrames}/${Math.round(metrics.largestFrameGap)}ms`,
    `slow ${metrics.slowResources}`,
    `scroll ${metrics.scrollCalls}`,
  ].join(' · ');

  const text = (): string => {
    const viewport = window.visualViewport;
    const header = [
      '[PERF-AUDIT v1]',
      `page=${window.location.pathname}`,
      `viewport=${number(window.innerWidth, 0)}x${number(window.innerHeight, 0)} visual=${number(viewport?.width ?? window.innerWidth, 0)}x${number(viewport?.height ?? window.innerHeight, 0)}@${number(viewport?.offsetTop ?? 0, 0)}`,
      `ua=${navigator.userAgent}`,
      `summary=${summaryText()}`,
    ];
    return [...header, ...records.map((record) => `${number(record.at, 0)}ms [${record.kind}] ${record.message}`)].join('\n');
  };

  // Updates the chip row in the bar; independent of summaryText() above.
  const updateSummary = (): void => {
    clsValue.textContent = metrics.cls.toFixed(3);
    clsChip.dataset.tone = clsTone(metrics.cls);
    lcpValue.textContent = metrics.lcp ? `${Math.round(metrics.lcp)}ms` : '-';
    const tone = lcpTone(metrics.lcp);
    if (tone) lcpChip.dataset.tone = tone;
    else delete lcpChip.dataset.tone;
    longValue.textContent = String(metrics.longTasks);
    jankValue.textContent = `${metrics.droppedFrames}/${Math.round(metrics.largestFrameGap)}ms`;
    slowValue.textContent = String(metrics.slowResources);
    scrollValue.textContent = String(metrics.scrollCalls);
  };

  const render = (): void => {
    renderFrame = 0;
    updateSummary();
    const fragment = document.createDocumentFragment();
    for (const item of records.slice(-MAX_VISIBLE_RECORDS)) {
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.category = KIND_CATEGORY[item.kind] ?? 'quiet';
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = item.kind;
      const time = document.createElement('span');
      time.className = 'time';
      time.textContent = `${number(item.at, 0)}ms`;
      const msg = document.createElement('span');
      msg.className = 'msg';
      msg.textContent = item.message;
      row.append(badge, time, msg);
      fragment.appendChild(row);
    }
    log.replaceChildren(fragment);
    log.scrollTop = log.scrollHeight;
  };

  const scheduleRender = (): void => {
    if (!renderFrame) renderFrame = window.requestAnimationFrame(render);
  };

  const record = (kind: string, message: string): void => {
    if (paused) return;
    records.push({ at: performance.now() - startedAt, kind, message });
    if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
    scheduleRender();
  };

  window.__BUXX_PERF_DEBUG__ = {
    snapshot: () => ({ metrics: { ...metrics }, records: records.map((item) => ({ ...item })) }),
    text,
  };

  pauseButton.addEventListener('click', () => {
    paused = !paused;
    pauseButton.textContent = paused ? 'Resume' : 'Pause';
    pauseButton.setAttribute('aria-pressed', String(paused));
    if (!paused) record('panel', 'recording resumed');
  });
  shadow.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
    records.length = 0;
    record('panel', 'log cleared');
  });
  collapseButton.addEventListener('click', () => {
    collapsed = !collapsed;
    panel.classList.toggle('collapsed', collapsed);
    collapseButton.textContent = collapsed ? '+' : '−';
  });
  copyButton.addEventListener('click', async () => {
    const output = text();
    try {
      await navigator.clipboard.writeText(output);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = output;
      textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    copyButton.textContent = 'Copied';
    window.setTimeout(() => { copyButton.textContent = 'Copy'; }, 1200);
  });

  const observe = (type: string, callback: (entry: PerformanceEntry) => void): void => {
    if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes(type)) return;
    try {
      const observer = new PerformanceObserver((list) => list.getEntries().forEach(callback));
      observer.observe({ type, buffered: true });
    } catch {
      record('support', `${type} observer unavailable`);
    }
  };

  observe('layout-shift', (entry) => {
    const shift = entry as PerformanceEntry & {
      hadRecentInput?: boolean;
      sources?: Array<{ currentRect?: DOMRectReadOnly; node?: Node; previousRect?: DOMRectReadOnly }>;
      value?: number;
    };
    if (shift.hadRecentInput) return;
    const value = shift.value ?? 0;
    metrics.cls += value;
    const sources = (shift.sources ?? []).slice(0, 4).map((source) => {
      const dy = (source.currentRect?.top ?? 0) - (source.previousRect?.top ?? 0);
      return `${nodeName(source.node)} Δy=${number(dy)}`;
    }).join(', ');
    record('cls', `+${value.toFixed(4)} total=${metrics.cls.toFixed(4)} ${sources}`.trim());
  });

  observe('largest-contentful-paint', (entry) => {
    metrics.lcp = entry.startTime;
    const lcp = entry as PerformanceEntry & { element?: Element; size?: number };
    record('lcp', `${number(entry.startTime, 0)}ms ${nodeName(lcp.element as Node)} size=${number(lcp.size ?? 0, 0)}`);
  });

  observe('longtask', (entry) => {
    metrics.longTasks += 1;
    record('long-task', `${number(entry.duration)}ms`);
  });

  observe('event', (entry) => {
    if (entry.duration < 40) return;
    const event = entry as PerformanceEntry & { interactionId?: number; name: string };
    record('interaction', `${event.name} ${number(event.duration)}ms id=${event.interactionId ?? 0}`);
  });

  observe('resource', (entry) => {
    const resource = entry as PerformanceResourceTiming;
    if (resource.duration < SLOW_RESOURCE_MS) return;
    metrics.slowResources += 1;
    record('resource', `${resourceName(resource.name)} ${number(resource.duration, 0)}ms transfer=${resource.transferSize || 0}`);
  });

  observe('navigation', (entry) => {
    const nav = entry as PerformanceNavigationTiming;
    record('navigation', `TTFB=${number(nav.responseStart)}ms DOM=${number(nav.domContentLoadedEventEnd)}ms load=${number(nav.loadEventEnd)}ms`);
  });

  const scroller = document.querySelector<HTMLElement>('[data-page-scroller]') ?? document.documentElement;
  let lastScrollTop = scroller.scrollTop;
  let scrollSampleFrame = 0;
  scroller.addEventListener('scroll', () => {
    if (scrollSampleFrame) return;
    scrollSampleFrame = window.requestAnimationFrame(() => {
      scrollSampleFrame = 0;
      const next = scroller.scrollTop;
      const delta = next - lastScrollTop;
      lastScrollTop = next;
      record('scroll', `top=${number(next)} Δ=${number(delta)}`);
    });
  }, { passive: true });

  const originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function debugScrollIntoView(...args: Parameters<Element['scrollIntoView']>): void {
    metrics.scrollCalls += 1;
    record('scroll-call', `${nodeName(this)} scrollIntoView ${scrollArguments(args)}`);
    originalScrollIntoView.apply(this, args);
  };

  for (const method of ['scrollBy', 'scrollTo'] as const) {
    const original = HTMLElement.prototype[method];
    const invoke = original as (this: HTMLElement, ...args: unknown[]) => void;
    HTMLElement.prototype[method] = function debugElementScroll(this: HTMLElement, ...args: unknown[]): void {
      metrics.scrollCalls += 1;
      record('scroll-call', `${nodeName(this)} ${method} ${scrollArguments(args)}`);
      invoke.apply(this, args);
    } as HTMLElement[typeof method];
  }

  const imageState = new WeakMap<HTMLImageElement, { frameHeight: number; started: number }>();
  const observeImage = (image: HTMLImageElement): void => {
    if (imageState.has(image)) return;
    const frame = image.closest<HTMLElement>('[data-mood-image-frame], .mood-image-frame') ?? image;
    imageState.set(image, { frameHeight: frame.getBoundingClientRect().height, started: performance.now() });
    const missingDimensions = !image.width || !image.height;
    if (missingDimensions && !image.classList.contains('mood-image-blur')) {
      record('image-warning', `${nodeName(image)} missing width/height src=${resourceName(image.currentSrc || image.src)}`);
    }
    const finish = (status: 'load' | 'error'): void => {
      const state = imageState.get(image);
      const nextHeight = frame.getBoundingClientRect().height;
      const elapsed = state ? performance.now() - state.started : 0;
      record('image', `${status} ${resourceName(image.currentSrc || image.src)} ${image.naturalWidth}x${image.naturalHeight} ${number(elapsed, 0)}ms frame=${number(state?.frameHeight)}→${number(nextHeight)}`);
    };
    if (image.complete) {
      finish(image.naturalWidth > 0 ? 'load' : 'error');
    } else {
      image.addEventListener('load', () => finish('load'), { once: true });
      image.addEventListener('error', () => finish('error'), { once: true });
    }
  };
  document.querySelectorAll<HTMLImageElement>('img').forEach(observeImage);

  const imageObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node instanceof HTMLImageElement) observeImage(node);
      node.querySelectorAll<HTMLImageElement>('img').forEach(observeImage);
    }));
  });
  imageObserver.observe(document.documentElement, { childList: true, subtree: true });

  const measured = new WeakMap<HTMLElement, { height: number; width: number }>();
  const resizeTargets = [
    ...document.querySelectorAll<HTMLElement>('[data-mood-id], [data-mood-image-frame], main, article'),
  ];
  const resizeObserver = new ResizeObserver((entries) => entries.forEach((entry) => {
    const target = entry.target as HTMLElement;
    const rect = target.getBoundingClientRect();
    const previous = measured.get(target);
    measured.set(target, { width: rect.width, height: rect.height });
    if (!previous) return;
    const dw = rect.width - previous.width;
    const dh = rect.height - previous.height;
    if (Math.abs(dw) > 0.5 || Math.abs(dh) > 0.5) {
      record('resize', `${nodeName(target)} ${number(previous.width)}x${number(previous.height)}→${number(rect.width)}x${number(rect.height)} Δ=${number(dw)}x${number(dh)}`);
    }
  }));
  const observeResizeTarget = (target: HTMLElement): void => {
    if (measured.has(target)) return;
    const rect = target.getBoundingClientRect();
    measured.set(target, { width: rect.width, height: rect.height });
    resizeObserver.observe(target);
  };
  resizeTargets.forEach(observeResizeTarget);
  const resizeTargetObserver = new MutationObserver((mutations) => mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.matches('[data-mood-id], [data-mood-image-frame], main, article')) observeResizeTarget(node);
      node.querySelectorAll<HTMLElement>('[data-mood-id], [data-mood-image-frame], main, article')
        .forEach(observeResizeTarget);
    });
  }));
  resizeTargetObserver.observe(document.documentElement, { childList: true, subtree: true });

  const viewport = window.visualViewport;
  const reportViewport = (kind: string): void => {
    record('viewport', `${kind} layout=${window.innerWidth}x${window.innerHeight} visual=${number(viewport?.width ?? window.innerWidth)}x${number(viewport?.height ?? window.innerHeight)}@${number(viewport?.offsetTop ?? 0)}`);
  };
  viewport?.addEventListener('resize', () => reportViewport('resize'), { passive: true });
  viewport?.addEventListener('scroll', () => reportViewport('scroll'), { passive: true });
  window.addEventListener('orientationchange', () => reportViewport('orientation'), { passive: true });

  let previousFrame = performance.now();
  const sampleFrames = (now: number): void => {
    const gap = now - previousFrame;
    previousFrame = now;
    if (!document.hidden && gap > JANK_FRAME_MS) {
      metrics.droppedFrames += Math.max(1, Math.round(gap / 16.67) - 1);
      metrics.largestFrameGap = Math.max(metrics.largestFrameGap, gap);
      record('frame-gap', `${number(gap)}ms`);
    }
    window.requestAnimationFrame(sampleFrames);
  };
  window.requestAnimationFrame(sampleFrames);

  document.fonts?.ready
    .then(() => record('font', `ready at ${number(performance.now() - startedAt, 0)}ms`))
    .catch(() => record('font', 'ready rejected'));
  window.addEventListener('error', (event) => {
    const target = event.target;
    if (target instanceof HTMLImageElement) return;
    record('error', errorMessage(event.message) || nodeName(target as Node));
  }, true);
  window.addEventListener('unhandledrejection', () => record('error', 'unhandled promise rejection'));

  record('panel', 'performance diagnostics started');
  reportViewport('initial');
}
