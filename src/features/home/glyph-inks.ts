/**
 * Ink options for the homepage glyph field, one pair per hue.
 *
 * Every pair is picked in oklch and converted, so the inks share lightness
 * and chroma and differ only in hue: dark-theme ink at L 0.76 / C 0.11,
 * light-theme ink at L 0.50 / C 0.12. Swapping the hue therefore changes the
 * mood of the field without changing how much of it shows through.
 *
 * The ground stays the site's own (`#0a0a0a` / white); only the glyphs carry
 * colour. Each visit draws one ink at random and keeps it for the session, so
 * the colour holds while the visitor moves around and changes on their next
 * visit. `?ink=<name>` pins one for review.
 */

export interface GlyphInk {
  light: string;
  dark: string;
}

export const GLYPH_INKS = {
  blue: { light: '#2266a4', dark: '#79b6f4' }, // hue 250, the blog highlight family
  steel: { light: '#007096', dark: '#57c0e6' }, // hue 225, colder, toward cyan
  indigo: { light: '#5d57a4', dark: '#aaa7f4' }, // hue 285, night, not neon
  violet: { light: '#784d96', dark: '#c79de6' }, // hue 310, warmer purple
  rose: { light: '#9b424d', dark: '#ee939b' }, // hue 15, the warm outlier
  teal: { light: '#007872', dark: '#49c7c0' }, // hue 190, green-blue terminal
} as const satisfies Record<string, GlyphInk>;

export type GlyphInkName = keyof typeof GLYPH_INKS;

export const isGlyphInkName = (value: string): value is GlyphInkName => value in GLYPH_INKS;

const INK_NAMES = Object.keys(GLYPH_INKS) as GlyphInkName[];
const SESSION_KEY = 'glyph-ink';

export const resolveGlyphInk = (search: string): GlyphInkName => {
  const pinned = new URLSearchParams(search).get('ink') ?? '';
  if (isGlyphInkName(pinned)) return pinned;

  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(SESSION_KEY);
  } catch {
    // Storage can be blocked; a fresh draw per load is fine then.
  }
  if (stored && isGlyphInkName(stored)) return stored;

  const drawn = INK_NAMES[(Math.random() * INK_NAMES.length) | 0];
  try {
    sessionStorage.setItem(SESSION_KEY, drawn);
  } catch {
    // Same as above.
  }
  return drawn;
};
