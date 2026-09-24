/**
 * What lives in the sea footer (BlogSeaFooter.astro), brought out by a touch.
 *
 * The first touch of the water always brings a dolphin up beside it; after
 * that the sea answers now and then — a dolphin, a shoal of small fish
 * jumping, or just the splash. A touch on the sky sends a gull off by day and
 * lights a star by night, and every so often a star falls. Drive the sea fast
 * enough and dolphins come to race the boat.
 *
 * Everything here is a one-off Web Animation on a sprite painted by
 * scripts/paint-sillage.ts. Nothing waits on the sea's clock: a leap is a leap
 * at any speed.
 */
import { creatures } from './sillage-motion.json';

const { dolphin, fish, gull, star } = creatures;

/** At most this many of each on the band at once. */
const MAX_DOLPHINS = 2;
const MAX_STARS = 14;
/** Chance that a later touch of the water brings a dolphin, or fish. */
const DOLPHIN_ODDS = 0.28;
const FISH_ODDS = 0.3;
/** Every this many stars, one falls. */
const FALLING = 5;

export interface Shore {
  /** The band's picture, its scale (CSS px per art px), and the near water. */
  sea: HTMLElement;
  scale: () => number;
  /** Layers to slot creatures between: stars go behind the clouds, gulls in
      front of them, anything leaping behind the near water. */
  near: HTMLElement;
  clouds: HTMLElement;
  back: HTMLElement;
  /** Screen y of the near water's surface at screen x. */
  surfaceY: (clientX: number) => number;
  /** A splash on the near water at screen x. */
  splash: (clientX: number, big: boolean) => void;
}

