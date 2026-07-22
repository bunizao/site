// Site-wide interaction feedback: a tiny zero-dependency Web Audio "UI sound"
// synth plus Android vibration. Sounds are synthesised on demand (no assets, no
// network) through one shared AudioContext, which browsers keep suspended until
// a user gesture — so nothing can play on load, only on a real click/keypress.
// Honours prefers-reduced-motion as a silent floor.
//
// The API is intentionally small and semantic: tap (generic tick), select
// (confirm/pick), success (copy landed), open/close (panels). Call it from
// vanilla `<script>` blocks or React islands alike.
//
// Vibration is Android-only reality: iOS Safari has never shipped navigator
// .vibrate and the one Taptic hack was patched shut in iOS 26.5. So vibrate()
// is a graceful no-op on iPhone — do not expect a buzz there.

type Sound = 'tap' | 'select' | 'success' | 'open' | 'close';

interface Blip {
  /** Start frequency in Hz. */
  freq: number;
  /** Optional linear glide target in Hz, reached over `dur`. */
  glideTo?: number;
  type?: OscillatorType;
  /** Duration in seconds. */
  dur?: number;
  /** Peak gain (0..1), scaled by the master. */
  gain?: number;
  /** Start offset in seconds, for layering. */
  delay?: number;
}

// Master is deliberately low — UI feedback should sit under the content, felt
// more than heard.
const MASTER_GAIN = 0.09;
const THROTTLE_MS = 30;

const RECIPES: Record<Sound, Blip[]> = {
  tap: [{ freq: 600, type: 'sine', dur: 0.05, gain: 0.6 }],
  select: [{ freq: 520, glideTo: 780, type: 'sine', dur: 0.09, gain: 0.7 }],
  success: [
    { freq: 660, type: 'sine', dur: 0.07, gain: 0.7 },
    { freq: 990, type: 'sine', dur: 0.11, gain: 0.6, delay: 0.06 },
  ],
  open: [{ freq: 400, glideTo: 560, type: 'sine', dur: 0.11, gain: 0.55 }],
  close: [{ freq: 560, glideTo: 380, type: 'sine', dur: 0.11, gain: 0.55 }],
};

const VIBRATION: Record<Sound, number | number[]> = {
  tap: 8,
  select: 12,
  success: [10, 30, 12],
  open: 10,
  close: 6,
};

// The AudioContext and reduced-motion query are shared across every bundle
// (palette script, theme script, React islands) via a window slot so we never
// spin up more than one context.
interface FeedbackSlot {
  ctx?: AudioContext;
  reduced?: MediaQueryList;
}
const slot: FeedbackSlot =
  typeof window !== 'undefined'
    ? ((window as unknown as { __uiFeedback__?: FeedbackSlot }).__uiFeedback__ ??= {})
    : {};

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  slot.reduced ??= window.matchMedia('(prefers-reduced-motion: reduce)');
  return slot.reduced.matches;
};

const audioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  slot.ctx ??= new AC();
  return slot.ctx;
};

const lastPlayed = new Map<Sound, number>();

const playSound = (name: Sound): void => {
  const ctx = audioContext();
  if (!ctx) return;
  // A gesture is what unlocks a suspended context; resume() is a no-op once it
  // is already running.
  if (ctx.state === 'suspended') void ctx.resume();

  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(ctx.destination);

  const now = ctx.currentTime;
  for (const blip of RECIPES[name]) {
    const { freq, glideTo, type = 'sine', dur = 0.08, gain = 0.6, delay = 0 } = blip;
    const start = now + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (glideTo != null) osc.frequency.linearRampToValueAtTime(glideTo, start + dur);
    // Fast attack, exponential decay — ramps stay above zero so the edges never
    // click.
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(env).connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
};

const vibrate = (name: Sound): void => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(VIBRATION[name]);
  } catch {
    // Some engines throw when the gesture context has lapsed — ignore.
  }
};

const fire = (name: Sound): void => {
  if (prefersReducedMotion()) return;
  const stamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (stamp - (lastPlayed.get(name) ?? -Infinity) < THROTTLE_MS) return;
  lastPlayed.set(name, stamp);
  playSound(name);
  vibrate(name);
};

export const feedback = {
  tap: () => fire('tap'),
  select: () => fire('select'),
  success: () => fire('success'),
  open: () => fire('open'),
  close: () => fire('close'),
};

export default feedback;
