import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isInternalDocsUnlocked } from '@/features/docs/server/internal-lock';

const dirs: string[] = [];

function docsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'internal-docs-'));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// A locked checkout must build without the owner-only pages, so anything short
// of every page being plaintext counts as locked.
describe('isInternalDocsUnlocked', () => {
  test('reads plaintext pages as unlocked', () => {
    expect(isInternalDocsUnlocked(docsDir({ 'a.md': '---\ntitle: A\n---\n' }))).toBe(true);
  });

  test('reads transcrypt ciphertext as locked', () => {
    const dir = docsDir({ 'a.md': '---\ntitle: A\n---\n', 'b.md': 'U2FsdGVkX19abc==\n' });
    expect(isInternalDocsUnlocked(dir)).toBe(false);
  });

  test('reads a missing or empty directory as locked', () => {
    expect(isInternalDocsUnlocked(join(tmpdir(), `absent-internal-docs-${process.pid}`))).toBe(false);
    expect(isInternalDocsUnlocked(docsDir({}))).toBe(false);
  });
});
