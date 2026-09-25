/* What the browser says about itself, and how the form was filled.

   Loaded on demand and never on a page view: the compose controller imports
   it at the first focus inside a compose box, and the reaction bar at the
   first pointer-down on a heart. Importing it *is* arming it -- module
   evaluation attaches the page listeners and starts the fingerprint -- so a
   reader who only reads never pays for any of this, and never has their
   canvas read.

   Three things leave here: `clientFingerprint()`, `interactionFor()` and
   `storageId()`. All three are evidence, none is a door. Every probe is
   wrapped: a browser that refuses one answers `undefined` for that field and
   the rest of the object still goes. A total failure sends nothing, and the
   write succeeds anyway -- site-api stores NULL for a missing or malformed
   object and never refuses over it, and none of this feeds a rate-limit
   budget. See plans/comment-actor-identity.md "Client fingerprint".

   The client never names its own hash. site-api hashes the canonical
   component JSON, so a browser cannot claim to be a different device by
   sending a hash it made up. */

import type { ClientFingerprint, Interaction } from '@bunizao/contracts/comments';
import { readTurnstileTiming, type TurnstileAction } from './turnstile-token';

// The server enforces these too. Trimming here keeps the object under the
// 4 KiB budget, past which site-api drops the whole blob rather than a field.
const MAX_STRING = 128;
const MAX_FONTS = 32;
const MAX_LANGUAGES = 8;
const MAX_BRANDS = 8;

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_STRING) : undefined;
}

function whole(value: unknown, max = 1_000_000): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  if (rounded < -max || rounded > max) return undefined;
  return rounded;
}

function flag(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** Every probe goes through this. One browser's refusal -- a blocked canvas,
    a locked-down audio context, a Permissions-Policy on a getter -- costs its
    own field and nothing else. */
function attempt<T>(probe: () => T): T | undefined {
  try {
    return probe();
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

function navigatorPart(): ClientFingerprint['navigator'] {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: {
      brands?: Array<{ brand?: string; version?: string }>;
      platform?: string;
      mobile?: boolean;
      getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
    };
  };
  const brands = attempt(() => nav.userAgentData?.brands
    ?.map((entry) => `${entry.brand ?? ''} ${entry.version ?? ''}`.trim())
    .filter(Boolean)
    .slice(0, MAX_BRANDS));

  return {
    platform: text(nav.platform),
    languages: attempt(() => Array.from(nav.languages ?? []).slice(0, MAX_LANGUAGES).map((one) => text(one)!).filter(Boolean)),
    hardwareConcurrency: whole(nav.hardwareConcurrency, 1024),
    deviceMemory: whole(nav.deviceMemory, 1024),
    maxTouchPoints: whole(nav.maxTouchPoints, 64),
    // Present and true on Playwright, Puppeteer and Selenium unless the
    // runner has gone out of its way. The cheapest honest signal there is.
    webdriver: flag(nav.webdriver),
    pdfViewerEnabled: flag((nav as { pdfViewerEnabled?: boolean }).pdfViewerEnabled),
    plugins: whole(attempt(() => nav.plugins?.length), 512),
    cookieEnabled: flag(nav.cookieEnabled),
    uaBrands: brands && brands.length ? brands : undefined,
    uaPlatform: text(nav.userAgentData?.platform),
    uaMobile: flag(nav.userAgentData?.mobile),
  };
}

/* The three Client Hints Chromium will only hand over when asked. Optional
   everywhere else, and a rejected promise costs the three fields and
   nothing more. */
async function highEntropyPart(): Promise<Partial<NonNullable<ClientFingerprint['navigator']>>> {
  try {
    const ask = (navigator as Navigator & {
      userAgentData?: { getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>> };
    }).userAgentData?.getHighEntropyValues;
    if (!ask) return {};
    const values = await ask.call(
      (navigator as unknown as { userAgentData: unknown }).userAgentData,
      ['platformVersion', 'architecture', 'model'],
    );
    return {
      uaPlatformVersion: text(values.platformVersion),
      uaArchitecture: text(values.architecture),
      uaModel: text(values.model),
    };
  } catch {
    return {};
  }
}

function screenPart(): ClientFingerprint['screen'] {
  return {
    width: whole(screen.width, 65_535),
    height: whole(screen.height, 65_535),
    availWidth: whole(screen.availWidth, 65_535),
    availHeight: whole(screen.availHeight, 65_535),
    colorDepth: whole(screen.colorDepth, 64),
    // Percent, so it stays an integer on a 1.5x display.
    dprPct: whole((window.devicePixelRatio || 1) * 100, 10_000),
    outerWidth: whole(window.outerWidth, 65_535),
    outerHeight: whole(window.outerHeight, 65_535),
  };
}

function mediaPart(): ClientFingerprint['media'] {
  const ask = (query: string, values: string[]): string | undefined =>
    values.find((value) => attempt(() => matchMedia(`(${query}: ${value})`).matches) === true);
  return {
    colorScheme: ask('prefers-color-scheme', ['dark', 'light']),
    reducedMotion: ask('prefers-reduced-motion', ['reduce', 'no-preference']),
    pointer: ask('pointer', ['none', 'coarse', 'fine']),
    hover: ask('hover', ['none', 'hover']),
    colorGamut: ask('color-gamut', ['rec2020', 'p3', 'srgb']),
    dynamicRange: ask('dynamic-range', ['high', 'standard']),
  };
}

function presencePart(): ClientFingerprint['presence'] {
  return {
    // Headless Chrome has the UA and not the object, which is the pair that
    // makes it worth recording at all.
    chrome: 'chrome' in window,
    notification: attempt(() => (window as { Notification?: { permission?: string } }).Notification?.permission),
    performanceMemory: 'memory' in performance,
    indexedDb: 'indexedDB' in window,
    localStorage: attempt(() => {
      void window.localStorage.length;
      return true;
    }) ?? false,
  };
}

function webglPart(): ClientFingerprint['webgl'] {
  return attempt(() => {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return undefined;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: text(debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
      // "SwiftShader" and "llvmpipe" live here: a software rasteriser on a
      // desktop UA is the headless tell this whole field exists for.
      renderer: text(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
      maxTextureSize: whole(gl.getParameter(gl.MAX_TEXTURE_SIZE), 1_000_000),
      maxViewport: whole(gl.getParameter(gl.MAX_VIEWPORT_DIMS)?.[0], 1_000_000),
    };
  });
}

/* A short, fixed drawing. The point is that the same machine and browser
   redraw it identically and a different one does not -- the content is
   arbitrary, so it is kept small and off-screen. */
async function canvasHash(): Promise<string | undefined> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.textBaseline = 'top';
    context.font = '14px "Arial"';
    context.fillStyle = '#f60';
    context.fillRect(0, 0, 62, 20);
    context.fillStyle = '#069';
    context.fillText('comments ✓ 中文 🙂', 2, 15);
    context.fillStyle = 'rgba(102, 204, 0, 0.7)';
    context.fillText('comments ✓ 中文 🙂', 4, 25);
    return await sha256Hex(canvas.toDataURL());
  } catch {
    return undefined;
  }
}

async function sha256Hex(value: string): Promise<string | undefined> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return undefined;
  }
}

