import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(
  await readFile(resolve(packageDirectory, 'package.json'), 'utf8'),
);

const fail = (message) => {
  console.error(`contracts package check failed: ${message}`);
  process.exitCode = 1;
};

if (packageJson.name !== '@bunizao/contracts') fail('package name must remain @bunizao/contracts');
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(packageJson.version)) {
  fail('version must be immutable SemVer');
}
if ('private' in packageJson && packageJson.private !== false) fail('package must be publishable');
if (packageJson.publishConfig?.access !== 'public') fail('publishConfig.access must be public');
if (packageJson.publishConfig?.provenance !== true) fail('publishConfig.provenance must be true');
if (!Array.isArray(packageJson.files) || !packageJson.files.includes('dist')) {
  fail('published files must include dist');
}

const exportsMap = packageJson.exports;
if (!exportsMap || typeof exportsMap !== 'object') fail('exports map is required');
for (const [subpath, entry] of Object.entries(exportsMap)) {
  if (!entry || typeof entry !== 'object') {
    fail(`${subpath} export must use conditional entries`);
    continue;
  }
  if (entry.import !== `./dist/${subpath === '.' ? 'index' : subpath.slice(2)}.js`) {
    fail(`${subpath} import target must point to dist`);
  }
  if (entry.default !== entry.import) fail(`${subpath} default target must match import`);
  if (entry.types !== `./dist/${subpath === '.' ? 'index' : subpath.slice(2)}.d.ts`) {
    fail(`${subpath} types target must point to dist`);
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`@bunizao/contracts@${packageJson.version} package metadata is valid.`);
