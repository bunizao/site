// The desk's sounds, made on the spot with Web Audio, so there are no files
// to fetch. A palette knife drags wet paint across the canvas when a section
// opens and scrapes it off on the way back, and the thing that was opened
// makes its own small noise: the needle going down on the record, a spoon on
// the cup, pages, a card on its lanyard, leaves, a frame knocked against the
// wall. The lamp's chain clicks.
//
// Nothing plays before the page has been touched, so nothing ever plays on
// its own, and the speaker in the letterhead turns it all off, for this visit
// and the next.

export type Sound = 'lay' | 'scrape' | 'chain' | 'needle' | 'clink' | 'pages' | 'card' | 'leaves' | 'knock' | 'tick';

interface Options {
  /** For the chain: which way the switch went. */
  on?: boolean;
}

const KEY = 'desk-sound';
const LEVEL = 0.5;

let audio: AudioContext | null = null;
let out: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === 'off';
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(KEY, value ? 'off' : 'on');
  } catch {
    // A private window keeps the choice for this visit only.
  }
}

function context() {
  if (audio) return audio;
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  audio = new Context();
  // A gentle limiter: a dozen crackles landing together stay civil.
  const limiter = audio.createDynamicsCompressor();
  limiter.threshold.value = -16;
  limiter.ratio.value = 4;
  out = audio.createGain();
  out.gain.value = LEVEL;
  out.connect(limiter).connect(audio.destination);
  noise = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return audio;
}

interface Band {
  type: BiquadFilterType;
  from: number;
  /** Where the filter has swept to by the end. */
  to?: number;
  q?: number;
}

/**
 * Noise through a filter, `length` seconds long. `grain` (0..1) flutters the
 * level the way a blade catches on the canvas's weave.
 */
function hiss(a: AudioContext, at: number, length: number, band: Band, level: number, attack = 0.01, grain = 0) {
  if (!noise || !out) return;
  // A jittered start can fall before the clock of a context that has just
  // begun, and scheduling in the past throws.
  at = Math.max(at, a.currentTime);
  const source = a.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  const filter = a.createBiquadFilter();
  filter.type = band.type;
  filter.frequency.setValueAtTime(band.from, at);
  if (band.to) filter.frequency.exponentialRampToValueAtTime(band.to, at + length);
  filter.Q.value = band.q ?? 1;
  const gain = a.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + attack);
  const fade = at + Math.max(attack, length * 0.7);
  if (grain) {
    for (let t = at + attack; t < fade; t += 0.009 + Math.random() * 0.014) gain.gain.setTargetAtTime(level * (1 - grain * Math.random()), t, 0.003);
  }
  gain.gain.setTargetAtTime(0, fade, Math.max(0.002, (at + length - fade) / 3));
  source.connect(filter).connect(gain).connect(out);
  source.start(at, Math.random() * 1.5);
  source.stop(at + length + 0.2);
}

/** A struck tone ringing down over `decay` seconds. */
function ring(a: AudioContext, at: number, frequency: number, decay: number, level: number, type: OscillatorType = 'sine') {
  if (!out) return;
  const tone = a.createOscillator();
  tone.type = type;
  tone.frequency.value = frequency;
  const gain = a.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  tone.connect(gain).connect(out);
  tone.start(at);
  tone.stop(at + decay + 0.05);
}

const jitter = (spread: number) => (Math.random() - 0.5) * 2 * spread;

