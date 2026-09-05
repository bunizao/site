// Physical feedback for the timeline wheel: a short click when the dial crosses
// a date, plus a haptic tap where the device supports one. Sound is the cheapest
// way to make a virtual dial feel detented, but it is also the rudest thing a
// page can do uninvited — so it only ever fires inside a deliberate gesture
// (drag, flick or arrow key), never on ordinary scrolling.

const STORAGE_KEY = 'mood-wheel-ticks';

export interface WheelFeedback {
  /**
   * Start the audio engine from inside a pointer or key event. iOS only lets an
   * AudioContext start or resume during a user gesture, and the ticks
   * themselves run from animation frames.
   */
  prime(): void;
  /** Click once. `strength` (0-1) scales volume and pitch with dial speed. */
  tick(strength?: number): void;
  /** A softer, lower click for the moment the dial settles onto a date. */
  settle(): void;
  muted(): boolean;
  setMuted(next: boolean): void;
  destroy(): void;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'off';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on');
  } catch {
    // Private mode and friends: the preference just does not persist.
  }
}

export function createWheelFeedback(): WheelFeedback {
  const silent = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let muted = silent || readMuted();
  let context: AudioContext | null = null;
  let unlocked = false;
  let lastTickAt = 0;

  // Autoplay policy: an AudioContext created outside a user gesture starts
  // suspended and stays that way, so it is built and resumed by prime().
  const ensureContext = (): AudioContext | null => {
    if (context) return context;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    return context;
  };

  const blip = (frequency: number, gainPeak: number, duration: number): void => {
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(frequency, now);
    // A falling pitch over a handful of milliseconds reads as a mechanical
    // click rather than a beep.
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.5, now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  };

  const buzz = (ms: number): void => {
    if (muted) return;
    navigator.vibrate?.(ms);
  };

  return {
    prime() {
      if (muted) return;
      const ctx = ensureContext();
      if (!ctx) return;
      if (ctx.state !== 'running') void ctx.resume();
      if (unlocked) return;
      // iOS does not treat resume() alone as the unlock: a node has to start
      // inside the gesture, once, or ticks scheduled later from animation
      // frames stay silent. A one-sample silent buffer is that node.
      const source = ctx.createBufferSource();
      source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      source.connect(ctx.destination);
      source.start(0);
      unlocked = true;
    },
    tick(strength = 0.5) {
      if (muted) return;
      // A fast spin can cross dates faster than the ear resolves; throttling
      // keeps a rapid pass sounding like a ratchet instead of a smear.
      const now = performance.now();
      if (now - lastTickAt < 28) return;
      lastTickAt = now;

      const intensity = Math.min(Math.max(strength, 0), 1);
      blip(1500 + intensity * 900, 0.012 + intensity * 0.02, 0.018);
      buzz(6);
    },
    settle() {
      if (muted) return;
      blip(760, 0.02, 0.05);
      buzz(12);
    },
    muted: () => muted,
    setMuted(next: boolean) {
      muted = next || silent;
      writeMuted(next);
    },
    destroy() {
      void context?.close();
      context = null;
    },
  };
}
