import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: packageDirectory,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

await rm(resolve(packageDirectory, 'dist'), { recursive: true, force: true });
const entries = (await readdir(resolve(packageDirectory, 'src')))
  .filter((file) => file.endsWith('.ts'))
  .map((file) => `src/${file}`);
run('bun', ['build', ...entries, '--outdir', 'dist', '--root', 'src', '--format', 'esm', '--target', 'node']);
run('bunx', ['--no-install', 'tsc', '-p', 'tsconfig.build.json', '--emitDeclarationOnly']);
