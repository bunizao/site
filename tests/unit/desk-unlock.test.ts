import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fixtures: string[] = [];
afterEach(() => { for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const git = (dir: string, args: string[]) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'desk-unlock-test-'));
  fixtures.push(dir);
  mkdirSync(join(dir, 'scripts/vendor'), { recursive: true });
  mkdirSync(join(dir, 'src/features/desk'), { recursive: true });
  for (const name of ['desk-unlock.sh', 'desk-unlock.mjs', 'desk-lock.mjs', 'vendor/transcrypt']) {
    copyFileSync(join(process.cwd(), 'scripts', name), join(dir, 'scripts', name));
  }
  writeFileSync(join(dir, '.gitattributes'), 'src/features/desk/** filter=crypt diff=crypt merge=crypt\n');
  writeFileSync(join(dir, 'src/features/desk/index.ts'), 'export const DeskPage = null;\n');
  writeFileSync(join(dir, 'src/features/desk/image.png'), Buffer.from([0, 1, 128, 255]));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.name', 'Fixture']);
  git(dir, ['config', 'user.email', 'fixture@example.invalid']);
  git(dir, ['add', '.']);
  git(dir, ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'test: initial plaintext']);
  return dir;
}

function unlock(dir: string, key?: string, args: string[] = []) {
  return spawnSync('bash', ['scripts/desk-unlock.sh', ...args], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, DESK_KEY: key ?? '' },
  });
}

const bytes = (dir: string) => ['index.ts', 'image.png'].map((file) => readFileSync(join(dir, 'src/features/desk', file)));

describe('desk initialization', () => {
  test('initializes existing plaintext attributes, preserves bytes and stays idempotent', () => {
    const dir = fixture();
    const key = randomBytes(64).toString('hex');
    const original = bytes(dir);
    const result = unlock(dir, key);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('desk unlocked');
    expect(result.stdout + result.stderr).not.toContain(key);
    expect(bytes(dir)).toEqual(original);
    expect(unlock(dir, key).status).toBe(0);
    git(dir, ['add', '--renormalize', '.']);
    expect(git(dir, ['cat-file', 'blob', ':src/features/desk/image.png']).subarray(0, 10).toString()).toBe('U2FsdGVkX1');
  }, 30_000);

  test('interactive input refuses a pipe instead of exposing a key', () => {
    const dir = fixture();
    const result = unlock(dir, undefined, ['--interactive']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('requires a terminal');
  });

  test('initializes without the optional column formatter', () => {
    const dir = fixture();
    const key = randomBytes(32).toString('hex');
    const command = `command() {
      if [[ "$1" == '-v' && "\${2:-}" == 'column' ]]; then return 1; fi
      builtin command "$@"
    }
    export -f command
    exec bash scripts/desk-unlock.sh`;
    const result = spawnSync('bash', ['-c', command], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, DESK_KEY: key },
    });
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).not.toContain(key);
  }, 30_000);

  test('refuses dirty source without installing configuration', () => {
    const dir = fixture();
    writeFileSync(join(dir, 'src/features/desk/index.ts'), 'owner edit\n');
    const result = unlock(dir, randomBytes(32).toString('hex'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('commit or stash');
    expect(readFileSync(join(dir, 'src/features/desk/index.ts'), 'utf8')).toBe('owner edit\n');
    expect(spawnSync('git', ['config', '--get', 'transcrypt.version'], { cwd: dir }).status).toBe(1);
  });

  test('resets an unused bootstrap key but refuses staged ciphertext and encrypted history', () => {
    const dir = fixture();
    const key = randomBytes(32).toString('hex');
    const original = bytes(dir);
    expect(unlock(dir, key).status).toBe(0);
    expect(unlock(dir, undefined, ['--reset-bootstrap']).status).toBe(0);
    expect(bytes(dir)).toEqual(original);
    expect(unlock(dir, key).status).toBe(0);
    git(dir, ['add', '--renormalize', '.']);
    expect(unlock(dir, undefined, ['--reset-bootstrap']).status).toBe(1);
    git(dir, ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'test: ciphertext']);
    // Simulate a plaintext branch while keeping the encrypted commit reachable.
    git(dir, ['branch', 'encrypted-history']);
    git(dir, ['-c', 'filter.crypt.smudge=cat', 'reset', '--hard', 'HEAD~1']);
    expect(unlock(dir, undefined, ['--reset-bootstrap']).stderr).toContain('encrypted history');
  }, 30_000);

  for (const entry of ['export const DeskPage = null;\n', 'export{};\n']) {
    test(`rejects a wrong key in a fresh encrypted clone (${entry.length} bytes)`, () => {
      const dir = fixture();
      writeFileSync(join(dir, 'src/features/desk/index.ts'), entry);
      git(dir, ['add', '.']);
      git(dir, ['-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'test: entry length']);
      const key = randomBytes(32).toString('hex');
      expect(unlock(dir, key).status).toBe(0);
      git(dir, ['add', '--renormalize', '.']);
      git(dir, ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'test: ciphertext']);
      const clone = mkdtempSync(join(tmpdir(), 'desk-unlock-clone-'));
      fixtures.push(clone);
      execFileSync('git', ['clone', '-q', '--no-local', dir, clone], { stdio: 'pipe' });
      const cipher = bytes(clone);
      const wrong = randomBytes(32).toString('hex');
      const result = unlock(clone, wrong);
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).not.toContain(wrong);
      expect(result.stdout + result.stderr).not.toContain(key);
      expect(bytes(clone)).toEqual(cipher);
      const retry = unlock(clone, key);
      if (retry.status !== 0) throw new Error(retry.stderr);
      expect(retry.status).toBe(0);
      expect(bytes(clone)).toEqual(bytes(dir));
    }, 30_000);
  }
});