/* One short offline render, summed. Rendering is capped by a timer: a
   suspended or throttled audio context otherwise leaves the promise open for
   the life of the page, and this must never delay a submission. */
function audioHash(): Promise<string | undefined> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: string | undefined) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(undefined), 1_000);
    try {
      const Offline = (window as unknown as {
        OfflineAudioContext?: typeof OfflineAudioContext;
        webkitOfflineAudioContext?: typeof OfflineAudioContext;
      }).OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
      if (!Offline) {
        clearTimeout(timer);
        finish(undefined);
        return;
      }
      const context = new Offline(1, 5_000, 44_100);
      const oscillator = context.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.value = 10_000;
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -50;
      compressor.knee.value = 40;
      compressor.ratio.value = 12;
      compressor.attack.value = 0;
      compressor.release.value = 0.25;
      oscillator.connect(compressor);
      compressor.connect(context.destination);
      oscillator.start(0);
      void context.startRendering().then((buffer) => {
        clearTimeout(timer);
        let sum = 0;
        const samples = buffer.getChannelData(0);
        for (let index = 4_500; index < samples.length; index += 1) sum += Math.abs(samples[index]!);
        finish(sum.toFixed(6));
      }).catch(() => {
        clearTimeout(timer);
        finish(undefined);
      });
    } catch {
      clearTimeout(timer);
      finish(undefined);
    }
  });
}

/* A width probe, not an enumeration: render a string in each candidate with
   three generic fallbacks and keep the families whose width differs from all
   three. Cheap, and the same list in the same order on every browser, so the
   result is a stable subset rather than an ordering artefact. */
const FONT_PROBES = [
  'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS', 'Consolas', 'Courier New',
  'Georgia', 'Helvetica Neue', 'Impact', 'Lucida Grande', 'Menlo', 'Monaco', 'Optima',
  'Palatino', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
  'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'SimSun',
];

