// "Still life with a desk": where each thing in the painting stands. Shared
// by the server, which renders a link or button over each thing, and the
// client, which paints it. Every measure is a share of the canvas width; the
// canvas is always 4:5, so the bottom edge sits at y = 1.25.

export const ASPECT = 1.25;
/** Where the wall meets the table. */
export const HORIZON = 0.76;

export type ThingId = 'works' | 'badge' | 'plant' | 'record' | 'clock' | 'books' | 'cup';
/** Everything painted on a canvas of its own: the things, and two parts that move. */
export type PieceId = ThingId | 'lamp' | 'disc';

type Box = [number, number, number, number];

export interface Piece {
  id: PieceId;
  /** x, y, width, height: the box it is painted in, and grabbed by. */
  box: Box;
}

export interface Thing extends Piece {
  id: ThingId;
  /** The desk section it opens, or the page it links to. */
  section: string;
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

/**
 * A pendant lamp hung from above the canvas, its cord down the middle of its
 * box, so it swings about the top middle. It opens nothing; it switches.
 */
export const LAMP: Piece = { id: 'lamp', box: [0.42, 0, 0.14, 0.215] };
/** Where the lamp's cord hangs from. */
export const LAMP_PIVOT: [number, number] = [0.49, 0];
/** The bulb's centre, where the light comes from. */
export const LAMP_BULB: [number, number] = [LAMP_PIVOT[0], 0.156];

/** The record's disc: centre and radius. It turns, under its sleeve, while a song plays. */
export const RECORD_DISC = [0.752, 0.568, 0.105] as const;
export const DISC: Piece = {
  id: 'disc',
  box: [RECORD_DISC[0] - RECORD_DISC[2], RECORD_DISC[1] - RECORD_DISC[2], RECORD_DISC[2] * 2, RECORD_DISC[2] * 2],
};

/** The cup's mouth, where its steam rises from: centre x, rim y, half width. */
export const CUP_MOUTH = [0.7125, 0.936, 0.046] as const;

/** The work hung on the wall, by the study it shows. */
export const WALL_WORK = { study: 'cube', box: [0.58, 0.17, 0.26, 0.195] as [number, number, number, number] };
