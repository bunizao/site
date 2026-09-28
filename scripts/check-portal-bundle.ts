#!/usr/bin/env bun

/* Guards the dev portal's JavaScript weight. Run after `bun run build`.

   The portal is one client:only island. What loads before the first screen
   (the shell) is the static import graph of the island's entry chunk plus
   Astro's React renderer. Each screen is an `import()` target; its cost on a
   first visit is its own static graph minus what the shell already loaded.

   Chunk names are not trusted: Rolldown files shared vendor code under
   whatever module it met first (the 150 KB chunk named `api` is react-query
   and Base UI). So the graph is walked from the server manifest's entry, and
   heavy libraries are found by strings they carry through minification.

   Checks, each a failure:
   - the shell or a screen grew more than 10% (and 1 KiB) over the baseline
   - a heavy library shows up outside the screens allowed to draw it
   - a dev-only demo switch reached the production output
   - a screen exists that the baseline has not recorded

   `--update` rewrites the baseline after a deliberate change. */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = resolve('dist');
const ASSETS = join(DIST, 'client/_astro');
const BASELINE_PATH = resolve('scripts/portal-bundle-baseline.json');
const ENTRY_MODULE = '@/features/portal/app/PortalApp';
const RENDERER_MODULE = '@astrojs/react/client.js';

const MAX_GROWTH = 0.1;
/** 10% of a 4 KiB screen is one icon; below this a change is noise. */
const MIN_GROWTH_BYTES = 1024;

/* A library that must stay out of the portal, or in the screens that draw
   it. The signature is a string the library keeps after minification;
   the report says where else in the build it was seen, which is how to
   tell that a signature still matches its library. */
const HEAVY_LIBRARIES: Array<{ name: string; signature: string; allowedIn: string[] }> = [
  { name: 'recharts', signature: 'recharts-wrapper', allowedIn: [] },
  { name: 'framer-motion', signature: 'framerAppearId', allowedIn: [] },
  { name: 'gsap', signature: 'GreenSock', allowedIn: [] },
  { name: 'lottie-web', signature: 'bodymovin', allowedIn: [] },
  { name: 'mermaid', signature: 'securityLevel', allowedIn: [] },
];

/** Dev-only switches from app/api.ts and server/demo-api.ts, and the demo
    reset route the e2e specs call. */
const DEV_ONLY_MARKERS = ['x-portal-demo', 'demoFail', 'demoDelay', 'handleDemoRequest', '__demo/reset'];

interface Baseline {
  note: string;
  shell: number;
  screens: Record<string, number>;
}

const STATIC_IMPORT = /(?:^|[;}\s])(?:import|export)\s*(?:[\w$*{}\s,]*?\bfrom\s*)?["']\.\/([^"']+\.js)["']/g;
const DYNAMIC_IMPORT = /\bimport\(\s*["']\.\/([^"']+\.js)["']\s*\)/g;

const sources = new Map<string, string>();
function source(file: string): string {
  let text = sources.get(file);
  if (text === undefined) {
    text = readFileSync(join(ASSETS, file), 'utf8');
    sources.set(file, text);
  }
  return text;
}

const gzipSizes = new Map<string, number>();
function gzipSize(file: string): number {
  let size = gzipSizes.get(file);
  if (size === undefined) {
    size = gzipSync(source(file)).length;
    gzipSizes.set(file, size);
  }
  return size;
}

const matches = (text: string, pattern: RegExp): string[] => [...text.matchAll(pattern)].map((match) => match[1]);

/** Every chunk `roots` load before running, skipping `loaded`. */
function staticGraph(roots: string[], loaded: ReadonlySet<string> = new Set()): Set<string> {
  const seen = new Set<string>();
  const stack = [...roots];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file) || loaded.has(file)) continue;
    seen.add(file);
    stack.push(...matches(source(file), STATIC_IMPORT));
  }
  return seen;
}

const total = (files: Iterable<string>): number => [...files].reduce((sum, file) => sum + gzipSize(file), 0);
const kib = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`;
const screenName = (file: string): string => file.split('.')[0];

function readText(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readText(path));
    else if (/\.(m?js|json)$/.test(entry.name)) out.push(readFileSync(path, 'utf8'));
  }
  return out;
}

function manifestChunk(server: string, module: string): string {
  const escaped = module.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const found = server.match(new RegExp(`"${escaped}":"_astro/([^"]+\\.js)"`));
  if (!found) throw new Error(`No client chunk for ${module} in dist/server. Did the build change shape?`);
  return found[1];
}

