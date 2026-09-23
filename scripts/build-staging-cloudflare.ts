// Builds the isolated staging Worker after dotenv has loaded. Blog pages are
// prerendered, so staging public vars must override the canonical local env at
// build time; changing Wrangler runtime vars afterwards cannot rewrite HTML.

import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

function parseJsonc(text: string): Record<string, unknown> {
  return JSON.parse(text.split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n'));
}

const staging = parseJsonc(readFileSync('wrangler.staging.jsonc', 'utf8'));
const vars = staging.vars;
if (!vars || typeof vars !== 'object') {
  throw new Error('wrangler.staging.jsonc is missing vars');
}

const buildEnvFile = process.env.SITE_BUILD_ENV_FILE?.trim();
const fileEnv = buildEnvFile ? parseEnv(readFileSync(buildEnvFile, 'utf8')) : {};
const env = { ...fileEnv, ...process.env, ...(vars as Record<string, string>) };
if (env.PUBLIC_TURNSTILE_SITE_KEY !== '1x00000000000000000000BB') {
  throw new Error('staging build must use the Cloudflare always-pass test site key');
}

const build = Bun.spawnSync(['bun', 'run', 'build:cloudflare'], {
  env,
  stdout: 'inherit',
  stderr: 'inherit',
});
if (build.exitCode !== 0) process.exit(build.exitCode);

const rewrite = Bun.spawnSync(['bun', 'scripts/make-staging-deploy-config.ts'], {
  stdout: 'inherit',
  stderr: 'inherit',
});
process.exit(rewrite.exitCode);
