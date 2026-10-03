// The tonearm on the listening panel's turntable, which is the song's
// progress bar. While the preview plays it tracks the groove in from the
// lead-in to the runout; paused, it lifts and waits over its groove; done,
// it goes home to its rest. A hand can take it anywhere: set down on the
// record it plays from that groove, set down off it the music stops.
//
// The arm swings on a spring, lifted while it moves, and settles into the
// groove with the sound of the needle going down. Under a finger it follows
// the finger, with no spring at all.
import { musicKitPlayer, type PlaybackSnapshot } from '@/lib/musickit/player';
import { ARM_MAX, DECK, angleAt, fractionAt, radiusAt, radiusOf } from '../shared/deck';
import { play } from './sound';

const REST = 0;
const ARM_MIN = -4;
/** Where the arm sits while the record turns on Apple Music, out of reach: a few songs in. */
const LIVE = angleAt(0.27);
/** Stiffness, per second squared; damped critically, it settles in about half a second. */
const SPRING = 60;
/** How far off its mark the arm may be and still be down in the groove, in degrees. */
const SETTLED = 0.3;
/** How far the groove may move from under a lowered arm before it lifts again. */
const DRIFT = 1.5;

interface Aim {
  angle: number;
  /** Down in the groove, or on its rest; or held up over the record. */
  down: boolean;
}

export function initTonearm() {
  const deck = document.querySelector<HTMLElement>('[data-deck]');
  const arm = deck?.querySelector<HTMLElement>('[data-arm]');
  const start = deck?.querySelector<HTMLButtonElement>('[data-deck-start]');
  const listening = document.querySelector<HTMLElement>('[data-listening]');
  const playButton = listening?.querySelector<HTMLButtonElement>('[data-listening-play]');
  if (!deck || !arm || !start || !listening || !playButton) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  let snap: PlaybackSnapshot = musicKitPlayer.snapshot();
  let angle = REST;
  let velocity = 0;
  let up = false;
  let held: { id: number; offset: number } | null = null;
  // Set down off the record by hand: it stays home until the music starts again.
  let parked = false;
  // Set down on a record that is not playing yet: the share to skip to once it does.
  let pending: number | null = null;
  let pendingLoaded = false;
  let frame = 0;
  let last = 0;

  const playable = () => Boolean(playButton.dataset.previewUrl || playButton.dataset.appleCatalogId);
  const progress = () => (snap.duration > 0 ? snap.currentTime / snap.duration : 0);

  const aim = (): Aim => {
    const owned = snap.owner !== null;
    if (pending !== null) return { angle: angleAt(radiusOf(pending)), down: false };
    if (owned && snap.isPlaying && snap.duration > 0) return { angle: angleAt(radiusOf(progress())), down: true };
    if (owned && snap.isLoading) return { angle: angleAt(DECK.leadIn), down: false };
    // Paused part way: cued up over the groove it stopped in.
    if (!parked && owned && snap.duration > 0 && snap.currentTime > 0.5 && snap.currentTime < snap.duration - 0.5) {
      return { angle: angleAt(radiusOf(progress())), down: false };
    }
    if (!parked && listening.classList.contains('is-live')) return { angle: LIVE, down: true };
    return { angle: REST, down: true };
  };

  const lift = (next: boolean) => {
    if (next === up) return;
    up = next;
    deck.classList.toggle('is-cued', up);
    // The needle meets the record, not the rest.
    if (!up && radiusAt(angle) <= DECK.record) play('needle');
  };

  const step = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame = 0;
    let moving = false;
    if (!held) {
      const goal = aim();
      if (reduced.matches) {
        angle = goal.angle;
        velocity = 0;
      } else {
        velocity += (SPRING * (goal.angle - angle) - 2 * Math.sqrt(SPRING) * velocity) * dt;
        angle += velocity * dt;
      }
      const off = Math.abs(goal.angle - angle);
      const settled = off < SETTLED && Math.abs(velocity) < 2;
      if (settled && goal.down) lift(false);
      else if (!goal.down || off > DRIFT) lift(true);
      moving = !settled;
    }
    arm.style.rotate = `${angle.toFixed(2)}deg`;
    if (moving) wake();
  };

  function wake() {
    if (frame) return;
    if (!last || performance.now() - last > 100) last = performance.now();
    frame = requestAnimationFrame(step);
  }

  const sync = () => {
    const turning = listening.classList.contains('is-live') || listening.classList.contains('is-preview-playing');
    deck.classList.toggle('is-on', turning);
    const pressed = snap.owner !== null && (snap.isPlaying || snap.isLoading);
    start.setAttribute('aria-pressed', String(pressed));
    start.setAttribute('aria-label', pressed ? 'Pause' : 'Play');
    wake();
  };

  musicKitPlayer.subscribe((next) => {
    snap = next;
    if (snap.isPlaying) parked = false;
    if (pending !== null) {
      if (snap.isPlaying && snap.duration > 0) {
        // Seeking says so to every listener, this one too.
        const fraction = pending;
        pending = null;
        musicKitPlayer.seekFraction(fraction);
        return;
      } else if (snap.isLoading) {
        pendingLoaded = true;
      } else if (pendingLoaded) {
        // It never played.
        pending = null;
      }
    }
    sync();
  });
  new MutationObserver(sync).observe(listening, { attributes: true, attributeFilter: ['class'] });

  start.addEventListener('click', () => {
    parked = false;
    playButton.click();
  });

  // --- A hand on the arm -------------------------------------------------------------
  // The angle of the line from the pivot to the finger, in the arm's terms.
  const fingerAngle = (event: PointerEvent) => {
    const box = deck.getBoundingClientRect();
    const x = event.clientX - (box.left + DECK.pivot.x * box.width);
    const y = event.clientY - (box.top + DECK.pivot.y * box.width);
    return (Math.atan2(-x, y) * 180) / Math.PI;
  };

  deck.addEventListener('pointerdown', (event) => {
    if (held || event.button > 0 || !(event.target as Element).closest('[data-grip]')) return;
    event.preventDefault();
    deck.setPointerCapture(event.pointerId);
    held = { id: event.pointerId, offset: angle - fingerAngle(event) };
    velocity = 0;
    deck.classList.add('is-held');
    lift(true);
  });

  deck.addEventListener('pointermove', (event) => {
    if (!held || event.pointerId !== held.id) return;
    angle = Math.min(ARM_MAX, Math.max(ARM_MIN, fingerAngle(event) + held.offset));
    arm.style.rotate = `${angle.toFixed(2)}deg`;
  });

  const letGo = (event: PointerEvent) => {
    if (!held || event.pointerId !== held.id) return;
    held = null;
    deck.classList.remove('is-held');
    const radius = radiusAt(angle);
    const owned = snap.owner !== null;
    if (event.type === 'pointercancel') {
      // Nothing was chosen: it goes back to wherever it was.
    } else if (radius <= DECK.record) {
      // Short of the label, so the song does not end the moment it starts.
      const fraction = Math.min(0.97, fractionAt(radius));
      parked = false;
      if (owned && snap.isPlaying) musicKitPlayer.seekFraction(fraction);
      else if (playable()) {
        pending = fraction;
        pendingLoaded = false;
        if (!(owned && snap.isLoading)) playButton.click();
      }
    } else {
      parked = true;
      pending = null;
      if (owned && (snap.isPlaying || snap.isLoading)) playButton.click();
    }
    wake();
  };
  deck.addEventListener('pointerup', letGo);
  deck.addEventListener('pointercancel', letGo);

  reduced.addEventListener('change', wake);
  sync();
}