function main(): void {
  if (!existsSync(ASSETS)) {
    console.error('No dist/client/_astro. Run `bun run build` first.');
    process.exit(1);
  }
  const serverFiles = readText(join(DIST, 'server'));
  const server = serverFiles.join('\n');
  const entry = manifestChunk(server, ENTRY_MODULE);
  const renderer = manifestChunk(server, RENDERER_MODULE);

  const shell = staticGraph([entry, renderer]);
  const shellBytes = total(shell);

  // Screens: every import() target reachable from the shell or a screen.
  const screens = new Map<string, Set<string>>();
  const queue = [...shell];
  while (queue.length > 0) {
    for (const target of matches(source(queue.pop()!), DYNAMIC_IMPORT)) {
      if (screens.has(target)) continue;
      const graph = staticGraph([target], shell);
      screens.set(target, graph);
      queue.push(...graph);
    }
  }
  const portalFiles = new Set([...shell, ...[...screens.values()].flatMap((graph) => [...graph])]);

  const update = process.argv.includes('--update');
  const baseline: Baseline | null = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : null;
  const failures: string[] = [];

  const grew = (name: string, now: number, before: number | undefined): string => {
    if (before === undefined) return 'new';
    const change = (now - before) / before;
    if (!update && change > MAX_GROWTH && now - before > MIN_GROWTH_BYTES) {
      failures.push(`${name} grew ${(change * 100).toFixed(1)}% (${kib(before)} -> ${kib(now)}).`);
    }
    return `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%`;
  };

  const rows: string[][] = [['', 'own chunk', 'first load', 'baseline', 'change']];
  rows.push(['shell (initial JS)', '', kib(shellBytes), baseline ? kib(baseline.shell) : '-', grew('The shell', shellBytes, baseline?.shell)]);
  const measured: Record<string, number> = {};
  for (const [file, graph] of [...screens].sort(([a], [b]) => a.localeCompare(b))) {
    const name = screenName(file);
    const bytes = total(graph);
    measured[name] = bytes;
    const before = baseline?.screens[name];
    if (!update && baseline && before === undefined) failures.push(`${name} is not in the baseline. Run with --update to record it.`);
    rows.push([`  ${name}`, kib(gzipSize(file)), kib(bytes), before === undefined ? '-' : kib(before), grew(name, bytes, before)]);
  }
  rows.push(['every screen (idle preload)', '', kib(total(portalFiles) - shellBytes), '', '']);

  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  console.log(`Portal bundle, gzip. Entry ${entry}, ${shell.size} shell chunks, ${screens.size} screens.\n`);
  for (const row of rows) console.log(row.map((cell, column) => (column === 0 ? cell.padEnd(widths[column]) : cell.padStart(widths[column]))).join('  '));

  console.log('\nHeavy libraries:');
  for (const library of HEAVY_LIBRARIES) {
    const hits = [...portalFiles].filter((file) => source(file).includes(library.signature));
    const elsewhere = readdirSync(ASSETS).filter((file) => file.endsWith('.js') && !portalFiles.has(file) && source(file).includes(library.signature)).length;
    const misplaced = hits.filter((file) => {
      if (shell.has(file)) return true;
      const users = [...screens].filter(([, graph]) => graph.has(file)).map(([screen]) => screenName(screen));
      return users.some((user) => !library.allowedIn.includes(user));
    });
    for (const file of misplaced) failures.push(`${library.name} (${library.signature}) is in ${file}, outside ${library.allowedIn.join(', ') || 'no screen'}.`);
    const where = hits.length > 0 ? `in ${hits.join(', ')}` : 'not in the portal';
    console.log(`  ${library.name}: ${where}; ${elsewhere > 0 ? `seen in ${elsewhere} other site chunks` : 'not in this build, signature unverified'}`);
  }

  const clientFiles = readdirSync(ASSETS).filter((file) => file.endsWith('.js'));
  for (const marker of DEV_ONLY_MARKERS) {
    const leaks = clientFiles.filter((file) => source(file).includes(marker));
    if (serverFiles.some((text) => text.includes(marker))) leaks.push('dist/server');
    if (leaks.length > 0) failures.push(`Dev-only "${marker}" reached the build: ${leaks.join(', ')}.`);
  }

  if (update) {
    const next: Baseline = {
      note: 'Gzip bytes from scripts/check-portal-bundle.ts. Regenerate with `bun run check:portal-bundle -- --update` after a deliberate change.',
      shell: shellBytes,
      screens: measured,
    };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`\nBaseline written to ${BASELINE_PATH}.`);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.map((failure) => `FAIL ${failure}`).join('\n')}`);
    process.exit(1);
  }
  console.log('\nPortal bundle OK.');
}

main();
