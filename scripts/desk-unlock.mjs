import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeskUnlocked } from './desk-lock.mjs';

const magic = Buffer.from('U2FsdGVkX1');
const encrypted = (bytes) => bytes.subarray(0, magic.length).equals(magic);
const git = (args, input) => execFileSync('git', args, { input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
function config(name) {
  try { return git(['config', '--local', '--get', name]).toString().replace(/\r?\n$/, ''); }
  catch { return ''; }
}

function managedFiles() {
  const paths = git(['ls-files', '-z']);
  const attributes = git(['check-attr', '-z', 'filter', '--stdin'], paths).toString().split('\0');
  const files = [];
  for (let i = 0; i + 2 < attributes.length; i += 3) {
    if (attributes[i + 2] === 'crypt') files.push(attributes[i]);
  }
  return files;
}

// Filters change Git's dirty status during a plaintext migration. Compare raw
// bytes instead; neither staged changes nor edits may be discarded or accepted.
function plaintextBootstrap(files) {
  if (!files.length) return false;
  return files.every((file) => {
    try {
      const head = git(['cat-file', 'blob', `HEAD:${file}`]);
      return !encrypted(head)
        && head.equals(git(['cat-file', 'blob', `:${file}`]))
        && head.equals(readFileSync(file));
    } catch { return false; }
  });
}

function filtersReady() {
  return config('transcrypt.version') === '2.3.2'
    && config('transcrypt.cipher') === 'aes-256-cbc'
    && config('filter.crypt.required') === 'true'
    && Boolean(config('filter.crypt.clean'))
    && Boolean(config('filter.crypt.smudge'));
}

function resetBootstrap() {
  const files = managedFiles();
  const deskPath = (file) => file.startsWith('src/features/desk/') || /^plans\/desk-.*\.md$/.test(file);
  if (!plaintextBootstrap(files) || !files.every(deskPath)) {
    throw new Error('desk reset refused: protected HEAD, index and working files must be identical plaintext');
  }
  const contexts = git(['config', '--local', '--name-only', '--get-regexp', '^transcrypt\\.']).toString().trim().split('\n');
  const defaultSettings = new Set(['transcrypt.version', 'transcrypt.cipher', 'transcrypt.password', 'transcrypt.openssl-path']);
  if (contexts.some((name) => !defaultSettings.has(name))) {
    throw new Error('desk reset refused: additional transcrypt configuration needs manual review');
  }
  // A reset is allowed only before this key has protected any reachable history.
  const objects = git(['rev-list', '--objects', '--all', '--', 'src/features/desk', 'plans/desk-*.md']).toString().trim().split('\n').filter(Boolean);
  const ids = objects.map((line) => line.split(' ')[0]);
  const types = git(['cat-file', '--batch-check'], ids.join('\n') + '\n').toString().trim().split('\n');
  for (const line of types) {
    const [id, type] = line.split(' ');
    if (type === 'blob' && encrypted(git(['cat-file', 'blob', id]))) {
      throw new Error('desk reset refused: encrypted history still depends on the configured key');
    }
  }
  clearConfiguration();
  console.log('desk bootstrap configuration reset; source files preserved');
}

function clearConfiguration() {
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir']).toString().trim();
  const hooks = resolve(config('core.hooksPath') || resolve(common, 'hooks'));
  const activeHook = resolve(hooks, 'pre-commit');
  const cryptHook = resolve(hooks, 'pre-commit-crypt');
  if (existsSync(activeHook) && existsSync(cryptHook) && readFileSync(activeHook).equals(readFileSync(cryptHook))) {
    unlinkSync(activeHook);
  }
  for (const section of ['transcrypt', 'filter.crypt', 'diff.crypt', 'merge.crypt']) {
    spawnSync('git', ['config', '--local', '--remove-section', section], { stdio: 'ignore' });
  }
  for (const name of ['alias.ls-crypt', 'alias.ls-crypt-default', 'alias.add-crypt']) {
    spawnSync('git', ['config', '--local', '--unset', name], { stdio: 'ignore' });
  }
  if (config('transcrypt.version') || config('filter.crypt.clean') || config('filter.crypt.smudge')) {
    throw new Error('desk unlock failed: filter configuration could not be rolled back');
  }
  spawnSync('git', ['update-index', '-q', '--really-refresh'], { stdio: 'ignore' });
}

let rollback;
try {
  if (process.argv[2] === '--reset-bootstrap') {
    resetBootstrap();
  } else {
    const key = process.env.DESK_KEY;
    if (!key) {
      console.log('desk locked (no DESK_KEY)');
      process.exit(0);
    }
    if (config('transcrypt.version')) {
      if (config('transcrypt.password') !== key) {
        throw new Error('desk unlock refused: this checkout already uses a different key');
      }
      if (!filtersReady()) throw new Error('desk unlock refused: transcrypt configuration is incomplete');
    } else {
      if (config('transcrypt.password') || config('filter.crypt.clean') || config('filter.crypt.smudge')) {
        throw new Error('desk unlock refused: incomplete existing filter configuration needs review');
      }
      const hooks = config('core.hooksPath');
      if (hooks && !existsSync(hooks)) throw new Error('desk unlock refused: repair the missing core.hooksPath directory first');
      spawnSync('git', ['update-index', '-q', '--really-refresh'], { stdio: 'ignore' });
      if (spawnSync('git', ['diff-index', '--quiet', 'HEAD', '--'], { stdio: 'ignore' }).status !== 0) {
        throw new Error('desk unlock refused: commit or stash tracked changes first');
      }
      const files = managedFiles();
      const bootstrap = plaintextBootstrap(files);
      const original = new Map(files.map((file) => [file, readFileSync(file)]));
      const index = git(['ls-files', '--stage', '-z', '--', ...files]);
      rollback = () => {
        for (const [file, bytes] of original) writeFileSync(file, bytes);
        clearConfiguration();
        git(['update-index', '-z', '--index-info'], index);
        spawnSync('git', ['update-index', '-q', '--really-refresh'], { stdio: 'ignore' });
      };
      // Never relay transcrypt output: configuration messages can contain keys.
      const result = spawnSync('bash', ['scripts/vendor/transcrypt', '-c', 'aes-256-cbc', '-p', key, '-y'], { stdio: 'ignore' });
      const ready = filtersReady() && config('transcrypt.password') === key;
      if (!ready || (result.status !== 0 && !(bootstrap && plaintextBootstrap(files)))) {
        throw new Error('desk unlock failed: initialization rolled back; source files preserved (check the key and dependencies)');
      }
    }
    if (!isDeskUnlocked()) throw new Error('desk unlock failed: source is still locked (check the key)');
    rollback = undefined;
    console.log('desk unlocked');
  }
} catch (error) {
  if (rollback) {
    try { rollback(); }
    catch {
      console.error('desk unlock recovery failed: preserve this checkout and recover protected files from raw Git blobs');
      process.exit(1);
    }
  }
  // Only our fixed messages are safe to display; child-process errors may
  // include sensitive command arguments, so never print their raw messages.
  const message = error instanceof Error && /^desk /.test(error.message)
    ? error.message : 'desk unlock failed: Git or OpenSSL operation could not complete';
  console.error(message);
  process.exit(1);
}
