// Site-wide interaction feedback: a tiny zero-dependency Web Audio "UI sound"
// synth plus haptics. Sounds are synthesised on demand (no assets, no network)
// through one shared AudioContext, which browsers keep suspended until a user
// gesture — so nothing can play on load, only on a real click/keypress. Honours
// prefers-reduced-motion as a silent floor.
//
// The API is intentionally small and semantic: tap (generic tick), select
// (confirm/pick), success (copy landed), open/close (panels). Call it from
// vanilla `<script>` blocks or React islands alike.
//
// Richness comes from cheap tricks, not samples: each voice can spawn a
// detuned chorus pair, the whole sound passes through one lowpass for warmth,
// taps get a filtered noise transient for a physical "tock", success is a real
// C-major arpeggio, and a master compressor glues the layers.
//
// Haptics cover both platforms: navigator.vibrate on Android, and on iPhone the
// ios-haptics trick — toggling a hidden `<input type="checkbox" switch>` fires
// the Taptic engine on iOS 17.4+ Safari, the only web route to real iPhone
// haptics. Apple narrowed it in iOS 26.5, so the very newest iPhones may feel
// nothing; both calls no-op wherever unsupported.

type Sound = 'tap' | 'select' | 'success' | 'open' | 'close';

interface Voice {
  /** Start frequency in Hz. */
  freq: number;
  /** Optional linear glide target in Hz, reached over `dur`. */
  glideTo?: number;
  type?: OscillatorType;
  /** Duration in seconds. */
  dur?: number;
  /** Peak gain (0..1), scaled by the master. */
  gain?: number;
  /** Start offset in seconds, for arpeggios and layering. */
  delay?: number;
  /** Chorus width in cents — spawns a detuned pair for a fuller voice. */
  detune?: number;
}

interface Noise {
  dur: number;
  gain: number;
  /** Bandpass centre in Hz. */
  freq?: number;
  q?: number;
}

interface Recipe {
  voices: Voice[];
  /** Filtered white-noise attack transient (skips the tone filter). */
  noise?: Noise;
  /** Lowpass cutoff in Hz for the tonal voices — lower is warmer/softer. */
  lowpass?: number;
}

// Master is deliberately low — UI feedback should sit under the content, felt
// more than heard. The compressor tames the layered peaks so this stays gentle.
const MASTER_GAIN = 0.085;
const THROTTLE_MS = 30;

const RECIPES: Record<Sound, Recipe> = {
  // Nav tick: a filtered noise transient gives a physical "tock", over a soft
  // sine + a quiet octave so it isn't a bare beep.
  tap: {
    lowpass: 3600,
    noise: { dur: 0.03, gain: 0.5, freq: 1800, q: 0.8 },
    voices: [
      { freq: 660, type: 'sine', dur: 0.05, gain: 0.5 },
      { freq: 1320, type: 'sine', dur: 0.04, gain: 0.14, delay: 0.004 },
    ],
  },
  // Confirm/pick: root + fifth, lightly detuned for chorus width, gliding up a
  // touch so it reads as a positive "yes".
  select: {
    lowpass: 4200,
    voices: [
      { freq: 523.25, glideTo: 560, type: 'triangle', dur: 0.11, gain: 0.5, detune: 7 },
      { freq: 783.99, glideTo: 840, type: 'sine', dur: 0.1, gain: 0.24, delay: 0.01, detune: 6 },
    ],
  },
  // Copy landed: a real C-major arpeggio (C5 E5 G5) staggered up, with an octave
  // shimmer on top — musical, rewarding, unmistakably "done".
  success: {
    lowpass: 5200,
    noise: { dur: 0.02, gain: 0.22, freq: 4200, q: 1.2 },
    voices: [
      { freq: 523.25, type: 'triangle', dur: 0.1, gain: 0.42 },
      { freq: 659.25, type: 'triangle', dur: 0.1, gain: 0.4, delay: 0.055 },
      { freq: 783.99, type: 'sine', dur: 0.16, gain: 0.44, delay: 0.11 },
      { freq: 1567.98, type: 'sine', dur: 0.12, gain: 0.12, delay: 0.11 },
    ],
  },
  // Panel open: warm rising root + fifth.
  open: {
    lowpass: 3800,
    voices: [
      { freq: 392, glideTo: 523.25, type: 'triangle', dur: 0.14, gain: 0.5, detune: 6 },
      { freq: 587.33, glideTo: 783.99, type: 'sine', dur: 0.13, gain: 0.2, delay: 0.012 },
    ],
  },
  // Panel close: the mirror — falling, a touch shorter.
  close: {
    lowpass: 3200,
    voices: [
      { freq: 523.25, glideTo: 392, type: 'triangle', dur: 0.12, gain: 0.46, detune: 6 },
      { freq: 783.99, glideTo: 587.33, type: 'sine', dur: 0.11, gain: 0.18, delay: 0.012 },
    ],
  },
};

const VIBRATION: Record<Sound, number | number[]> = {
  tap: 8,
  select: 12,
  success: [10, 30, 12],
  open: 10,
  close: 6,
};

