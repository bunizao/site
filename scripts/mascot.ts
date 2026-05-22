#!/usr/bin/env bun
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

import { PEEK_BASE } from '../src/features/mascot/peek/base';
import { getPeekAsset } from '../src/features/mascot/peek/catalog';
import type { Cell, Grid } from '../src/features/mascot/peek/model';
import { expandTimelineFrames } from '../src/features/mascot/peek/timeline';

type Cmd = 'show' | 'diff';

const ANSI_RESET = '\x1b[0m';
const PIXEL = '  ';

const CELL_RGB: Record<Cell, readonly [number, number, number]> = {
  0: [24, 24, 27],
  1: [228, 228, 231],
  2: [82, 82, 91],
  3: [250, 204, 21],
  4: [239, 68, 68],
  5: [248, 250, 252],
  6: [234, 179, 8],
  7: [34, 197, 94],
  8: [9, 9, 11],
  9: [168, 85, 247],
  10: [120, 53, 15],
  11: [96, 165, 250],
  12: [244, 114, 182],
};

function bg(cell: Cell): string {
  const [r, g, b] = CELL_RGB[cell] ?? CELL_RGB[0];
  return `\x1b[48;2;${r};${g};${b}m`;
}

function renderGrid(grid: Grid): string {
  return grid
    .map((row) => row.map((cell) => `${bg(cell)}${PIXEL}`).join('') + ANSI_RESET)
    .join('\n');
}

function renderFrames(frames: ReadonlyArray<Grid>, gap = 2): string {
  if (frames.length === 0) return '';
  const height = frames[0]!.length;
  const lines: string[] = [];
  for (let y = 0; y < height; y += 1) {
    const parts = frames.map((frame) =>
      frame[y]!.map((cell) => `${bg(cell)}${PIXEL}`).join('') + ANSI_RESET,
    );
    lines.push(parts.join(' '.repeat(gap)));
  }
  return lines.join('\n');
}

function diffGrid(a: Grid, b: Grid): { ascii: string; changed: number } {
  if (a.length !== b.length || a[0]!.length !== b[0]!.length) {
    throw new Error(`grid size mismatch: ${a[0]!.length}x${a.length} vs ${b[0]!.length}x${b.length}`);
  }
  let changed = 0;
  const ascii = a
    .map((row, y) =>
      row
        .map((cell, x) => {
          if (cell === b[y]![x]) {
            return `${bg(cell)}${PIXEL}`;
          }
          changed += 1;
          return `\x1b[48;2;239;68;68m\x1b[97m><`;
        })
        .join('') + ANSI_RESET,
    )
    .join('\n');
  return { ascii, changed };
}

async function writePng(grid: Grid, path: string, scale = 32): Promise<void> {
  const height = grid.length;
  const width = grid[0]!.length;
  const buffer = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = CELL_RGB[grid[y]![x]!] ?? CELL_RGB[0];
      const i = (y * width + x) * 4;
      buffer[i] = r;
      buffer[i + 1] = g;
      buffer[i + 2] = b;
      buffer[i + 3] = 255;
    }
  }
  await mkdir(resolve(path, '..'), { recursive: true });
  await sharp(buffer, { raw: { width, height, channels: 4 } })
    .resize(width * scale, height * scale, { kernel: 'nearest' })
    .png()
    .toFile(path);
}

function resolveAsset(id: string): { grid?: Grid; frames?: ReadonlyArray<Grid>; label: string } {
  if (id === 'peek.base' || id === 'base') {
    return { grid: PEEK_BASE.base, label: 'peek.base' };
  }
  const asset = getPeekAsset(id);
  return {
    grid: asset.grid,
    frames: asset.frames ? expandTimelineFrames(asset) : undefined,
    label: asset.id,
  };
}

async function show(id: string, opts: { png: boolean }): Promise<void> {
  const { grid, frames, label } = resolveAsset(id);
  if (frames && frames.length > 0) {
    console.log(`${label} — ${frames.length} frames\n`);
    console.log(renderFrames(frames));
    if (opts.png) {
      const dir = resolve('.tmp/mascot', label);
      await Promise.all(frames.map((frame, i) => writePng(frame, resolve(dir, `${i}.png`))));
      console.log(`\nwrote ${frames.length} png to ${dir}`);
    }
    return;
  }
  if (!grid) throw new Error(`asset ${label} has neither grid nor frames`);
  console.log(`${label}\n`);
  console.log(renderGrid(grid));
  if (opts.png) {
    const file = resolve('.tmp/mascot', `${label}.png`);
    await writePng(grid, file);
    console.log(`\nwrote ${file}`);
  }
}

function pickFirstFrame(asset: { grid?: Grid; frames?: ReadonlyArray<Grid> }): Grid {
  if (asset.grid) return asset.grid;
  if (asset.frames && asset.frames[0]) return asset.frames[0];
  throw new Error('asset has no grid or frames');
}

async function diff(idA: string, idB: string): Promise<void> {
  const a = resolveAsset(idA);
  const b = resolveAsset(idB);
  const ga = pickFirstFrame(a);
  const gb = pickFirstFrame(b);
  const { ascii, changed } = diffGrid(ga, gb);
  console.log(`${a.label} vs ${b.label} — ${changed} changed pixels\n`);
  console.log(ascii);
}

function parseArgs(argv: ReadonlyArray<string>): { cmd: Cmd; ids: string[]; png: boolean } {
  const [cmd, ...rest] = argv;
  if (cmd !== 'show' && cmd !== 'diff') {
    throw new Error(`usage: bun scripts/mascot.ts <show|diff> <id> [id] [--png]`);
  }
  const png = rest.includes('--png');
  const ids = rest.filter((a) => !a.startsWith('--'));
  if (cmd === 'show' && ids.length !== 1) throw new Error('show needs exactly one asset id');
  if (cmd === 'diff' && ids.length !== 2) throw new Error('diff needs exactly two asset ids');
  return { cmd, ids, png };
}

const { cmd, ids, png } = parseArgs(process.argv.slice(2));
if (cmd === 'show') {
  await show(ids[0]!, { png });
} else {
  await diff(ids[0]!, ids[1]!);
}
