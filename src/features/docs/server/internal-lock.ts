import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Owner-only docs are transcrypt ciphertext in every checkout without the key:
// CI, hosted builds and forks. OpenSSL's salted output always starts with this.
const CIPHERTEXT_PREFIX = 'U2FsdGVkX1';

export const INTERNAL_DOCS_DIR = 'src/content/internal-docs';

export function isInternalDocsUnlocked(dir = resolve(INTERNAL_DOCS_DIR)): boolean {
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.md'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
  return names.length > 0
    && names.every((name) => !readFileSync(join(dir, name), 'utf8').startsWith(CIPHERTEXT_PREFIX));
}
