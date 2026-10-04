import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isInternalDocsUnlocked } from '@/features/docs/server/internal-lock';

const dirs: string[] = [];

function docsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'internal-docs-'));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// A locked checkout must build without the owner-only pages, so anything short
// of every internal page being plaintext counts as locked. Public pages never
// count either way.
describe('isInternalDocsUnlocked', () => {
  test('reads plaintext pages as unlocked', () => {
    const dir = docsDir({ 'a.md': 'U2FsdGVkX19abc==\n', 'api/b.internal.md': '---\ntitle: B\n---\n' });
    expect(isInternalDocsUnlocked(dir)).toBe(true);
  });

  test('reads transcrypt ciphertext as locked', () => {
    const dir = docsDir({
      'a.internal.md': '---\ntitle: A\n---\n',
      'api/b.internal.md': 'U2FsdGVkX19abc==\n',
    });
    expect(isInternalDocsUnlocked(dir)).toBe(false);
  });

  test('reads a missing directory or one without internal pages as locked', () => {
    expect(isInternalDocsUnlocked(join(tmpdir(), `absent-internal-docs-${process.pid}`))).toBe(false);
    expect(isInternalDocsUnlocked(docsDir({ 'a.md': '---\ntitle: A\n---\n' }))).toBe(false);
  });
});
