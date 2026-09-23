/**
 * The sea's surface, shared by the painter (scripts/paint-sillage.ts) and the
 * footer's touch handling, so a splash lands on the water that was painted.
 */

/** [waves per tile, amplitude px, phase] rows. Integer counts keep a tile seamless. */
export type Swell = readonly (readonly number[])[];

/**
 * Depth of the surface below a strip's top at tile x, CSS px. A Stokes-style
 * second harmonic sharpens the crests and flattens the troughs; `lean` tips
 * each crest downwind, so the right-hand face is the steeper one, as a wind
 * sea from astern builds it.
 */
export function surfaceDepth(swell: Swell, mean: number, lean: number, tile: number, x: number): number {
  let y = mean;
  for (const [k, a, phase] of swell) {
    const t = (2 * Math.PI * k * x) / tile + phase;
    y -= a * (Math.cos(t) + 0.24 * Math.cos(2 * t) + lean * Math.sin(2 * t));
  }
  return y;
}
