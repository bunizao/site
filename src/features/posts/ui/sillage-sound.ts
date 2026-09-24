/**
 * Sound for the sea footer (BlogSeaFooter.astro), from the recordings in
 * public/sillage/sound/ (scripts/cut-sillage-sound.sh).
 *
 * The sea is silent until the reader touches it. A browser only lets a page
 * make sound after a gesture, and a page that starts making noise on its own
 * is rude; the first touch on the water opens the sound. From then on the sea
 * answers what the reader does: splashes where they touch, the surf while they
 * play with it, and water rushing along the hull as fast as they drive it.
 * When they stop, it goes quiet again. It is quiet off screen, in a hidden
 * tab, and on an iPhone or iPad with the silent switch on. A switch beside the
 * sea turns it off for good; the choice is remembered.
 */

const BASE = '/sillage/sound/';
/** splash.m4a holds one take per SLOT seconds; BIG of them for a touch, the
    rest for the small splashes a drag leaves. */
const SLOT = 1;
const TAKES = 7;
const BIG = 4;
/** The surf's level while the reader plays with the sea, and for how long it
    stays after they stop, s. */
const SURF = 0.3;
const LINGER = 5;
/** The wash at full speed. */
const WASH = 0.45;
/** Small splashes closer together than this are skipped, s. */
const SPACING = 0.07;

export type Voice = ReturnType<typeof voice>;

type Loop = { gain: GainNode; source: AudioBufferSourceNode };

export function voice(sea: HTMLElement) {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let splashBytes: Promise<ArrayBuffer | null> | null = null;
  let splashes: Promise<AudioBuffer | null> | null = null;
  let surf: Loop | null = null;
  let wash: Loop | null = null;
  let lastPlay = -Infinity;
  let lastSmall = -Infinity;
  let speed = 1;
  let timer = 0;
  let muted = false;

  const fetchBytes = (name: string) =>
    fetch(BASE + name)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);

  const decode = (bytes: Promise<ArrayBuffer | null>) =>
    bytes.then((b) => (b && ctx ? ctx.decodeAudioData(b) : null)).catch(() => null);

  function loop(name: string, keep: (loop: Loop) => void) {
    decode(fetchBytes(name)).then((buffer) => {
      if (!buffer || !ctx) return;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain).connect(master);
      source.start();
      keep({ gain, source });
      mix();
    });
  }

  /** Sets both beds for the sea's speed and how recently the reader played,
      and checks back when that changes on its own. */
  function mix() {
    if (!ctx) return;
    const now = ctx.currentTime;
    const heard = !muted && sea.hasAttribute('data-awake') && !document.hidden;
    const playing = heard && (now - lastPlay < LINGER || speed > 1.05);
    const drive = Math.min(1, Math.max(0, (speed - 1) / 6));
    surf?.gain.gain.setTargetAtTime(playing ? SURF * (1 + 0.4 * drive) : 0, now, playing ? 0.6 : 1.2);
    wash?.gain.gain.setTargetAtTime(playing ? WASH * drive : 0, now, 0.25);
    wash?.source.playbackRate.setTargetAtTime(1 + 0.25 * drive, now, 0.25);

    clearTimeout(timer);
    if (playing) {
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      timer = window.setTimeout(mix, Math.max(0.25, lastPlay + LINGER - now) * 1000);
    } else {
      // Faded out: let the audio sleep, so a quiet sea holds nothing open.
      timer = window.setTimeout(() => ctx?.suspend(), 5000);
    }
  }

  function play() {
    if (!ctx) return;
    lastPlay = ctx.currentTime;
    mix();
  }

  /** Called on every touch of the sea. The first opens the sound. */
  function wake() {
    if (muted) return;
    if (!ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      // Mix with whatever else is playing, and obey the silent switch.
      const session = (navigator as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'ambient';
      ctx = new Ctx();
      master = ctx.createGain();
      master.connect(ctx.destination);
      splashes = decode(splashBytes ?? fetchBytes('splash.m4a'));
      loop('surf.m4a', (l) => (surf = l));
      loop('wash.m4a', (l) => (wash = l));
    }
    play();
  }

  /** A splash at pan -1 (left edge) to 1 (right edge); deeper for the boat. */
  function splash(pan: number, big: boolean, deep = false) {
    if (muted || !ctx || !splashes) return;
    if (!big) {
      if (ctx.currentTime - lastSmall < SPACING) return;
      lastSmall = ctx.currentTime;
    }
    play();
    splashes.then((buffer) => {
      if (!buffer || !ctx) return;
      const take = big ? Math.floor(Math.random() * BIG) : BIG + Math.floor(Math.random() * (TAKES - BIG));
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = (deep ? 0.72 : big ? 0.9 : 1.1) + Math.random() * 0.2;
      const gain = ctx.createGain();
      gain.gain.value = big ? 0.6 : 0.2;
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan)) * 0.6;
      source.connect(gain).connect(panner).connect(master);
      source.start(0, take * SLOT, SLOT);
    });
  }

  /** The sea's playback rate, whenever it changes. Driving it is playing
      with it, whether by finger or by scroll. */
  function drive(rate: number) {
    if (!ctx || Math.abs(rate - speed) < 0.02) return;
    const faster = rate > speed && rate > 1.05;
    speed = rate;
    if (faster) play();
    else mix();
  }

  /** Off cuts everything at once; back on is a gesture, so it opens the
      sound and answers with a splash. */
  function mute(off: boolean) {
    muted = off;
    if (ctx) master.gain.setTargetAtTime(off ? 0 : 1, ctx.currentTime, 0.04);
    if (off) mix();
    else {
      wake();
      splash(0.6, true);
    }
  }

  // The splash takes are small: fetch them as the band comes near, so the
  // first touch is not silent while they load.
  new MutationObserver(() => {
    if (sea.hasAttribute('data-seen')) splashBytes ??= fetchBytes('splash.m4a');
    mix();
  }).observe(sea, { attributes: true, attributeFilter: ['data-seen', 'data-awake'] });
  document.addEventListener('visibilitychange', mix);

  return { wake, splash, drive, mute };
}
