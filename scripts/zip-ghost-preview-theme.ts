#!/usr/bin/env bun
// Zips scripts/ghost-preview-theme/ into a file Ghost Admin's
// Design → Change theme → Upload accepts. See that folder's README.md.

import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const themeDir = resolve('scripts/ghost-preview-theme');
const outDir = resolve('dist/ghost-preview-theme');
const outFile = resolve(outDir, 'buxx-preview.zip');

await mkdir(outDir, { recursive: true });
await rm(outFile, { force: true });

const proc = Bun.spawn(
  ['zip', '-r', '-X', outFile, '.', '-x', 'README.md'],
  { cwd: themeDir, stdout: 'inherit', stderr: 'inherit' },
);
const exitCode = await proc.exited;

if (exitCode !== 0) {
  console.error('Failed to zip the Ghost preview theme.');
  process.exit(exitCode);
}

console.log(`Wrote ${outFile}`);
