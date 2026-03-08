/**
 * Floor tile pattern storage and caching.
 *
 * Stores 7 grayscale floor patterns loaded from floors.png.
 * Uses shared colorize module for HSL tinting (Photoshop-style Colorize).
 * Caches colorized SpriteData by (pattern, h, s, b, c) key.
 */

import { FALLBACK_FLOOR_COLOR, TILE_SIZE } from '../constants.js';
import { clearColorizeCache, getColorizedSprite } from './colorize.js';
import type { FloorColor, SpriteData } from './types.js';

const FLOOR_SHADE_RAMP = [
  '#242424',
  '#2C2C2C',
  '#353535',
  '#404040',
  '#4B4B4B',
  '#575757',
  '#636363',
  '#707070',
] as const;

function shade(level: number): string {
  return FLOOR_SHADE_RAMP[Math.max(0, Math.min(FLOOR_SHADE_RAMP.length - 1, level))];
}

function createBuiltinFloorSprite(fill: (x: number, y: number) => number): SpriteData {
  return Array.from({ length: TILE_SIZE }, (_, y) =>
    Array.from({ length: TILE_SIZE }, (_, x) => shade(fill(x, y))),
  );
}

const BUILTIN_FLOOR_SPRITES: SpriteData[] = [
  // Checker slab
  createBuiltinFloorSprite((x, y) => {
    if (x === 0 || y === 0) return 6;
    if (x === TILE_SIZE - 1 || y === TILE_SIZE - 1) return 2;
    return (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0 ? 4 : 3;
  }),
  // Offset ceramic tiles
  createBuiltinFloorSprite((x, y) => {
    const rowOffset = y >= TILE_SIZE / 2 ? 4 : 0;
    const shifted = (x + rowOffset) % 8;
    if (y === 0 || y === TILE_SIZE / 2) return 6;
    if (y === TILE_SIZE - 1) return 2;
    if (shifted === 0) return 5;
    if (shifted === 7) return 2;
    return shifted === 1 || shifted === 6 ? 4 : 3;
  }),
  // Diagonal weave
  createBuiltinFloorSprite((x, y) => {
    if ((x - y + TILE_SIZE) % 8 === 0 || (x + y) % 8 === 0) return 6;
    return (x + y) % 2 === 0 ? 3 : 2;
  }),
  // Vertical planks
  createBuiltinFloorSprite((x, y) => {
    if (x === 0 || x === TILE_SIZE - 1) return 5;
    if (x % 4 === 0) return 6;
    return y % 6 === 0 ? 4 : 3;
  }),
  // Server-room panels
  createBuiltinFloorSprite((x, y) => {
    if (x === 0 || y === 0 || x === TILE_SIZE - 1 || y === TILE_SIZE - 1) return 5;
    if ((x - 2) % 6 === 0 && (y - 2) % 6 === 0) return 6;
    return (x + y) % 3 === 0 ? 4 : 3;
  }),
  // Crosshatch carpet
  createBuiltinFloorSprite((x, y) => {
    if (x % 8 === 0 || y % 8 === 0) return 5;
    if (x % 4 === 0 || y % 4 === 0) return 4;
    return (x + y) % 2 === 0 ? 3 : 2;
  }),
  // Concrete noise
  createBuiltinFloorSprite((x, y) => {
    const hash = (x * 13 + y * 17 + x * y * 3) % 16;
    if (hash === 0) return 6;
    if (hash < 3) return 5;
    if (hash > 12) return 2;
    return 3 + ((x + y) % 2);
  }),
];

/** Module-level storage for floor tile sprites (set once on load) */
let floorSprites: SpriteData[] = [];

/** Wall color constant */
export const WALL_COLOR = '#3A3A5C';

/** Set floor tile sprites (called once when extension sends floorTilesLoaded) */
export function setFloorSprites(sprites: SpriteData[]): void {
  floorSprites = sprites;
  clearColorizeCache();
}

/** Get the raw floor sprite for a pattern index (1-7 -> array index 0-6). */
export function getFloorSprite(patternIndex: number): SpriteData | null {
  const idx = patternIndex - 1;
  if (idx < 0) return null;
  if (idx < floorSprites.length) return floorSprites[idx];
  if (idx < BUILTIN_FLOOR_SPRITES.length) return BUILTIN_FLOOR_SPRITES[idx];
  if (patternIndex >= 1) {
    return Array.from({ length: TILE_SIZE }, () => Array(TILE_SIZE).fill(FALLBACK_FLOOR_COLOR));
  }
  return null;
}

/** Check if floor sprites are available (always true — built-ins cover missing assets). */
export function hasFloorSprites(): boolean {
  return true;
}

/** Get count of available floor patterns. */
export function getFloorPatternCount(): number {
  return floorSprites.length > 0 ? floorSprites.length : BUILTIN_FLOOR_SPRITES.length;
}

/** Get all floor sprites used for preview rendering. */
export function getAllFloorSprites(): SpriteData[] {
  return floorSprites.length > 0 ? floorSprites : BUILTIN_FLOOR_SPRITES;
}

/**
 * Get a colorized version of a floor sprite.
 * Uses Photoshop-style Colorize: grayscale -> HSL with given hue/saturation,
 * then brightness/contrast adjustment.
 */
export function getColorizedFloorSprite(patternIndex: number, color: FloorColor): SpriteData {
  const key = `floor-${patternIndex}-${color.h}-${color.s}-${color.b}-${color.c}`;

  const base = getFloorSprite(patternIndex);
  if (!base) {
    // Return a 16x16 magenta error tile
    const err: SpriteData = Array.from({ length: 16 }, () => Array(16).fill('#FF00FF'));
    return err;
  }

  // Floor tiles are always colorized (grayscale patterns need Photoshop-style Colorize)
  return getColorizedSprite(key, base, { ...color, colorize: true });
}
