import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeskUnlocked } from './desk-lock.mjs';

// Managed worktree creation can skip smudge filters. Restore only pristine
// ciphertext from the existing local configuration; never initialize a key.
export function prepareDeskCheckout() {
  if (isDeskUnlocked()) return;
  const configured = spawnSync('git', ['config', '--local', '--get', 'transcrypt.version'], { stdio: 'ignore' });
  if (configured.status !== 0) return;
  const git = (args, input) => execFileSync('git', args, { input, stdio: ['pipe', 'pipe', 'pipe'] });
  const paths = git(['ls-files', '-z']);
  const attributes = git(['check-attr', '-z', 'filter', '--stdin'], paths).toString().split('\0');
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir']).toString().trim();
  const helper = resolve(common, 'crypt/transcrypt');
  const pending = [];
  const crypt = (mode, path, input) => {
    const args = mode === 'clean' ? [helper, mode, 'context=default', path] : [helper, mode, 'context=default'];
    const result = spawnSync('bash', args, { input, stdio: ['pipe', 'pipe', 'ignore'] });
    if (result.status !== 0 || !result.stdout) throw new Error('Desk checkout decryption failed. Verify the local key and OpenSSL.');
    return result.stdout;
  };
  for (let i = 0; i + 2 < attributes.length; i += 3) {
    if (attributes[i + 2] !== 'crypt') continue;
    const path = attributes[i];
    const before = readFileSync(path);
    if (!before.subarray(0, 10).equals(Buffer.from('U2FsdGVkX1'))) continue;
    if (!before.equals(git(['cat-file', 'blob', `:${path}`])) || !before.equals(git(['cat-file', 'blob', `HEAD:${path}`]))) {
      throw new Error(`Desk checkout refused to overwrite edited ciphertext: ${path}`);
    }
    const after = crypt('smudge', path, before);
    if (!crypt('clean', path, after).equals(before)) {
      throw new Error('Desk checkout key verification failed; no source files were changed.');
    }
    pending.push({ path, before, after });
  }
  try {
    for (const file of pending) writeFileSync(file.path, file.after);
    // Refresh only these verified paths; their deterministic ciphertext blobs
    // are unchanged, but skipped-smudge checkout metadata still marks them dirty.
    if (pending.length) git(['add', '--', ...pending.map((file) => file.path)]);
  } catch {
    for (const file of pending) writeFileSync(file.path, file.before);
    throw new Error('Desk checkout could not write source files; original ciphertext was restored.');
  }
  if (!isDeskUnlocked()) throw new Error('Desk checkout remains locked. Verify the existing local key.');
}
