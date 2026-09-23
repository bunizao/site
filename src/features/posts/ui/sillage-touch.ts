/**
 * Touch for the sea footer (BlogSeaFooter.astro).
 *
 * A touch on the water splashes on the painted surface under the finger. A
 * sideways drag takes hold of the sea: the water moves with the finger — hold
 * still and the sea stops, sweep and it runs — and on release it coasts back
 * to its own pace. Splashes close to the boat rock her, and a touch on the
 * boat ducks her.
 *
 * The sea's speed is one playback rate applied to every CSS animation in the
 * band. They all share one clock, so the boat's ride, the bow wave and the
 * wake stay true to the water at any speed.
 */
import { front, near, period, tile } from './sillage-motion.json';
import { surfaceDepth, type Swell } from './sillage-surface';

/** The fastest a finger can drive the sea, as a multiple of its own pace. */
const MAX_RATE = 10;
/** Seconds for the sea to take up the finger's speed, and to give it back. */
const GRIP = 0.06;
const COAST = 0.9;
/** Finger travel between the small splashes a drag leaves, art px. */
const TRAIL = 30;
/** Splashes this close to the boat rock her, art px. */
const REACH = 150;
const MAX_SPLASHES = 18;
const FOAM_ROWS = 6;
const DROP_ROWS = 4;

interface Row {
  el: HTMLElement;
  swell: Swell;
  surface: number;
  lean: number;
  period: number;
}

interface Finger {
  id: number;
  row: Row;
  x0: number;
  y0: number;
  x: number;
  sideways: boolean;
  trail: number;
  track: { x: number; t: number }[];
}