export function life(shore: Shore) {
  const { sea, near, clouds, back } = shore;
  let touched = false;
  let dolphins = 0;
  let stars: HTMLElement[] = [];
  let starCount = 0;
  let escortAt = 0;

  const make = (name: string, before: Element) => {
    const el = document.createElement('i');
    el.className = `sillage-sea__${name}`;
    before.before(el);
    return el;
  };

  /**
   * One leap out of the near water and back in: a parabola from `x` (screen)
   * running `span` art px in `dir`, `height` art px high, the body turned
   * along its path. It starts and ends under the surface, so the near water
   * hides the way in and the way out.
   */
  function leap(name: 'dolphin' | 'fish', x: number, dir: 1 | -1, span: number, height: number, duration: number) {
    const s = shore.scale();
    const box = sea.getBoundingClientRect();
    const size = name === 'dolphin' ? dolphin : fish;
    const w = size.width * s;
    const h = size.height * s;
    const under = (name === 'dolphin' ? 16 : 6) * s;
    const x1 = x + dir * span * s;
    const y0 = shore.surfaceY(x) - box.top + under;
    const y1 = shore.surfaceY(x1) - box.top + under;
    const el = make(name, near);
    const keys: Keyframe[] = [];
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      // A little past both ends, so it is fully under before it shows.
      const t = -0.06 + (i / steps) * 1.12;
      const px = x - box.left + dir * span * s * t;
      const py = y0 + (y1 - y0) * t - 4 * height * s * t * (1 - t);
      const vx = dir * span;
      const vy = y1 - y0 - 4 * height * (1 - 2 * t);
      const turn = dir > 0 ? Math.atan2(vy, vx) : Math.atan2(-vy, -vx);
      keys.push({
        transform: `translate(${px - w / 2}px, ${py - h / 2}px) rotate(${turn}rad)${dir > 0 ? '' : ' scaleX(-1)'}`,
      });
    }
    el.animate(keys, { duration, easing: 'linear' }).onfinish = () => {
      el.remove();
      if (name === 'dolphin') dolphins--;
    };
    // Out through the surface, and back in with a bigger one.
    const entry = 0.06 / 1.12;
    window.setTimeout(() => shore.splash(x, false), duration * entry);
    window.setTimeout(() => shore.splash(x1, name === 'dolphin'), duration * (1 - entry));
  }

  function dolphinNear(x: number, dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1) {
    if (dolphins >= MAX_DOLPHINS) return;
    dolphins++;
    const span = 110 + Math.random() * 60;
    // Start behind the touch, so the leap passes over it.
    leap('dolphin', x - dir * span * 0.35 * shore.scale(), dir, span, 46 + Math.random() * 22, 1150 + Math.random() * 250);
  }

  function shoal(x: number) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      window.setTimeout(
        () => {
          const from = x + (Math.random() - 0.5) * 60 * shore.scale();
          leap('fish', from, dir, 22 + Math.random() * 22, 12 + Math.random() * 16, 480 + Math.random() * 180);
        },
        i * (70 + Math.random() * 90),
      );
    }
  }

  /** A touch on the water, at screen x. */
  function water(x: number) {
    if (!touched) {
      touched = true;
      dolphinNear(x);
      return;
    }
    const roll = Math.random();
    if (roll < DOLPHIN_ODDS) dolphinNear(x);
    else if (roll < DOLPHIN_ODDS + FISH_ODDS) shoal(x);
  }

  /** A gull, off from the touch and away from the middle, rising as it goes. */
  function gullFrom(x: number, y: number) {
    const s = shore.scale();
    const box = sea.getBoundingClientRect();
    const dir = x - box.left < box.width / 2 ? -1 : 1;
    const el = make('gull', back);
    const w = gull.width * s;
    const h = gull.height * s;
    const run = box.width * (0.5 + Math.random() * 0.3);
    const rise = (40 + Math.random() * 50) * s;
    const x0 = x - box.left - w / 2;
    const y0 = y - box.top - h / 2;
    const keys: Keyframe[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      // Glides as it goes: a gentle swell up and down under the climb.
      const bob = Math.sin(t * Math.PI * 3) * 5 * s;
      keys.push({
        transform: `translate(${x0 + dir * run * t}px, ${y0 - rise * t * t + bob}px)${dir > 0 ? '' : ' scaleX(-1)'} scale(${1 - 0.35 * t})`,
        opacity: t > 0.85 ? (1 - t) / 0.15 : 1,
      });
    }
    el.animate(keys, { duration: 5200 + Math.random() * 1500, easing: 'cubic-bezier(.3,.1,.6,1)' }).onfinish = () => el.remove();
  }

  /** A star where the sky was touched, twinkling until it fades. */
  function starAt(x: number, y: number) {
    const s = shore.scale();
    const box = sea.getBoundingClientRect();
    if (stars.length >= MAX_STARS) stars.shift()!.remove();
    starCount++;
    const el = make('star', clouds);
    const scale = 0.7 + Math.random() * 0.6;
    el.style.left = `${x - box.left - (star.width * s) / 2}px`;
    el.style.top = `${y - box.top - (star.height * s) / 2}px`;
    el.style.setProperty('--tw', `${1.4 + Math.random() * 1.6}s`);
    el.animate(
      [
        { transform: 'scale(0) rotate(-40deg)', opacity: 0 },
        { transform: `scale(${scale * 1.4}) rotate(8deg)`, opacity: 1, offset: 0.04 },
        { transform: `scale(${scale})`, opacity: 1, offset: 0.1 },
        { transform: `scale(${scale})`, opacity: 1, offset: 0.85 },
        { transform: `scale(${scale * 0.6})`, opacity: 0 },
      ],
      { duration: 14000, easing: 'ease-out' },
    ).onfinish = () => {
      el.remove();
      stars = stars.filter((other) => other !== el);
    };
    stars.push(el);
    if (starCount % FALLING === 0) fall(x - box.left, y - box.top);
  }

  /** A falling star, streaking down and away across the sky. */
  function fall(x: number, y: number) {
    const s = shore.scale();
    const box = sea.getBoundingClientRect();
    const dir = x < box.width / 2 ? 1 : -1;
    const el = make('meteor', clouds);
    const run = (220 + Math.random() * 160) * s;
    const angle = (18 + Math.random() * 14) * (Math.PI / 180);
    const dx = dir * Math.cos(angle) * run;
    const dy = Math.sin(angle) * run;
    const turn = Math.atan2(dy, dx);
    const from = `translate(${x}px, ${y - 30 * s}px) rotate(${turn}rad)`;
    el.animate(
      [
        { transform: `${from} scaleX(.2)`, opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { transform: `translate(${x + dx}px, ${y - 30 * s + dy}px) rotate(${turn}rad) scaleX(1)`, opacity: 0 },
      ],
      { duration: 900, delay: 350, easing: 'cubic-bezier(.3,0,.8,.6)', fill: 'backwards' },
    ).onfinish = () => el.remove();
  }

  /** A touch on the open sky. */
  function sky(x: number, y: number) {
    if (document.documentElement.classList.contains('dark')) starAt(x, y);
    else gullFrom(x, y);
  }

  /** Called every frame the sea runs; `bow` is the stem's screen x. Fast
      enough, and dolphins come to play at the bow. */
  function escort(rate: number, bow: number, now: number) {
    if (rate < 4 || now - escortAt < 1400) return;
    escortAt = now;
    if (Math.random() < 0.55) dolphinNear(bow + (30 + Math.random() * 90) * shore.scale(), 1);
  }

  return { water, sky, escort };
}
