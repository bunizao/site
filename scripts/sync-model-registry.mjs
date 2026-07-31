// Refresh the model registry that backs blog authorship credits.
//
//   bun run sync:models
//
// Source: https://models.dev (github.com/sst/models.dev), an open database of
// providers and models. We take only provider ids/names and model ids/names —
// the upstream payload is ~3.3MB of pricing, limits and capability flags we do
// not use.
//
// The snapshot is committed rather than fetched during the build: blog posts are
// prerendered in CI, and a network call there is a new way for a deploy to fail.
// Same reasoning as `sync:contracts`.
//
// Vendor marks are NOT synced. Three are vendored by hand under
// src/data/vendor-marks/ (from github.com/lobehub/lobe-icons, MIT); everything
// else renders a lettered ring. See AiMark.astro.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://models.dev/api.json';
const OUTPUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/data/generated/model-registry.json',
);

const response = await fetch(SOURCE);
if (!response.ok) {
  throw new Error(`models.dev returned ${response.status} ${response.statusText}`);
}

/** @type {Record<string, { name: string, models: Record<string, { name: string }> }>} */
const upstream = await response.json();

const providers = Object.entries(upstream)
  .map(([providerId, provider]) => [
    providerId,
    {
      name: provider.name,
      models: Object.fromEntries(
        Object.entries(provider.models ?? {})
          .map(([modelId, model]) => [modelId, model.name])
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    },
  ])
  .sort(([a], [b]) => a.localeCompare(b));

if (providers.length === 0) {
  throw new Error('models.dev returned no providers; refusing to write an empty registry.');
}

const registry = {
  source: SOURCE,
  providers: Object.fromEntries(providers),
};

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(registry, null, 2)}\n`);

const modelCount = providers.reduce((total, [, p]) => total + Object.keys(p.models).length, 0);
console.log(`Wrote ${providers.length} providers / ${modelCount} models to ${OUTPUT}`);