function fontsPart(): string[] | undefined {
  return attempt(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    const sample = 'mmmmmmmmmmlli中文';
    const baselines = ['monospace', 'sans-serif', 'serif'].map((generic) => {
      context.font = `72px ${generic}`;
      return context.measureText(sample).width;
    });
    const found: string[] = [];
    for (const family of FONT_PROBES) {
      const widths = ['monospace', 'sans-serif', 'serif'].map((generic, index) => {
        context.font = `72px "${family}", ${generic}`;
        return context.measureText(sample).width !== baselines[index];
      });
      if (widths.some(Boolean)) found.push(family);
      if (found.length >= MAX_FONTS) break;
    }
    return found.length ? found : undefined;
  });
}

/** Drops every undefined leaf and every object left empty by that, so a
    browser that answers nothing sends nothing rather than a shell of nulls
    -- and two browsers that answer the same fields hash the same. */
function prune<T>(value: T): T | undefined {
  if (Array.isArray(value)) return value.length ? value : undefined;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = prune(entry);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return Object.keys(out).length ? (out as T) : undefined;
  }
  return value === undefined ? undefined : value;
}

let fingerprintPromise: Promise<ClientFingerprint | undefined> | null = null;

async function computeFingerprint(): Promise<ClientFingerprint | undefined> {
  try {
    const [canvas, audio, highEntropy] = await Promise.all([canvasHash(), audioHash(), highEntropyPart()]);
    return prune<ClientFingerprint>({
      navigator: { ...navigatorPart(), ...highEntropy },
      screen: screenPart(),
      timezone: attempt(() => text(Intl.DateTimeFormat().resolvedOptions().timeZone)),
      timezoneOffset: whole(new Date().getTimezoneOffset(), 1_440),
      canvas,
      webgl: webglPart(),
      audio,
      fonts: fontsPart(),
      media: mediaPart(),
      presence: presencePart(),
    });
  } catch {
    return undefined;
  }
}

/** The fingerprint for this page, computed once. Started at module load, so
    by the time anyone submits it has almost always resolved; awaiting it is
    still correct on the reader who types one character and presses Post. */
export function clientFingerprint(): Promise<ClientFingerprint | undefined> {
  fingerprintPromise ??= computeFingerprint();
  return fingerprintPromise;
}

// ---------------------------------------------------------------------------
// Storage id
// ---------------------------------------------------------------------------

const STORAGE_DB = 'blog-comments';
const STORAGE_STORE = 'identity';
const STORAGE_KEY = 'storageId';

