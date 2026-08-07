import {
  LISTENING_ANALYTICS_EVENT_ENDPOINT,
  type ListeningAnalyticsAction,
  type ListeningAnalyticsEventInput,
  type ListeningAnalyticsSurface,
} from '@bunizao/contracts/analytics';

export interface ListeningAnalyticsMetadata {
  trackId: string | null;
  trackTitle: string;
  trackArtist: string | null;
  pagePath: string;
  surface: ListeningAnalyticsSurface;
}

export interface ListeningPlaybackObservation {
  owned: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

interface ListeningPlaybackAnalyticsOptions {
  metadata: () => ListeningAnalyticsMetadata;
  visitorId: string;
  sessionId: string | null;
  send: (event: ListeningAnalyticsEventInput) => void;
  now?: () => number;
  createId?: () => string;
  checkpointMs?: number;
}

const DEFAULT_CHECKPOINT_MS = 15_000;
const COMPLETION_RATIO = 0.98;

export function inferListeningSurface(pathname: string): ListeningAnalyticsSurface {
  if (pathname === '/') return 'home';
  if (pathname === '/blog' || pathname.startsWith('/blog/')) return 'blog';
  if (pathname === '/mood' || pathname.startsWith('/mood/')) return 'mood';
  if (pathname === '/components' || pathname.startsWith('/components/')) return 'components';
  return 'other';
}

export class ListeningPlaybackAnalytics {
  private readonly metadata: () => ListeningAnalyticsMetadata;
  private readonly visitorId: string;
  private readonly sessionId: string | null;
  private readonly sendEvent: (event: ListeningAnalyticsEventInput) => void;
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly checkpointMs: number;

  private playbackId = '';
  private sessionMetadata: ListeningAnalyticsMetadata | null = null;
  private playing = false;
  private completed = false;
  private heardSince = 0;
  private lastSentAt = 0;
  private listenedMs = 0;
  private mediaTimeMs = 0;
  private durationMs = 0;
  private requestCount = 0;
  private playCount = 0;
  private pauseCount = 0;
  private seekCount = 0;

  constructor(options: ListeningPlaybackAnalyticsOptions) {
    this.metadata = options.metadata;
    this.visitorId = options.visitorId;
    this.sessionId = options.sessionId;
    this.sendEvent = options.send;
    this.now = options.now ?? (() => performance.now());
    this.createId = options.createId ?? createId;
    this.checkpointMs = options.checkpointMs ?? DEFAULT_CHECKPOINT_MS;
  }

  requestPlay(): void {
    this.ensureSession();
    this.requestCount += 1;
    this.emit('play_request');
  }

  observe(observation: ListeningPlaybackObservation): void {
    if (!observation.owned) {
      if (this.playing) this.stopPlaying('pause');
      return;
    }

    this.updateMediaProgress(observation.currentTime, observation.duration);

    if (observation.isPlaying && !this.playing) {
      this.ensureSession();
      this.playing = true;
      this.heardSince = this.now();
      this.playCount += 1;
      this.emit('play');
      return;
    }

    if (!observation.isPlaying && this.playing) {
      const completed = this.durationMs > 0
        && this.mediaTimeMs / this.durationMs >= COMPLETION_RATIO;
      this.stopPlaying(completed ? 'complete' : 'pause');
      return;
    }

    if (this.playing && this.now() - this.lastSentAt >= this.checkpointMs) {
      this.captureHeardTime();
      this.emit('progress');
    }
  }

  recordSeek(): void {
    if (!this.playbackId) return;
    if (this.playing) this.captureHeardTime();
    this.seekCount += 1;
    this.emit('seek');
  }

  flush(): void {
    if (!this.playbackId || this.completed || !this.playing) return;
    this.captureHeardTime();
    this.emit('progress');
  }

  private stopPlaying(action: 'pause' | 'complete'): void {
    this.captureHeardTime();
    this.playing = false;
    if (action === 'complete') {
      this.completed = true;
    } else {
      this.pauseCount += 1;
    }
    this.emit(action);
  }

