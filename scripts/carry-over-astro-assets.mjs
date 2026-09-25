// Keeps the live build's hashed /_astro/* files in the next deploy.
//
// Workers static assets serve only the files uploaded with the current
// version. A rollout is not atomic across the edge: for a moment the old
// version (or its cached HTML) still answers page requests while the asset
// layer already serves the new version, and tabs opened before a deploy keep
// lazy-loading chunks by their old names. Either way the old HTML asks for
// files the new version no longer has, and they 404.
//
// Every build publishes /_astro-files.json listing its own /_astro/* files.
// Before deploying, this script reads that list from the live site and copies
// the files missing from the new build into dist/client/_astro, so the
// previous build's assets survive exactly one more deploy. The new list names
// only the new build's own files, so carried files drop out on the deploy
// after. Any failure warns and continues: a missed carry-over must never
// block a deploy.

import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ASSET_LIST_FILE = '_astro-files.json';
const CLIENT_DIR = 'dist/client';
const FETCH_TIMEOUT_MS = 10_000;
const CONCURRENCY = 8;
// Hashed Astro output only; anything else in a fetched list is ignored.
const SAFE_NAME = /^[\w-][\w.-]*$/;

async function fetchWithTimeout(url, fetchImpl) {
  return fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

async function readLiveAssetList(origin, fetchImpl) {
  const response = await fetchWithTimeout(new URL(`/${ASSET_LIST_FILE}`, origin), fetchImpl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const list = await response.json();
  if (!Array.isArray(list)) throw new Error('not a JSON array');
  return list.filter((name) => typeof name === 'string' && SAFE_NAME.test(name));
}

/**
 * @param {{ origin: string, clientDir?: string, fetchImpl?: typeof fetch }} options
 * @returns {Promise<{ carried: number, failed: number }>}
 */
export async function carryOverAstroAssets({
  origin,
  clientDir = CLIENT_DIR,
  fetchImpl = fetch,
}) {
  const astroDir = resolve(clientDir, '_astro');
  if (!existsSync(astroDir)) {
    console.warn(`Asset carry-over skipped: ${astroDir} does not exist.`);
    return { carried: 0, failed: 0 };
  }

  const ownFiles = readdirSync(astroDir).sort();
  writeFileSync(resolve(clientDir, ASSET_LIST_FILE), `${JSON.stringify(ownFiles)}\n`);

  let liveFiles;
  try {
    liveFiles = await readLiveAssetList(origin, fetchImpl);
  } catch (error) {
    console.warn(`Asset carry-over skipped: ${origin}/${ASSET_LIST_FILE} unreadable (${error.message}).`);
    return { carried: 0, failed: 0 };
  }

  const own = new Set(ownFiles);
  const missing = liveFiles.filter((name) => !own.has(name));
  let carried = 0;
  let failed = 0;

  const queue = [...missing];
  const worker = async () => {
    for (let name = queue.shift(); name; name = queue.shift()) {
      try {
        const response = await fetchWithTimeout(new URL(`/_astro/${name}`, origin), fetchImpl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        writeFileSync(join(astroDir, name), Buffer.from(await response.arrayBuffer()));
        carried += 1;
      } catch (error) {
        failed += 1;
        console.warn(`Asset carry-over could not fetch /_astro/${name} (${error.message}).`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(
    `Asset carry-over: ${carried} of ${missing.length} previous /_astro files kept`
    + ` (${ownFiles.length} built).`,
  );
  return { carried, failed };
}

const isDirectRun = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  const origin = process.argv[2] ?? process.env.PUBLIC_SITE_URL ?? 'https://buxx.me';
  await carryOverAstroAssets({ origin });
}
