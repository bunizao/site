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
  fcp: number;
  inp: number;
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

// How long a self-caused panel resize (see isPanelInducedSource below) stays
// eligible to be matched against an incoming layout-shift entry. Delivery of
// layout-shift entries typically trails the DOM mutation that caused them by
// well under 100ms; this window is generous padding, not a tuned deadline.
const SELF_SHIFT_WINDOW_MS = 1000;
// Chrome's null-node fallback rect for a shift inside the shadow root does
// not match getBoundingClientRect()'s layout (border) box — it tracks the
// panel's *painted* ink-overflow box instead, which is larger. Measured
// empirically at ~42px beyond the layout box, which lines up with the
// panel's own `backdrop-filter: blur(14px)` (ink overflow extends roughly 3x
// the blur radius per the CSS Filter Effects spec) plus its `box-shadow`
// blur. This epsilon absorbs that halo when checking whether a source rect
// falls inside the panel's own recently-measured screen area.
const SELF_SHIFT_CONTAINMENT_EPS = 56;

// Flash threshold and cap for the CLS source overlay (feature 3).
const CLS_OVERLAY_MIN_VALUE = 0.0005;
const CLS_OVERLAY_MAX_BOXES = 6;
const CLS_OVERLAY_FADE_MS = 700;

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
  fcp: 'measure',
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
  mark: 'quiet',
};

// Which record kinds a metric chip filters the log to when toggled active.
// FCP and LCP intentionally share one bucket: FCP itself only ever produces a
// single log line, so its chip surfaces the paint/navigation timeline around
// it instead of just that one line.
const CHIP_FILTER_KINDS: Record<string, string[]> = {
  cls: ['cls'],
  fcp: ['lcp', 'navigation'],
  lcp: ['lcp', 'navigation'],
  inp: ['interaction'],
  long: ['long-task', 'frame-gap'],
  jank: ['frame-gap', 'long-task'],
  slow: ['resource'],
  scroll: ['scroll', 'scroll-call'],
};

