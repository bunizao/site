// The turntable on the listening panel, seen from above. Everything is in
// plinth widths, with the origin at the plinth's top left corner, so the
// painting (client/studies.ts), the layout (ui/Turntable.astro) and the
// tonearm (client/tonearm.ts) agree on where the record and the arm are.
//
// The arm turns about its pivot; 0° hangs it straight down onto its rest,
// and a positive angle swings the stylus left, over the record, the way a
// CSS rotation turns.

export const DECK = {
  /** The plinth's height. */
  height: 0.8,
  /** The platter's centre, and the radius of its rim. */
  platter: { x: 0.4, y: 0.4, r: 0.35 },
  /** The record's radius. */
  record: 0.33,
  /** Where the arm turns. */
  pivot: { x: 0.86, y: 0.15 },
  /** Pivot to stylus. */
  arm: 0.5,
  /** The first groove and the last, as radii. */
  leadIn: 0.318,
  runout: 0.15,
  /** The arm's box, around the pivot: the counterweight above, the headshell below. */
  box: { left: 0.075, right: 0.075, top: 0.13, bottom: 0.56 },
} as const;

const RAD = Math.PI / 180;

/** How far the stylus is from the spindle with the arm at `angle` degrees. */
export function radiusAt(angle: number) {
  const x = DECK.pivot.x - DECK.arm * Math.sin(angle * RAD) - DECK.platter.x;
  const y = DECK.pivot.y + DECK.arm * Math.cos(angle * RAD) - DECK.platter.y;
  return Math.hypot(x, y);
}

// Swinging in from the rest, the stylus closes on the spindle until the arm
// points at it; past that it would swing away again.
const NEAREST = Math.atan2(DECK.pivot.x - DECK.platter.x, DECK.platter.y - DECK.pivot.y) / RAD;

/** The arm's angle that sets the stylus `radius` from the spindle, by bisection. */
export function angleAt(radius: number) {
  let lo = 0;
  let hi = NEAREST;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (radiusAt(mid) > radius) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The groove for a share of the song: 0 at the lead-in, 1 at the runout. */
export const radiusOf = (fraction: number) => DECK.leadIn - Math.min(1, Math.max(0, fraction)) * (DECK.leadIn - DECK.runout);

/** The share of the song at a groove. */
export const fractionAt = (radius: number) => Math.min(1, Math.max(0, (DECK.leadIn - radius) / (DECK.leadIn - DECK.runout)));

/** The farthest the arm swings in: the stylus nearly at the spindle. */
export const ARM_MAX = NEAREST - 4;
