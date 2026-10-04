import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Owner-only pages sit next to the public ones in the docs tree, named
// `<page>.internal.md`. .gitattributes encrypts that suffix with transcrypt, so
// they are ciphertext in every checkout without the key: CI, hosted builds and
// forks. OpenSSL's salted output always starts with this.
const CIPHERTEXT_PREFIX = 'U2FsdGVkX1';

export const DOCS_DIR = 'src/content/docs';
export const INTERNAL_DOCS_SUFFIX = '.internal.md';

export function isInternalDocsUnlocked(dir = resolve(DOCS_DIR)): boolean {
  let names: string[];
  try {
    names = readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((name) => name.endsWith(INTERNAL_DOCS_SUFFIX));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
  return names.length > 0
    && names.every((name) => !readFileSync(join(dir, name), 'utf8').startsWith(CIPHERTEXT_PREFIX));
}
