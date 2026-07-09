import { createRequire } from 'node:module';
import Module from 'node:module';

const require = createRequire(import.meta.url);
const legacyTypescriptPath = require.resolve('typescript-astro-check');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveLegacyTypescript(request, parent, isMain, options) {
  if (request === 'typescript') {
    return legacyTypescriptPath;
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { check, parseArgsAsCheckConfig } = await import('@astrojs/check');
const config = parseArgsAsCheckConfig(process.argv);
const failed = await check(config);

process.exit(failed ? 1 : 0);