  private ensureSession(): void {
    const metadata = this.metadata();
    const metadataKey = listeningMetadataKey(metadata);
    const currentKey = this.sessionMetadata ? listeningMetadataKey(this.sessionMetadata) : '';
    if (this.playbackId && !this.completed && metadataKey === currentKey) return;

    this.playbackId = this.createId();
    this.sessionMetadata = metadata;
    this.playing = false;
    this.completed = false;
    this.heardSince = 0;
    this.lastSentAt = 0;
    this.listenedMs = 0;
    this.mediaTimeMs = 0;
    this.durationMs = 0;
    this.requestCount = 0;
    this.playCount = 0;
    this.pauseCount = 0;
    this.seekCount = 0;
  }

  private captureHeardTime(): void {
    if (!this.playing) return;
    const current = this.now();
    this.listenedMs += Math.max(0, current - this.heardSince);
    this.heardSince = current;
  }

  private updateMediaProgress(currentTime: number, duration: number): void {
    if (Number.isFinite(currentTime) && currentTime > 0) {
      this.mediaTimeMs = Math.max(this.mediaTimeMs, Math.round(currentTime * 1000));
    }
    if (Number.isFinite(duration) && duration > 0) {
      this.durationMs = Math.max(this.durationMs, Math.round(duration * 1000));
    }
  }

  private emit(action: ListeningAnalyticsAction): void {
    if (!this.playbackId || !this.sessionMetadata) return;
    this.lastSentAt = this.now();
    this.sendEvent({
      playbackId: this.playbackId,
      visitorId: this.visitorId,
      sessionId: this.sessionId,
      action,
      ...this.sessionMetadata,
      listenedMs: Math.round(this.listenedMs),
      mediaTimeMs: this.mediaTimeMs,
      durationMs: this.durationMs,
      requestCount: this.requestCount,
      playCount: this.playCount,
      pauseCount: this.pauseCount,
      seekCount: this.seekCount,
      completed: this.completed,
    });
  }
}

const browserTrackers = new Set<ListeningPlaybackAnalytics>();
let browserLifecycleBound = false;

export function createBrowserListeningAnalytics(
  metadata: () => ListeningAnalyticsMetadata,
): ListeningPlaybackAnalytics | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (window.location.hostname !== 'buxx.me' && window.location.hostname !== 'www.buxx.me') return null;

  const tracker = new ListeningPlaybackAnalytics({
    metadata,
    visitorId: readStoredId('localStorage', 'buxx:blog-analytics:visitor-id'),
    sessionId: readStoredId('sessionStorage', 'buxx:blog-analytics:session-id'),
    send: sendBrowserEvent,
  });
  browserTrackers.add(tracker);
  bindBrowserLifecycle();
  return tracker;
}

function listeningMetadataKey(metadata: ListeningAnalyticsMetadata): string {
  return [
    metadata.trackId ?? '',
    metadata.trackTitle,
    metadata.trackArtist ?? '',
    metadata.pagePath,
    metadata.surface,
  ].join('\u0000');
}

function bindBrowserLifecycle(): void {
  if (browserLifecycleBound) return;
  browserLifecycleBound = true;
  const flush = () => browserTrackers.forEach((tracker) => tracker.flush());
  window.addEventListener('pagehide', flush, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

function sendBrowserEvent(event: ListeningAnalyticsEventInput): void {
  const body = JSON.stringify(event);
  const blob = new Blob([body], { type: 'application/json' });
  if (navigator.sendBeacon?.(LISTENING_ANALYTICS_EVENT_ENDPOINT, blob)) return;

  fetch(LISTENING_ANALYTICS_EVENT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => undefined);
}

function readStoredId(storageName: 'localStorage' | 'sessionStorage', key: string): string {
  let storage: Storage | null = null;
  try {
    storage = window[storageName];
    const existing = storage.getItem(key);
    if (existing) return existing;
  } catch {
    storage = null;
  }

  const next = createId();
  try {
    storage?.setItem(key, next);
  } catch {
    // Storage can be unavailable in private browsing; the in-memory id is still valid.
  }
  return next;
}

function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (char) => {
    const random = crypto.getRandomValues(new Uint8Array(1))[0] ?? 0;
    return (Number(char) ^ (random & (15 >> (Number(char) / 4)))).toString(16);
  });
}