const MILESTONE_ORDER = ['ttfb', 'fcp', 'lcp', 'dcl', 'load'] as const;
const MILESTONE_LABEL: Record<(typeof MILESTONE_ORDER)[number], string> = {
  ttfb: 'TTFB',
  fcp: 'FCP',
  lcp: 'LCP',
  dcl: 'DCL',
  load: 'load',
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
// Unlike the timing metrics below, 0 is a genuinely good CLS score, not "hasn't fired yet".
function clsTone(value: number): 'good' | 'warn' | 'bad' {
  if (value <= 0.1) return 'good';
  if (value <= 0.25) return 'warn';
  return 'bad';
}

// FCP/LCP/INP thresholds follow web-vitals. 0 means the metric has not fired
// yet, so it deliberately renders as no tone rather than "good".
function timingTone(value: number, good: number, warn: number): 'good' | 'warn' | 'bad' | '' {
  if (!value) return '';
  if (value <= good) return 'good';
  if (value <= warn) return 'warn';
  return 'bad';
}
const fcpTone = (value: number) => timingTone(value, 1800, 3000);
const lcpTone = (value: number) => timingTone(value, 2500, 4000);
const inpTone = (value: number) => timingTone(value, 200, 500);

type ShiftSource = { node?: Node | null; previousRect?: DOMRectReadOnly; currentRect?: DOMRectReadOnly };
type RectLike = { x: number; y: number; width: number; height: number };

const toRectLike = (r: DOMRectReadOnly): RectLike => ({ x: r.x, y: r.y, width: r.width, height: r.height });

// True when `inner` fits inside `outer` grown by `eps` pixels on every edge.
function containsRect(outer: RectLike, inner: RectLike, eps: number): boolean {
  return inner.x >= outer.x - eps &&
    inner.y >= outer.y - eps &&
    inner.x + inner.width <= outer.x + outer.width + eps &&
    inner.y + inner.height <= outer.y + outer.height + eps;
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
    fcp: 0,
    inp: 0,
  };
  let paused = false;
  let collapsed = false;
  let renderFrame = 0;
  let markCount = 0;
  const activeChips = new Set<string>();
  const milestoneTimes = new Map<(typeof MILESTONE_ORDER)[number], number>();
  // Rolling union of the panel's own bounding box across recent renders, so a
  // layout-shift entry that turns out to be the panel resizing/reflowing
  // itself can be told apart from a genuine page shift. See
  // isPanelInducedSource — a single before/after pair per render is not
  // enough because the browser can deliver one shift entry that spans a
  // handful of back-to-back render() calls (rAF ticks firing faster than
  // paint during the initial burst), so the comparison rect needs to cover
  // the whole recent sweep, not just the immediately preceding sample.
  let selfShiftEnvelope: { x: number; y: number; right: number; bottom: number; at: number } | null = null;
  const extendSelfShiftEnvelope = (rect: RectLike, at: number): void => {
    if (!selfShiftEnvelope || at - selfShiftEnvelope.at > SELF_SHIFT_WINDOW_MS) {
      selfShiftEnvelope = { x: rect.x, y: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height, at };
      return;
    }
    selfShiftEnvelope.x = Math.min(selfShiftEnvelope.x, rect.x);
    selfShiftEnvelope.y = Math.min(selfShiftEnvelope.y, rect.y);
    selfShiftEnvelope.right = Math.max(selfShiftEnvelope.right, rect.x + rect.width);
    selfShiftEnvelope.bottom = Math.max(selfShiftEnvelope.bottom, rect.y + rect.height);
    selfShiftEnvelope.at = at;
  };

  const host = document.createElement('aside');
  host.dataset.performanceDebug = '';
  host.setAttribute('aria-label', 'Performance diagnostics');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .panel {
        position: fixed; left: 8px; right: 8px; bottom: calc(8px + env(safe-area-inset-bottom, 0px));
        z-index: 2147483647; overflow: hidden;
        border: 1px solid hsl(var(--foreground, 0 0% 100%) / 0.1);
        border-radius: var(--radius-md, 0.75rem);
        background: hsl(var(--background, 0 0% 4%) / 0.86);
        backdrop-filter: blur(14px) saturate(140%);
        -webkit-backdrop-filter: blur(14px) saturate(140%);
        color: hsl(var(--foreground, 0 0% 100%) / 0.9);
        box-shadow: 0 8px 28px hsl(var(--background, 0 0% 4%) / 0.35);
        font: 11px/1.4 var(--font-code, 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
        font-variant-numeric: tabular-nums;
      }
      .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 6px 8px; border-bottom: 1px solid hsl(var(--foreground, 0 0% 100%) / 0.1); }
      .title { font-family: var(--font-mono, 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); color: hsl(var(--foreground, 0 0% 100%) / 1); font-weight: 600; white-space: nowrap; letter-spacing: .01em; }
      .summary { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; min-width: 0; flex: 1; }
      .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }

      button {
        appearance: none; min-height: 40px; min-width: 40px; padding: 4px 10px;
        border: 1px solid hsl(var(--foreground, 0 0% 100%) / 0.14);
        border-radius: var(--radius-sm, 0.5rem);
        background: hsl(var(--foreground, 0 0% 100%) / 0.03);
        color: hsl(var(--foreground, 0 0% 100%) / 0.82);
        font: inherit; font-weight: 600; cursor: pointer;
        transition: background-color var(--dur-fast, 130ms) var(--ease, cubic-bezier(0.2, 0, 0, 1)),
                    border-color var(--dur-fast, 130ms) var(--ease, cubic-bezier(0.2, 0, 0, 1));
      }
      button:hover { background: hsl(var(--foreground, 0 0% 100%) / 0.07); border-color: hsl(var(--foreground, 0 0% 100%) / 0.22); }
      button:active { background: hsl(var(--foreground, 0 0% 100%) / 0.1); }
      button:focus-visible { outline: 2px solid hsl(var(--foreground, 0 0% 100%) / 0.5); outline-offset: 1px; }
      button[aria-pressed="true"] { background: hsl(var(--foreground, 0 0% 100%) / 0.14); border-color: hsl(var(--foreground, 0 0% 100%) / 0.32); color: hsl(var(--foreground, 0 0% 100%) / 1); }

      .chip { display: inline-flex; align-items: baseline; gap: 4px; padding: 4px 8px; font-weight: 500; }
      .chip-label { color: hsl(var(--foreground, 0 0% 100%) / 0.45); font-size: 9.5px; text-transform: uppercase; letter-spacing: .03em; }
      .chip-value { color: hsl(var(--foreground, 0 0% 100%) / 0.82); font-weight: 600; }
      .chip[data-tone="warn"] .chip-value { color: hsl(38 65% 52%); }
      .chip[data-tone="bad"] .chip-value { color: hsl(var(--destructive, 0 62% 30%)); }

      .milestones { position: relative; height: 22px; padding: 0 12px; border-bottom: 1px solid hsl(var(--foreground, 0 0% 100%) / 0.08); }
      .milestones[hidden] { display: none; }
      .milestone-track { position: absolute; left: 12px; right: 12px; top: 50%; height: 1px; background: hsl(var(--foreground, 0 0% 100%) / 0.14); }
      .milestone-point { position: absolute; top: 50%; display: flex; align-items: center; gap: 3px; transform: translate(-50%, -50%); white-space: nowrap; }
      .milestone-dot { width: 4px; height: 4px; border-radius: 50%; background: hsl(var(--foreground, 0 0% 100%) / 0.55); flex: none; }
      .milestone-label { font-family: var(--font-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); font-size: 9px; color: hsl(var(--foreground, 0 0% 100%) / 0.5); }

      .log { max-height: min(38vh, 300px); margin: 0; padding: 4px 4px 8px; overflow: auto; overflow-wrap: anywhere; user-select: text; -webkit-overflow-scrolling: touch; }
      .row { display: flex; align-items: flex-start; gap: 8px; padding: 2px 8px; border-left: 2px solid transparent; }
      .row[data-category="critical"] { border-left-color: hsl(var(--destructive, 0 62% 30%)); }
      .row[data-category="critical"] .badge, .row[data-category="critical"] .msg { color: hsl(var(--destructive, 0 62% 30%)); }
      .row[data-category="warning"] { border-left-color: hsl(38 65% 52% / 0.7); }
      .row[data-category="warning"] .badge { color: hsl(38 65% 52%); }
      .row[data-category="measure"] { border-left-color: hsl(210 45% 58% / 0.6); }
      .row[data-category="measure"] .badge { color: hsl(210 45% 62%); }
      .row[data-category="layout"] { border-left-color: hsl(var(--foreground, 0 0% 100%) / 0.3); }
      .row[data-category="layout"] .badge { color: hsl(var(--foreground, 0 0% 100%) / 0.6); }
      .row[data-category="quiet"] .badge { color: hsl(var(--foreground, 0 0% 100%) / 0.4); }
      .row[data-category="quiet"] .msg { color: hsl(var(--foreground, 0 0% 100%) / 0.5); }
      .badge { flex: 0 0 84px; overflow: hidden; color: hsl(var(--foreground, 0 0% 100%) / 0.45); font-size: 9px; font-weight: 700; text-overflow: ellipsis; text-transform: uppercase; letter-spacing: .02em; white-space: nowrap; }
      .time { flex: 0 0 56px; color: hsl(var(--foreground, 0 0% 100%) / 0.4); text-align: right; }
      .msg { flex: 1 1 auto; min-width: 0; color: hsl(var(--foreground, 0 0% 100%) / 0.72); white-space: pre-wrap; overflow-wrap: anywhere; }

      .row-mark { align-items: center; gap: 8px; padding: 6px 8px; }
      .mark-rule { flex: 1 1 auto; height: 0; border-top: 1px solid hsl(var(--foreground, 0 0% 100%) / 0.2); }
      .mark-label { flex: none; color: hsl(var(--foreground, 0 0% 100%) / 1); font-weight: 600; font-size: 10px; letter-spacing: .02em; }

      .panel.collapsed .log, .panel.collapsed .milestones { display: none; }
      .panel.collapsed .bar { border-bottom: 0; }

      .shift-layer { position: fixed; inset: 0; z-index: 2147483646; pointer-events: none; overflow: hidden; }
      .shift-box {
        position: fixed; outline: 1.5px solid hsl(var(--destructive, 0 62% 30%));
        background: hsl(var(--destructive, 0 62% 30%) / 0.14); border-radius: 2px;
        opacity: 1; transition: opacity ${CLS_OVERLAY_FADE_MS}ms var(--ease, cubic-bezier(0.2, 0, 0, 1));
      }

      @media (max-width: 560px) {
        .title { display: none; }
        .summary { flex-basis: 100%; }
        .actions { flex-basis: 100%; justify-content: flex-end; }
        .chip-label { font-size: 9px; }
        button { padding-inline: 8px; }
        .badge { flex-basis: 70px; font-size: 8.5px; }
        .time { flex-basis: 48px; }
      }
    </style>
    <div class="shift-layer" aria-hidden="true"></div>
    <section class="panel">
      <div class="bar">
        <span class="title">Perf audit</span>
        <div class="summary" aria-label="Metrics summary — click a metric to filter the log">
          <button type="button" class="chip" data-chip="cls" aria-pressed="false"><span class="chip-label">CLS</span><span class="chip-value" data-field="cls"></span></button>
          <button type="button" class="chip" data-chip="fcp" aria-pressed="false"><span class="chip-label">FCP</span><span class="chip-value" data-field="fcp"></span></button>
          <button type="button" class="chip" data-chip="lcp" aria-pressed="false"><span class="chip-label">LCP</span><span class="chip-value" data-field="lcp"></span></button>
          <button type="button" class="chip" data-chip="inp" aria-pressed="false"><span class="chip-label">INP</span><span class="chip-value" data-field="inp"></span></button>
          <button type="button" class="chip" data-chip="long" aria-pressed="false"><span class="chip-label">long</span><span class="chip-value" data-field="long"></span></button>
          <button type="button" class="chip" data-chip="jank" aria-pressed="false"><span class="chip-label">jank</span><span class="chip-value" data-field="jank"></span></button>
          <button type="button" class="chip" data-chip="slow" aria-pressed="false"><span class="chip-label">slow</span><span class="chip-value" data-field="slow"></span></button>
          <button type="button" class="chip" data-chip="scroll" aria-pressed="false"><span class="chip-label">scroll</span><span class="chip-value" data-field="scroll"></span></button>
        </div>
        <div class="actions">
          <button type="button" data-action="mark">Mark</button>
          <button type="button" data-action="pause" aria-pressed="false">Pause</button>
          <button type="button" data-action="clear">Clear</button>
          <button type="button" data-action="copy">Copy</button>
          <button type="button" data-action="collapse" aria-label="Collapse panel">−</button>
        </div>
      </div>
      <div class="milestones" aria-hidden="true" hidden></div>
      <div class="log" role="log" aria-live="polite"></div>
    </section>
  `;
  document.body.appendChild(host);

  const panel = shadow.querySelector<HTMLElement>('.panel');
  const shiftLayer = shadow.querySelector<HTMLElement>('.shift-layer');
  const milestonesEl = shadow.querySelector<HTMLElement>('.milestones');
  const log = shadow.querySelector<HTMLElement>('.log');
  const pauseButton = shadow.querySelector<HTMLButtonElement>('[data-action="pause"]');
  const markButton = shadow.querySelector<HTMLButtonElement>('[data-action="mark"]');
  const copyButton = shadow.querySelector<HTMLButtonElement>('[data-action="copy"]');
  const collapseButton = shadow.querySelector<HTMLButtonElement>('[data-action="collapse"]');
  const clsChip = shadow.querySelector<HTMLElement>('[data-chip="cls"]');
  const fcpChip = shadow.querySelector<HTMLElement>('[data-chip="fcp"]');
  const lcpChip = shadow.querySelector<HTMLElement>('[data-chip="lcp"]');
  const inpChip = shadow.querySelector<HTMLElement>('[data-chip="inp"]');
  const clsValue = shadow.querySelector<HTMLElement>('[data-field="cls"]');
  const fcpValue = shadow.querySelector<HTMLElement>('[data-field="fcp"]');
  const lcpValue = shadow.querySelector<HTMLElement>('[data-field="lcp"]');
  const inpValue = shadow.querySelector<HTMLElement>('[data-field="inp"]');
  const longValue = shadow.querySelector<HTMLElement>('[data-field="long"]');
  const jankValue = shadow.querySelector<HTMLElement>('[data-field="jank"]');
  const slowValue = shadow.querySelector<HTMLElement>('[data-field="slow"]');
  const scrollValue = shadow.querySelector<HTMLElement>('[data-field="scroll"]');
  const chipButtons = Array.from(shadow.querySelectorAll<HTMLButtonElement>('.chip[data-chip]'));
  if (
    !panel || !shiftLayer || !milestonesEl || !log || !pauseButton || !markButton || !copyButton || !collapseButton ||
    !clsChip || !fcpChip || !lcpChip || !inpChip ||
    !clsValue || !fcpValue || !lcpValue || !inpValue || !longValue || !jankValue || !slowValue || !scrollValue
  ) return;

  // Plain-text summary line used only by text() — the bug-report format must stay byte-identical.
  const summaryText = (): string => [
    `CLS ${metrics.cls.toFixed(3)}`,
    `FCP ${metrics.fcp ? `${Math.round(metrics.fcp)}ms` : '-'}`,
    `LCP ${metrics.lcp ? `${Math.round(metrics.lcp)}ms` : '-'}`,
    `INP ${metrics.inp ? `${Math.round(metrics.inp)}ms` : '-'}`,
    `long ${metrics.longTasks}`,
    `jank ${metrics.droppedFrames}/${Math.round(metrics.largestFrameGap)}ms`,
    `slow ${metrics.slowResources}`,
    `scroll ${metrics.scrollCalls}`,
  ].join(' · ');

  const text = (): string => {
    const viewport = window.visualViewport;
    const header = [
      '[PERF-AUDIT v2]',
      `page=${window.location.pathname}`,
      `viewport=${number(window.innerWidth, 0)}x${number(window.innerHeight, 0)} visual=${number(viewport?.width ?? window.innerWidth, 0)}x${number(viewport?.height ?? window.innerHeight, 0)}@${number(viewport?.offsetTop ?? 0, 0)}`,
      `ua=${navigator.userAgent}`,
      `summary=${summaryText()}`,
    ];
    return [...header, ...records.map((record) => `${number(record.at, 0)}ms [${record.kind}] ${record.message}`)].join('\n');
  };

  const applyTone = (el: HTMLElement, tone: 'good' | 'warn' | 'bad' | ''): void => {
    if (tone === 'warn' || tone === 'bad') el.dataset.tone = tone;
    else delete el.dataset.tone;
  };

  // Updates the chip row in the bar; independent of summaryText() above.
  const updateSummary = (): void => {
    clsValue.textContent = metrics.cls.toFixed(3);
    applyTone(clsChip, clsTone(metrics.cls));
    fcpValue.textContent = metrics.fcp ? `${Math.round(metrics.fcp)}ms` : '-';
    applyTone(fcpChip, fcpTone(metrics.fcp));
    lcpValue.textContent = metrics.lcp ? `${Math.round(metrics.lcp)}ms` : '-';
    applyTone(lcpChip, lcpTone(metrics.lcp));
    inpValue.textContent = metrics.inp ? `${Math.round(metrics.inp)}ms` : '-';
    applyTone(inpChip, inpTone(metrics.inp));
    longValue.textContent = String(metrics.longTasks);
    jankValue.textContent = `${metrics.droppedFrames}/${Math.round(metrics.largestFrameGap)}ms`;
    slowValue.textContent = String(metrics.slowResources);
    scrollValue.textContent = String(metrics.scrollCalls);
  };

  // Paint chain strip: TTFB/FCP/LCP/DCL/load plotted proportionally on a thin
  // track. Milestones that have not fired yet are simply not in the map.
  // Milestones landing close together on screen (FCP and LCP are frequently
  // within a few ms of each other) are merged into one labeled point instead
  // of overlapping into unreadable text.
  const MILESTONE_MERGE_PX = 44;
  const renderMilestones = (): void => {
    const present = MILESTONE_ORDER.filter((key) => milestoneTimes.has(key));
    milestonesEl.replaceChildren();
    if (present.length === 0) {
      milestonesEl.hidden = true;
      return;
    }
    milestonesEl.hidden = false;
    const max = Math.max(...present.map((key) => milestoneTimes.get(key) ?? 0));
    const track = document.createElement('div');
    track.className = 'milestone-track';
    milestonesEl.appendChild(track);

    const trackWidth = Math.max(1, milestonesEl.clientWidth - 24);
    type Group = { keys: (typeof MILESTONE_ORDER)[number][]; at: number; pct: number };
    const groups: Group[] = [];
    for (const key of present) {
      const at = milestoneTimes.get(key) ?? 0;
      const pct = max > 0 ? Math.min(100, (at / max) * 100) : 0;
      const px = (pct / 100) * trackWidth;
      const last = groups[groups.length - 1];
      if (last && Math.abs((last.pct / 100) * trackWidth - px) < MILESTONE_MERGE_PX) {
        last.keys.push(key);
        last.at = at;
        last.pct = pct;
      } else {
        groups.push({ keys: [key], at, pct });
      }
    }

    for (const group of groups) {
      const point = document.createElement('div');
      point.className = 'milestone-point';
      point.style.left = `${group.pct}%`;
      const dot = document.createElement('span');
      dot.className = 'milestone-dot';
      const label = document.createElement('span');
      label.className = 'milestone-label';
      label.textContent = `${group.keys.map((key) => MILESTONE_LABEL[key]).join('/')} ${number(group.at, 0)}ms`;
      point.append(dot, label);
      milestonesEl.appendChild(point);
    }
  };

  const render = (): void => {
    renderFrame = 0;
    // Measure the panel's own box before and after mutating it, so a
    // resulting layout-shift entry that matches this exact delta can be
    // recognized as self-caused rather than a genuine page shift. See
    // isPanelInducedSource for why this is necessary.
    const beforeRect = panel.getBoundingClientRect();

    updateSummary();
    renderMilestones();

    const allowedKinds = activeChips.size
      ? new Set(Array.from(activeChips).flatMap((name) => CHIP_FILTER_KINDS[name] ?? []))
      : null;
    // Marks always render — they segment the log and stay visible even under an active filter.
    const filtered = allowedKinds
      ? records.filter((item) => item.kind === 'mark' || allowedKinds.has(item.kind))
      : records;

    const fragment = document.createDocumentFragment();
    for (const item of filtered.slice(-MAX_VISIBLE_RECORDS)) {
      const row = document.createElement('div');
      if (item.kind === 'mark') {
        row.className = 'row row-mark';
        const ruleLeft = document.createElement('span');
        ruleLeft.className = 'mark-rule';
        const label = document.createElement('span');
        label.className = 'mark-label';
        label.textContent = `${item.message} · ${number(item.at, 0)}ms`;
        const ruleRight = document.createElement('span');
        ruleRight.className = 'mark-rule';
        row.append(ruleLeft, label, ruleRight);
      } else {
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
      }
      fragment.appendChild(row);
    }
    log.replaceChildren(fragment);
    log.scrollTop = log.scrollHeight;

    const afterRect = panel.getBoundingClientRect();
    const now = performance.now();
    extendSelfShiftEnvelope(toRectLike(beforeRect), now);
    extendSelfShiftEnvelope(toRectLike(afterRect), now);
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
  markButton.addEventListener('click', () => {
    markCount += 1;
    record('mark', `#${markCount}`);
  });
  chipButtons.forEach((chip) => {
    chip.addEventListener('click', () => {
      const name = chip.dataset.chip ?? '';
      if (activeChips.has(name)) activeChips.delete(name);
      else activeChips.add(name);
      chip.setAttribute('aria-pressed', String(activeChips.has(name)));
      scheduleRender();
    });
  });

  const observe = (
    type: string,
    callback: (entry: PerformanceEntry) => void,
    extra?: Record<string, unknown>,
  ): void => {
    if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes(type)) return;
    try {
      const observer = new PerformanceObserver((list) => list.getEntries().forEach(callback));
      observer.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
    } catch {
      record('support', `${type} observer unavailable`);
    }
  };

  // --- Self-induced CLS exclusion -------------------------------------------------
  //
  // Root cause: the panel is a bottom-anchored `position: fixed` box that
  // grows as the log/milestone strip fill in during the first render bursts,
  // and its chips reflow horizontally as metric text changes width. Resizing
  // or repositioning an already-painted box IS a real layout shift by the
  // Layout Instability spec (only brand-new elements are exempt), so Chrome
  // reports it. Because the shifted content lives inside our shadow root,
  // `source.node` always comes back null — shadow-tree nodes are never
  // exposed to the Layout Instability API, open or closed — but the reported
  // rects still describe real screen geometry. For the panel's own outer box
  // specifically, Chrome's null-node fallback rect is not our exact inset box
  // (left/right: 8px) but the fixed element's containing block (the
  // viewport), offset by that same 8px on every edge — everything else
  // (chips, log rows) reports accurate rects. Either way, a self-caused
  // source always falls inside the panel's own recently-measured screen area
  // (see SELF_SHIFT_CONTAINMENT_EPS), which a genuine page shift essentially
  // can't produce by coincidence — our panel occupies a small, fixed strip
  // nothing else on the page shares. We only exclude entries whose sources
  // are *all* panel-contained; anything else is kept.
  const isPanelInducedSource = (source: ShiftSource): boolean => {
    if (source.node) return source.node === host || shadow.contains(source.node);
    const prev = source.previousRect;
    const cur = source.currentRect;
    if (!prev || !cur) return false;
    if (!selfShiftEnvelope) return false;
    const now = performance.now();
    if (now - selfShiftEnvelope.at > SELF_SHIFT_WINDOW_MS) return false;
    const envelope: RectLike = {
      x: selfShiftEnvelope.x,
      y: selfShiftEnvelope.y,
      width: selfShiftEnvelope.right - selfShiftEnvelope.x,
      height: selfShiftEnvelope.bottom - selfShiftEnvelope.y,
    };
    return containsRect(envelope, toRectLike(prev), SELF_SHIFT_CONTAINMENT_EPS) &&
      containsRect(envelope, toRectLike(cur), SELF_SHIFT_CONTAINMENT_EPS);
  };
  const isPanelInducedShift = (sources: ShiftSource[]): boolean =>
    sources.length > 0 && sources.every(isPanelInducedSource);

  // CLS source overlay (feature 3): flashes outline boxes over real shift sources.
  const flashShiftBoxes = (sources: ShiftSource[]): void => {
    sources.slice(0, CLS_OVERLAY_MAX_BOXES).forEach((source) => {
      const rect = source.currentRect;
      if (!rect || (rect.width <= 0 && rect.height <= 0)) return;
      const box = document.createElement('div');
      box.className = 'shift-box';
      box.style.left = `${rect.x}px`;
      box.style.top = `${rect.y}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      shiftLayer.appendChild(box);
      // Double rAF guarantees the browser paints the full-opacity box on one
      // frame before the transition to 0 starts on the next.
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => { box.style.opacity = '0'; }));
      window.setTimeout(() => box.remove(), CLS_OVERLAY_FADE_MS + 40);
    });
  };

  observe('layout-shift', (entry) => {
    const shift = entry as PerformanceEntry & {
      hadRecentInput?: boolean;
      sources?: ShiftSource[];
      value?: number;
    };
    if (shift.hadRecentInput) return;
    const sources = shift.sources ?? [];
    if (isPanelInducedShift(sources)) return;
    const value = shift.value ?? 0;
    metrics.cls += value;
    const sourceText = sources.slice(0, 4).map((source) => {
      const dy = (source.currentRect?.top ?? 0) - (source.previousRect?.top ?? 0);
      return `${nodeName(source.node)} Δy=${number(dy)}`;
    }).join(', ');
    record('cls', `+${value.toFixed(4)} total=${metrics.cls.toFixed(4)} ${sourceText}`.trim());
    if (value >= CLS_OVERLAY_MIN_VALUE) flashShiftBoxes(sources);
  });

  observe('paint', (entry) => {
    if (entry.name !== 'first-contentful-paint') return;
    metrics.fcp = entry.startTime;
    milestoneTimes.set('fcp', entry.startTime);
    record('fcp', `${number(entry.startTime, 0)}ms`);
  });

  observe('largest-contentful-paint', (entry) => {
    metrics.lcp = entry.startTime;
    milestoneTimes.set('lcp', entry.startTime);
    const lcp = entry as PerformanceEntry & { element?: Element; size?: number };
    record('lcp', `${number(entry.startTime, 0)}ms ${nodeName(lcp.element as Node)} size=${number(lcp.size ?? 0, 0)}`);
  });

  observe('longtask', (entry) => {
    metrics.longTasks += 1;
    record('long-task', `${number(entry.duration)}ms`);
  });

  // INP attribution (feature 5): worst interaction duration, with a phase
  // breakdown (inputDelay/processing/presentationDelay) when derivable.
  const recordInteraction = (entry: PerformanceEntry): void => {
    const evt = entry as PerformanceEntry & {
      duration: number;
      processingStart?: number;
      processingEnd?: number;
      target?: Node | null;
    };
    if (evt.duration < 40) return;
    metrics.inp = Math.max(metrics.inp, evt.duration);
    const target = nodeName(evt.target ?? null);
    let phases = '';
    if (typeof evt.processingStart === 'number' && typeof evt.processingEnd === 'number') {
      const inputDelay = Math.max(0, evt.processingStart - entry.startTime);
      const processing = Math.max(0, evt.processingEnd - evt.processingStart);
      const presentationDelay = Math.max(0, entry.startTime + evt.duration - evt.processingEnd);
      phases = ` inputDelay=${number(inputDelay, 0)}ms processing=${number(processing, 0)}ms presentationDelay=${number(presentationDelay, 0)}ms`;
    }
    record('interaction', `${entry.name} ${target} ${number(evt.duration, 0)}ms${phases}`);
  };
  observe('event', recordInteraction, { durationThreshold: 40 });
  observe('first-input', recordInteraction);

  observe('resource', (entry) => {
    const resource = entry as PerformanceResourceTiming;
    if (resource.duration < SLOW_RESOURCE_MS) return;
    metrics.slowResources += 1;
    record('resource', `${resourceName(resource.name)} ${number(resource.duration, 0)}ms transfer=${resource.transferSize || 0}`);
  });

  observe('navigation', (entry) => {
    const nav = entry as PerformanceNavigationTiming;
    record('navigation', `TTFB=${number(nav.responseStart)}ms DOM=${number(nav.domContentLoadedEventEnd)}ms load=${number(nav.loadEventEnd)}ms`);
    if (nav.responseStart) milestoneTimes.set('ttfb', nav.responseStart);
    if (nav.domContentLoadedEventEnd) milestoneTimes.set('dcl', nav.domContentLoadedEventEnd);
    if (nav.loadEventEnd) milestoneTimes.set('load', nav.loadEventEnd);
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
