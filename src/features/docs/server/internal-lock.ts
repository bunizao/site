import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

// Owner-only pages sit next to the public ones in the docs tree, named
// `<page>.internal.md`. .gitattributes encrypts that suffix with transcrypt, so
// they are ciphertext in every checkout without the key: CI, hosted builds and
// forks. OpenSSL's salted output always starts with this.
const CIPHERTEXT_PREFIX = 'U2FsdGVkX1';

export const DOCS_DIR = 'src/content/docs';
export const INTERNAL_DOCS_SUFFIX = '.internal.md';

function internalDocFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((name) => name.endsWith(INTERNAL_DOCS_SUFFIX));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export function isInternalDocsUnlocked(dir = resolve(DOCS_DIR)): boolean {
  const names = internalDocFiles(dir);
  return names.length > 0
    && names.every((name) => !readFileSync(join(dir, name), 'utf8').startsWith(CIPHERTEXT_PREFIX));
}

// The page ids, which are also their /docs/<id> paths: api/endpoints.internal.md
// is api/endpoints.
export function internalDocIds(dir = resolve(DOCS_DIR)): string[] {
  return internalDocFiles(dir)
    .map((name) => name.slice(0, -INTERNAL_DOCS_SUFFIX.length).split(sep).join('/'))
    .sort();
}
