#!/usr/bin/env bun
import { gridFromPattern, type Cell, type Grid } from '../src/features/mascot/peek/model';
import { PEEK_BASE } from '../src/features/mascot/peek/base';

const POSES: Record<string, string> = {
  far_left:  '.#.....##.|##.....###|##########|##########|o####o####|o##*#o####|##########',
  left:      '.##....###|###....###|##########|##########|#o####o###|#o##*#o###|##########',
  center:    '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  right:     '###....##.|###....###|##########|##########|###o####o#|###o#*##o#|##########',
  far_right: '.##.....#.|###.....##|##########|##########|####o####o|####o#*##o|##########',
};

const MOTIONS: Record<string, ReadonlyArray<string>> = {
  idle: [
    '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
    '.##....##.|###....###|##########|##########|##########|##o##*#o##|##########',
  ],
  curious: [
    '.##....##.|###.......|##########|##########|#o####o###|#o##*#o###|##########',
    '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
    '.##....##.|.......###|##########|##########|###o####o#|###o#*##o#|##########',
  ],
  dart: [
    '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
    '.##....##.|###....###|##########|##########|#o####o###|#o##*#o###|##########',
    '.##....##.|###....###|##########|##########|###o####o#|###o#*##o#|##########',
    '.##....##.|###....###|##########|##########|##########|##o##*#o##|##########',
  ],
  alert: [
    '.##....##.|.##....##.|###....###|##########|##oo##oo##|##oo#*oo##|##########',
    '.##....##.|.##....##.|###....###|##########|##oo##oo##|##oo**oo##|##########',
  ],
  purr: [
    '.##....##.|###....###|##########|##########|##########|##oo*#oo##|##########',
    '.##....##.|###....###|##########|##########|##########|##oo**oo##|##########',
    '.##....##.|###....###|##########|##########|##########|##o##*#o##|##########',
  ],
  nap: [
    '.##....##.|###....###|##########|##########|##########|#####*####|##########',
    '.##....##.|###....###|##########|##########|##########|##########|##########',
  ],
};

function diff(base: Grid, target: Grid): Array<[number, number, Cell | -1]> {
  const out: Array<[number, number, Cell | -1]> = [];
  for (let y = 0; y < base.length; y += 1) {
    for (let x = 0; x < base[0]!.length; x += 1) {
      const b = base[y]![x]!;
      const t = target[y]![x]!;
      if (b === t) continue;
      out.push([x, y, t === 0 ? -1 : (t as Cell)]);
    }
  }
  return out;
}

function emitSparse(name: string, pixels: ReadonlyArray<[number, number, Cell | -1]>) {
  console.log(`// ${name} — ${pixels.length} px`);
  console.log(`const ${name.toUpperCase()} = sparse([`);
  for (const [x, y, c] of pixels) console.log(`  [${x}, ${y}, ${c}],`);
  console.log(`]);`);
}

console.log('// === poses (delta from base) ===');
for (const [name, pattern] of Object.entries(POSES)) {
  emitSparse(`pose_${name}`, diff(PEEK_BASE.base, gridFromPattern(pattern)));
  console.log();
}

console.log('// === motions (delta from base, deduplicated by frame string) ===');
for (const [motion, frames] of Object.entries(MOTIONS)) {
  console.log(`// ${motion}`);
  const seen = new Map<string, number>();
  let i = 0;
  for (const frame of frames) {
    if (seen.has(frame)) continue;
    seen.set(frame, i);
    emitSparse(`${motion}_${i}`, diff(PEEK_BASE.base, gridFromPattern(frame)));
    i += 1;
    console.log();
  }
}
