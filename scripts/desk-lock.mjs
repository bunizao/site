import { readFileSync } from 'node:fs';

export function isDeskUnlocked(root = new URL('../', import.meta.url)) {
  try {
    return !readFileSync(new URL('src/features/desk/index.ts', root), 'utf8').startsWith('U2FsdGVkX1');
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
