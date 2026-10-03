// The pendant lamp over the desk. Pressing it pulls the chain, which switches
// it; dragging it swings it on its cord, and its light swings with it, a
// damped pendulum that follows the finger while held and keeps the speed it
// was let go with. The light only comes on once the paint is dry: it goes
// out while the room is repainted and flickers back when the easel is done.
// By day it starts off, as a lamp in daylight only burns power; by night, on.
// A switch is kept for the next visit at the same time of day.
//
// The first time it comes on by night, it is lit the way a lamp in a dark
// room is: a beat of dark, the chain pulled, the filament catching in the
// bulb with a stutter, and the light spreading from the bulb to the table.

import { ASPECT, LAMP_BULB, LAMP_PIVOT } from '@/features/desk/shared/still-life';
import { play } from './sound';

// Night keeps the key the lamp had before day and night were apart.
const KEYS = { day: 'desk-lamp-day', night: 'desk-lamp' } as const;
// A cord a little over a metre long.
const PERIOD_S = 2.2;
const DAMPING = 0.09;
/** Radians: as far as the cord lets it go, either way. */
const REACH = 0.32;
// Moved less than this, a press is a pull on the chain, not a drag.
const TAP_PX = 5;

// First light, after the paint is dry: the room sits dark this long, then the
// chain is pulled and the filament catches a moment after.
const BEAT_MS = 320;
// Nor before the prose has come in (its last stroke of paint is down by then,
// styles/desk.css), so the eye is free to go to the painting.
const ARRIVAL_MS = 2100;
const CATCH_MS = 110;
/** How long the filament stutters and settles; the light spreads meanwhile. */
const STUTTER_MS = 1150;
const SPREAD_MS = 1900;

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
const isNight = () => document.documentElement.classList.contains('dark');
const timeOfDay = (): keyof typeof KEYS => (isNight() ? 'night' : 'day');

/** The switch as last left at this time of day. */
const stored = () => {
  try {
    const value = localStorage.getItem(KEYS[timeOfDay()]);
    if (value) return value === 'on';
  } catch {
    // Not kept: the time of day decides.
  }
  return isNight();
};

