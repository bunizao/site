import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const staged = args.includes('--staged');
const unpublished = args.includes('--unpublished');
const refs = unpublished
  ? execFileSync('git', ['rev-list', 'HEAD', '--not', '--remotes'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  : [staged ? ':' : 'HEAD'];
const privatePath = (path) => path.startsWith('src/features/desk/') || /^plans\/desk-.*\.md$/.test(path);
const historicalPath = (path) => path.startsWith('public/desk/') || path.startsWith('scripts/brand/') || path === 'tests/unit/desk-github-week.test.ts';
const shell = /^---\s+import \{ DeskPage \} from '@desk';\s+export const prerender = false;\s+if \(!DeskPage\) return Astro.redirect\('\/'\);\s+---\s+<DeskPage \/>\s*$/;
let failures = 0;

for (const ref of refs) {
  const paths = execFileSync('git', ref === ':' ? ['ls-files', '-z'] : ['ls-tree', '-rz', '--name-only', ref], { encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const path of paths) {
    const legacy = unpublished && (historicalPath(path) || path === 'src/pages/new.astro');
    if (!privatePath(path) && !legacy) continue;
    const object = ref === ':' ? `:${path}` : `${ref}:${path}`;
    const blob = execFileSync('git', ['cat-file', 'blob', object], { maxBuffer: 64 * 1024 * 1024 });
    if (legacy && path === 'src/pages/new.astro' && shell.test(blob.toString('utf8'))) continue;
    if (!blob.subarray(0, 10).equals(Buffer.from('U2FsdGVkX1'))) {
      console.error(`Plaintext protected blob: ${object}`);
      failures += 1;
    }
  }
}
if (failures) {
  console.error(`Desk encryption check failed (${failures} blobs). Do not push this history.`);
  process.exit(1);
}
console.log(`Desk encryption verified (${refs.length} revisions).`);
