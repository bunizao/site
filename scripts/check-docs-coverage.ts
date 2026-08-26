#!/usr/bin/env bun
// Fails when an HTTP route exists that no page under src/content/docs mentions.
//
// The published /docs reference is the only description of this API, so a route
// added without a doc line is a route nobody outside the repo can discover. This
// walks the route files in both Workers, derives the public path of each, and
// checks that some doc page names it.
//
// Scope is route modules (.ts/.js under src/pages) — the things with a request
// and response contract. .astro pages are rendered UI and are out of scope.
//
// Usage: bun scripts/check-docs-coverage.ts [path-to-site-api]

import { readFile, readdir } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';

const requestedApiRepo = process.argv[2] ?? process.env.SITE_API_REPO;
const apiRepo = resolve(requestedApiRepo ?? '../site-api');
const docsDir = resolve('src/content/docs');

// Routes that exist but are deliberately not documented, each with the reason.
// Add to this rather than loosening the matcher — an entry here is a decision,
// a loosened matcher is a hole.
const EXEMPT = new Map<string, string>([
  ['/api/dev/*', 'Dev-only scaffolding, not deployed behavior'],
]);

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const found = await Promise.all(
    entries.map((entry) => {
      const full = join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : Promise.resolve([full]);
    }),
  );
  return found.flat();
}

/** src/pages/v2/mood/[id]/comments.ts -> /v2/mood/*​/comments */
function routeFileToPath(pagesDir: string, file: string): string | null {
  if (!/\.(ts|js)$/.test(file)) return null;
  const rel = relative(pagesDir, file).replace(/\.(ts|js)$/, '');
  const segments = rel
    .split('/')
    .filter((segment, index, all) => !(segment === 'index' && index === all.length - 1))
    .map((segment) => segment.replace(/\[[^\]]*\]/g, '*'));
  return `/${segments.join('/')}`;
}

/**
 * Collapse the ways a doc can spell a dynamic segment down to one. A segment
 * can also be part dynamic — logo/[id].svg and logo/{id}.svg both mean
 * logo/​*.svg — so the placeholder is replaced in place, not whole-segment.
 */
function normalize(path: string): string {
  return path
    .replace(/\/+$/, '')
    .split('/')
    .map((segment) =>
      segment
        .replace(/\{[^}]*\}|<[^>]*>|\[[^\]]*\]/g, '*')
        .replace(/^:[A-Za-z][\w-]*/, '*'),
    )
    .join('/')
    .toLowerCase() || '/';
}

// Path-like tokens in prose, tables, and code fences alike. Deliberately greedy
// on the character class so /api/oembed.json and /r/<name>.json both survive.
const PATH_TOKEN = /(?<![\w.\-/])\/[A-Za-z0-9][A-Za-z0-9._/*-]*(?:\{[^}\s]*\}|<[^>\s]*>|:[A-Za-z]+|\[[^\]\s]*\])?[A-Za-z0-9._/*-]*/g;

async function documentedPaths(): Promise<Set<string>> {
  const files = (await walk(docsDir)).filter((file) => file.endsWith('.md'));
  const paths = new Set<string>();
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(PATH_TOKEN)) {
      paths.add(normalize(match[0]));
    }
  }
  return paths;
}

async function routesOf(repo: string, publicPrefix: string): Promise<Map<string, string>> {
  const pagesDir = join(repo, 'src/pages');
  const routes = new Map<string, string>();
  for (const file of await walk(pagesDir)) {
    const path = routeFileToPath(pagesDir, file);
    if (path) routes.set(`${publicPrefix}${path}`, relative(repo, file));
  }
  return routes;
}

async function main(): Promise<void> {
  const documented = await documentedPaths();

  // site-api strips a leading /api at ingress, so a route file answers both the
  // prefixed form on buxx.me and the bare form on api.buxx.me. Either spelling
  // in the docs counts as covering it.
  const apiRoutes = await routesOf(apiRepo, '/api');
  if (apiRoutes.size === 0) {
    if (requestedApiRepo) {
      console.error(`No site-api routes found at ${apiRepo}.`);
      process.exit(1);
    }
    console.warn(`No site-api routes found at ${apiRepo} — skipping that half.`);
    console.warn('Pass the repo path as an argument or set SITE_API_REPO.');
  }
  const siteRoutes = await routesOf(resolve('.'), '');

  const missing: Array<{ path: string; file: string }> = [];
  for (const [path, file] of [...apiRoutes, ...siteRoutes]) {
    const normalized = normalize(path);
    if (EXEMPT.has(normalized)) continue;
    const bare = normalized.startsWith('/api/') ? normalized.slice(4) : normalized;
    if (documented.has(normalized) || documented.has(bare)) continue;
    missing.push({ path, file });
  }

  const total = apiRoutes.size + siteRoutes.size;
  if (missing.length === 0) {
    console.log(`All ${total} routes are documented under src/content/docs.`);
    return;
  }

  console.error(`${missing.length} of ${total} routes are not mentioned anywhere in src/content/docs:\n`);
  for (const { path, file } of missing.sort((a, b) => a.path.localeCompare(b.path))) {
    console.error(`  ${path.padEnd(44)} ${file}`);
  }
  console.error('\nDocument each under src/content/docs/api/, or add it to EXEMPT in this script with a reason.');
  process.exit(1);
}

await main();
