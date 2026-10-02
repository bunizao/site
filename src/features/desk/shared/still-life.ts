// "Still life with a desk": where each thing in the painting stands. Shared
// by the server, which renders a link or button over each thing, and the
// client, which paints it. Every measure is a share of the canvas width; the
// canvas is always 4:5, so the bottom edge sits at y = 1.25.

export const ASPECT = 1.25;
/** Where the wall meets the table. */
export const HORIZON = 0.76;

export type ThingId = 'works' | 'badge' | 'plant' | 'record' | 'clock' | 'books' | 'cup';

export interface Thing {
  id: ThingId;
  /** The desk section it opens, or the page it links to. */
  section: string;
  /** x, y, width, height: the box a pointer can grab it by. */
  box: [number, number, number, number];
}

// Back to front: the order they are painted in and stacked in. Two things on
// the wall, five on the table, and the rest of the canvas left to the light.
export const THINGS: Thing[] = [
  { id: 'works', section: 'projects', box: [0.565, 0.155, 0.29, 0.23] },
  { id: 'badge', section: 'about', box: [0.27, 0.15, 0.16, 0.33] },
  { id: 'plant', section: 'github', box: [0.03, 0.48, 0.3, 0.44] },
  { id: 'record', section: 'listening', box: [0.6, 0.48, 0.29, 0.41] },
  { id: 'clock', section: 'clock', box: [0.35, 0.74, 0.27, 0.17] },
  { id: 'books', section: 'writing', box: [0.08, 0.89, 0.3, 0.13] },
  { id: 'cup', section: 'moods', box: [0.63, 0.86, 0.19, 0.19] },
];

/** The clock's window, where the time is painted live: x, y, width, height. */
export const CLOCK_FACE: [number, number, number, number] = [0.385, 0.785, 0.2, 0.072];

/** The work hung on the wall, by the study it shows. */
export const WALL_WORK = { study: 'cube', box: [0.58, 0.17, 0.26, 0.195] as [number, number, number, number] };
