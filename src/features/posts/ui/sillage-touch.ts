/**
 * Touch and scroll for the sea footer (BlogSeaFooter.astro).
 *
 * A touch on the water splashes on the painted surface under the finger. A
 * sideways drag takes hold of the sea: the water moves with the finger — hold
 * still and the sea stops, sweep and it runs — and on release it coasts back
 * to its own pace. Splashes close to the boat rock her, and a touch on the
 * boat ducks her.
 *
 * The boat can be picked up. She follows the finger out of the water, swings
 * as it moves, drips, and when let go falls back — or flies, if thrown — and
 * lands with a splash, then drifts back to her place in the fleet of one.
 *
 * The sea is the end of the page, and a scroll does not stop there: the speed
 * a scroll arrives with carries on into the water, and scrolling on past the
 * end keeps driving it, so the boat sails on for as long as the reader does.
 *
 * The sea's speed is one playback rate applied to every CSS animation in the
 * band. They all share one clock, so the boat's ride, the bow wave and the
 * wake stay true to the water at any speed.
 */
import { pageScroll } from '@/lib/page-scroll';
import { bow, front, near, period, tile } from './sillage-motion.json';
import { life } from './sillage-life';
import type { Voice } from './sillage-sound';
import { surfaceDepth, type Swell } from './sillage-surface';

/** The fastest a finger can drive the sea, as a multiple of its own pace. */
const MAX_RATE = 10;
/** Seconds for the sea to take up the finger's speed, and to give it back. */
const GRIP = 0.06;
const COAST = 0.9;
/** Finger travel between the small splashes a drag leaves, art px. */
const TRAIL = 30;
/** Water moved per px of scroll carried past the end of the page. */
const SCROLL_GAIN = 0.35;
/** Splashes this close to the boat rock her, art px. */
const REACH = 150;
const MAX_SPLASHES = 18;
/** The boat in hand: how high she lifts before the pull stiffens, and the
    most she can be thrown up, art px and art px/s. */
const LIFT = 40;
const THROW = 480;
/** The sky above her, art px: she stops short of the top of the picture. */
const CEILING = 150;
const GRAVITY = 900;
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
  /** Took hold of the boat; `lifted` once it has moved her. */
  boat: boolean;
  lifted: boolean;
  bx: number;
  dip: number;
  trail: number;
  track: { x: number; y: number; t: number }[];
}

