#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const defaultMirrorPath = '../site-api/packages/contracts/src/routes.ts';
const mirrorPath = resolve(process.argv[2] ?? process.env.ROUTE_CONTRACTS_MIRROR ?? defaultMirrorPath);
const sourcePath = resolve('packages/contracts/src/routes.ts');

async function main(): Promise<void> {
  const [source, mirror] = await Promise.all([
    readFile(sourcePath, 'utf8'),
    readFile(mirrorPath, 'utf8').catch((error: unknown) => {
      throw new Error(`Unable to read route contract mirror at ${mirrorPath}: ${error instanceof Error ? error.message : String(error)}`);
    }),
  ]);

  if (source === mirror) {
    console.log(`Route contracts match ${mirrorPath}.`);
    return;
  }

  console.error(`Route contracts drift from ${mirrorPath}. Sync packages/contracts/src/routes.ts.`);
  process.exit(1);
}

await main();
