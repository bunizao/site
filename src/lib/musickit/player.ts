import type { MusicKitInstance, MusicKitStatic } from '@/types/musickit';

const MUSICKIT_SRC = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
const TOKEN_ENDPOINT = '/api/v2/musickit/token';
const TOKEN_REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;
const LOAD_TIMEOUT_MS = 10_000;

export interface PlayRequest {
  catalogId?: string;
  previewUrl?: string;
}

export type PlaybackSource = 'full' | 'preview' | null;

export interface PlaybackSnapshot {
  owner: PlayRequest | null;
  isPlaying: boolean;
  isLoading: boolean;
  source: PlaybackSource;
  currentTime: number;
  duration: number;
}

type Listener = (snapshot: PlaybackSnapshot) => void;

type TokenResponse = {
  token?: string;
  expiresAt?: string | number;
};

function isReducedData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData);
}

function prepareGlobalProcessShim(): void {
  const processShim = (globalThis as unknown as {
    process?: { env?: unknown; versions?: unknown };
  }).process;
  if (processShim?.env && processShim.versions === undefined) {
    processShim.versions = null;
  }
}

class MusicKitPlayer {
  private kit: MusicKitInstance | null = null;
  private kitLoad: Promise<MusicKitInstance | null> | null = null;
  private token: string | null = null;
  private tokenExpiry = 0;
  private preview: HTMLAudioElement | null = null;
  private owner: PlayRequest | null = null;
  private source: PlaybackSource = null;
  private playing = false;
  private loading = false;
  private listeners = new Set<Listener>();
  private rafId = 0;
  private operationId = 0;
  private loadTimer = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): PlaybackSnapshot {
    return {
      owner: this.owner,
      isPlaying: this.playing,
      isLoading: this.loading,
      source: this.source,
      currentTime: this.currentTime(),
      duration: this.duration(),
    };
  }

  private currentTime(): number {
    if (this.source === 'full' && this.kit) return this.kit.currentPlaybackTime || 0;
    if (this.source === 'preview' && this.preview) return this.preview.currentTime || 0;
    return 0;
  }

  private duration(): number {
    if (this.source === 'full' && this.kit) return this.kit.currentPlaybackDuration || 0;
    if (this.source === 'preview' && this.preview) {
      return Number.isFinite(this.preview.duration) ? this.preview.duration : 0;
    }
    return 0;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private startTicker(): void {
    if (this.rafId) return;
    const tick = () => {
      if (!this.playing) {
        this.rafId = 0;
        return;
      }
      this.emit();
      this.rafId = window.requestAnimationFrame(tick);
    };
    this.rafId = window.requestAnimationFrame(tick);
  }

  private setState(playing: boolean, source: PlaybackSource, loading = false): void {
    this.playing = playing;
    this.source = source;
    this.loading = loading;
    this.emit();
    if (playing) this.startTicker();
  }

  private clearLoadTimeout(): void {
    if (!this.loadTimer) return;
    window.clearTimeout(this.loadTimer);
    this.loadTimer = 0;
  }

  private async withTimeout<T>(work: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('MusicKit request timed out')), LOAD_TIMEOUT_MS);
      work.then(
        (value) => {
          window.clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          window.clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private async ensureToken(): Promise<string | null> {
    const now = Date.now();
    if (this.token && now < this.tokenExpiry - TOKEN_REFRESH_MARGIN_MS) return this.token;

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
    try {
      const response = await fetch(TOKEN_ENDPOINT, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const data = (await response.json()) as TokenResponse;
      if (!data.token) return null;
      const expiry = data.expiresAt ? new Date(data.expiresAt).getTime() : 0;
      this.token = data.token;
      this.tokenExpiry = Number.isFinite(expiry) && expiry > now
        ? expiry
        : now + TOKEN_REFRESH_MARGIN_MS;
      return this.token;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  }

  private loadScript(): Promise<void> {
    if (window.MusicKit) return Promise.resolve();

    return this.withTimeout(new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${MUSICKIT_SRC}"]`);
      const script = existing ?? document.createElement('script');
      const complete = () => window.MusicKit
        ? resolve()
        : reject(new Error('MusicKit did not initialize'));

      script.addEventListener('load', complete, { once: true });
      script.addEventListener('error', () => {
        script.remove();
        reject(new Error('MusicKit failed to load'));
      }, { once: true });
      document.addEventListener('musickitloaded', complete, { once: true });

      if (!existing) {
        prepareGlobalProcessShim();
        script.src = MUSICKIT_SRC;
        script.async = true;
        script.dataset.webComponents = '';
        document.head.appendChild(script);
      }
    }));
  }

  private async ensureKit(): Promise<MusicKitInstance | null> {
    if (this.kit) return this.kit;
    if (this.kitLoad) return this.kitLoad;
    if (isReducedData()) return null;

    this.kitLoad = (async () => {
      const token = await this.ensureToken();
      if (!token) return null;
      try {
        await this.loadScript();
        const musicKit = window.MusicKit;
        if (!musicKit) return null;
        const configured = await this.withTimeout(musicKit.configure({
          developerToken: token,
          app: { name: 'buxx', build: '2.0.0' },
        }));
        this.kit = configured ?? musicKit.getInstance() ?? null;
        if (this.kit) this.bindKitEvents(this.kit, musicKit);
        return this.kit;
      } catch {
        return null;
      }
    })();

    const result = await this.kitLoad;
    if (!result) this.kitLoad = null;
    return result;
  }

  private bindKitEvents(kit: MusicKitInstance, musicKit: MusicKitStatic): void {
    const playingState = musicKit.PlaybackStates?.playing ?? 2;
    kit.addEventListener(musicKit.Events.playbackStateDidChange, () => {
      if (this.source !== 'full') return;
      this.setState(kit.playbackState === playingState, 'full');
    });
    kit.addEventListener(musicKit.Events.playbackTimeDidChange, () => {
      if (this.source === 'full') this.emit();
    });

    const errorEvent = musicKit.Events.mediaPlaybackError;
    if (errorEvent) {
      kit.addEventListener(errorEvent, () => {
        const request = this.owner;
        if (this.source === 'full' && request) this.fallback(request, this.operationId);
      });
    }
  }

  private ensurePreview(): HTMLAudioElement {
    if (this.preview) return this.preview;

    this.preview = new Audio();
    this.preview.preload = 'none';
    this.preview.addEventListener('ended', () => {
      this.clearLoadTimeout();
      this.playing = false;
      this.loading = false;
      this.emit();
      this.source = null;
      this.emit();
    });
    this.preview.addEventListener('pause', () => {
      if (this.source !== 'preview') return;
      this.playing = false;
      this.emit();
    });
    this.preview.addEventListener('waiting', () => {
      if (this.source !== 'preview' || this.loading) return;
      this.loading = true;
      this.emit();
    });
    this.preview.addEventListener('playing', () => {
      if (this.source !== 'preview') return;
      this.clearLoadTimeout();
      this.setState(true, 'preview');
    });
    this.preview.addEventListener('error', () => {
      if (this.source === 'preview') this.setState(false, null);
    });
    return this.preview;
  }

  private playPreview(request: PlayRequest, operationId: number): void {
    if (this.owner !== request || this.operationId !== operationId) return;
    if (!request.previewUrl) {
      this.setState(false, null);
      return;
    }

    const audio = this.ensurePreview();
    if (audio.src !== request.previewUrl) audio.src = request.previewUrl;
    this.setState(false, 'preview', true);
    this.clearLoadTimeout();
    this.loadTimer = window.setTimeout(() => {
      if (this.operationId === operationId && this.loading) this.setState(false, null);
    }, LOAD_TIMEOUT_MS);
    audio.play().then(
      () => {
        if (this.owner !== request || this.operationId !== operationId) return;
        this.clearLoadTimeout();
        this.setState(true, 'preview');
      },
      () => {
        if (this.owner !== request || this.operationId !== operationId) return;
        this.clearLoadTimeout();
        this.setState(false, null);
      },
    );
  }

  async toggle(request: PlayRequest): Promise<void> {
    const sameOwner = this.owner === request;
    if (sameOwner && (this.playing || this.loading)) {
      this.pause();
      return;
    }

    if (sameOwner && this.source) {
      const operationId = ++this.operationId;
      this.setState(false, this.source, true);
      if (this.source === 'full' && this.kit) {
        try {
          await this.withTimeout(this.kit.play());
          if (this.operationId === operationId) this.setState(true, 'full');
        } catch {
          this.fallback(request, operationId);
        }
        return;
      }
      this.playPreview(request, operationId);
      return;
    }

    await this.start(request);
  }

  private async start(request: PlayRequest): Promise<void> {
    this.stopCurrent();
    const operationId = this.operationId;
    this.owner = request;
    this.setState(false, null, true);

    if (request.catalogId) {
      const kit = await this.ensureKit();
      if (this.owner !== request || this.operationId !== operationId) return;
      if (kit) {
        try {
          if (!kit.isAuthorized) await this.withTimeout(kit.authorize());
          if (!kit.isAuthorized) throw new Error('Apple Music authorization unavailable');
          await this.withTimeout(kit.setQueue({ song: request.catalogId }));
          await this.withTimeout(kit.play());
          if (this.owner !== request || this.operationId !== operationId) return;
          this.setState(true, 'full');
          return;
        } catch {
          // The preview remains the playback floor for every MusicKit failure.
        }
      }
    }

    this.fallback(request, operationId);
  }

  private fallback(request: PlayRequest, operationId: number): void {
    if (this.owner !== request || this.operationId !== operationId) return;
    if (this.kit) this.kit.stop().catch(() => undefined);
    this.playPreview(request, operationId);
  }

  pause(): void {
    this.operationId += 1;
    this.clearLoadTimeout();
    if (this.source === 'full' && this.kit) this.kit.pause().catch(() => undefined);
    if (this.source === 'preview' && this.preview) this.preview.pause();
    this.playing = false;
    this.loading = false;
    this.emit();
  }

  seekFraction(fraction: number): void {
    const target = Math.min(1, Math.max(0, fraction)) * this.duration();
    if (!Number.isFinite(target)) return;
    if (this.source === 'full' && this.kit) this.kit.seekToTime(target).catch(() => undefined);
    if (this.source === 'preview' && this.preview) this.preview.currentTime = target;
    this.emit();
  }

  private stopCurrent(): void {
    this.operationId += 1;
    this.clearLoadTimeout();
    if (this.kit) this.kit.stop().catch(() => undefined);
    if (this.preview) {
      this.preview.pause();
      this.preview.currentTime = 0;
    }
    this.playing = false;
    this.loading = false;
    this.source = null;
  }
}

export const musicKitPlayer = new MusicKitPlayer();
