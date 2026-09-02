// Rewrites the adapter-generated config into the isolated staging Worker.
// The generated assets block is kept because its paths are build-relative.

import { readFileSync, writeFileSync } from 'node:fs';

const GENERATED = 'dist/server/wrangler.json';
const STAGING = 'wrangler.staging.jsonc';

function parseJsonc(text: string): Record<string, unknown> {
  return JSON.parse(text.split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n'));
}

const generated = JSON.parse(readFileSync(GENERATED, 'utf8')) as Record<string, unknown>;
const staging = parseJsonc(readFileSync(STAGING, 'utf8'));

if (generated.name !== 'site' && generated.name !== staging.name) {
  throw new Error(`expected generated config for "site", got "${String(generated.name)}"`);
}

delete generated.routes;

for (const key of ['name', 'workers_dev', 'preview_urls', 'vars', 'kv_namespaces', 'services'] as const) {
  if (!(key in staging)) throw new Error(`wrangler.staging.jsonc is missing "${key}"`);
  generated[key] = staging[key];
}

writeFileSync(GENERATED, JSON.stringify(generated, null, 2));
console.log(`rewrote ${GENERATED} -> name=${String(generated.name)}, routes stripped`);