interface Splash {
  el: HTMLElement;
  row: Row;
  x: number;
  end: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function stir(sea: HTMLElement, sound: Voice) {
  const part = (name: string) => sea.querySelector<HTMLElement>(`.sillage-sea__${name}`)!;
  const boat = part('boat');
  const wakeLayer = part('wake');
  // Front to back: the front row is the first water a finger meets.
  const rows: Row[] = [
    { el: part('front'), ...front },
    { el: part('near'), ...near, period },
  ];
  const nearRow = rows[1];
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const scroll = pageScroll();
  const scroller = scroll.el;
  // The root's clientHeight is the viewport with the toolbar shown; a scroll
  // with the toolbar collapsed ends innerHeight short of the bottom.
  const viewHeight = () => (scroller === document.documentElement ? window.innerHeight : scroller.clientHeight);
  const critters = life({
    sea,
    scale: () => s,
    near: nearRow.el,
    clouds: part('clouds'),
    back: part('back'),
    surfaceY: (x) => surfaceY(nearRow, x),
    splash: (x, big) => {
      wake();
      splash(x, nearRow, big);
    },
  });

  let s = 1;
  let dim = 1;
  let boatAt = 0.33;
  let rate = 1;
  let clocks: Animation[] = [];
  let finger: Finger | null = null;
  // The boat's extra rock (deg), dip (art px, down) and offset along the
  // water (art px), each a damped spring with its velocity; in the air, only
  // gravity.
  let tilt = 0;
  let spin = 0;
  let dip = 0;
  let sink = 0;
  let bx = 0;
  let drift = 0;
  let flying = false;
  let dripAt = 0;
  let band = new DOMRect();
  let splashes: Splash[] = [];
  let frame = 0;
  let last = 0;

  function measure() {
    const style = getComputedStyle(sea);
    s = parseFloat(style.getPropertyValue('--s')) || 1;
    dim = parseFloat(style.getPropertyValue('--dim')) || 1;
    boatAt = (parseFloat(style.getPropertyValue('--boat-x')) || 33) / 100;
    band = sea.getBoundingClientRect();
  }

  /** Screen x of the boat's waterline point. */
  const boatX = () => band.left + band.width * boatAt + bx * s;

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

  function splash(clientX: number, row: Row, big: boolean, deep = false) {
    if (splashes.length >= MAX_SPLASHES) splashes.shift()!.el.remove();
    const band = sea.getBoundingClientRect();
    sound.splash(((clientX - band.left) / band.width) * 2 - 1, big, deep);
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

  /** The near row's own speed, CSS px/s. */
  const pace = () => (tile * s) / period;

  /** Scroll that the page could not take drives the water: each px of it is
      an impulse, and the sea coasts back down from it. Held steady, a scroll
      of v px/s runs the sea at 1 + SCROLL_GAIN * v / pace. */
  function carry(distance: number) {
    if (still.matches || distance <= 0) return;
    wake();
    rate = Math.min(MAX_RATE, rate + (distance * SCROLL_GAIN) / (pace() * COAST));
  }

  /** The finger's speed over the last tenth of a second, CSS px/s. Zero once
      it holds still, which is what stops the sea under it. */
  function velocity(now: number) {
    if (!finger) return { x: 0, y: 0 };
    const track = finger.track;
    let base = 0;
    while (base + 1 < track.length && track[base + 1].t <= now - 100) base++;
    track.splice(0, base);
    const span = (now - track[0].t) / 1000;
    const head = track[track.length - 1];
    return span > 0 ? { x: (head.x - track[0].x) / span, y: (head.y - track[0].y) / span } : { x: 0, y: 0 };
  }

  /** A drop off the hull while she is out of the water. */
  function drip() {
    const el = document.createElement('i');
    el.className = 'sillage-sea__drop';
    el.style.setProperty('--v', String(Math.floor(Math.random() * DROP_ROWS)));
    const x = boatX() - band.left + (Math.random() - 0.5) * 50 * s;
    // Off the keel, which sits 18 art px under her waterline.
    const from = nearRow.el.getBoundingClientRect().top - band.top + (near.surface + dip + 18) * s;
    const to = surfaceY(nearRow, x + band.left) - band.top;
    if (to - from < 4 * s) return;
    el.style.left = `${x}px`;
    el.style.top = `${from}px`;
    nearRow.el.before(el);
    const fall = Math.sqrt((2 * (to - from)) / (GRAVITY * s));
    el.animate(
      [
        { transform: 'translateY(0) scale(.5)', opacity: dim },
        { transform: `translateY(${to - from}px) scale(.75)`, opacity: dim },
      ],
      { duration: fall * 1000, easing: 'cubic-bezier(.4,0,1,1)' },
    ).onfinish = () => el.remove();
  }

  function tick() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    band = sea.getBoundingClientRect();

    // The sea: held sideways, it goes at the finger's speed, measured against
    // the row the finger took hold of. It can be stopped, never run backwards.
    const held = finger?.sideways && !finger.boat ? finger : null;
    const want = held ? clamp(-velocity(now).x / ((tile * s) / held.row.period), 0, MAX_RATE) : 1;
    rate += (want - rate) * (1 - Math.exp(-dt / (held ? GRIP : COAST)));
    for (const clock of clocks) clock.playbackRate = rate;
    sound.drive(rate);

    const carried = finger?.lifted ? finger : null;
    if (carried) {
      // In hand: exactly under the finger, the pull stiffening past LIFT, and
      // swinging like something held from above as the finger moves.
      const v = velocity(now);
      const raw = carried.dip + (carried.track[carried.track.length - 1].y - carried.y0) / s;
      dip = Math.min(4, raw < -LIFT ? -LIFT + (raw + LIFT) * 0.35 : raw);
      bx = carried.bx + (carried.x - carried.x0) / s;
      sink = v.y / s;
      drift = v.x / s;
      spin += (70 * (clamp(drift * 0.05, -28, 28) - tilt) - 9 * spin) * dt;
    } else if (flying) {
      sink += GRAVITY * dt;
      spin += (6 * -tilt - 1.5 * spin) * dt;
    } else {
      // The boat leans into a push, bow down, rocks back from a splash, and
      // the water carries her back to her place.
      const heel = clamp((rate - 1) * 0.6, -1, 5);
      spin += (24 * (heel - tilt) - 2 * spin) * dt;
      sink += (-40 * dip - 3.2 * sink) * dt;
      drift += (-5 * bx - 4.5 * drift) * dt;
    }
    tilt += spin * dt;
    if (!carried) {
      dip += sink * dt;
      bx += drift * dt;
    }
    // Keep her on the band.
    const room = band.width / s;
    const lo = 60 - room * boatAt;
    const hi = room * (1 - boatAt) - 60;
    if (bx < lo || bx > hi) {
      bx = clamp(bx, lo, hi);
      drift *= -0.4;
    }
    if (dip < -CEILING) {
      dip = -CEILING;
      sink = Math.max(0, sink);
    }
    if (flying && dip >= 0) {
      // Back in the water.
      flying = false;
      if (sink > 80) splash(boatX(), nearRow, true, true);
      sink *= 0.3;
      spin += (Math.random() - 0.5) * sink * 0.12;
    }
    critters.escort(rate, boatX() + bow.x * s, now);
    // Out of the water she drips, for a while.
    if (dip < -10 && now - dripAt > 140) {
      dripAt = now;
      if (Math.random() < 0.8) drip();
    }
    boat.style.transform = `translate(${bx * s}px, ${dip * s}px) rotate(${tilt}deg)`;
    // Her bow wave, the broken water at the stern and the wake go with her
    // along the water, and dry up when she leaves it.
    wakeLayer.style.translate = `${bx * s}px 0`;
    wakeLayer.style.opacity = String(clamp(1 + dip / 14, 0, 1));

    // Splashes ride the water they fell on.
    for (const splash of splashes) {
      splash.x -= ((tile * s) / splash.row.period) * rate * dt;
      splash.el.style.translate = `${splash.x}px 0`;
    }
    splashes = splashes.filter((splash) => splash.end > now || (splash.el.remove(), false));

    const calm =
      !finger &&
      !flying &&
      Math.abs(rate - 1) < 0.003 &&
      Math.abs(tilt) + Math.abs(dip) + Math.abs(bx) < 0.05 &&
      Math.abs(spin) + Math.abs(sink) + Math.abs(drift) < 0.1 &&
      !splashes.length;
    if (calm) {
      rate = 1;
      tilt = spin = dip = sink = bx = drift = 0;
      for (const clock of clocks) clock.playbackRate = 1;
      sound.drive(1);
      boat.style.transform = '';
      wakeLayer.style.translate = '';
      wakeLayer.style.opacity = '';
      frame = 0;
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function wake() {
    if (frame) return;
    measure();
    // The sea's own clocks; the scroll-linked ones follow the page, not time.
    clocks = sea
      .getAnimations({ subtree: true })
      .filter((a) => a instanceof CSSAnimation && a.timeline === document.timeline);
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  /** By her box, not the event target: the water in front covers her hull. */
  function onBoatAt(clientX: number, clientY: number) {
    const box = boat.getBoundingClientRect();
    return clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom - 14 * s;
  }

  // She can be picked up in any direction, so a touch on her never scrolls.
  sea.addEventListener(
    'touchstart',
    (e) => {
      const touch = e.touches[0];
      if (!still.matches && e.touches.length === 1 && onBoatAt(touch.clientX, touch.clientY)) e.preventDefault();
    },
    { passive: false },
  );

  sea.addEventListener('pointerdown', (e) => {
    if (still.matches || finger || (e.pointerType === 'mouse' && e.button !== 0)) return;
    wake();
    const onBoat = onBoatAt(e.clientX, e.clientY);
    const row = onBoat ? nearRow : rowAt(e.clientX, e.clientY);
    finger = {
      id: e.pointerId,
      row: row ?? nearRow,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      sideways: false,
      boat: onBoat,
      lifted: false,
      bx,
      dip,
      trail: 0,
      track: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }],
    };
    sea.setPointerCapture(e.pointerId);
    sound.wake();
    // A touch on the boat waits to see whether it picks her up.
    if (onBoat) return;
    if (row) {
      splash(e.clientX, row, true);
      critters.water(e.clientX);
    } else critters.sky(e.clientX, e.clientY);
  });

  sea.addEventListener('pointermove', (e) => {
    if (!finger || e.pointerId !== finger.id) return;
    const dx = e.clientX - finger.x0;
    finger.track.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (finger.boat) {
      finger.x = e.clientX;
      if (!finger.lifted && Math.hypot(dx, e.clientY - finger.y0) > 6) {
        finger.lifted = true;
        flying = false;
        sea.toggleAttribute('data-held', true);
      }
      return;
    }
    if (!finger.sideways && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - finger.y0) * 1.2) {
      finger.sideways = true;
      sea.toggleAttribute('data-held', true);
    }
    finger.trail += Math.abs(e.clientX - finger.x);
    finger.x = e.clientX;
    if (finger.sideways && finger.trail > TRAIL * s) {
      finger.trail = 0;
      const row = rowAt(e.clientX, e.clientY);
      if (row) splash(e.clientX, row, false);
    }
  });

  const release = (e: PointerEvent) => {
    if (finger?.id !== e.pointerId) return;
    if (finger.lifted) {
      // Let go: she keeps the finger's speed, capped so a throw stays in the
      // band, and falls if she is out of the water.
      sink = Math.max(-THROW, sink);
      drift = clamp(drift, -600, 600);
      flying = dip < -1;
    } else if (finger.boat && e.type === 'pointerup') {
      // A tap on the boat ducks her.
      sink += 40;
      spin += (Math.random() < 0.5 ? -1 : 1) * 14;
      splash(boatX(), nearRow, true, true);
    }
    finger = null;
    sea.removeAttribute('data-held');
  };
  // A touch only counts as a gesture that may open the sound when it lifts.
  sea.addEventListener('pointerup', (e) => {
    if (finger?.id === e.pointerId) sound.wake();
    release(e);
  });
  sea.addEventListener('pointercancel', release);
  sea.addEventListener('lostpointercapture', release);

  // Scrolling on past the end: wheels and trackpads keep sending deltas the
  // page can no longer take, a finger keeps pulling up. Both count only
  // downward, and only once the page has nothing left.
  const atEnd = () => scroller.scrollTop + viewHeight() >= scroller.scrollHeight - 2;
  scroll.events.addEventListener(
    'wheel',
    (event) => {
      const e = event as WheelEvent;
      if (!atEnd()) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientHeight : 1;
      carry(e.deltaY * unit);
    },
    { passive: true },
  );

  let touchY: number | null = null;
  scroll.events.addEventListener('touchstart', (e) => (touchY = (e as TouchEvent).touches[0].clientY), { passive: true });
  scroll.events.addEventListener(
    'touchmove',
    (event) => {
      const e = event as TouchEvent;
      const y = e.touches[0].clientY;
      if (touchY !== null && atEnd()) carry(touchY - y);
      touchY = y;
    },
    { passive: true },
  );

  // The speed a scroll arrives at the end with, as the steady scroll above
  // would have carried it.
  let top = scroller.scrollTop;
  let topAt = performance.now();
  scroll.events.addEventListener(
    'scroll',
    (e) => {
      const was = top;
      const dt = (e.timeStamp - topAt) / 1000;
      top = scroller.scrollTop;
      topAt = e.timeStamp;
      if (still.matches || top <= was || dt <= 0 || dt > 0.1 || !atEnd()) return;
      wake();
      rate = Math.max(rate, Math.min(MAX_RATE, 1 + (SCROLL_GAIN * (top - was)) / dt / pace()));
    },
    { passive: true },
  );
}
