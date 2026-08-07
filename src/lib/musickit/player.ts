// Preview playback singleton: the one audio brain for the whole site.
//
// The server now serves Apple's 90s extended preview through `previewUrl` (see
// site-api extended-preview.ts), so full-track MusicKit streaming is gone from
// the client entirely. That was a deliberate trade: full track only ever helped
// already-authorized subscribers, yet it dragged in the MusicKit SDK, a token
// endpoint, and an authorize() call that popped Apple's login sheet on the first
// tap — burying the demo behind a wall. A plain HTMLAudioElement plays the
// preview (30s or 90s) instantly, cross-origin, with zero login and zero SDK.
//
// One global instance gives us free single-owner preemption: starting any track
// stops whatever was playing. Nothing loads until the first play tap (lazy),
// keeping the "calm, zero client request" page contract intact.

export interface PlayRequest {
  /** Apple Music catalog song id. Kept for call-site compatibility; unused. */
  catalogId?: string;
  /** Preview URL (30s or 90s extended). The only audio source. */
  previewUrl?: string;
}

// 'full' is never produced anymore, but the union stays for API compatibility
// with consumers that branch on snapshot.source.
export type PlaybackSource = 'full' | 'preview' | null;

export interface PlaybackSnapshot {
  /** The request currently owning playback, by identity. */
  owner: PlayRequest | null;
  isPlaying: boolean;
  isLoading: boolean;
  /** Which engine is producing sound. Always 'preview' or null now. */
  source: PlaybackSource;
  currentTime: number;
  duration: number;
}

type Listener = (snapshot: PlaybackSnapshot) => void;

/** Give up on a preview that never reaches playback within this window. */
const LOAD_TIMEOUT_MS = 10_000;

class PreviewPlayer {
  private audio: HTMLAudioElement | null = null;

  private owner: PlayRequest | null = null;
  private source: PlaybackSource = null;
  private playing = false;
  private loading = false;

  private listeners = new Set<Listener>();
  private rafId = 0;
  // Every start/stop bumps the token so a late-settling play() promise from an
  // abandoned attempt can't flip state back on.
  private startToken = 0;
  private loadTimer = 0;

  /** Subscribe to playback snapshots; returns an unsubscribe fn. */
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
    return this.source === 'preview' && this.audio ? this.audio.currentTime || 0 : 0;
  }

  private duration(): number {
    if (this.source === 'preview' && this.audio) {
      return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
    }
    return 0;
  }

  private emit(): void {
    const snap = this.snapshot();
    this.listeners.forEach((listener) => listener(snap));
  }

  // Drive a lightweight rAF loop only while playing, so progress bars track
  // time without a permanent timer.
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
    this.loading = loading;
    this.source = source;
    this.emit();
    if (playing) this.startTicker();
  }

  private clearLoadTimeout(): void {
    if (!this.loadTimer) return;
    window.clearTimeout(this.loadTimer);
    this.loadTimer = 0;
  }

  // A preview that never reaches playback (dead CDN edge, offline mid-request)
  // would otherwise leave the card spinning forever, so bound the wait.
  private armLoadTimeout(token: number): void {
    this.clearLoadTimeout();
    this.loadTimer = window.setTimeout(() => {
      this.loadTimer = 0;
      if (this.startToken !== token || !this.loading) return;
      this.stopCurrent();
      this.emit();
    }, LOAD_TIMEOUT_MS);
  }

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'none';
      this.audio.addEventListener('ended', () => {
        this.clearLoadTimeout();
        this.playing = false;
        this.loading = false;
        // Emit the final media position before clearing the source so playback
        // analytics can recognize completion even when background rAF is throttled.
        this.emit();
        this.source = null;
        this.emit();
      });
      this.audio.addEventListener('pause', () => {
        if (this.source === 'preview') {
          this.playing = false;
          this.emit();
        }
      });
      // Mid-track rebuffering reuses the loading state, so the card shows the
      // same spinner it shows on the first tap.
      this.audio.addEventListener('waiting', () => {
        if (this.source !== 'preview' || this.loading) return;
        this.loading = true;
        this.emit();
        this.armLoadTimeout(this.startToken);
      });
      this.audio.addEventListener('playing', () => {
        if (this.source !== 'preview') return;
        this.clearLoadTimeout();
        this.setState(true, 'preview');
      });
      this.audio.addEventListener('error', () => {
        if (this.source !== 'preview') return;
        this.stopCurrent();
        this.emit();
      });
    }
    return this.audio;
  }

  /**
   * Toggle playback for a request. Same owner playing (or still loading) means
   * stop; otherwise start or resume in place. Preview plays instantly — no
   * login, no SDK.
   */
  async toggle(request: PlayRequest): Promise<void> {
    const sameOwner = this.owner === request;
    // Loading counts as "on": a second tap must be able to abort a preview that
    // is taking too long, not queue another play() behind it.
    if (sameOwner && (this.playing || this.loading)) {
      this.pause();
      return;
    }
    if (sameOwner && this.source && this.audio) {
      // Resume in place.
      const token = ++this.startToken;
      this.setState(false, 'preview', true);
      this.armLoadTimeout(token);
      this.audio.play().then(
        () => {
          if (this.startToken !== token) return;
          this.clearLoadTimeout();
          this.setState(true, 'preview');
        },
        () => {
          if (this.startToken !== token) return;
          this.clearLoadTimeout();
          this.setState(false, null);
        },
      );
      return;
    }

    this.start(request);
  }

  private start(request: PlayRequest): void {
    this.stopCurrent();
    this.owner = request;

    if (!request.previewUrl) {
      this.setState(false, null);
      return;
    }

    const token = this.startToken;
    const audio = this.ensureAudio();
    if (audio.src !== request.previewUrl) audio.src = request.previewUrl;
    this.setState(false, 'preview', true);
    this.armLoadTimeout(token);
    audio.play().then(
      () => {
        // The attempt may have been aborted while play() awaited its first frame.
        if (this.startToken !== token) return;
        this.clearLoadTimeout();
        this.setState(true, 'preview');
      },
      () => {
        if (this.startToken !== token) return;
        this.clearLoadTimeout();
        this.setState(false, null);
      },
    );
  }

  pause(): void {
    this.startToken += 1;
    this.clearLoadTimeout();
    if (this.source === 'preview' && this.audio) this.audio.pause();
    this.playing = false;
    this.loading = false;
    this.emit();
  }

  /** Seek within the current track. Fraction is 0..1 of duration. */
  seekFraction(fraction: number): void {
    const clamped = Math.min(1, Math.max(0, fraction));
    const target = clamped * this.duration();
    if (!Number.isFinite(target)) return;
    if (this.source === 'preview' && this.audio) this.audio.currentTime = target;
    this.emit();
  }

  private stopCurrent(): void {
    this.startToken += 1;
    this.clearLoadTimeout();
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.playing = false;
    this.loading = false;
    this.source = null;
  }
}

// The one instance. Importers share it for single-owner playback preemption.
export const musicKitPlayer = new PreviewPlayer();
