import { describe, expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
const build = await Bun.build({
  entrypoints: [
    new URL('./fixtures/site-beacon-entry.ts', import.meta.url).pathname,
  ],
  target: 'browser',
  format: 'iife',
  minify: false,
});
if (!build.success) throw new Error(String(build.logs));
const source = await build.outputs[0].text();
class Target {
  handlers = new Map<string, Array<(event: any) => void>>();
  addEventListener(name: string, handler: (event: any) => void) {
    const list = this.handlers.get(name) || [];
    list.push(handler);
    this.handlers.set(name, list);
  }
  fire(name: string, event: Record<string, unknown> = {}) {
    for (const handler of this.handlers.get(name) || [])
      handler({ type: name, isTrusted: true, ...event });
  }
}
class ElementStub extends Target {
  dataset: Record<string, string> = {};
  tagName = 'BUTTON';
  textContent = 'Test';
  parent: ElementStub | null = null;
  attrs: Record<string, string> = {};
  scrollHeight = 1000;
  clientHeight = 500;
  scrollTop = 0;
  constructor(attrs: Record<string, string> = {}) {
    super();
    this.attrs = attrs;
  }
  matches(selector: string) {
    return selector.split(',').some((s) => {
      s = s.trim();
      const compound = /^(\w+)\[([^\]]+)\]$/.exec(s);
      if (compound)
        return (
          this.tagName === compound[1].toUpperCase() &&
          this.attrs[compound[2]] !== undefined
        );
      if (s.startsWith('[')) return this.attrs[s.slice(1, -1)] !== undefined;
      return s.toUpperCase() === this.tagName;
    });
  }
  closest(selector: string): ElementStub | null {
    if (selector.startsWith('input:')) return null;
    if (this.matches(selector)) return this;
    return this.parent?.closest(selector) || null;
  }
  getAttribute(key: string) {
    return this.attrs[key] ?? null;
  }
  querySelectorAll() {
    return [] as ElementStub[];
  }
}
function harness(
  options: {
    host?: string;
    gpc?: boolean;
    stored?: Record<string, string>;
    beacon?: boolean;
    fetchReject?: boolean;
    hidden?: boolean;
  } = {},
) {
  let now = 0,
    epoch = 1_800_000_000_000,
    id = 0;
  const window = new Target(),
    doc = Object.assign(new Target(), {
      body: { dataset: { analyticsSurface: 'home' } },
      documentElement: Object.assign(new ElementStub(), { lang: 'en' }),
      visibilityState: options.hidden ? 'hidden' : 'visible',
      prerendering: false,
      referrer: 'https://example.com/path?token=secret',
      querySelector: () => null,
      querySelectorAll: () => [],
    });
  const storage = new Map(Object.entries(options.stored || {}));
  const payloads: any[] = [];
  const timers = new Map<number, { at: number; run: () => void }>();
  let timerId = 0;
  class DateStub extends Date {
    constructor(value?: any) {
      super(value ?? epoch);
    }
    static now() {
      return epoch;
    }
  }
  const context: any = {
    window,
    document: doc,
    location: {
      hostname: options.host || 'buxx.me',
      pathname: '/',
      origin: 'https://buxx.me',
      search: '?token=secret&utm_source=mail',
    },
    navigator: {
      languages: ['en-AU'],
      webdriver: false,
      globalPrivacyControl: options.gpc,
      sendBeacon: (_url: string, blob: any) => {
        if (options.beacon === false) return false;
        payloads.push(JSON.parse(blob.parts.join('')));
        return true;
      },
    },
    localStorage: {
      getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    crypto: {
      randomUUID: () =>
        `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
    },
    performance: {
      now: () => now,
      getEntriesByType: () => [{ type: 'navigate' }],
    },
    fetch: (_url: string, init: any) => {
      payloads.push(JSON.parse(init.body));
      return options.fetchReject
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ ok: true });
    },
    Blob: class {
      constructor(public parts: string[]) {}
      get size() {
        return new TextEncoder().encode(this.parts.join('')).byteLength;
      }
    },
    URL,
    URLSearchParams,
    Date: DateStub,
    Intl,
    Element: ElementStub,
    HTMLElement: ElementStub,
    AbortController,
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 2,
    CustomEvent: class {
      constructor(
        public type: string,
        public detail: any,
      ) {}
    },
    setTimeout: (run: () => void, ms: number) => {
      timers.set(++timerId, { at: now + ms, run });
      return timerId;
    },
    clearTimeout: (id: number) => timers.delete(id),
    requestAnimationFrame: (run: () => void) => run(),
  };
  runInNewContext(source, context);
  context.startAnalytics();
  return {
    context,
    doc,
    window,
    payloads,
    storage,
    step: (ms: number) => {
      now += ms;
      epoch += ms;
      for (const [id, t] of [...timers])
        if (t.at <= now) {
          timers.delete(id);
          t.run();
        }
    },
    hide: () => {
      doc.visibilityState = 'hidden';
      doc.fire('visibilitychange');
    },
    show: () => {
      doc.visibilityState = 'visible';
      doc.fire('visibilitychange');
    },
  };
}
describe('site beacon runtime', () => {
  test('visible dwell pauses and resumes, including navigation at time zero; hidden exit is unchanged', () => {
    const h = harness();
    expect(h.payloads[0].progress.dwellMs).toBe(0);
    h.step(5000);
    h.hide();
    expect(h.payloads[1].progress.dwellMs).toBe(5000);
    h.step(60000);
    h.window.fire('pagehide');
    expect(h.payloads).toHaveLength(2);
    h.show();
    h.step(3000);
    h.window.fire('pagehide');
    expect(h.payloads.at(-1).progress.dwellMs).toBe(8000);
    expect(h.payloads.map((p) => p.seq)).toEqual([0, 1, 2]);
  });
  test('non-production host, GPC and prerendering suppress sends', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      'site.workers.dev',
      'evil.test',
    ])
      expect(harness({ host }).payloads).toHaveLength(0);
    expect(harness({ gpc: true }).payloads).toHaveLength(0);
  });
  test('session rolls over after thirty minutes and owner marker is explicit', () => {
    const h = harness({ stored: { 'buxx:analytics:owner': '1' } });
    const resolve = h.context.resolveSession;
    const prior = JSON.stringify({
      id: '11111111-1111-4111-8111-111111111111',
      last: 0,
    });
    expect(resolve(1800000, prior).isEntry).toBe(false);
    expect(resolve(1800001, prior).isEntry).toBe(true);
    expect(h.payloads[0].owner).toBe(true);
    expect(h.payloads[0].client.isNewVisitor).toBe(true);
  });
  test('bfcache restore creates a fresh view and resets counters', () => {
    const h = harness();
    h.step(1000);
    h.hide();
    h.show();
    h.window.fire('pageshow', { persisted: true });
    expect(h.payloads.at(-1).viewId).not.toBe(h.payloads[0].viewId);
    expect(h.payloads.at(-1).seq).toBe(0);
    expect(h.payloads.at(-1).client.navType).toBe(3);
    expect(h.payloads.at(-1).client.isNewVisitor).toBe(false);
  });
  test('clicks flush on pagehide with sanitized URLs, regions and stable names; ignore controls never capture input values', () => {
    const h = harness(),
      link = new ElementStub({
        href: '/blog/test?token=secret',
        'data-track': 'post.adjacent',
      });
    link.tagName = 'A';
    link.dataset.track = 'post.adjacent';
    const region = new ElementStub({ 'data-track-region': '' });
    region.dataset.trackRegion = 'main';
    link.parent = region;
    h.step(50);
    h.doc.fire('click', { target: link });
    h.window.fire('pagehide');
    const click = h.payloads.at(-1).clicks[0];
    expect(click.name).toBe('post.adjacent');
    expect(click.href).toBe('/blog/test');
    expect(click.region).toBe('main');
    expect(click.position).toBe(-1);
    const ignored = new ElementStub({ 'data-track-ignore': '' });
    link.parent = ignored;
    expect(
      h.context.resolveClick({ target: link }, 'https://buxx.me', 0),
    ).toBeNull();
    expect(h.payloads[0].page.path).toBe('/');
    expect(h.payloads[0].page.referrer).toBe('https://example.com/path');
    expect(h.payloads[0].page.utm).toEqual(['mail', '', '']);
  });
  test('ten clicks flush immediately; a smaller batch flushes after ten visible seconds', () => {
    const h = harness(),
      button = new ElementStub();
    h.doc.fire('click', { target: button });
    h.step(9999);
    expect(h.payloads).toHaveLength(1);
    h.step(1);
    expect(h.payloads.at(-1).clicks).toHaveLength(1);
    for (let i = 0; i < 10; i++) h.doc.fire('click', { target: button });
    expect(h.payloads.at(-1).clicks).toHaveLength(10);
  });
  test('failed fetch fallback retains the same sequence and clicks until an accepted send', async () => {
    const h = harness({ beacon: false, fetchReject: true });
    await Promise.resolve();
    h.step(50);
    h.doc.fire('click', { target: new ElementStub() });
    h.hide();
    await Promise.resolve();
    h.window.fire('pagehide');
    expect(h.payloads.at(-1).seq).toBe(0);
    expect(h.payloads.at(-1).clicks).toHaveLength(1);
  });
  test('a pending fetch retries an identical snapshot and never reassigns buffered clicks to an acknowledged sequence', async () => {
    const h = harness();
    const calls: any[] = [],
      acknowledgements: Array<(value: { ok: boolean }) => void> = [];
    h.context.navigator.sendBeacon = () => false;
    h.context.fetch = (_url: string, init: any) => {
      calls.push(JSON.parse(init.body));
      return new Promise((resolve) => acknowledgements.push(resolve));
    };
    const button = new ElementStub();
    h.doc.fire('click', { target: button });
    h.step(10000);
    h.doc.fire('click', { target: button });
    h.hide();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[0].clicks).toHaveLength(1);
    acknowledgements[1]({ ok: true });
    await Promise.resolve();
    h.step(0);
    expect(calls.at(-1).seq).toBe(calls[0].seq + 1);
    expect(calls.at(-1).clicks).toHaveLength(1);
    acknowledgements[0]({ ok: true });
    await Promise.resolve();
    expect(calls.filter((c) => c.seq === 2)).toHaveLength(1);
  });
  test('click position follows its nearest list and synthetic click events are ignored', () => {
    const h = harness(),
      first = new ElementStub({ href: '/one' }),
      second = new ElementStub({ href: '/two' }),
      list = new ElementStub({ 'data-track-list': '' });
    first.tagName = second.tagName = 'A';
    list.tagName = 'UL';
    first.parent = second.parent = list;
    list.querySelectorAll = () => [first, second];
    expect(
      h.context.resolveClick({ target: second }, 'https://buxx.me', 50)
        .position,
    ).toBe(1);
    h.doc.fire('click', { target: second, isTrusted: false });
    h.hide();
    expect(h.payloads.at(-1).clicks).toHaveLength(0);
  });
  test('an empty referrer remains direct, and UTF-8 click batches fit the ingest body limit', () => {
    const direct = harness();
    expect(direct.context.resolveSession(0, null).isEntry).toBe(true);
    const h = harness(),
      button = new ElementStub();
    button.textContent = '你'.repeat(60);
    button.dataset.track = 'a'.repeat(64);
    button.attrs['data-track'] = '';
    for (let i = 0; i < 10; i++) h.doc.fire('click', { target: button });
    const payload = h.payloads.at(-1);
    expect(
      new TextEncoder().encode(JSON.stringify(payload)).byteLength,
    ).toBeLessThanOrEqual(8192);
  });
  test('trusted input counts engagement; synthetic input is ignored; panel events count distinct openings', () => {
    const h = harness();
    h.doc.fire('pointerdown', { isTrusted: false });
    h.step(100);
    h.doc.fire('keydown');
    h.doc.fire('analytics:panel', {
      detail: { id: 'projects', source: 'chip' },
    });
    h.doc.fire('analytics:panel', {
      detail: { id: 'projects', source: 'hash' },
    });
    h.hide();
    const p = h.payloads.at(-1);
    expect(p.progress.interactions).toBe(1);
    expect(p.progress.firstInputMs).toBe(100);
    expect(p.progress.metric1).toBe(2);
    expect(p.progress.metric2).toBe(1);
    expect(p.clicks.map((c: any) => c.kind)).toEqual(['panel', 'panel']);
  });
});