export function initLamp() {
  const easel = document.querySelector<HTMLElement>('[data-easel]');
  const still = easel?.querySelector<HTMLElement>('[data-sl]');
  const button = easel?.querySelector<HTMLButtonElement>('[data-lamp]');
  const lights = [...(easel?.querySelectorAll<HTMLCanvasElement>('[data-sl-lit], [data-sl-air]') ?? [])];
  if (!easel || !still || !button || lights.length !== 2) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let time = timeOfDay();
  let on = stored();
  let dry = false;
  let shining = false;
  /** Whether it last shone by night or by day, so a repaint at the same hour only strikes it. */
  let shoneBy: 'night' | 'day' | null = null;
  let pending = 0;

  // A filament stutters as it catches, and glows a moment after it is cut.
  const STRIKE: Keyframe[] = [
    { opacity: 0 },
    { opacity: 0.85, offset: 0.08 },
    { opacity: 0.25, offset: 0.2 },
    { opacity: 1, offset: 0.4 },
    { opacity: 0.78, offset: 0.58 },
    { opacity: 1 },
  ];
  const COOL: Keyframe[] = [{ opacity: 1 }, { opacity: 0.3, offset: 0.12 }, { opacity: 0 }];

  // The first light stutters in the bulb, catches, breathes once as the
  // filament settles, and holds.
  const STUTTER: Keyframe[] = [
    { opacity: 0 },
    { opacity: 0.6, offset: 0.04 },
    { opacity: 0.08, offset: 0.1 },
    { opacity: 0.82, offset: 0.18 },
    { opacity: 0.3, offset: 0.25 },
    { opacity: 1, offset: 0.36 },
    { opacity: 1, offset: 0.7 },
    { opacity: 0.88, offset: 0.8 },
    { opacity: 1 },
  ];
  // Meanwhile a mask opens from the bulb (`--reach`, in canvas widths): it
  // holds round the bulb while the filament stutters, then goes out quickly
  // and slows as it reaches the far wall.
  const SPREAD: Keyframe[] = [
    { '--reach': 0.05 },
    { '--reach': 0.1, offset: 0.24, easing: 'cubic-bezier(0.3, 0.65, 0.2, 1)' },
    { '--reach': 1.8 },
  ];
  const [bulbX, bulbY] = LAMP_BULB;
  const SPREAD_MASK = `radial-gradient(ellipse calc(var(--reach) * 100%) calc(var(--reach) * ${(100 / ASPECT).toFixed(3)}%) at ${bulbX * 100}% ${((bulbY / ASPECT) * 100).toFixed(3)}%, #000 60%, transparent)`;

  const shine = (value: boolean, first = false) => {
    if (value === shining) return;
    shining = value;
    if (value) shoneBy = isNight() ? 'night' : 'day';
    easel.classList.toggle('is-lit', value);
    for (const light of lights) {
      light.getAnimations().forEach((animation) => animation.cancel());
      light.style.removeProperty('mask-image');
      light.style.opacity = value ? '1' : '0';
      if (reduced.matches) continue;
      if (!first) {
        light.animate(value ? STRIKE : COOL, { duration: value ? 560 : 420, easing: 'linear' });
        continue;
      }
      light.style.maskImage = SPREAD_MASK;
      light.animate(STUTTER, { duration: STUTTER_MS, delay: CATCH_MS, fill: 'backwards', easing: 'linear' });
      light.animate(SPREAD, { duration: SPREAD_MS, delay: CATCH_MS, fill: 'backwards' }).finished.then(
        () => light.style.removeProperty('mask-image'),
        // Cancelled: whatever cancelled it has cleared the mask.
        () => {},
      );
    }
  };

  const wait = () => {
    clearTimeout(pending);
    pending = 0;
  };

  const sync = () => {
    wait();
    button.setAttribute('aria-pressed', String(on));
    shine(on && dry);
  };

  // --- The swing ----------------------------------------------------------------
  const omega = (2 * Math.PI) / PERIOD_S;
  let angle = 0;
  let speed = 0;
  let frame = 0;
  let last = 0;
  let held = false;

  const hang = () => still.style.setProperty('--swing', `${angle.toFixed(4)}rad`);

  const step = (now: number) => {
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    if (!held) {
      speed += (-omega * omega * Math.sin(angle) - 2 * DAMPING * omega * speed) * dt;
      angle = clamp(angle + speed * dt, REACH);
      if (Math.abs(angle) >= REACH) speed *= -0.4;
    }
    hang();
    if (!held && Math.abs(angle) < 0.0006 && Math.abs(speed) < 0.002) {
      angle = 0;
      speed = 0;
      hang();
      frame = 0;
      return;
    }
    frame = requestAnimationFrame(step);
  };

  const run = () => {
    if (frame) return;
    last = performance.now();
    frame = requestAnimationFrame(step);
  };

  /** Adds `push` radians a second to the swing. */
  const nudge = (push: number) => {
    if (reduced.matches) return;
    speed = clamp(speed + push, 3);
    run();
  };

  const firstLight = () => {
    pending = 0;
    if (!on || !dry) return;
    // The chain is pulled; the light catches as the lamp starts to swing.
    nudge(0.2);
    shine(true, true);
  };

  // --- Hands on it ----------------------------------------------------------------
  /** The pointer's angle off the cord, as the lamp's own: positive swings it left. */
  const angleOf = (event: PointerEvent) => {
    const box = still.getBoundingClientRect();
    const x = box.left + box.width * LAMP_PIVOT[0];
    const y = box.top + box.width * LAMP_PIVOT[1];
    return Math.atan2(x - event.clientX, event.clientY - y);
  };

  let drag: { id: number; x: number; y: number; grab: number; from: number; moved: boolean; at: number; was: number } | null = null;
  let dragged = false;
  let brushed = false;

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0 || reduced.matches) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, grab: angleOf(event), from: angle, moved: false, at: event.timeStamp, was: angle };
    button.setPointerCapture(event.pointerId);
  };

  const onMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) {
      // A mouse brushing past sets it going a little, the way it went.
      if (!drag && event.pointerType === 'mouse' && !brushed) {
        brushed = true;
        nudge(clamp(-event.movementX * 0.012, 0.25));
      }
      return;
    }
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < TAP_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      held = true;
      run();
    }
    const next = clamp(drag.from + angleOf(event) - drag.grab, REACH);
    const dt = (event.timeStamp - drag.at) / 1000;
    // The speed it is let go with, smoothed over the last few moves.
    if (dt > 0) speed = speed * 0.6 + ((next - drag.was) / dt) * 0.4;
    drag.at = event.timeStamp;
    drag.was = next;
    angle = next;
  };

  const onUp = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    dragged = drag.moved;
    if (drag.moved) speed = clamp(speed, 2.5);
    drag = null;
    held = false;
  };

  const onLeave = () => (brushed = false);

  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    if (dragged) {
      dragged = false;
      return;
    }
    // Still dark before its first light, it looks off, so a pull lights it.
    if (pending) {
      play('chain', { on: true });
      nudge(0.2);
      sync();
      return;
    }
    on = !on;
    try {
      localStorage.setItem(KEYS[time], on ? 'on' : 'off');
    } catch {
      // Kept for this visit only.
    }
    play('chain', { on });
    // The chain tugs it.
    nudge(on ? 0.2 : -0.2);
    sync();
  };

  button.addEventListener('pointerdown', onDown);
  button.addEventListener('pointermove', onMove);
  button.addEventListener('pointerup', onUp);
  button.addEventListener('pointercancel', onUp);
  button.addEventListener('pointerleave', onLeave);
  button.addEventListener('click', onClick);

  // The light waits for the paint, and goes out while the room is repainted.
  easel.addEventListener('easel:painting', () => {
    dry = false;
    // Day turned to night or back: the switch as left at the new time.
    if (timeOfDay() !== time) {
      time = timeOfDay();
      on = stored();
    }
    sync();
  });
  easel.addEventListener('easel:painted', () => {
    dry = true;
    // Lit by night for the first time, since the visit began or the room went dark.
    if (on && !shining && isNight() && shoneBy !== 'night' && !reduced.matches) {
      button.setAttribute('aria-pressed', 'true');
      wait();
      pending = window.setTimeout(firstLight, Math.max(BEAT_MS, ARRIVAL_MS - performance.now()));
      return;
    }
    sync();
  });
  sync();
}
