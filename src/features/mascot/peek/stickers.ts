export type PeekStickerAsset = {
  id: string;
  label: string;
  summary: string;
  src: string;
  width: number;
  height: number;
  sourceBox: readonly [number, number, number, number];
};

export const PEEK_CODING_STICKER = {
  id: 'peek.sticker.coding',
  label: 'Coding',
  summary: 'Laptop pose with the skull status bubble.',
  src: '/mascot/peek/stickers/coding.svg',
  width: 371,
  height: 320,
  sourceBox: [284, 112, 655, 432],
} as const satisfies PeekStickerAsset;

export const PEEK_DEBUGGING_STICKER = {
  id: 'peek.sticker.debugging',
  label: 'Debugging',
  summary: 'Gear bubble, sweat mark, and side helper pose.',
  src: '/mascot/peek/stickers/debugging.svg',
  width: 351,
  height: 318,
  sourceBox: [858, 108, 1209, 426],
} as const satisfies PeekStickerAsset;

export const PEEK_NOTES_STICKER = {
  id: 'peek.sticker.notes',
  label: 'Notes',
  summary: 'Paper check pose with question mark.',
  src: '/mascot/peek/stickers/notes.svg',
  width: 352,
  height: 316,
  sourceBox: [307, 516, 659, 832],
} as const satisfies PeekStickerAsset;

export const PEEK_FOCUS_STICKER = {
  id: 'peek.sticker.focus',
  label: 'Focus',
  summary: 'Headphones workstation pose with laptop and cable.',
  src: '/mascot/peek/stickers/focus.svg',
  width: 408,
  height: 313,
  sourceBox: [860, 520, 1268, 833],
} as const satisfies PeekStickerAsset;

export const PEEK_STICKER_ASSETS: readonly PeekStickerAsset[] = [
  PEEK_CODING_STICKER,
  PEEK_DEBUGGING_STICKER,
  PEEK_NOTES_STICKER,
  PEEK_FOCUS_STICKER,
] as const;
