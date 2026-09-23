// Rewrites the adapter-generated dist/server/wrangler.json into the staging
// deploy config. The Cloudflare adapter always derives that file from the
// default wrangler.jsonc, so a staging deploy is: `bun run build`, then this
// script, then `wrangler deploy -c dist/server/wrangler.json`.
//
// Prod routes are stripped; name/bindings/vars come from
// wrangler.staging.jsonc. The generated `assets` block is kept as-is — its
// paths are relative to the generated file, not to the repo root.

import { readFileSync, writeFileSync } from 'node:fs';

const GENERATED = 'dist/server/wrangler.json';
const STAGING = 'wrangler.staging.jsonc';

function parseJsonc(text: string): Record<string, unknown> {
  // wrangler.staging.jsonc uses full-line // comments only.
  return JSON.parse(text.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'));
}

const generated = JSON.parse(readFileSync(GENERATED, 'utf8')) as Record<string, unknown>;
const staging = parseJsonc(readFileSync(STAGING, 'utf8'));

// Fresh builds say "site"; re-applying after a vars-only staging edit sees
// the already-rewritten name. Anything else is the wrong file.
if (generated.name !== 'site' && generated.name !== String(staging.name)) {
  throw new Error(`expected generated config for "site", got "${String(generated.name)}"`);
}

delete generated.routes;

for (const key of [
  'name',
  'workers_dev',
  'preview_urls',
  'vars',
  'kv_namespaces',
  'services',
] as const) {
  if (!(key in staging)) throw new Error(`wrangler.staging.jsonc is missing "${key}"`);
  generated[key] = staging[key];
}

writeFileSync(GENERATED, JSON.stringify(generated, null, 2));
console.log(`rewrote ${GENERATED} -> name=${String(generated.name)}, routes stripped`);
