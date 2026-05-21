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

function diff(base: Grid, pose: Grid): Array<[number, number, Cell | -1]> {
  const out: Array<[number, number, Cell | -1]> = [];
  for (let y = 0; y < base.length; y += 1) {
    for (let x = 0; x < base[0]!.length; x += 1) {
      const b = base[y]![x]!;
      const p = pose[y]![x]!;
      if (b === p) continue;
      out.push([x, y, p === 0 ? -1 : (p as Cell)]);
    }
  }
  return out;
}

for (const [name, pattern] of Object.entries(POSES)) {
  const pose = gridFromPattern(pattern);
  const pixels = diff(PEEK_BASE.base, pose);
  console.log(`// ${name} — ${pixels.length} pixels`);
  console.log(`sparse([`);
  for (const [x, y, c] of pixels) {
    console.log(`  [${x}, ${y}, ${c}],`);
  }
  console.log(`]),`);
  console.log();
}
