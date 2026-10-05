import { afterEach, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const script = join(process.cwd(), 'scripts/check-desk-encryption.mjs');
const git = (dir: string, args: string[]) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });

function fixture(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'desk-guard-'));
  directories.push(dir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.name', 'Fixture']);
  git(dir, ['config', 'user.email', 'fixture@example.invalid']);
  git(dir, ['add', '.']);
  git(dir, ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'test: initial tree']);
  return dir;
}

function check(dir: string, args: string[] = []) {
  return spawnSync('node', [script, ...args], { cwd: dir, encoding: 'utf8' });
}

const shell = "---\nimport { DeskPage } from '@desk';\nexport const prerender = false;\nif (!DeskPage) return Astro.redirect('/');\n---\n<DeskPage />\n";

test('accepts the public shell and shared tests alongside ciphertext', () => {
  const dir = fixture({
    'src/features/desk/index.ts': 'U2FsdGVkX1fixture',
    'src/pages/new.astro': shell,
    'tests/unit/favicon.test.ts': "test('public favicon', () => {});\n",
    'src/lib/favicon.ts': 'export const SITE_FAVICON = "/logo/peek.svg";',
  });
  expect(check(dir).status).toBe(0);
});

test('accepts the redirect new.astro became when the desk moved to /', () => {
  const dir = fixture({
    'src/features/desk/index.ts': 'U2FsdGVkX1fixture',
    'src/pages/new.astro': "---\nexport const prerender = false;\nreturn Astro.redirect('/', 308);\n---\n",
  });
  expect(check(dir).status).toBe(0);
});

for (const [name, content] of Object.entries({
  'src/features/desk/index.ts': 'export const privateSource = true;',
  'src/pages/new.astro': '<main>Private page body</main>',
  'public/desk/icon.png': 'private image bytes',
  'scripts/brand/paint.ts': 'private generator',
  'tests/unit/desk-github-week.test.ts': 'private test',
  'tests/unit/favicon.test.ts': "describe('desk icons', () => {});",
  'src/lib/favicon.ts': 'export const DESK_FAVICON = {};',
})) {
  test(`rejects plaintext in ${name}`, () => {
    const dir = fixture({ [name]: content });
    const result = check(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(name);
    expect(result.stderr).not.toContain(content);
  });
}

test('checks every unpublished parent even when the latest tree is encrypted', () => {
  const dir = fixture({ 'src/features/desk/index.ts': 'private source' });
  const file = join(dir, 'src/features/desk/index.ts');
  writeFileSync(file, 'U2FsdGVkX1fixture');
  git(dir, ['add', '.']);
  git(dir, ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'test: encrypt tree']);
  expect(check(dir).status).toBe(0);
  expect(check(dir, ['--unpublished']).status).toBe(1);
  // Excluding a published parent limits the check to the real publication range.
  git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD~1']);
  expect(check(dir, ['--ref', 'HEAD', '--unpublished']).status).toBe(0);
});