// The AudioContext, reduced-motion query, noise buffer and haptic switch are
// shared across every bundle (palette script, theme script, React islands) via
// a window slot so we never spin up more than one of each.
interface FeedbackSlot {
  ctx?: AudioContext;
  reduced?: MediaQueryList;
  noise?: AudioBuffer;
  haptic?: HTMLInputElement | null;
  themeAudio?: HTMLAudioElement;
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

const noiseBuffer = (ctx: AudioContext): AudioBuffer => {
  if (slot.noise) return slot.noise;
  const len = Math.floor(ctx.sampleRate * 0.2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  slot.noise = buf;
  return buf;
};

const playVoice = (ctx: AudioContext, dest: AudioNode, v: Voice, now: number): void => {
  const { freq, glideTo, type = 'sine', dur = 0.1, gain = 0.5, delay = 0, detune = 0 } = v;
  const start = now + delay;

  const env = ctx.createGain();
  env.connect(dest);
  // Fast attack, exponential decay — ramps stay above zero so the edges never
  // click.
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

  const spawn = (cents: number) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (glideTo != null) osc.frequency.linearRampToValueAtTime(glideTo, start + dur);
    if (cents) osc.detune.value = cents;
    osc.connect(env);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  };
  // A detuned pair beats against itself for a fuller, chorused voice.
  if (detune) {
    spawn(-detune);
    spawn(detune);
  } else {
    spawn(0);
  }
};

const playNoise = (ctx: AudioContext, dest: AudioNode, n: Noise, now: number): void => {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = n.freq ?? 2000;
  bp.Q.value = n.q ?? 1;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(n.gain, now + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, now + n.dur);

  src.connect(bp).connect(env).connect(dest);
  src.start(now);
  src.stop(now + n.dur + 0.02);
};

const lastPlayed = new Map<Sound, number>();

const playSound = (name: Sound): void => {
  const ctx = audioContext();
  if (!ctx) return;
  // A gesture is what unlocks a suspended context; resume() is a no-op once it
  // is already running.
  if (ctx.state === 'suspended') void ctx.resume();

  const recipe = RECIPES[name];
  const now = ctx.currentTime;

  // master gain → compressor → out. The compressor glues the stacked voices and
  // catches transient peaks so the layering never clips.
  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 3;
  comp.attack.value = 0.003;
  comp.release.value = 0.12;
  master.connect(comp).connect(ctx.destination);

  // One lowpass shapes the tonal voices' warmth; the noise transient keeps its
  // own bandpass and bypasses it for bite.
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = recipe.lowpass ?? 6000;
  tone.Q.value = 0.7;
  tone.connect(master);

  for (const voice of recipe.voices) playVoice(ctx, tone, voice, now);
  if (recipe.noise) playNoise(ctx, master, recipe.noise, now);
};

// ios-haptics: a hidden iOS switch whose toggle fires the Taptic engine. Built
// lazily on first use (a user gesture, so <body> exists), cached on the slot.
const hapticSwitch = (): HTMLInputElement | null => {
  if (slot.haptic !== undefined) return slot.haptic;
  if (typeof document === 'undefined') {
    slot.haptic = null;
    return null;
  }
  const parent = document.body ?? document.documentElement;
  if (!parent) return null; // not cached — retry once the DOM is ready
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', ''); // Safari 17.4+ iOS switch control
  input.setAttribute('aria-hidden', 'true');
  input.tabIndex = -1;
  // Present and interactable, but out of sight and out of the a11y tree. Not
  // display:none — a fully hidden control won't fire the haptic.
  input.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  parent.appendChild(input);
  slot.haptic = input;
  return input;
};

const haptics = (name: Sound): void => {
  // Android: real vibration motor.
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(VIBRATION[name]);
    } catch {
      // Some engines throw when the gesture context has lapsed — ignore.
    }
  }
  // iPhone: toggle the hidden switch to pulse the Taptic engine. No-op elsewhere.
  try {
    hapticSwitch()?.click();
  } catch {
    // ignore — haptics are best-effort
  }
};

const fire = (name: Sound): void => {
  if (prefersReducedMotion()) return;
  const stamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (stamp - (lastPlayed.get(name) ?? -Infinity) < THROTTLE_MS) return;
  lastPlayed.set(name, stamp);
  playSound(name);
  haptics(name);
};

let themeLastPlayed = -Infinity;

const fireTheme = (): void => {
  if (prefersReducedMotion() || typeof Audio === 'undefined') return;
  const stamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (stamp - themeLastPlayed < THROTTLE_MS) return;
  themeLastPlayed = stamp;

  const audio = (slot.themeAudio ??= new Audio('/audio/theme-click.mp3'));
  audio.volume = 0.3;
  audio.currentTime = 0;
  void audio.play().catch(() => {});
  haptics('select');
};

export const feedback = {
  tap: () => fire('tap'),
  select: () => fire('select'),
  success: () => fire('success'),
  open: () => fire('open'),
  close: () => fire('close'),
  theme: fireTheme,
};

export default feedback;