const SOUNDS: Record<Sound, (a: AudioContext, at: number, options: Options) => void> = {
  // Four passes of the knife through wet paint, over the length of the coat:
  // a soft, rising swish over a low squelch.
  lay: (a, at) => {
    for (let i = 0; i < 4; i++) {
      const from = 620 + i * 90 + jitter(60);
      hiss(a, at + i * 0.13 + jitter(0.02), 0.24 + Math.random() * 0.08, { type: 'bandpass', from, to: from * 2.3, q: 0.9 }, 0.26, 0.03, 0.35);
    }
    hiss(a, at, 0.58, { type: 'lowpass', from: 360 }, 0.12, 0.05, 0.25);
  },
  // Three dry drags, higher and grittier: the coat coming off.
  scrape: (a, at) => {
    for (let i = 0; i < 3; i++) {
      hiss(a, at + i * 0.12 + jitter(0.015), 0.18 + Math.random() * 0.05, { type: 'bandpass', from: 2100 + jitter(200), to: 3400, q: 1.4 }, 0.2, 0.008, 0.6);
    }
    hiss(a, at, 0.42, { type: 'highpass', from: 5000 }, 0.05, 0.02, 0.5);
  },
  // The beads of the chain, then the switch, a tock lower going off. A bulb
  // coming on gives a faint ping as its filament heats.
  chain: (a, at, { on = true }) => {
    for (let i = 0; i < 6; i++) hiss(a, at + i * 0.011 + Math.random() * 0.006, 0.006, { type: 'bandpass', from: 5200 + Math.random() * 1600, q: 7 }, 0.2, 0.001);
    const click = at + 0.075;
    ring(a, click, on ? 2100 : 1650, 0.035, 0.22, 'triangle');
    hiss(a, click, 0.012, { type: 'highpass', from: 2400 }, 0.3, 0.001);
    if (on) ring(a, click + 0.03, 3900, 0.16, 0.025);
  },
  // The needle going down: a thump through the tonearm, then the crackle of
  // the lead-in groove, thinning out.
  needle: (a, at) => {
    ring(a, at, 64, 0.2, 0.4);
    hiss(a, at, 0.01, { type: 'lowpass', from: 2400 }, 0.25, 0.001);
    hiss(a, at + 0.04, 1.6, { type: 'bandpass', from: 4200, q: 0.5 }, 0.022, 0.15);
    for (let i = 0; i < 42; i++) {
      const t = Math.random() ** 1.5 * 1.6;
      hiss(a, at + 0.05 + t, 0.002 + Math.random() * 0.003, { type: 'bandpass', from: 1600 + Math.random() * 3600, q: 1.5 }, 0.32 * (1 - t / 1.7) * Math.random(), 0.0005);
    }
  },
  // A spoon against the cup, and a smaller bounce: a few inharmonic
  // partials, the high ones dying first.
  clink: (a, at) => {
    for (const [delay, level] of [[0, 1], [0.12, 0.45]] as const) {
      const pitch = 1 + jitter(0.012);
      for (const [frequency, decay, gain] of [[2480, 0.34, 0.2], [3910, 0.22, 0.1], [5650, 0.13, 0.05], [7020, 0.08, 0.025]] as const) {
        ring(a, at + delay, frequency * pitch, decay, gain * level);
      }
      hiss(a, at + delay, 0.006, { type: 'highpass', from: 4000 }, 0.12 * level, 0.0005);
    }
  },
  // Pages riffled under a thumb, and the book falling open.
  pages: (a, at) => {
    for (let i = 0; i < 6; i++) {
      hiss(a, at + i * 0.034 + jitter(0.006), 0.05, { type: 'bandpass', from: 1800 + Math.random() * 1200, to: 3200, q: 1.1 }, 0.16 * (1 - i * 0.1), 0.004, 0.2);
    }
    hiss(a, at + 0.24, 0.08, { type: 'lowpass', from: 480 }, 0.24, 0.004);
  },
  // A plastic card clacking on its clip, the clip jingling.
  card: (a, at) => {
    for (const [delay, level] of [[0, 1], [0.06, 0.45]] as const) {
      hiss(a, at + delay, 0.014, { type: 'bandpass', from: 1500, q: 3 }, 0.34 * level, 0.001);
      ring(a, at + delay, 960, 0.045, 0.08 * level, 'triangle');
    }
    ring(a, at + 0.03, 4700, 0.07, 0.03);
    ring(a, at + 0.035, 6100, 0.05, 0.02);
  },
  // Leaves brushed past.
  leaves: (a, at) => {
    for (let i = 0; i < 3; i++) hiss(a, at + i * 0.07 + jitter(0.02), 0.34, { type: 'bandpass', from: 3200 + Math.random() * 2400, q: 0.8 }, 0.11, 0.04, 0.85);
  },
  // The frame knocking the wall as it swings on its nail, twice.
  knock: (a, at) => {
    for (const [delay, level] of [[0, 1], [0.14, 0.4]] as const) {
      ring(a, at + delay, 185, 0.1, 0.34 * level);
      ring(a, at + delay, 420, 0.06, 0.1 * level);
      hiss(a, at + delay, 0.02, { type: 'lowpass', from: 1300 }, 0.28 * level, 0.001);
    }
  },
  tick: (a, at) => {
    ring(a, at, 1500, 0.03, 0.14, 'triangle');
  },
};

export function play(name: Sound, options: Options = {}) {
  if (muted) return;
  // Before any gesture an AudioContext only refuses, with a console warning.
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (activation && !activation.hasBeenActive) return;
  const a = context();
  if (!a) return;
  if (a.state === 'suspended') void a.resume();
  SOUNDS[name](a, a.currentTime + 0.012, options);
}

/** The speaker in the letterhead. */
export function initSoundToggle() {
  const button = document.querySelector<HTMLButtonElement>('[data-sound]');
  if (!button) return;
  button.setAttribute('aria-pressed', String(!muted));
  button.addEventListener('click', () => {
    setMuted(!muted);
    button.setAttribute('aria-pressed', String(!muted));
    play('tick');
  });
}
