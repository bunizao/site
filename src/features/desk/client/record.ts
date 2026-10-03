// The song on the record. The listening card in its panel polls it
// (lib/listening/controller.ts) and says so with LISTENING_TRACK_EVENT; here
// it becomes what the painting needs: a cover the knife can read for the
// sleeve, the colour site-api picked from it for the disc's label, and the
// words on the gallery label under the canvas.
import type { ListeningTrackPayload } from '@/lib/listening/controller';

/** A colour as a hue and how much of it, in OKLCH. */
export interface Tint {
  h: number;
  c: number;
}

/** What the painting shows of the song: its cover, and the colour taken from it. */
export interface Song {
  cover: HTMLImageElement;
  tint: Tint;
}

export interface GalleryLabel {
  title: string;
  date: string;
  medium: string;
}

// The sleeve is painted from a study about 150 CSS pixels across; anything
// much over twice that is bytes the knife never sees.
const COVER_PX = 300;

/** The cover to paint the sleeve from, or '' when the track has none. */
export function coverOf(track: ListeningTrackPayload): string {
  const url = track.artworkUrl?.trim() || track.thumbUrl?.trim() || '';
  // Apple's artwork CDN serves any size the path asks for: .../600x600bb.jpg.
  return url.replace(/\/\d+x\d+bb\.(\w+)$/u, `/${COVER_PX}x${COVER_PX}bb.$1`);
}

/**
 * Loads a cover the knife may read. A host that does not send CORS headers
 * fails the load instead of tainting the study, and the sleeve keeps its sun.
 */
export function loadCover(url: string): Promise<HTMLImageElement | null> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  return image.decode().then(
    () => image,
    () => null,
  );
}

/** No colour at all: a black-and-white cover's. */
const NEUTRAL: Tint = { h: 0, c: 0 };

/**
 * The label's colour: the accent site-api picks from the artwork once and
 * keeps for a week, the same one the listening card wears. Its chroma is the
 * one that fits at the lightness of the label's band. A track without one
 * has a monochrome cover, and its label is black and white; the desk's own
 * label is only for a record without a song.
 */
export function tintOf(accent: ListeningTrackPayload['accent']): Tint {
  return accent ? { h: accent.hue, c: accent.chromaLight } : NEUTRAL;
}

/**
 * What the gallery label says while the record is pointed at, or its panel is
 * open, in the voice of the rest of the desk's labels: a title, a date, and
 * a medium ("A song on repeat", "right now", "Sound, duration variable").
 * Null keeps the label the page was served with.
 */
export function labelOf(track: ListeningTrackPayload): GalleryLabel | null {
  // TODO
  return null;
}