interface Splash {
  el: HTMLElement;
  row: Row;
  x: number;
  end: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function stir(sea: HTMLElement) {
  const part = (name: string) => sea.querySelector<HTMLElement>(`.sillage-sea__${name}`)!;
  const boat = part('boat');
  // Front to back: the front row is the first water a finger meets.
  const rows: Row[] = [
    { el: part('front'), ...front },
    { el: part('near'), ...near, period },
  ];
  const nearRow = rows[1];
  const still = matchMedia('(prefers-reduced-motion: reduce)');

  let s = 1;
  let dim = 1;
  let boatAt = 0.33;
  let rate = 1;
  let clocks: Animation[] = [];
  let finger: Finger | null = null;
  // The boat's extra rock (deg) and dip (art px), each a damped spring.
  let tilt = 0;
  let spin = 0;
  let dip = 0;
  let sink = 0;
  let splashes: Splash[] = [];
  let frame = 0;
  let last = 0;

  function measure() {
    const style = getComputedStyle(sea);
    s = parseFloat(style.getPropertyValue('--s')) || 1;
    dim = parseFloat(style.getPropertyValue('--dim')) || 1;
    boatAt = (parseFloat(style.getPropertyValue('--boat-x')) || 33) / 100;
  }

  /** Screen y of a row's painted surface at screen x. */
  function surfaceY(row: Row, clientX: number) {
    const box = row.el.getBoundingClientRect();
    const x = ((((clientX - box.left) / s) % tile) + tile) % tile;
    return box.top + surfaceDepth(row.swell, row.surface, row.lean, tile, x) * s;
  }

  /** The water under a point, front to back; none in open sky. The near row
      also takes touches on the back swell just above it. */
  function rowAt(clientX: number, clientY: number) {
    if (clientY >= surfaceY(rows[0], clientX) - 4 * s) return rows[0];
    if (clientY >= surfaceY(nearRow, clientX) - 28 * s) return nearRow;
    return null;
  }

  function splash(clientX: number, row: Row, big: boolean) {
    if (splashes.length >= MAX_SPLASHES) splashes.shift()!.el.remove();
    const band = sea.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'sillage-sea__splash';
    el.style.left = `${clientX - band.left}px`;
    el.style.top = `${surfaceY(row, clientX) - band.top}px`;
    // Near water splashes behind the front row, front water in front of it.
    if (row === nearRow) rows[0].el.before(el);
    else sea.append(el);

    // Foam running off both ways. The two spreads are the same sprite, thick
    // end on the point of impact; the right-hand one is mirrored.
    const k = big ? 1 : 0.6;
    const life = big ? 1700 : 1100;
    for (const dir of [-1, 1]) {
      const foam = document.createElement('i');
      foam.className = 'sillage-sea__spread';
      foam.style.setProperty('--v', String(Math.floor(Math.random() * FOAM_ROWS)));
      foam.style.setProperty('--k', String(k));
      el.append(foam);
      const run = (big ? 16 : 9) * s * dir;
      foam.animate(
        [
          { transform: `translateX(0) scaleX(${-0.15 * dir})`, opacity: 0 },
          { opacity: 0.95 * dim, offset: 0.12 },
          { transform: `translateX(${run}px) scaleX(${-1.3 * dir})`, opacity: 0 },
        ],
        { duration: life, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
      );
    }

    // Droplets thrown up, falling back under gravity.
    let end = life;
    if (big) {
      const gravity = 620 * s;
      for (let i = 0; i < 10; i++) {
        const drop = document.createElement('i');
        drop.className = 'sillage-sea__drop';
        drop.style.setProperty('--v', String(i % DROP_ROWS));
        el.append(drop);
        // Mostly up, a few flung wide; the wide ones go low.
        const angle = (Math.random() - 0.5) * (i < 6 ? 0.9 : 1.8);
        const speed = (90 + Math.random() * (i < 6 ? 100 : 50)) * s;
        const vx = Math.sin(angle) * speed;
        const vy = Math.cos(angle) * speed;
        const flight = (2 * vy) / gravity;
        const keys: Keyframe[] = [];
        for (let j = 0; j <= 8; j++) {
          const t = (j / 8) * flight;
          const y = vy * t - (gravity * t * t) / 2;
          keys.push({ transform: `translate(${vx * t}px, ${-y}px) scale(${1 - 0.45 * (j / 8)})`, opacity: j === 8 ? 0 : dim });
        }
        drop.animate(keys, { duration: flight * 1000, fill: 'forwards' });
        end = Math.max(end, flight * 1000);
      }
    }

    // The swell a splash sends out reaches the boat if it is close enough: a
    // splash ahead of her lifts the bow, one astern lifts the stern.
    const from = (clientX - band.left - band.width * boatAt) / s;
    if (Math.abs(from) < REACH) {
      const push = 1 - Math.abs(from) / REACH;
      spin -= Math.sign(from) * push * (big ? 28 : 7);
      sink += push * (big ? 26 : 6);
    }
    splashes.push({ el, row, x: 0, end: performance.now() + end });
  }

  /** The finger's speed over the last tenth of a second, CSS px/s. Zero once
      it holds still, which is what stops the sea under it. */
  function velocity(now: number) {
    if (!finger) return 0;
    const track = finger.track;
    let base = 0;
    while (base + 1 < track.length && track[base + 1].t <= now - 100) base++;
    track.splice(0, base);
    const span = (now - track[0].t) / 1000;
    return span > 0 ? (finger.x - track[0].x) / span : 0;
  }

  function tick() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // The sea: held sideways, it goes at the finger's speed, measured against
    // the row the finger took hold of. It can be stopped, never run backwards.
    const held = finger?.sideways ? finger : null;
    const want = held ? clamp(-velocity(now) / ((tile * s) / held.row.period), 0, MAX_RATE) : 1;
    rate += (want - rate) * (1 - Math.exp(-dt / (held ? GRIP : COAST)));
    for (const clock of clocks) clock.playbackRate = rate;

    // The boat leans into a push, bow down, and rocks back from a splash.
    const heel = clamp((rate - 1) * 0.6, -1, 5);
    spin += (24 * (heel - tilt) - 2 * spin) * dt;
    tilt += spin * dt;
    sink += (-40 * dip - 3.2 * sink) * dt;
    dip += sink * dt;
    boat.style.transform = `translateY(${dip * s}px) rotate(${tilt}deg)`;

    // Splashes ride the water they fell on.
    for (const splash of splashes) {
      splash.x -= ((tile * s) / splash.row.period) * rate * dt;
      splash.el.style.translate = `${splash.x}px 0`;
    }
    splashes = splashes.filter((splash) => splash.end > now || (splash.el.remove(), false));

    const calm =
      !finger &&
      Math.abs(rate - 1) < 0.003 &&
      Math.abs(tilt) + Math.abs(dip) < 0.03 &&
      Math.abs(spin) + Math.abs(sink) < 0.1 &&
      !splashes.length;
    if (calm) {
      rate = 1;
      tilt = spin = dip = sink = 0;
      for (const clock of clocks) clock.playbackRate = 1;
      boat.style.transform = '';
      frame = 0;
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function wake() {
    if (frame) return;
    clocks = sea.getAnimations({ subtree: true }).filter((a) => a instanceof CSSAnimation);
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  sea.addEventListener('pointerdown', (e) => {
    if (still.matches || finger || (e.pointerType === 'mouse' && e.button !== 0)) return;
    measure();
    const onBoat = boat.contains(e.target as Node);
    const row = onBoat ? nearRow : rowAt(e.clientX, e.clientY);
    finger = {
      id: e.pointerId,
      row: row ?? nearRow,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      sideways: false,
      trail: 0,
      track: [{ x: e.clientX, t: e.timeStamp }],
    };
    sea.setPointerCapture(e.pointerId);
    if (onBoat) {
      sink += 40;
      spin += (Math.random() < 0.5 ? -1 : 1) * 14;
    }
    if (row) splash(e.clientX, row, true);
    wake();
  });

  sea.addEventListener('pointermove', (e) => {
    if (!finger || e.pointerId !== finger.id) return;
    const dx = e.clientX - finger.x0;
    if (!finger.sideways && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - finger.y0) * 1.2) {
      finger.sideways = true;
      sea.toggleAttribute('data-held', true);
    }
    finger.trail += Math.abs(e.clientX - finger.x);
    finger.x = e.clientX;
    finger.track.push({ x: e.clientX, t: e.timeStamp });
    if (finger.sideways && finger.trail > TRAIL * s) {
      finger.trail = 0;
      const row = rowAt(e.clientX, e.clientY);
      if (row) splash(e.clientX, row, false);
    }
  });

  const release = (e: PointerEvent) => {
    if (finger?.id !== e.pointerId) return;
    finger = null;
    sea.removeAttribute('data-held');
  };
  sea.addEventListener('pointerup', release);
  sea.addEventListener('pointercancel', release);
  sea.addEventListener('lostpointercapture', release);
}
