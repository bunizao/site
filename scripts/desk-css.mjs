import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TOKEN = /\bdk-[a-z0-9-]+/g;

export function deskCssPlugin() {
  const names = new Map();
  const owners = new Map();
  const root = resolve('src/features/desk').replaceAll('\\', '/') + '/';
  const rename = (name) => {
    if (names.has(name)) return names.get(name);
    const hash = createHash('sha256').update(name).digest('hex');
    const short = 'k' + BigInt('0x' + hash).toString(36).padStart(5, '0').slice(-5);
    const previous = owners.get(short);
    if (previous && previous !== name) throw new Error(`Desk CSS hash collision: ${previous}, ${name}`);
    names.set(name, short);
    owners.set(short, name);
    return short;
  };

  return {
    name: 'desk-css',
    apply: 'build',
    // Rename CSS before Vite extracts it into asset metadata.
    enforce: 'pre',
    buildStart() {
      const check = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = resolve(dir, entry.name);
          if (entry.isDirectory()) check(path);
          else if (/\.(astro|css|[cm]?[jt]sx?)$/.test(path)) {
            const source = readFileSync(path, 'utf8');
            if (/dk-[a-z0-9-]*\$\{/.test(source)) {
              throw new Error(`Desk CSS names must be literal tokens: ${path}`);
            }
            // Reserve all names before transforming either the client or server graph.
            for (const name of source.match(TOKEN) ?? []) rename(name);
          }
        }
      };
      check(root);
    },
    transform(code, id) {
      if (!id.replaceAll('\\', '/').startsWith(root)) return null;
      return { code: code.replace(TOKEN, rename), map: null };
    },
    generateBundle(_options, bundle) {
      for (const [file, output] of Object.entries(bundle)) {
        const source = output.type === 'chunk' ? output.code : String(output.source);
        if (source.match(TOKEN)) throw new Error(`Unrenamed desk CSS token in ${file}`);
      }
    },
  };
}
