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
  /** Which engine is producing sound. Always 'preview' or null now. */
  source: PlaybackSource;
  currentTime: number;
  duration: number;
}

type Listener = (snapshot: PlaybackSnapshot) => void;

class PreviewPlayer {
  private audio: HTMLAudioElement | null = null;

  private owner: PlayRequest | null = null;
  private source: PlaybackSource = null;
  private playing = false;

  private listeners = new Set<Listener>();
  private rafId = 0;

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

  private setState(playing: boolean, source: PlaybackSource): void {
    this.playing = playing;
    this.source = source;
    this.emit();
    if (playing) this.startTicker();
  }

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'none';
      this.audio.addEventListener('ended', () => this.setState(false, null));
      this.audio.addEventListener('pause', () => {
        if (this.source === 'preview') {
          this.playing = false;
          this.emit();
        }
      });
    }
    return this.audio;
  }

  /**
   * Toggle playback for a request. Same owner playing means pause; otherwise
   * start (or resume in place). Preview plays instantly — no login, no SDK.
   */
  async toggle(request: PlayRequest): Promise<void> {
    const sameOwner = this.owner === request;
    if (sameOwner && this.playing) {
      this.pause();
      return;
    }
    if (sameOwner && this.source && !this.playing && this.audio) {
      // Resume in place.
      this.audio.play().then(
        () => this.setState(true, 'preview'),
        () => this.setState(false, null),
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

    const audio = this.ensureAudio();
    if (audio.src !== request.previewUrl) audio.src = request.previewUrl;
    this.source = 'preview';
    audio.play().then(
      () => {
        // Owner may have changed while play() awaited the first frame.
        if (this.owner === request) this.setState(true, 'preview');
      },
      () => {
        if (this.owner === request) this.setState(false, null);
      },
    );
  }

  pause(): void {
    if (this.source === 'preview' && this.audio) this.audio.pause();
    this.playing = false;
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
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.playing = false;
    this.source = null;
  }
}

// The one instance. Importers share it for single-owner playback preemption.
export const musicKitPlayer = new PreviewPlayer();