function openStorage(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(STORAGE_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORAGE_STORE)) {
          request.result.createObjectStore(STORAGE_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readWrite(db: IDBDatabase, run: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORAGE_STORE, 'readwrite');
      const request = run(transaction.objectStore(STORAGE_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

let storageIdPromise: Promise<string | undefined> | null = null;

async function loadStorageId(): Promise<string | undefined> {
  const db = await openStorage();
  if (!db) return undefined;
  try {
    const existing = await readWrite(db, (store) => store.get(STORAGE_KEY));
    if (typeof existing === 'string' && /^[0-9a-f]{32}$/.test(existing)) return existing;
    const minted = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    await readWrite(db, (store) => store.put(minted, STORAGE_KEY));
    return minted;
  } catch {
    return undefined;
  } finally {
    attempt(() => db.close());
  }
}

/** A random 32-hex value kept in IndexedDB, read or created once per page.
    It survives a cleared cookie jar, which is the whole point -- and it is
    never written back to a cookie, never used to restore a session, and
    never leaves here in any other direction. site-api stores only its HMAC.
    A private window, a browser that refuses IndexedDB, or a first visit
    where the write fails all answer undefined, and nothing downstream
    changes because of it. */
export function storageId(): Promise<string | undefined> {
  storageIdPromise ??= loadStorageId();
  return storageIdPromise;
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

const COMPOSE_SELECTOR = '.blog-compose, [data-comment-compose]';

const counts = {
  keyEvents: 0,
  inputEvents: 0,
  pasteEvents: 0,
  pointerMoves: 0,
  scrollEvents: 0,
  hiddenCount: 0,
  scrollDepth: 0,
};

/* Inter-key intervals, as a running sum and sum of squares. The sequence
   itself is never kept: what leaves is one spread figure, which separates a
   machine typing at a fixed rate from a person and says nothing about what
   was typed. */
let lastKeyAt = 0;
let intervalCount = 0;
let intervalSum = 0;
let intervalSquares = 0;

let lastPointer: { pointerType: string; offset: number } | null = null;

function inCompose(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(COMPOSE_SELECTOR));
}

function arm(): void {
  if (typeof document === 'undefined') return;
  const passive = { passive: true, capture: true } as const;

  document.addEventListener('keydown', (event) => {
    if (!inCompose(event.target)) return;
    counts.keyEvents += 1;
    const now = performance.now();
    if (lastKeyAt) {
      const gap = now - lastKeyAt;
      // A gap longer than a few seconds is a pause for thought, not a
      // keystroke rhythm, and averaging it in would swamp the spread.
      if (gap > 0 && gap < 3_000) {
        intervalCount += 1;
        intervalSum += gap;
        intervalSquares += gap * gap;
      }
    }
    lastKeyAt = now;
  }, passive);

  document.addEventListener('input', (event) => {
    if (inCompose(event.target)) counts.inputEvents += 1;
  }, passive);

  document.addEventListener('paste', (event) => {
    if (inCompose(event.target)) counts.pasteEvents += 1;
  }, passive);

  document.addEventListener('pointermove', () => {
    counts.pointerMoves += 1;
  }, passive);

  document.addEventListener('pointerdown', (event) => {
    const button = (event.target as Element | null)?.closest?.('button, [role="button"]');
    if (!button) return;
    const box = button.getBoundingClientRect();
    lastPointer = {
      pointerType: event.pointerType || 'unknown',
      offset: Math.round(Math.hypot(
        event.clientX - (box.left + box.width / 2),
        event.clientY - (box.top + box.height / 2),
      )),
    };
  }, passive);

  document.addEventListener('scroll', () => {
    counts.scrollEvents += 1;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable > 0) {
      counts.scrollDepth = Math.max(counts.scrollDepth, Math.min(100, Math.round((window.scrollY / scrollable) * 100)));
    }
  }, passive);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') counts.hiddenCount += 1;
  }, passive);
}

arm();

export interface InteractionExtras {
  /** Comments carry the typing aggregates; reactions carry the tap count. */
  kind: 'comment' | 'reaction';
  /** `performance.now()` when the caller armed this module: the first
      compose focus, or the first pointer-down on a bar. The caller owns it
      because the import that arms us resolves a fetch later than the event
      that triggered it. */
  armedAt?: number;
  /** Client-side rejections before this submit (comments). */
  validationErrors?: number;
  /** Reaction taps on this page so far, this one included (reactions). */
  tapsThisPage?: number;
  /** Read for its solve time and whether a challenge opened. */
  turnstileAction?: TurnstileAction;
}

/** A snapshot of how this page has been used, as aggregates only. Never the
    key sequence, never the intervals, never what was typed. */
export function interactionFor(extras: InteractionExtras): Interaction | undefined {
  try {
    const now = performance.now();
    const turnstile = extras.turnstileAction ? readTurnstileTiming(extras.turnstileAction) : null;
    const comment = extras.kind === 'comment';
    // A draft already in the box at load arrived without keys -- see drafts.ts.
    const restored = document.querySelector('[data-draft-restored]') ? 1 : 0;
    const mean = intervalCount ? intervalSum / intervalCount : 0;
    // Per mille, so a 0-1 ratio survives as a bounded integer.
    const cv = intervalCount >= 3 && mean > 0
      ? Math.round((Math.sqrt(Math.max(0, intervalSquares / intervalCount - mean * mean)) / mean) * 1_000)
      : undefined;

    return prune<Interaction>({
      loadToFocusMs: comment ? whole(extras.armedAt, 86_400_000) : undefined,
      loadToTapMs: comment ? undefined : whole(extras.armedAt, 86_400_000),
      composeMs: comment && extras.armedAt !== undefined ? whole(now - extras.armedAt, 86_400_000) : undefined,
      keyEvents: comment ? whole(counts.keyEvents, 100_000) : undefined,
      inputEvents: comment ? whole(counts.inputEvents, 100_000) : undefined,
      pasteEvents: comment ? whole(counts.pasteEvents + restored, 100_000) : undefined,
      keyIntervalCv: comment ? whole(cv, 100_000) : undefined,
      pointerType: text(lastPointer?.pointerType),
      pointerMoves: whole(counts.pointerMoves, 1_000_000),
      clickOffset: whole(lastPointer?.offset, 65_535),
      scrollEvents: whole(counts.scrollEvents, 1_000_000),
      scrollDepth: whole(counts.scrollDepth, 100),
      hiddenCount: whole(counts.hiddenCount, 100_000),
      hasFocus: attempt(() => document.hasFocus()),
      historyLength: whole(history.length, 100_000),
      validationErrors: comment ? whole(extras.validationErrors, 100_000) : undefined,
      turnstileSolveMs: whole(turnstile?.solveMs ?? undefined, 600_000),
      turnstileInteractive: turnstile ? turnstile.interactive : undefined,
      tapsThisPage: comment ? undefined : whole(extras.tapsThisPage, 100_000),
    });
  } catch {
    return undefined;
  }
}
