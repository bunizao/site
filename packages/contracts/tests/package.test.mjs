import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(
  await readFile(resolve(packageDirectory, 'package.json'), 'utf8'),
);

test('publishes a public immutable package version', () => {
  assert.equal(packageJson.name, '@bunizao/contracts');
  assert.match(
    packageJson.version,
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
  );
  assert.notEqual(packageJson.private, true);
  assert.deepEqual(packageJson.publishConfig, {
    access: 'public',
    provenance: true,
    tag: 'latest',
  });
});

test('exports only generated dist entrypoints', () => {
  for (const entry of Object.values(packageJson.exports)) {
    assert.match(entry.import, /^\.\/dist\/[a-z-]+\.js$/);
    assert.equal(entry.default, entry.import);
    assert.match(entry.types, /^\.\/dist\/[a-z-]+\.d\.ts$/);
  }
});
