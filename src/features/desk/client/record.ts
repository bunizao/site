// The song on the record. The listening card in its panel polls it
// (lib/listening/controller.ts) and says so with LISTENING_TRACK_EVENT; here
// it becomes what the painting needs: a cover the knife can read for the
// sleeve, its colour for the disc's label, and the words on the gallery
// label under the canvas.
import type { ListeningTrackPayload } from '@/lib/listening/controller';
import { toneOf } from './painterly';

/** A colour as a hue and how much of it, in OKLCH. */
export interface Tint {
  h: number;
  c: number;
}

/** What the painting shows of the song: its cover, and the colour taken from it. */
export interface Song {
  cover: HTMLImageElement;
  tint: Tint | null;
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

// The cover is read small; its colour does not need its detail.
const SAMPLE = 32;

/**
 * The cover's colour, picked the way site-api picks the listening card's
 * accent: pixels grouped by hue and chroma, and the group that covers the
 * most of the cover wins, the more colourful the better. Null for a cover
 * with next to no colour, which keeps the desk's own.
 */
export function tintOf(cover: HTMLImageElement): Tint | null {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(cover, 0, 0, SAMPLE, SAMPLE);
  const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
  const total = SAMPLE * SAMPLE;
  const groups = new Map<number, { a: number; b: number; n: number }>();
  let grey = 0;
  for (let i = 0; i < data.length; i += 4) {
    const { l, c, h } = toneOf(data[i], data[i + 1], data[i + 2]);
    if (c < 0.02) grey++;
    if (c < 0.02 || l < 0.1 || l > 0.95) continue;
    const key = Math.floor(h / 20) * 100 + Math.floor(c / 0.04);
    const group = groups.get(key) ?? { a: 0, b: 0, n: 0 };
    const angle = (h * Math.PI) / 180;
    group.a += c * Math.cos(angle);
    group.b += c * Math.sin(angle);
    group.n++;
    groups.set(key, group);
  }
  if (grey > total * 0.9) return null;

  let best: Tint | null = null;
  let bestScore = 0;
  for (const { a, b, n } of groups.values()) {
    const c = Math.hypot(a, b) / n;
    const coverage = n / total;
    if (c < 0.03 || coverage < 0.03) continue;
    const score = coverage * (0.15 + (0.85 * Math.min(c, 0.11)) / 0.11);
    if (score <= bestScore) continue;
    bestScore = score;
    const h = (Math.atan2(b, a) * 180) / Math.PI;
    best = { h: h < 0 ? h + 360 : h, c };
  }
  return best;
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
